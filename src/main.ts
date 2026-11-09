import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { EFFECTS, EffectView, type EffectId } from './effects'
import { createScene } from './model'
import { BUTTONS, CHARGE, LABEL, type Frame, type Info } from './pad'

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T

const COLORS = ['#4c8dff', '#b07cff', '#ff6fa3', '#ff5d5d', '#ffb23f', '#3ecf8e', '#2fd3e0']
const out = {
  color: COLORS[0],
  players: 0b00100,
  mic: false,
  rumble: [0, 0] as [number, number],
  effect: { L: 'off' as EffectId, R: 'off' as EffectId },
}

// ---------- output ----------
let queued = false
function send() {
  if (queued) return
  queued = true
  setTimeout(() => {
    queued = false
    const n = parseInt(out.color.slice(1), 16)
    invoke('set_output', {
      output: {
        color: [(n >> 16) & 255, (n >> 8) & 255, n & 255],
        players: out.players,
        micLed: out.mic,
        rumble: out.rumble,
        triggerLeft: EFFECTS[out.effect.L].bytes,
        triggerRight: EFFECTS[out.effect.R].bytes,
      },
    }).catch(() => {})
  }, 16)
}

function setColor(c: string) {
  out.color = c
  document.documentElement.style.setProperty('--accent', c)
  document.querySelectorAll('#swatches button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.c === c))
  send()
}

const swatches = $('#swatches')
for (const c of COLORS) {
  const b = document.createElement('button')
  b.dataset.c = c
  b.style.background = c
  b.style.color = c
  b.title = c
  b.onclick = () => setColor(c)
  swatches.append(b)
}
const custom = document.createElement('label')
custom.title = 'Outra cor'
custom.innerHTML = '<input type="color" value="#4c8dff">'
custom.querySelector('input')!.oninput = (e) => setColor((e.target as HTMLInputElement).value)
swatches.append(custom)

const leds = $('#leds')
for (let i = 0; i < 5; i++) {
  const b = document.createElement('button')
  b.classList.toggle('on', !!(out.players & (1 << i)))
  b.onclick = () => { out.players ^= 1 << i; b.classList.toggle('on'); send() }
  leds.append(b)
}
$<HTMLInputElement>('#mic').onchange = (e) => { out.mic = (e.target as HTMLInputElement).checked; send() }

const rumbleL = $<HTMLInputElement>('#rumbleL'), rumbleR = $<HTMLInputElement>('#rumbleR')
const setRumble = (l: number, r: number) => { out.rumble = [l, r]; rumbleL.value = String(l); rumbleR.value = String(r); send() }
rumbleL.oninput = () => setRumble(+rumbleL.value, out.rumble[1])
rumbleR.oninput = () => setRumble(out.rumble[0], +rumbleR.value)
let timers: number[] = []
const play = (steps: [number, number, number][]) => {
  timers.forEach(clearTimeout)
  let at = 0
  timers = steps.map(([l, r, ms]) => { const t = setTimeout(() => setRumble(l, r), at); at += ms; return t })
  timers.push(setTimeout(() => setRumble(0, 0), at))
}
$('#buzz').onclick = () => play([[255, 0, 500], [0, 255, 500]])
$('#heartbeat').onclick = () => play([[200, 0, 120], [0, 0, 120], [255, 0, 160], [0, 0, 600], [200, 0, 120], [0, 0, 120], [255, 0, 160]])
$('#stop').onclick = () => play([])

// ---------- trigger effects ----------
const fx: Record<'L' | 'R', EffectView> = { L: null!, R: null! }
document.querySelectorAll<HTMLElement>('.trigger').forEach((el) => {
  const side = el.dataset.side as 'L' | 'R'
  fx[side] = new EffectView(el.querySelector('[data-fx]')!)
  const list = el.querySelector('[data-effects]')!
  const hint = el.querySelector('[data-hint]')!
  const pick = (id: EffectId) => {
    out.effect[side] = id
    hint.textContent = EFFECTS[id].hint
    list.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.id === id))
    fx[side].reset()
    send()
  }
  for (const [id, e] of Object.entries(EFFECTS)) {
    const b = document.createElement('button')
    b.dataset.id = id
    b.innerHTML = `<span>${e.icon}</span>${e.label}`
    b.onclick = () => pick(id as EffectId)
    list.append(b)
  }
  pick(side === 'R' ? 'gun' : 'bow')
})

// ---------- buttons ----------
const counts = BUTTONS.map(() => ({ n: 0, double: 0, last: 0 }))
const keys = BUTTONS.map((name) => {
  const k = document.createElement('div')
  k.className = 'key'
  k.innerHTML = `<b>${LABEL[name]}</b><small>0</small>`
  $('#buttons').append(k)
  return k
})
let prevButtons = 0

// ---------- sticks ----------
const buckets = { L: new Array(36).fill(0), R: new Array(36).fill(0) }
const trail = { L: [] as [number, number][], R: [] as [number, number][] }
$('#resetSticks').onclick = () => {
  buckets.L.fill(0); buckets.R.fill(0); trail.L = []; trail.R = []
  counts.forEach((c) => { c.n = 0; c.double = 0 })
  keys.forEach((k) => k.classList.remove('tested'))
}
function drawStick(canvas: HTMLCanvasElement, side: 'L' | 'R', x: number, y: number, accent: string) {
  const g = canvas.getContext('2d')!, R = 54, c = 65
  const r = Math.hypot(x, y)
  if (r > 0.6) {
    const a = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 36) % 36
    buckets[side][a] = Math.max(buckets[side][a], r)
    trail[side].push([x, y])
    if (trail[side].length > 500) trail[side].shift()
  }
  g.clearRect(0, 0, 130, 130)
  g.strokeStyle = 'rgba(255,255,255,.08)'
  g.beginPath(); g.arc(c, c, R, 0, 7); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke()
  g.strokeStyle = 'rgba(245,185,66,.45)'
  g.beginPath(); g.arc(c, c, R * 0.05, 0, 7); g.stroke()
  g.fillStyle = accent + '55'
  for (const [tx, ty] of trail[side]) g.fillRect(c + tx * R - 1, c + ty * R - 1, 2, 2)
  g.fillStyle = accent
  g.shadowColor = accent; g.shadowBlur = 12
  g.beginPath(); g.arc(c + x * R, c + y * R, 7, 0, 7); g.fill()
  g.shadowBlur = 0
}
const circularity = (side: 'L' | 'R') => {
  const v = buckets[side].filter((r) => r > 0)
  if (v.length < 30) return `<span class="muted">gire (${Math.round((v.length / 36) * 100)}%)</span>`
  const err = v.reduce((s, r) => s + Math.abs(Math.min(r, 1.42) - 1), 0) / v.length
  return `${(err * 100).toFixed(1)}% ${err > 0.1 ? '⚠️' : '✅'}`
}
const drift = (x: number, y: number) => {
  const d = Math.hypot(x, y) * 100
  return `${d.toFixed(1)}% ${d < 5 ? '✅' : d < 12 ? '⚠️' : '❌'}`
}

// ---------- scene ----------
const scene = createScene($<HTMLCanvasElement>('#stage'))
let frame: Frame | null = null
let info: Info | null = null

function showInfo(i: Info | null) {
  const was = info
  info = i
  document.body.classList.toggle('connected', !!i)
  $('#dot').classList.toggle('on', !!i)
  $('#conn').textContent = i ? `${i.edge ? 'DualSense Edge' : 'DualSense'} · ${i.bluetooth ? 'Bluetooth' : 'USB'}` : 'Procurando controle…'
  if (!i) { frame = null; return }
  const rows: [string, string | null][] = [
    ['Modelo', i.edge ? 'DualSense Edge' : 'DualSense'],
    ['Conexão', i.bluetooth ? 'Bluetooth' : 'Cabo USB'],
    ['MAC', i.mac],
    ['Firmware de', i.built],
    ['Firmware', i.firmware],
    ['Hardware', i.hardware],
    ['Atualização', i.update],
  ]
  $('#info').innerHTML = rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
  if (!was) send()
}

listen<Info | null>('pad-info', (e) => { if (!!e.payload !== !!info) showInfo(e.payload) })
listen<Frame>('pad', (e) => { frame = e.payload })
invoke<Info | null>('hello').then(showInfo).catch(() => {})

const follow = $<HTMLInputElement>('#follow')
let lastUi = 0
function tick(now: number) {
  requestAnimationFrame(tick)
  const f = frame
  const accent = out.color

  let kick = 0, shake = out.rumble[0] / 255 + out.rumble[1] / 400
  for (const side of ['L', 'R'] as const) {
    const r = fx[side].draw(out.effect[side], f ? (side === 'L' ? f.l2 : f.r2) : 0, accent, now)
    kick = Math.max(kick, r.kick)
    shake += r.shake
  }
  if (kick) scene.kick(kick)
  scene.update(f, { color: accent, players: out.players, mic: out.mic, shake, follow: follow.checked })
  if (!f) return

  // Button counts on every frame, so no press is missed.
  BUTTONS.forEach((_, i) => {
    const on = (f.buttons >> i) & 1
    if (on && !((prevButtons >> i) & 1)) {
      const c = counts[i]
      if (now - c.last < 45) c.double++
      c.n++
      c.last = now
      keys[i].classList.add('tested')
      keys[i].querySelector('small')!.innerHTML = `${c.n}${c.double ? ` <span class="warn">${c.double}×2</span>` : ''}`
    }
    keys[i].classList.toggle('on', !!on)
  })
  prevButtons = f.buttons

  const s = f.sticks.map((v) => Math.max(-1, Math.min(1, (v - 128) / 127)))
  drawStick($('#stickL'), 'L', s[0], s[1], accent)
  drawStick($('#stickR'), 'R', s[2], s[3], accent)

  const t = $<HTMLCanvasElement>('#touch').getContext('2d')!
  t.fillStyle = 'rgba(10,12,16,.22)'
  t.fillRect(0, 0, 240, 135)
  f.touch.forEach((p, i) => {
    if (!p.down) return
    t.fillStyle = i ? '#ef476f' : '#ffd166'
    t.beginPath(); t.arc((p.x / 1920) * 240, (p.y / 1080) * 135, 5, 0, 7); t.fill()
  })

  // Text panels at 10 Hz: easier to read, cheaper to draw.
  if (now - lastUi < 100) return
  lastUi = now
  $('#rate').textContent = `${f.rate} Hz`
  $('#stickStats').innerHTML = `<dt>Esquerdo: desvio</dt><dd>${drift(s[0], s[1])}</dd><dt>Esquerdo: círculo</dt><dd>${circularity('L')}</dd>
    <dt>Direito: desvio</dt><dd>${drift(s[2], s[3])}</dd><dt>Direito: círculo</dt><dd>${circularity('R')}</dd>`
  if (f.full && f.battery !== null) {
    const pct = f.battery
    const ring = $('#ring')
    ring.style.strokeDashoffset = String(314 - (314 * pct) / 100)
    ring.style.stroke = pct <= 15 ? 'var(--bad)' : pct <= 35 ? 'var(--warn)' : 'var(--ok)'
    $('#pct').textContent = `${pct}%`
    $('#charge').textContent = CHARGE[f.charge ?? 0] ?? `estado ${f.charge}`
    $('#plugs').innerHTML = `<span class="chip">🎧 ${f.headphones ? 'fone ligado' : 'sem fone'}</span><span class="chip">🎙️ ${f.mic ? 'microfone ligado' : 'sem microfone'}</span>`
  } else {
    $('#charge').textContent = 'esperando o modo completo…'
  }
  const axis = (name: string, v: number, max: number) => {
    const w = Math.min(Math.abs(v) / max, 1) * 50
    return `<div class="axis"><span class="muted">${name}</span><div class="bar"><i style="width:${w}%;${v < 0 ? 'transform:translateX(-100%)' : ''}"></i></div><span>${v}</span></div>`
  }
  $('#motion').innerHTML = ['X', 'Y', 'Z'].map((a, i) => axis('Giro ' + a, f.gyro[i], 8000)).join('') + ['X', 'Y', 'Z'].map((a, i) => axis('Acel ' + a, f.accel[i], 10000)).join('')
}
requestAnimationFrame(tick)
