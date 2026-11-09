/**
 * The 3D controller: one GLB per kind (public/models, generated in Blender), animated by node name.
 * Buttons sink and glow, sticks tilt on their base pivot, triggers swing on their hinge, the lightbar
 * and player LEDs light up with what the page sends to the controller.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BUTTONS, type Button, type Frame, type Kind } from './pad'

export type Scene = {
  update(frame: Frame | null, opts: { color: string; players: number; mic: boolean; shake: number; follow: boolean }): void
  kick(amount: number): void
  setKind(kind: Kind): void
}

/** Models are in metres; the scene (camera, floor, shake) was laid out for a pad ~6 units wide. */
const SCALE = 37.5
/** How far a button sinks when pressed, in metres. */
const PRESS = 0.0012

const NODE: Partial<Record<Button, string>> = {
  Cross: 'btn_cross', Circle: 'btn_circle', Square: 'btn_square', Triangle: 'btn_triangle',
  Up: 'dpad_up', Down: 'dpad_down', Left: 'dpad_left', Right: 'dpad_right',
  L1: 'l1', R1: 'r1', L2: 'l2', R2: 'r2', L3: 'stick_l', R3: 'stick_r',
  Create: 'btn_create', Options: 'btn_options', PS: 'btn_ps', Touchpad: 'touchpad', Mute: 'btn_mute',
}

type Part = { obj: THREE.Object3D; rest: THREE.Vector3; mats: THREE.MeshStandardMaterial[] }

type Model = {
  root: THREE.Object3D
  parts: Map<Button, Part>
  lightbar: THREE.MeshStandardMaterial[]
  leds: THREE.MeshStandardMaterial[][]
  touch: THREE.Box3 | null
  fingers: THREE.Mesh[]
}

/** Gives every mesh under `obj` its own copy of its materials, so one part can glow on its own. */
function ownMaterials(obj: THREE.Object3D, keep?: (m: THREE.MeshStandardMaterial) => boolean) {
  const out: THREE.MeshStandardMaterial[] = []
  obj.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (!mesh.isMesh) return
    const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.MeshStandardMaterial).clone()
      if (!keep || keep(c)) {
        c.emissiveIntensity = 0
        out.push(c)
      }
      return c
    })
    mesh.material = Array.isArray(mesh.material) ? list : list[0]
  })
  return out
}

function prepare(gltf: { scene: THREE.Group }): Model {
  const root = gltf.scene
  // Parts mounted on another moving part follow it (README of the models).
  const mounted: THREE.Object3D[] = []
  root.traverse((n) => { if (n.userData.attachTo) mounted.push(n) })
  for (const n of mounted) root.getObjectByName(n.userData.attachTo)?.attach(n)

  root.traverse((n) => { if ((n as THREE.Mesh).isMesh) n.castShadow = n.receiveShadow = true })

  const parts = new Map<Button, Part>()
  for (const b of BUTTONS) {
    const obj = NODE[b] && root.getObjectByName(NODE[b]!)
    if (!obj) continue
    parts.set(b, { obj, rest: obj.position.clone(), mats: ownMaterials(obj) })
  }

  // Emissive materials load dark; their colour is in userData.emissiveColor.
  const glow = (name: string) => (m: THREE.MeshStandardMaterial) => m.name === name
  const lightbar: THREE.MeshStandardMaterial[] = []
  const bar = root.getObjectByName('lightbar')
  if (bar) lightbar.push(...ownMaterials(bar, glow('lightbar')))
  const leds = [1, 2, 3, 4, 5].map((i) => {
    const led = root.getObjectByName(`led_${i}`)
    return led ? ownMaterials(led, glow('player_led')) : []
  })

  let touch: THREE.Box3 | null = null
  const fingers: THREE.Mesh[] = []
  const pad = parts.get('Touchpad')
  if (pad) {
    root.updateMatrixWorld(true)
    touch = new THREE.Box3().setFromObject(pad.obj)
    for (const color of ['#ffd166', '#ef476f']) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0019, 16, 12), new THREE.MeshBasicMaterial({ color }))
      dot.visible = false
      root.add(dot)
      fingers.push(dot)
    }
  }
  return { root, parts, lightbar, leds, touch, fingers }
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  camera.position.set(0, 9.5, 11.5)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 6
  controls.maxDistance = 16
  controls.target.set(0, 0.2, -0.3)

  scene.add(new THREE.HemisphereLight('#dfe8ff', '#1a1d26', 0.6))
  const key = new THREE.DirectionalLight('#ffffff', 2.2)
  key.position.set(4, 9, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = key.shadow.camera.bottom = -6
  key.shadow.camera.right = key.shadow.camera.top = 6
  scene.add(key)
  const rim = new THREE.DirectionalLight('#7aa2ff', 1.2)
  rim.position.set(-6, 3, -6)
  scene.add(rim)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.35 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.9
  floor.receiveShadow = true
  scene.add(floor)

  const pad = new THREE.Group()
  scene.add(pad)
  const holder = new THREE.Group()
  holder.scale.setScalar(SCALE)
  holder.position.y = -0.85
  pad.add(holder)

  // Only the model on screen is loaded, the first time it's needed.
  const models = new Map<Kind, Model>()
  const loading = new Set<Kind>()
  let kind: Kind = 'dualsense'
  const loader = new GLTFLoader()
  const show = () => {
    models.forEach((m, k) => (m.root.visible = k === kind))
    if (models.has(kind) || loading.has(kind)) return
    const k = kind
    loading.add(k)
    loader.loadAsync(`/models/${k}.glb`).then((gltf) => {
      const m = prepare(gltf)
      models.set(k, m)
      holder.add(m.root)
      show()
    }).catch((e) => console.error(`modelo ${k}`, e)).finally(() => loading.delete(k))
  }
  show()

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(canvas)
  resize()

  // Tilt from gravity, as a quaternion: no Euler angles, so no jump past 90°.
  const tilt = new THREE.Quaternion()
  const want = new THREE.Quaternion()
  const level = new THREE.Quaternion()
  const extra = new THREE.Quaternion()
  const gravity = new THREE.Vector3()
  const smooth = new THREE.Vector3()
  const candidate = new THREE.Quaternion()
  const UP = new THREE.Vector3(0, 1, 0)
  /** Typical accelerometer length at rest (1 g), learnt from the readings. */
  let oneG = 0
  let recoil = 0
  const clock = new THREE.Timer()
  let last: Frame | null = null
  let opts = { color: '#4c8dff', players: 0b00100, mic: false, shake: 0, follow: true }
  const accent = new THREE.Color()
  const orange = new THREE.Color('#ff7a1a')

  const animate = (m: Model, f: Frame | null, t: number) => {
    accent.set(opts.color)
    for (const mat of m.lightbar) {
      mat.emissive.copy(accent)
      mat.emissiveIntensity = f ? 2.4 + Math.sin(t * 2) * 0.3 : 0.4
    }
    m.leds.forEach((mats, i) => mats.forEach((mat) => {
      mat.emissive.fromArray(mat.userData.emissiveColor ?? [1, 1, 1])
      mat.emissiveIntensity = opts.players & (1 << i) ? 3 : 0
    }))

    const on = f ? f.buttons : 0
    BUTTONS.forEach((name, i) => {
      const p = m.parts.get(name)
      if (!p) return
      const pressed = (on >> i) & 1
      const mute = name === 'Mute'
      const want = pressed ? (mute ? 3 : 1.2) : mute && opts.mic ? 2.5 : 0
      for (const mat of p.mats) {
        mat.emissive.copy(mute ? orange : accent)
        mat.emissiveIntensity += (want - mat.emissiveIntensity) * 0.35
      }
      if (name !== 'L2' && name !== 'R2') p.obj.position.y += (p.rest.y - (pressed ? PRESS : 0) - p.obj.position.y) * 0.5
    })

    const stickL = m.parts.get('L3'), stickR = m.parts.get('R3')
    const trigL = m.parts.get('L2'), trigR = m.parts.get('R2')
    if (f) {
      // Small dead zone so a stick at rest doesn't twitch on the model.
      const s = f.sticks.map((v) => { const x = Math.max(-1, Math.min(1, (v - 128) / 127)); return Math.abs(x) < 0.06 ? 0 : x })
      stickL?.obj.rotation.set(s[1] * 0.35, 0, -s[0] * 0.35)
      stickR?.obj.rotation.set(s[3] * 0.35, 0, -s[2] * 0.35)
    }
    // Triggers hang below a hinge parallel to X; a negative turn swings the tip toward the player.
    const pull = (p: Part | undefined, v: number) => { if (p) p.obj.rotation.x += (-(v / 255) * 0.35 - p.obj.rotation.x) * 0.5 }
    pull(trigL, f ? f.l2 : 0)
    pull(trigR, f ? f.r2 : 0)

    if (m.touch) {
      const b = m.touch
      m.fingers.forEach((dot, i) => {
        const p = f?.touch[i]
        dot.visible = !!p?.down
        if (p?.down) dot.position.set(b.min.x + (p.x / 1920) * (b.max.x - b.min.x), b.max.y + 0.001, b.min.z + (p.y / 1080) * (b.max.z - b.min.z))
      })
    }
  }

  const loop = () => {
    requestAnimationFrame(loop)
    // Nothing to draw when the controller page isn't showing (other tab, minimised window).
    if (document.hidden || !canvas.getClientRects().length) return
    clock.update()
    const t = clock.getElapsed()
    const f = last
    const m = models.get(kind)
    if (m) animate(m, f, t)

    let target = level
    if (f && opts.follow && f.full) {
      // The accelerometer at rest points up, in the controller's own axes (x right, y up, z toward
      // the player). The turn that takes it to world up is the controller's tilt. Yaw is left to the mouse.
      gravity.fromArray(f.accel)
      const len = gravity.length()
      if (len > 0) {
        oneG = oneG ? oneG + (len - oneG) * 0.01 : len
        // A shake or a swing isn't gravity: keep the last tilt until the hand settles.
        if (Math.abs(len / oneG - 1) < 0.25) {
          // Low-pass the reading, then ignore turns under ~3°: the hand's tremor never reaches the model.
          smooth.lerp(gravity.divideScalar(len), smooth.lengthSq() ? 0.1 : 1)
          candidate.setFromUnitVectors(smooth.clone().normalize(), UP)
          if (want.angleTo(candidate) > 0.05) want.copy(candidate)
        }
        target = want
      }
    }
    tilt.slerp(target, 0.06)

    recoil *= 0.82
    const shake = opts.shake + recoil
    extra.setFromEuler(new THREE.Euler(-recoil * 0.25, Math.sin(t * 0.4) * 0.04, 0))
    pad.quaternion.copy(tilt).multiply(extra)
    // Vibration as a smooth fast wobble, not a new random spot every frame (that read as jitter).
    const buzz = shake * 0.03
    pad.position.set(Math.sin(t * 37) * buzz, Math.sin(t * 1.1) * 0.05 + Math.sin(t * 29 + 1) * buzz * 0.6, recoil * 0.2)
    controls.update()
    renderer.render(scene, camera)
  }
  loop()

  return {
    setKind(k) {
      kind = k
      show()
    },
    update(frame, o) {
      last = frame
      opts = o
    },
    kick(amount) {
      recoil = Math.max(recoil, amount)
    },
  }
}
