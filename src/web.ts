/**
 * The controller outside the app (plain browser, `npm run dev`): the PlayStation pads through WebHID
 * (same offsets as src-tauri/src/dualsense.rs and ds4.rs) and Xbox pads through the Gamepad API.
 * WebHID needs a click to pick the device, so the page shows a "Conectar" button.
 */
import type { Frame, Info, Kind, Touch } from './pad'

export type WebOutput = {
  color: [number, number, number]
  players: number
  micLed: boolean
  rumble: [number, number]
  triggerLeft: number[]
  triggerRight: number[]
  impulse: [number, number]
}

type Handlers = { info(i: Info | null): void; frame(f: Frame): void }

const SONY = 0x054c
const DUALSENSE = [0x0ce6, 0x0df2]
const DS4 = [0x05c4, 0x09cc, 0x0ba0]
const EDGE = 0x0df2

export const hasWebHid = () => 'hid' in navigator

/** Same bits as `buttons()` in dualsense.rs. */
function buttons(b0: number, b1: number, b2: number) {
  const hat = b0 & 0x0f
  const on = [
    b0 & 0x20, b0 & 0x40, b0 & 0x10, b0 & 0x80,
    [7, 0, 1].includes(hat), [3, 4, 5].includes(hat), [5, 6, 7].includes(hat), [1, 2, 3].includes(hat),
    b1 & 0x01, b1 & 0x02, b1 & 0x04, b1 & 0x08, b1 & 0x40, b1 & 0x80, b1 & 0x10, b1 & 0x20,
    b2 & 0x01, b2 & 0x02, b2 & 0x04,
  ]
  return on.reduce<number>((m, b, i) => (b ? m | (1 << i) : m), 0)
}

const blank = (): Omit<Frame, 'rate'> => ({
  sticks: [128, 128, 128, 128], l2: 0, r2: 0, buttons: 0, gyro: [0, 0, 0], accel: [0, 0, 0],
  touch: [{ down: false, x: 0, y: 0 }, { down: false, x: 0, y: 0 }], battery: null, charge: null,
  headphones: false, mic: false, full: false,
})

const short = (d: DataView): Omit<Frame, 'rate'> | null => d.byteLength < 9 ? null : {
  ...blank(),
  sticks: [d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3)],
  l2: d.getUint8(7), r2: d.getUint8(8),
  buttons: buttons(d.getUint8(4), d.getUint8(5), d.getUint8(6) & 0x03),
}

const touchAt = (d: DataView, i: number): Touch => ({
  down: (d.getUint8(i) & 0x80) === 0,
  x: d.getUint8(i + 1) | ((d.getUint8(i + 2) & 0x0f) << 8),
  y: (d.getUint8(i + 2) >> 4) | (d.getUint8(i + 3) << 4),
})
const i16s = (d: DataView, i: number) => [d.getInt16(i, true), d.getInt16(i + 2, true), d.getInt16(i + 4, true)]

function dualsenseFull(d: DataView): Omit<Frame, 'rate'> | null {
  if (d.byteLength < 54) return null
  const status = d.getUint8(52)
  return {
    sticks: [d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3)],
    l2: d.getUint8(4), r2: d.getUint8(5),
    buttons: buttons(d.getUint8(7), d.getUint8(8), d.getUint8(9)),
    gyro: i16s(d, 15), accel: i16s(d, 21),
    touch: [touchAt(d, 32), touchAt(d, 36)],
    battery: Math.min((status & 0x0f) * 10 + 5, 100), charge: status >> 4,
    headphones: !!(d.getUint8(53) & 1), mic: !!(d.getUint8(53) & 2), full: true,
  }
}

function ds4Full(d: DataView): Omit<Frame, 'rate'> | null {
  if (d.byteLength < 42) return null
  const status = d.getUint8(29), level = status & 0x0f, cable = !!(status & 0x10)
  const [battery, charge] = cable ? (level <= 9 ? [Math.min(level * 10 + 5, 100), 1] : level <= 11 ? [100, 2] : [0, 15]) : [Math.min(level * 10 + 5, 100), 0]
  return {
    sticks: [d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3)],
    l2: d.getUint8(7), r2: d.getUint8(8),
    buttons: buttons(d.getUint8(4), d.getUint8(5), d.getUint8(6) & 0x03),
    gyro: i16s(d, 12), accel: i16s(d, 18),
    touch: [touchAt(d, 34), touchAt(d, 38)],
    battery, charge, headphones: !!(status & 0x20), mic: !!(status & 0x40), full: true,
  }
}

/** WebHID gives the report id apart from the data, so offsets are hidapi's minus one. */
function parse(kind: Kind, id: number, d: DataView, bt: boolean) {
  if (kind === 'dualsense') {
    if (id === 0x31) return dualsenseFull(new DataView(d.buffer, d.byteOffset + 1))
    if (id === 0x01) return bt ? short(d) : dualsenseFull(d)
  } else {
    if (id === 0x11) return ds4Full(new DataView(d.buffer, d.byteOffset + 2))
    if (id === 0x01) return bt ? short(d) : ds4Full(d)
  }
  return null
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(bytes: Uint8Array) {
  let c = ~0
  for (const b of bytes) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

/** Bluetooth output: the report without its id, CRC over 0xA2, the id and the bytes before it. */
function signed(id: number, body: Uint8Array) {
  const seeded = new Uint8Array(2 + body.length - 4)
  seeded.set([0xa2, id])
  seeded.set(body.subarray(0, body.length - 4), 2)
  new DataView(body.buffer).setUint32(body.length - 4, crc32(seeded), true)
  return body
}

function dualsenseOut(o: WebOutput, bt: boolean, setup: boolean, seq: number): [number, Uint8Array] {
  const c = new Uint8Array(47)
  c[0] = 0x0f
  c[1] = 0x15
  c[2] = o.rumble[1]
  c[3] = o.rumble[0]
  c[8] = +o.micLed
  c.set(o.triggerRight.slice(0, 11), 10)
  c.set(o.triggerLeft.slice(0, 11), 21)
  if (setup) { c[38] = 0x02; c[41] = 0x02 }
  c[43] = (o.players & 0x1f) | 0x20
  c.set(o.color, 44)
  if (!bt) return [0x02, c]
  const r = new Uint8Array(77)
  r[0] = (seq & 0x0f) << 4
  r[1] = 0x10
  r.set(c, 2)
  return [0x31, signed(0x31, r)]
}

function ds4Out(o: WebOutput, bt: boolean): [number, Uint8Array] {
  const c = new Uint8Array(11)
  c[0] = 0x03
  c[3] = o.rumble[1]
  c[4] = o.rumble[0]
  c.set(o.color, 5)
  if (!bt) {
    const r = new Uint8Array(31)
    r.set(c, 0)
    return [0x05, r]
  }
  const r = new Uint8Array(77)
  r[0] = 0xc0
  r.set(c, 2)
  return [0x11, signed(0x11, r)]
}

let hid: { dev: HIDDevice; kind: Kind; bt: boolean; seq: number; setup: boolean } | null = null
let pad: { index: number } | null = null
let last: WebOutput | null = null

/** Counts readings per second and hands at most one frame per animation frame. */
function pacer(h: Handlers) {
  let count = 0, rate = 0, tick = performance.now()
  return (f: Omit<Frame, 'rate'>) => {
    count++
    const now = performance.now()
    if (now - tick >= 1000) { rate = count; count = 0; tick = now }
    h.frame({ ...f, rate })
  }
}

async function feature(dev: HIDDevice, id: number) {
  // Chrome puts the report id first in feature reports (not in input reports): drop it.
  try {
    const v = await dev.receiveFeatureReport(id)
    return v.byteLength && v.getUint8(0) === id ? new DataView(v.buffer, v.byteOffset + 1, v.byteLength - 1) : v
  } catch { return null }
}

async function openHid(dev: HIDDevice, h: Handlers) {
  if (!dev.opened) await dev.open()
  const kind: Kind = DUALSENSE.includes(dev.productId) ? 'dualsense' : 'dualshock4'
  // WebHID doesn't say the bus: a Bluetooth pad has a 0x31 (DualSense) or 0x11 (DS4) input report.
  const btId = kind === 'dualsense' ? 0x31 : 0x11
  const bt = dev.collections.some((c) => c.inputReports?.some((r) => r.reportId === btId))
  const info: Info = { kind, name: dev.productName || 'Wireless Controller', bluetooth: bt, edge: dev.productId === EDGE, mac: null, built: null, hardware: null, firmware: null, update: null }
  const text = (v: DataView, a: number, b: number) => new TextDecoder().decode(new Uint8Array(v.buffer, v.byteOffset + a, b - a)).replace(/\0/g, '').trim()
  const hex = (n: number, w: number) => '0x' + n.toString(16).padStart(w, '0')
  // Reading calibration switches Bluetooth to the full report. Feature data comes without its id.
  if (kind === 'dualsense') {
    await feature(dev, 0x05)
    const m = await feature(dev, 0x09)
    if (m && m.byteLength >= 6) info.mac = Array.from({ length: 6 }, (_, i) => m.getUint8(5 - i).toString(16).padStart(2, '0').toUpperCase()).join(':')
    const f = await feature(dev, 0x20)
    if (f && f.byteLength >= 45) {
      info.built = `${text(f, 0, 11)} ${text(f, 11, 19)}`
      info.hardware = hex(f.getUint32(23, true), 8)
      info.firmware = hex(f.getUint32(27, true), 8)
      info.update = hex(f.getUint16(43, true), 4)
    }
  } else {
    await feature(dev, bt ? 0x05 : 0x02)
    const f = await feature(dev, 0xa3)
    if (f && f.byteLength >= 44) {
      info.built = `${text(f, 0, 16)} ${text(f, 16, 32)}`
      info.hardware = hex(f.getUint16(34, true), 4)
      info.firmware = hex(f.getUint16(40, true), 4)
    }
  }
  hid = { dev, kind, bt, seq: 0, setup: true }
  const push = pacer(h)
  dev.oninputreport = (e) => {
    const f = parse(kind, e.reportId, e.data, bt)
    if (f) push(f)
  }
  h.info(info)
  if (last) webOutput(last)
}

/** Opens a PlayStation pad already allowed on this site, if there is one. */
async function reopen(h: Handlers) {
  if (!hasWebHid() || hid) return
  const devs = await navigator.hid.getDevices()
  const d = devs.find((d) => d.vendorId === SONY && [...DUALSENSE, ...DS4].includes(d.productId))
  if (d) await openHid(d, h).catch((e) => console.error('WebHID', e))
}

/** Asks the browser for a PlayStation pad (needs a click). */
export async function connectHid(h: Handlers) {
  const [d] = await navigator.hid.requestDevice({ filters: [...DUALSENSE, ...DS4].map((productId) => ({ vendorId: SONY, productId })) })
  if (d) await openHid(d, h)
}

// Gamepad API order: A B X Y LB RB LT RT View Menu LS RS Up Down Left Right Guide.
const STANDARD = [0, 1, 2, 3, 12, 13, 14, 15, 4, 5, 6, 7, 10, 11, 8, 9, 16]

function xboxFrame(g: Gamepad): Omit<Frame, 'rate'> {
  const axis = (v: number) => Math.round((Math.max(-1, Math.min(1, v)) + 1) * 127.5)
  const mask = STANDARD.reduce((m, b, i) => (g.buttons[b]?.pressed ? m | (1 << i) : m), 0)
  return { ...blank(), sticks: g.axes.slice(0, 4).map(axis), l2: Math.round((g.buttons[6]?.value ?? 0) * 255), r2: Math.round((g.buttons[7]?.value ?? 0) * 255), buttons: mask }
}

/** Starts listening: Xbox pads through the Gamepad API, PlayStation pads already allowed through WebHID. */
export function startWeb(h: Handlers) {
  reopen(h)
  // The controller keeps the last effect after the page is gone: free the triggers, stop the motors.
  addEventListener('pagehide', () => { if (last) webOutput({ ...last, rumble: [0, 0], impulse: [0, 0], triggerLeft: [0x05], triggerRight: [0x05] }) })
  if (hasWebHid()) {
    navigator.hid.addEventListener('connect', () => reopen(h))
    navigator.hid.addEventListener('disconnect', (e) => {
      if (hid && e.device === hid.dev) { hid = null; h.info(null) }
    })
  }
  const push = pacer(h)
  const poll = () => {
    requestAnimationFrame(poll)
    if (hid) return
    const pads = navigator.getGamepads?.() ?? []
    const g = pad ? pads[pad.index] : pads.find((p) => p && p.mapping === 'standard' && !/054c/i.test(p.id))
    if (!g?.connected) {
      if (pad) { pad = null; h.info(null) }
      return
    }
    if (!pad) {
      pad = { index: g.index }
      h.info({ kind: 'xbox', name: g.id, bluetooth: false, edge: false, mac: null, built: null, hardware: null, firmware: null, update: null })
      if (last) webOutput(last)
    }
    push(xboxFrame(g))
  }
  poll()
}

type Actuator = { playEffect(type: string, params: Record<string, number>): Promise<unknown>; reset(): Promise<unknown> }

export function webOutput(o: WebOutput) {
  last = o
  if (hid) {
    const [id, data] = hid.kind === 'dualsense' ? dualsenseOut(o, hid.bt, hid.setup, hid.seq++) : ds4Out(o, hid.bt)
    hid.setup = false
    hid.dev.sendReport(id, data as BufferSource).catch((e) => console.error('WebHID saída', e))
    return
  }
  const g = pad && navigator.getGamepads()[pad.index]
  const act = (g as unknown as { vibrationActuator?: Actuator } | null)?.vibrationActuator
  if (!act) return
  const [l, r] = o.rumble, [tl, tr] = o.impulse
  if (!l && !r && !tl && !tr) { act.reset().catch(() => {}); return }
  const params = { duration: 5000, strongMagnitude: l / 255, weakMagnitude: r / 255, leftTrigger: tl / 255, rightTrigger: tr / 255 }
  act.playEffect(tl || tr ? 'trigger-rumble' : 'dual-rumble', params).catch(() => act.playEffect('dual-rumble', params).catch(() => {}))
}
