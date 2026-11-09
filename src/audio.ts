/**
 * Headphones and microphone: tones on each side, a 20 Hz–20 kHz sweep, the microphone's level and
 * spectrum, and a five-second recording played back. Works with any device Windows lists, the
 * DualSense's own jack included when it's on the cable.
 */
export function mountAudio(root: HTMLElement, isActive: () => boolean) {
  root.innerHTML = `
    <div class="au">
      <section class="card">
        <h2>Fone e caixas</h2>
        <label class="field">Saída <select id="auOut"></select></label>
        <div class="au-lr"><div class="au-side" id="auL">E</div><div class="au-side" id="auR">D</div></div>
        <div class="row">
          <button data-tone="-1">Esquerdo</button>
          <button data-tone="1">Direito</button>
          <button data-tone="0">Os dois</button>
          <button id="auSweep" class="ghost">Varredura 20 Hz – 20 kHz</button>
          <button id="auStop" class="ghost">Parar</button>
        </div>
        <div class="slider"><span>Volume</span><input type="range" id="auVol" min="0" max="100" value="30" /></div>
        <div class="muted" id="auFreq">—</div>
        <p class="note">Na varredura, anote onde o som some: a maioria dos adultos para de ouvir entre 14 e 17 kHz. Comece com volume baixo.</p>
      </section>

      <section class="card">
        <h2>Microfone</h2>
        <label class="field">Entrada <select id="auIn"></select></label>
        <div class="row">
          <button id="auMic">Ligar microfone</button>
          <label class="chip toggle"><input type="checkbox" id="auRaw" checked /> Som cru (sem filtros)</label>
          <label class="chip toggle"><input type="checkbox" id="auMonitor" /> Ouvir agora</label>
        </div>
        <div class="au-meter"><i id="auLevel"></i><b id="auPeak"></b></div>
        <div class="muted" id="auDb">—</div>
        <canvas id="auScope"></canvas>
        <div class="row">
          <button id="auRec" class="ghost" disabled>Gravar 5 s e ouvir</button>
          <span class="muted" id="auRecState"></span>
        </div>
        <dl id="auSettings"></dl>
        <p class="note">"Som cru" desliga cancelamento de eco, supressão de ruído e ganho automático, para ouvir o microfone como ele é. "Ouvir agora" pode dar microfonia em caixas de som: use fone.</p>
      </section>
    </div>`

  const $ = <T extends Element = HTMLElement>(id: string) => root.querySelector('#' + id) as T
  let ctx: AudioContext | null = null
  const audio = () => (ctx ??= new AudioContext())
  let tone: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode } | null = null
  let sweepTimer = 0

  async function devices() {
    const list = await navigator.mediaDevices.enumerateDevices()
    const fill = (sel: HTMLSelectElement, kind: MediaDeviceKind) => {
      const was = sel.value
      sel.innerHTML = list.filter((d) => d.kind === kind).map((d, i) => `<option value="${d.deviceId}">${d.label || `${kind === 'audioinput' ? 'Microfone' : 'Saída'} ${i + 1}`}</option>`).join('')
      if (was) sel.value = was
    }
    fill($('auOut'), 'audiooutput')
    fill($('auIn'), 'audioinput')
  }
  navigator.mediaDevices.addEventListener('devicechange', devices)
  devices()

  $<HTMLSelectElement>('auOut').addEventListener('change', async (e) => {
    const id = (e.target as HTMLSelectElement).value
    const c = audio() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
    await c.setSinkId?.(id === 'default' ? '' : id).catch(() => {})
  })

  const volume = () => (+$<HTMLInputElement>('auVol').value / 100) ** 2 * 0.6
  $<HTMLInputElement>('auVol').addEventListener('input', () => tone?.gain.gain.setTargetAtTime(volume(), audio().currentTime, 0.02))

  function stop() {
    clearInterval(sweepTimer)
    if (tone) {
      const t = tone
      t.gain.gain.setTargetAtTime(0, audio().currentTime, 0.03)
      setTimeout(() => t.osc.stop(), 150)
    }
    tone = null
    $('auL').classList.remove('on')
    $('auR').classList.remove('on')
    $('auFreq').textContent = '—'
  }

  function play(side: number, freq = 440) {
    stop()
    const c = audio()
    void c.resume()
    const osc = c.createOscillator()
    const gain = c.createGain()
    const pan = c.createStereoPanner()
    osc.frequency.value = freq
    pan.pan.value = side
    gain.gain.value = 0
    gain.gain.setTargetAtTime(volume(), c.currentTime, 0.03)
    osc.connect(gain).connect(pan).connect(c.destination)
    osc.start()
    tone = { osc, gain, pan }
    $('auL').classList.toggle('on', side <= 0)
    $('auR').classList.toggle('on', side >= 0)
    $('auFreq').textContent = `${freq} Hz`
  }

  root.querySelectorAll<HTMLButtonElement>('[data-tone]').forEach((b) => b.addEventListener('click', () => play(+b.dataset.tone!)))
  $('auStop').addEventListener('click', stop)
  $('auSweep').addEventListener('click', () => {
    play(0, 20)
    const start = performance.now()
    // Logarithmic, 20 Hz to 20 kHz in 20 s: each decade gets the same time.
    sweepTimer = window.setInterval(() => {
      const t = Math.min((performance.now() - start) / 20000, 1)
      const f = Math.round(20 * 1000 ** t)
      tone?.osc.frequency.setTargetAtTime(f, audio().currentTime, 0.02)
      $('auFreq').textContent = f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${f} Hz`
      if (t >= 1) stop()
    }, 50)
  })

  // ---------- microphone ----------
  let stream: MediaStream | null = null
  let analyser: AnalyserNode | null = null
  let monitor: GainNode | null = null
  let peak = 0

  async function mic() {
    stream?.getTracks().forEach((t) => t.stop())
    const raw = $<HTMLInputElement>('auRaw').checked
    const id = $<HTMLSelectElement>('auIn').value
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: !raw, noiseSuppression: !raw, autoGainControl: !raw },
    })
    await devices()
    const c = audio()
    void c.resume()
    const src = c.createMediaStreamSource(stream)
    analyser = c.createAnalyser()
    analyser.fftSize = 2048
    monitor = c.createGain()
    monitor.gain.value = $<HTMLInputElement>('auMonitor').checked ? 1 : 0
    src.connect(analyser)
    src.connect(monitor).connect(c.destination)
    const s = stream.getAudioTracks()[0].getSettings()
    $('auSettings').innerHTML = `<dt>Dispositivo</dt><dd>${stream.getAudioTracks()[0].label}</dd><dt>Taxa</dt><dd>${s.sampleRate ? `${s.sampleRate} Hz` : '—'}</dd><dt>Canais</dt><dd>${s.channelCount ?? '—'}</dd><dt>Cancelamento de eco</dt><dd>${s.echoCancellation ? 'ligado' : 'desligado'}</dd>`
    $('auMic').textContent = 'Reiniciar microfone'
    $<HTMLButtonElement>('auRec').disabled = false
  }
  $('auMic').addEventListener('click', () => mic().catch((e) => ($('auDb').textContent = `Não deu para abrir o microfone: ${e.message}`)))
  $('auRaw').addEventListener('change', () => stream && mic())
  $('auIn').addEventListener('change', () => stream && mic())
  $('auMonitor').addEventListener('change', (e) => monitor && (monitor.gain.value = (e.target as HTMLInputElement).checked ? 1 : 0))

  $('auRec').addEventListener('click', () => {
    if (!stream) return
    const rec = new MediaRecorder(stream)
    const parts: Blob[] = []
    rec.ondataavailable = (e) => parts.push(e.data)
    rec.onstop = () => {
      const a = new Audio(URL.createObjectURL(new Blob(parts, { type: rec.mimeType })))
      const out = $<HTMLSelectElement>('auOut').value
      const sink = a as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }
      void sink.setSinkId?.(out).catch(() => {})
      $('auRecState').textContent = 'tocando…'
      a.onended = () => ($('auRecState').textContent = '')
      void a.play()
    }
    rec.start()
    let left = 5
    $('auRecState').textContent = `gravando… ${left}`
    const t = setInterval(() => {
      left--
      $('auRecState').textContent = `gravando… ${left}`
      if (left <= 0) { clearInterval(t); rec.stop() }
    }, 1000)
  })

  const scope = $<HTMLCanvasElement>('auScope')
  const g = scope.getContext('2d')!
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8dff'
  const wave = new Float32Array(2048)
  const freq = new Uint8Array(1024)
  const frame = () => {
    requestAnimationFrame(frame)
    if (!isActive() || !analyser) return
    analyser.getFloatTimeDomainData(wave)
    analyser.getByteFrequencyData(freq)
    let sum = 0
    for (const v of wave) sum += v * v
    const rms = Math.sqrt(sum / wave.length)
    const db = rms > 0 ? 20 * Math.log10(rms) : -100
    const level = Math.max(0, Math.min(1, (db + 60) / 60))
    peak = Math.max(level, peak - 0.006)
    $('auLevel').style.width = `${level * 100}%`
    $('auPeak').style.left = `${peak * 100}%`
    $('auDb').textContent = `${db.toFixed(1)} dBFS${db > -3 ? ' · estourando!' : db < -50 ? ' · quase nada' : ''}`

    const dpr = devicePixelRatio || 1
    const W = scope.clientWidth, H = scope.clientHeight
    if (scope.width !== W * dpr) { scope.width = W * dpr; scope.height = H * dpr }
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    // Spectrum behind, waveform on top.
    const bars = 96
    for (let i = 0; i < bars; i++) {
      const v = freq[Math.floor((i / bars) ** 2 * 900)] / 255
      g.fillStyle = `rgba(255,255,255,${0.05 + v * 0.25})`
      g.fillRect((i / bars) * W, H - v * H, W / bars - 1, v * H)
    }
    g.strokeStyle = accent()
    g.lineWidth = 2
    g.beginPath()
    for (let i = 0; i < wave.length; i += 4) g.lineTo((i / wave.length) * W, H / 2 + wave[i] * H * 0.45)
    g.stroke()
  }
  frame()
}
