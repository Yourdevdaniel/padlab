/**
 * The 3D mouse (public/models/mouse.glb). Each button node carries its MouseEvent.button in userData
 * (-1 for DPI, which the browser never sees). Main clicks swing about their back hinge, side buttons
 * push in, the wheel turns as it scrolls, and the RGB follows the accent colour.
 */
import * as THREE from 'three'
import { accent, createStage, ownMaterials } from './stage'

type Btn = { obj: THREE.Object3D; rest: THREE.Vector3; mats: THREE.MeshStandardMaterial[]; down: boolean; kind: 'click' | 'side' | 'wheel' }

export function mountMouse3d(canvas: HTMLCanvasElement) {
  const buttons = new Map<number, Btn>()
  let wheel: THREE.Object3D | null = null
  let spin = 0
  let rgb: THREE.MeshStandardMaterial[] = []

  createStage(canvas, '/models/mouse.glb', { scale: 22, camera: [1.1, 4.2, 2.4], target: [0, 0.3, -0.15] }).then((stage) => {
    stage.root.traverse((n) => {
      const b = n.userData.button
      if (typeof b !== 'number' || b < 0) return
      const kind = b === 1 ? 'wheel' : b >= 3 ? 'side' : 'click'
      buttons.set(b, { obj: n, rest: n.position.clone(), mats: ownMaterials(n), down: false, kind })
      if (b === 1) wheel = n
    })
    // Every material named mouse_rgb glows in the accent colour; the sensor stays red.
    stage.root.traverse((n) => {
      const mesh = n as THREE.Mesh
      if (!mesh.isMesh) return
      for (const m of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[]) {
        if (m.name === 'mouse_rgb') rgb.push(m)
        if (m.name === 'sensor_led') { m.emissive.fromArray(m.userData.emissiveColor ?? [1, 0, 0]); m.emissiveIntensity = 2 }
      }
    })
    rgb = [...new Set(rgb)]

    const color = new THREE.Color()
    stage.tick(() => {
      color.set(accent())
      for (const m of rgb) { m.emissive.copy(color); m.emissiveIntensity = 1.6 }
      for (const b of buttons.values()) {
        const p = b.obj.position
        if (b.kind === 'click') b.obj.rotation.x += ((b.down ? -0.052 : 0) - b.obj.rotation.x) * 0.5
        if (b.kind === 'side') p.x += (b.rest.x + (b.down ? 0.0012 : 0) - p.x) * 0.5
        if (b.kind === 'wheel') p.y += (b.rest.y - (b.down ? 0.001 : 0) - p.y) * 0.5
        for (const m of b.mats) {
          if (rgb.includes(m)) continue
          m.emissive.copy(color)
          m.emissiveIntensity += ((b.down ? 1.2 : 0) - m.emissiveIntensity) * 0.4
        }
      }
      if (wheel) {
        const step = spin * 0.25
        wheel.rotation.x += step
        spin -= step
      }
    })
  }).catch((e) => console.error('mouse 3D', e))

  return {
    press(button: number, down: boolean) {
      const b = buttons.get(button)
      if (b) b.down = down
    },
    /** One notch turns the wheel a little; up rolls the top of the wheel away from the hand. */
    scroll(deltaY: number) { spin += Math.sign(deltaY) * 0.5 },
  }
}
