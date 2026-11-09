/**
 * The 3D keyboard (public/models/keyboard.glb): one node per key named `key_<KeyboardEvent.code>`,
 * with its label in userData. Keys sink and glow while held and keep a tint once tested; the lock
 * LEDs follow Caps, Num and Scroll Lock.
 */
import * as THREE from 'three'
import { accent, createStage, ownMaterials } from './stage'

const PRESS = 0.0035
const TESTED = new THREE.Color('#3ecf8e')

type Key = { obj: THREE.Object3D; rest: number; mats: THREE.MeshStandardMaterial[]; down: boolean; tested: boolean }

/** Draws the label on the key top. The top has its own 0..1 UVs, upper edge toward the F row. */
function legend(mat: THREE.MeshStandardMaterial, label: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#' + mat.color.getHexString(THREE.SRGBColorSpace)
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#d9dde6'
  g.font = `600 ${label.length > 3 ? 30 : label.length > 1 ? 40 : 56}px "Segoe UI", sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(label, 64, 66)
  const t = new THREE.CanvasTexture(c)
  t.flipY = false
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  mat.map = t
  mat.color.set('#ffffff')
  mat.needsUpdate = true
}

export function mountKeyboard3d(canvas: HTMLCanvasElement) {
  const keys = new Map<string, Key>()
  const leds: Record<string, THREE.MeshStandardMaterial[]> = {}
  let underglow: THREE.MeshStandardMaterial[] = []

  createStage(canvas, '/models/keyboard.glb', { scale: 10, camera: [0, 2.1, 1.55], target: [0, 0, 0.08] }).then((stage) => {
    stage.root.traverse((n) => {
      // The key node carries `code`; its meshes (key_X_1, key_X_2…) are children and are covered by it.
      if (!n.userData.code) return
      const mats = ownMaterials(n)
      const top = mats.find((m) => m.name.startsWith('key_top'))
      if (top && n.userData.label) legend(top, String(n.userData.label))
      keys.set(n.userData.code, { obj: n, rest: n.position.y, mats, down: false, tested: false })
    })
    for (const name of ['caps', 'num', 'scroll']) {
      const led = stage.root.getObjectByName(`led_${name}`)
      leds[name] = led ? ownMaterials(led) : []
    }
    const glow = stage.root.getObjectByName('underglow')
    if (glow) underglow = ownMaterials(glow)

    const color = new THREE.Color()
    stage.tick(() => {
      color.set(accent())
      for (const m of underglow) { m.emissive.copy(color); m.emissiveIntensity = 0.8 }
      for (const k of keys.values()) {
        k.obj.position.y += (k.rest - (k.down ? PRESS : 0) - k.obj.position.y) * 0.5
        const want = k.down ? 1.4 : k.tested ? 0.18 : 0
        for (const m of k.mats) {
          m.emissive.copy(k.down ? color : TESTED)
          m.emissiveIntensity += (want - m.emissiveIntensity) * 0.4
        }
      }
    })
  }).catch((e) => console.error('teclado 3D', e))

  return {
    press(code: string, down: boolean) {
      const k = keys.get(code)
      if (!k) return
      k.down = down
      if (down) k.tested = true
    },
    releaseAll() { for (const k of keys.values()) k.down = false },
    reset() { for (const k of keys.values()) k.tested = false },
    locks(e: KeyboardEvent) {
      const on = { caps: e.getModifierState('CapsLock'), num: e.getModifierState('NumLock'), scroll: e.getModifierState('ScrollLock') }
      for (const [name, lit] of Object.entries(on)) for (const m of leds[name] ?? []) {
        m.emissive.fromArray(m.userData.emissiveColor ?? [0.2, 1, 0.4])
        m.emissiveIntensity = lit ? 3 : 0
      }
    },
  }
}
