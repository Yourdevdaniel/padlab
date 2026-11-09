/**
 * Mouse test: five buttons, the wheel in both directions, double clicks the switch made on its own
 * (chatter), and the polling rate measured from raw pointer updates while the mouse moves.
 */
const NAMES = ['Esquerdo', 'Meio', 'Direito', 'Voltar', 'Avançar']

export function mountMouse(root: HTMLElement, isActive: () => boolean) {
  root.innerHTML = `
    <div class="ms">
      <div class="ms-pad" id="msPad">
        <canvas id="msTrail"></canvas>
        <p class="ms-hint">Clique, role e mexa o mouse aqui dentro</p>
      </div>
      <aside class="ms-side">
        <section class="card">
          <h2>Botões</h2>
          <svg viewBox="0 0 120 190" class="ms-svg">
            <path d="M60 6 C24 6 10 40 10 80 V128 C10 162 32 184 60 184 C88 184 110 162 110 128 V80 C110 40 96 6 60 6Z" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.18)"/>
            <path data-b="0" d="M58 8 C26 10 12 40 12 78 H58Z" class="ms-part"/>
            <path data-b="2" d="M62 8 C94 10 108 40 108 78 H62Z" class="ms-part"/>
            <rect data-b="1" x="52" y="22" width="16" height="36" rx="8" class="ms-part ms-wheel"/>
            <rect data-b="4" x="4" y="92" width="10" height="22" rx="4" class="ms-part"/>
            <rect data-b="3" x="4" y="118" width="10" height="22" rx="4" class="ms-part"/>
          </svg>
          <dl id="msButtons"></dl>
        </section>
        <section class="card">
          <h2>Roda</h2>
          <dl id="msWheel"></dl>
        </section>
        <section class="card">
          <h2>Taxa de atualização</h2>
          <div class="big" id="msRate">— Hz</div>
          <div class="muted" id="msRateMax">mexa o mouse rápido em círculos</div>
        </section>
        <button class="ghost" id="msReset">Zerar teste</button>
        <p class="note">Duplo clique sozinho (<span class="warn">repique</span>) é um clique registrado duas vezes em menos de 60 ms: sinal de switch gasto.</p>
      </aside>
    </div>`

  const $ = <T extends Element = HTMLElement>(id: string) => root.querySelector('#' + id) as T
  const pad = $<HTMLElement>('msPad')
  const canvas = $<HTMLCanvasElement>('msTrail')
  const g = canvas.getContext('2d')!
  const counts = NAMES.map(() => ({ n: 0, chatter: 0, last: -1e9 }))
  const wheel = { up: 0, down: 0, left: 0, right: 0 }
  let rawCount = 0
  let maxRate = 0

  const render = () => {
    $('msButtons').innerHTML = NAMES.map((n, i) => `<dt>${n}</dt><dd>${counts[i].n}${counts[i].chatter ? ` <span class="warn">${counts[i].chatter} repique</span>` : ''}</dd>`).join('')
    $('msWheel').innerHTML = `<dt>Para cima</dt><dd>${wheel.up}</dd><dt>Para baixo</dt><dd>${wheel.down}</dd><dt>Inclinar esquerda</dt><dd>${wheel.left}</dd><dt>Inclinar direita</dt><dd>${wheel.right}</dd>`
  }
  const light = (b: number, on: boolean) => root.querySelector(`[data-b="${b}"]`)?.classList.toggle('on', on)

  pad.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const c = counts[e.button]
    if (!c) return
    const now = performance.now()
    if (now - c.last < 60) c.chatter++
    c.n++
    c.last = now
    light(e.button, true)
    root.querySelector(`[data-b="${e.button}"]`)?.classList.add('tested')
    render()
  })
  addEventListener('mouseup', (e) => {
    if (!isActive()) return
    // Back and forward would otherwise navigate the page.
    if (e.button > 2) e.preventDefault()
    light(e.button, false)
  })
  pad.addEventListener('contextmenu', (e) => e.preventDefault())
  pad.addEventListener('auxclick', (e) => e.preventDefault())
  pad.addEventListener('wheel', (e) => {
    e.preventDefault()
    if (e.deltaY < 0) wheel.up++
    if (e.deltaY > 0) wheel.down++
    if (e.deltaX < 0) wheel.left++
    if (e.deltaX > 0) wheel.right++
    const w = root.querySelector('.ms-wheel')!
    w.classList.remove('spin-up', 'spin-down')
    void (w as HTMLElement).getBoundingClientRect()
    w.classList.add(e.deltaY < 0 ? 'spin-up' : 'spin-down')
    render()
  }, { passive: false })

  // Raw updates arrive once per report from the mouse, not once per frame: that is the polling rate.
  const raw = 'onpointerrawupdate' in window ? 'pointerrawupdate' : 'pointermove'
  pad.addEventListener(raw, () => rawCount++)

  let trail: [number, number, number][] = []
  pad.addEventListener('pointermove', (e) => {
    const r = pad.getBoundingClientRect()
    trail.push([e.clientX - r.left, e.clientY - r.top, performance.now()])
  })

  setInterval(() => {
    if (!isActive()) return
    if (rawCount > 20) {
      maxRate = Math.max(maxRate, rawCount)
      $('msRate').textContent = `${rawCount} Hz`
      $('msRateMax').textContent = `máximo ${maxRate} Hz`
    }
    rawCount = 0
  }, 1000)

  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8dff'
  const frame = () => {
    requestAnimationFrame(frame)
    if (!isActive()) return
    const dpr = devicePixelRatio || 1
    if (canvas.width !== pad.clientWidth * dpr) { canvas.width = pad.clientWidth * dpr; canvas.height = pad.clientHeight * dpr }
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, pad.clientWidth, pad.clientHeight)
    const now = performance.now()
    trail = trail.filter((p) => now - p[2] < 600)
    g.strokeStyle = accent()
    g.lineCap = 'round'
    for (let i = 1; i < trail.length; i++) {
      g.globalAlpha = 1 - (now - trail[i][2]) / 600
      g.lineWidth = 3
      g.beginPath()
      g.moveTo(trail[i - 1][0], trail[i - 1][1])
      g.lineTo(trail[i][0], trail[i][1])
      g.stroke()
    }
    g.globalAlpha = 1
  }
  frame()

  $('msReset').addEventListener('click', () => {
    counts.forEach((c) => { c.n = 0; c.chatter = 0 })
    Object.assign(wheel, { up: 0, down: 0, left: 0, right: 0 })
    maxRate = 0
    root.querySelectorAll('.ms-part').forEach((p) => p.classList.remove('tested'))
    render()
  })
  render()
}
