/** Same order as `buttons()` in src-tauri/src/dualsense.rs: bit i of `Frame.buttons`. */
export const BUTTONS = ['Cross', 'Circle', 'Square', 'Triangle', 'Up', 'Down', 'Left', 'Right', 'L1', 'R1', 'L2', 'R2', 'L3', 'R3', 'Create', 'Options', 'PS', 'Touchpad', 'Mute'] as const
export type Button = (typeof BUTTONS)[number]

export const LABEL: Record<Button, string> = {
  Cross: '✕', Circle: '○', Square: '□', Triangle: '△', Up: '↑', Down: '↓', Left: '←', Right: '→',
  L1: 'L1', R1: 'R1', L2: 'L2', R2: 'R2', L3: 'L3', R3: 'R3', Create: 'Create', Options: 'Options', PS: 'PS', Touchpad: 'Touch', Mute: 'Mudo',
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
