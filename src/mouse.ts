/**
 * Mouse test: five buttons, the wheel in both directions, double clicks the switch made on its own
 * (chatter), and the polling rate measured from raw pointer updates while the mouse moves.
 */
import { invoke } from '@tauri-apps/api/core'
import { mountMouse3d } from './mouse3d'

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
          <canvas class="ms-3d" id="ms3d"></canvas>
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
        <section class="card">
          <h2>Bateria sem fio</h2>
          <dl id="msBattery"></dl>
          <p class="note" id="msBatteryNote"></p>
        </section>
        <button class="ghost" id="msReset">Zerar teste</button>
        <p class="note">Duplo clique sozinho (<span class="warn">repique</span>) é um clique registrado duas vezes em menos de 60 ms: sinal de switch gasto.</p>
      </aside>
    </div>`

  const $ = <T extends Element = HTMLElement>(id: string) => root.querySelector('#' + id) as T
  const m3d = mountMouse3d($<HTMLCanvasElement>('ms3d'))
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
  const light = (b: number, on: boolean) => m3d.press(b, on)

  pad.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const c = counts[e.button]
    if (!c) return
    const now = performance.now()
    if (now - c.last < 60) c.chatter++
    c.n++
    c.last = now
    light(e.button, true)
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
    m3d.scroll(e.deltaY)
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

  // Windows only knows the battery of Bluetooth devices; a 2.4 GHz dongle reports it in a protocol of
  // its own brand. In the browser preview there is no way to ask.
  type Battery = { name: string; percent: number }
  const showBatteries = (list: Battery[] | null) => {
    const color = (p: number) => (p <= 15 ? 'bad' : p <= 35 ? 'warn' : 'ok')
    $('msBattery').innerHTML = (list ?? []).map((b) => `<dt>${escape(b.name)}</dt><dd class="${color(b.percent)}">${b.percent}%</dd>`).join('')
    $('msBatteryNote').textContent = list === null
      ? 'Só aparece no app instalado.'
      : list.length
        ? 'Aparelhos Bluetooth conectados. Pelo receptor 2.4 GHz o Windows não recebe a bateria.'
        : 'Nenhum aparelho Bluetooth com bateria conectado. Pelo receptor 2.4 GHz o Windows não recebe a bateria; num mouse de dois modos, ligue o Bluetooth para ver.'
  }
  const inApp = '__TAURI_INTERNALS__' in window
  const pollBatteries = () => {
    if (!inApp) return showBatteries(null)
    if (isActive()) invoke<Battery[]>('batteries').then(showBatteries).catch(() => showBatteries([]))
  }
  pollBatteries()
  setInterval(pollBatteries, 5000)

  $('msReset').addEventListener('click', () => {
    counts.forEach((c) => { c.n = 0; c.chatter = 0 })
    Object.assign(wheel, { up: 0, down: 0, left: 0, right: 0 })
    maxRate = 0
    render()
  })
  render()
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
