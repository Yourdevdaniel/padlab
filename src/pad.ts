/** Same order as `buttons()` in src-tauri/src/dualsense.rs: bit i of `Frame.buttons`. */
export const BUTTONS = ['Cross', 'Circle', 'Square', 'Triangle', 'Up', 'Down', 'Left', 'Right', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'Create', 'Options', 'PS', 'Touchpad', 'Mute'] as const
export type Button = (typeof BUTTONS)[number]

export const LABEL: Record<Button, string> = {
  Cross: '✕', Circle: '○', Square: '□', Triangle: '△', Up: '↑', Down: '↓', Left: '←', Right: '→',
  L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', L3: 'L3', R3: 'R3', Create: 'Create', Options: 'Options', PS: 'PS', Touchpad: 'Touch', Mute: 'Mudo',
}

export type Kind = 'dualsense' | 'dualshock4' | 'xbox'

export const KIND_NAME: Record<Kind, string> = { dualsense: 'DualSense', dualshock4: 'DualShock 4', xbox: 'Controle Xbox' }

/** What each controller has: the page hides what it doesn't. */
export const HAS: Record<Kind, { touch: boolean; motion: boolean; lightbar: boolean; players: boolean; micLed: boolean; adaptive: boolean; impulse: boolean; buttons: Button[] }> = {
  dualsense: { touch: true, motion: true, lightbar: true, players: true, micLed: true, adaptive: true, impulse: false, buttons: [...BUTTONS] },
  dualshock4: { touch: true, motion: true, lightbar: true, players: false, micLed: false, adaptive: false, impulse: false, buttons: BUTTONS.filter((b) => b !== 'Mute') },
  xbox: { touch: false, motion: false, lightbar: false, players: false, micLed: false, adaptive: false, impulse: true, buttons: BUTTONS.filter((b) => !['PS', 'Touchpad', 'Mute'].includes(b)) },
}

const XBOX_LABEL: Partial<Record<Button, string>> = { Cross: 'A', Circle: 'B', Square: 'X', Triangle: 'Y', L1: 'LB', R1: 'RB', L2: 'LT', R2: 'RT', L3: 'LS', R3: 'RS', Create: 'View', Options: 'Menu' }

export function labelFor(kind: Kind, b: Button) {
  if (kind === 'xbox') return XBOX_LABEL[b] ?? LABEL[b]
  if (kind === 'dualshock4' && b === 'Create') return 'Share'
  return LABEL[b]
}

export type Touch = { down: boolean; x: number; y: number }

export type Frame = {
  sticks: number[]
  l2: number
  r2: number
  buttons: number
  gyro: number[]
  accel: number[]
  touch: Touch[]
  battery: number | null
  charge: number | null
  headphones: boolean
  mic: boolean
  full: boolean
  rate: number
}

export type Info = {
  kind: Kind
  name: string
  bluetooth: boolean
  edge: boolean
  mac: string | null
  built: string | null
  hardware: string | null
  firmware: string | null
  update: string | null
}

export const CHARGE: Record<number, string> = { 0: 'Na bateria', 1: 'Carregando', 2: 'Carga completa', 10: 'Tensão fora do normal', 11: 'Temperatura fora do normal', 15: 'Erro de carga' }
