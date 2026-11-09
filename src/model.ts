/**
 * A stylised gamepad built from primitives (no downloaded model): a white shell, a dark centre,
 * moving sticks, triggers that sink as they're pulled, buttons that light up, and a lightbar in the
 * colour the page sends to the controller.
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BUTTONS, type Frame, type Kind } from './pad'

const TOP = 0.66

export type Scene = {
  update(frame: Frame | null, opts: { color: string; players: number; mic: boolean; shake: number; follow: boolean }): void
  kick(amount: number): void
  setKind(kind: Kind): void
}

function shell() {
  const s = new THREE.Shape()
  s.moveTo(-1.5, 1.25)
  s.lineTo(1.5, 1.25)
  s.bezierCurveTo(2.4, 1.38, 2.92, 1.12, 3.06, 0.4)
  s.bezierCurveTo(3.26, -0.5, 3.32, -1.6, 2.96, -2.22)
  s.bezierCurveTo(2.7, -2.62, 2.12, -2.56, 1.94, -2.0)
  s.bezierCurveTo(1.74, -1.48, 1.44, -1.02, 1.0, -0.98)
  s.lineTo(-1.0, -0.98)
  s.bezierCurveTo(-1.44, -1.02, -1.74, -1.48, -1.94, -2.0)
  s.bezierCurveTo(-2.12, -2.56, -2.7, -2.62, -2.96, -2.22)
  s.bezierCurveTo(-3.32, -1.6, -3.26, -0.5, -3.06, 0.4)
  s.bezierCurveTo(-2.92, 1.12, -2.4, 1.38, -1.5, 1.25)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.48, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 8, curveSegments: 48 })
  g.rotateX(-Math.PI / 2)
  return g
}

function roundedPanel(w: number, d: number, r: number, h: number) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -d / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d)
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 })
  g.rotateX(-Math.PI / 2)
  return g
}

const XBOX: Record<string, [string, string]> = { Cross: ['A', '#5fd068'], Circle: ['B', '#ff5d5d'], Square: ['X', '#4c9dff'], Triangle: ['Y', '#ffcf3f'] }

function symbol(kind: string, xbox = false) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#15171c'
  g.fillRect(0, 0, 128, 128)
  g.strokeStyle = '#c9ced8'
  g.lineWidth = 9
  g.lineCap = g.lineJoin = 'round'
  g.beginPath()
  if (xbox) {
    const [letter, color] = XBOX[kind]
    g.fillStyle = color
    g.font = 'bold 72px "Segoe UI", sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(letter, 64, 68)
  } else if (kind === 'Triangle') { g.moveTo(64, 34); g.lineTo(94, 88); g.lineTo(34, 88); g.closePath() }
  else if (kind === 'Circle') g.arc(64, 64, 30, 0, Math.PI * 2)
  else if (kind === 'Cross') { g.moveTo(38, 38); g.lineTo(90, 90); g.moveTo(90, 38); g.lineTo(38, 90) }
  else if (kind === 'Square') g.rect(38, 38, 52, 52)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
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
  key.shadow.mapSize.set(2048, 2048)
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

  const white = new THREE.MeshPhysicalMaterial({ color: '#eef0f4', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 })
  const black = new THREE.MeshPhysicalMaterial({ color: '#16181d', roughness: 0.5, clearcoat: 0.3 })
  const gloss = new THREE.MeshPhysicalMaterial({ color: '#0f1115', roughness: 0.18, clearcoat: 1 })
  const accent = new THREE.Color('#4c8dff')

  const pad = new THREE.Group()
  scene.add(pad)
  const body = new THREE.Group()
  pad.add(body)
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = m.receiveShadow = true
    parent.add(m)
    return m
  }

  mesh(shell(), white)
  mesh(roundedPanel(2.5, 2.3, 0.3, 0.04), black, 0, TOP - 0.02, -0.1)

  // Touchpad, with the lightbar along both sides and dots for each finger.
  const touchMat = new THREE.MeshPhysicalMaterial({ color: '#e6e9ef', roughness: 0.55, emissive: accent.clone(), emissiveIntensity: 0 })
  const touchpad = mesh(roundedPanel(2.1, 1.15, 0.12, 0.05), touchMat, 0, TOP + 0.03, -0.62)
  const lightMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: accent.clone(), emissiveIntensity: 2.4 })
  const lightSides = [-1.12, 1.12].map((x) => mesh(new THREE.BoxGeometry(0.05, 0.05, 1.05), lightMat, x, TOP + 0.06, -0.62))
  // The DualShock 4 has its lightbar on the back edge instead.
  const lightBack = mesh(new THREE.BoxGeometry(1.9, 0.08, 0.06), lightMat, 0, 0.42, -1.48)
  lightBack.visible = false
  const fingers = [0, 1].map((i) => {
    const m = mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: i ? '#ef476f' : '#ffd166' }), 0, TOP + 0.12, 0)
    m.visible = false
    return m
  })

  // Player LEDs under the touchpad.
  const ledMats = [0, 1, 2, 3, 4].map(() => new THREE.MeshStandardMaterial({ color: '#333', emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 }))
  const ledMeshes = ledMats.map((m, i) => mesh(new THREE.BoxGeometry(0.06, 0.03, 0.025), m, (i - 2) * 0.13, TOP + 0.02, 0.0))

  const buttons = new Map<string, { obj: THREE.Object3D; mat: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial; rest: number }>()
  const button = (name: string, obj: THREE.Mesh) => {
    const mat = (Array.isArray(obj.material) ? obj.material[1] : obj.material) as THREE.MeshPhysicalMaterial
    mat.emissive = accent.clone()
    mat.emissiveIntensity = 0
    buttons.set(name, { obj, mat, rest: obj.position.y })
  }

  // Face buttons.
  const face: [string, number, number][] = [['Triangle', 0, -0.4], ['Cross', 0, 0.4], ['Square', -0.4, 0], ['Circle', 0.4, 0]]
  const faceTops = new Map<string, THREE.MeshPhysicalMaterial>()
  for (const [name, dx, dz] of face) {
    const top = new THREE.MeshPhysicalMaterial({ map: symbol(name), roughness: 0.25, clearcoat: 1 })
    faceTops.set(name, top)
    const b = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 40), [gloss.clone(), top, gloss.clone()] as unknown as THREE.Material, 2.1 + dx, TOP + 0.06, 0.02 + dz)
    button(name, b)
  }
  // D-pad.
  const dpad: [string, number, number, number][] = [['Up', 0, -0.33, 0], ['Down', 0, 0.33, 0], ['Left', -0.33, 0, 1], ['Right', 0.33, 0, 1]]
  const dpadGroup = new THREE.Group()
  dpadGroup.position.set(-2.1, 0, 0.02)
  body.add(dpadGroup)
  for (const [name, dx, dz, turn] of dpad) {
    const b = mesh(new THREE.BoxGeometry(0.24, 0.12, 0.34), gloss.clone(), dx, TOP + 0.05, dz, dpadGroup)
    b.rotation.y = (turn * Math.PI) / 2
    button(name, b)
  }
  // Small buttons.
  const create = mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 12), gloss.clone(), -1.38, TOP + 0.04, -1.0)
  const options = mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 12), gloss.clone(), 1.38, TOP + 0.04, -1.0)
  button('Create', create)
  button('Options', options)
  const ps = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 32), gloss.clone(), 0, TOP + 0.03, 0.62)
  button('PS', ps)
  const muteMat = new THREE.MeshStandardMaterial({ color: '#22252c', emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 })
  const mute = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.08), muteMat, 0, TOP + 0.02, 0.88)
  buttons.set('Mute', { obj: mute, mat: muteMat, rest: mute.position.y })
  buttons.set('Touchpad', { obj: touchpad, mat: touchMat, rest: touchpad.position.y })

  // Sticks: a base ring, and a cap that tilts with the stick and sinks for L3/R3.
  const sticks = [-1.02, 1.02].map((x, i) => {
    const group = new THREE.Group()
    group.position.set(x, 0, 0.92)
    body.add(group)
    mesh(new THREE.TorusGeometry(0.36, 0.05, 12, 40).rotateX(Math.PI / 2), black, 0, TOP + 0.02, 0, group)
    const pivot = new THREE.Group()
    pivot.position.set(0, TOP, 0)
    group.add(pivot)
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 20), black, 0, 0.14, 0, pivot)
    const capMat = new THREE.MeshPhysicalMaterial({ color: '#1b1d22', roughness: 0.75, emissive: accent.clone(), emissiveIntensity: 0 })
    const cap = mesh(new THREE.CylinderGeometry(0.32, 0.29, 0.1, 40), capMat, 0, 0.32, 0, pivot)
    mesh(new THREE.TorusGeometry(0.27, 0.025, 8, 40).rotateX(Math.PI / 2), black, 0, 0.37, 0, pivot)
    buttons.set(i ? 'R3' : 'L3', { obj: pivot, mat: capMat, rest: pivot.position.y })
    return { group, pivot, cap }
  })

  // Shoulders: bumpers, and triggers on a hinge so they swing down as they're pulled.
  const bumpers = [-1, 1].map((side) => {
    const b = mesh(new THREE.BoxGeometry(0.95, 0.16, 0.26), black.clone(), side * 2.15, 0.38, -1.42)
    button(side < 0 ? 'L1' : 'R1', b)
    return b
  })
  const triggers = [-1, 1].map((side) => {
    const hinge = new THREE.Group()
    hinge.position.set(side * 2.15, 0.1, -1.38)
    body.add(hinge)
    const t = mesh(new THREE.BoxGeometry(0.9, 0.22, 0.62), black.clone(), 0, -0.05, -0.32, hinge)
    t.rotation.x = 0.25
    button(side < 0 ? 'L2' : 'R2', t)
    return hinge
  })
  void bumpers

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(canvas)
  resize()

  let tilt = new THREE.Euler()
  let recoil = 0
  const clock = new THREE.Timer()
  let last: Frame | null = null
  let opts = { color: '#4c8dff', players: 0b00100, mic: false, shake: 0, follow: true }

  const loop = () => {
    requestAnimationFrame(loop)
    clock.update()
    const t = clock.getElapsed()
    const f = last
    accent.set(opts.color)
    lightMat.emissive.set(opts.color)
    lightMat.emissiveIntensity = f ? 2.4 + Math.sin(t * 2) * 0.3 : 0.4
    ledMats.forEach((m, i) => (m.emissiveIntensity = opts.players & (1 << i) ? 3 : 0))
    muteMat.emissiveIntensity = opts.mic ? 2.5 : 0

    const on = f ? f.buttons : 0
    BUTTONS.forEach((name, i) => {
      const b = buttons.get(name)
      if (!b) return
      const pressed = (on >> i) & 1
      b.mat.emissive.set(name === 'Mute' ? '#ff7a1a' : opts.color)
      const want = pressed ? (name === 'Mute' ? 3 : 1.6) : name === 'Mute' && opts.mic ? 2.5 : 0
      b.mat.emissiveIntensity += (want - b.mat.emissiveIntensity) * 0.35
      if (!['Touchpad', 'L2', 'R2'].includes(name)) b.obj.position.y += (b.rest - (pressed ? 0.05 : 0) - b.obj.position.y) * 0.5
    })

    if (f) {
      const s = f.sticks.map((v) => Math.max(-1, Math.min(1, (v - 128) / 127)))
      sticks[0].pivot.rotation.set(s[1] * 0.4, 0, -s[0] * 0.4)
      sticks[1].pivot.rotation.set(s[3] * 0.4, 0, -s[2] * 0.4)
      triggers[0].rotation.x += (-(f.l2 / 255) * 0.55 - triggers[0].rotation.x) * 0.5
      triggers[1].rotation.x += (-(f.r2 / 255) * 0.55 - triggers[1].rotation.x) * 0.5
      f.touch.forEach((p, i) => {
        fingers[i].visible = p.down
        if (p.down) fingers[i].position.set(-1.0 + (p.x / 1920) * 2.0, TOP + 0.12, -1.15 + (p.y / 1080) * 1.05)
      })
      if (opts.follow && f.full) {
        // Tilt from gravity: the accelerometer, smoothed. Spin (yaw) is left to the mouse.
        const [ax, ay, az] = f.accel
        const want = new THREE.Euler(Math.atan2(az, ay) * 0.9, 0, -Math.atan2(ax, ay) * 0.9)
        tilt = new THREE.Euler(tilt.x + (want.x - tilt.x) * 0.15, 0, tilt.z + (want.z - tilt.z) * 0.15)
      }
    }
    if (!opts.follow || !f) tilt = new THREE.Euler(tilt.x * 0.9, 0, tilt.z * 0.9)

    recoil *= 0.82
    const shake = opts.shake + recoil
    pad.rotation.set(tilt.x - recoil * 0.25, Math.sin(t * 0.4) * 0.04, tilt.z)
    pad.position.set((Math.random() - 0.5) * shake * 0.08, Math.sin(t * 1.1) * 0.05 + (Math.random() - 0.5) * shake * 0.05, recoil * 0.2)
    controls.update()
    renderer.render(scene, camera)
  }
  loop()

  const place = (o: THREE.Object3D, x: number, z: number) => o.position.set(x, o.position.y, z)
  return {
    setKind(kind) {
      const xbox = kind === 'xbox'
      // Xbox: left stick up top, d-pad below it; no touchpad, a glowing guide button instead.
      place(sticks[0].group, xbox ? -2.1 : -1.02, xbox ? 0.02 : 0.92)
      place(dpadGroup, xbox ? -1.02 : -2.1, xbox ? 0.92 : 0.02)
      touchpad.visible = !xbox
      lightSides.forEach((m) => (m.visible = kind === 'dualsense'))
      lightBack.visible = kind === 'dualshock4'
      ledMeshes.forEach((m) => (m.visible = kind === 'dualsense'))
      mute.visible = kind === 'dualsense'
      place(ps, 0, xbox ? -0.75 : 0.62)
      ps.scale.setScalar(xbox ? 1.8 : 1)
      place(create, xbox ? -0.5 : -1.38, xbox ? -0.2 : -1.0)
      place(options, xbox ? 0.5 : 1.38, xbox ? -0.2 : -1.0)
      for (const [name, mat] of faceTops) {
        mat.map?.dispose()
        mat.map = symbol(name, xbox)
        mat.needsUpdate = true
      }
      white.color.set(xbox ? '#2a2d33' : '#eef0f4')
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
