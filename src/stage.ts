/**
 * A small 3D stage for one GLB (keyboard, mouse): renderer, lights, orbit camera, and a loop that
 * stops drawing while its canvas isn't on screen. The model is in metres; `scale` sizes it.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type Stage = { root: THREE.Object3D; tick(cb: (t: number) => void): void }

export function createStage(canvas: HTMLCanvasElement, url: string, view: { scale: number; camera: [number, number, number]; target?: [number, number, number] }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.HemisphereLight('#dfe8ff', '#1a1d26', 0.6))
  const key = new THREE.DirectionalLight('#ffffff', 2)
  key.position.set(4, 9, 5)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#7aa2ff', 1)
  rim.position.set(-6, 3, -6)
  scene.add(rim)

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
  camera.position.set(...view.camera)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.target.set(...(view.target ?? [0, 0, 0]))

  const holder = new THREE.Group()
  holder.scale.setScalar(view.scale)
  scene.add(holder)

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(canvas)
  resize()

  let onTick: (t: number) => void = () => {}
  const clock = new THREE.Timer()
  const loop = () => {
    requestAnimationFrame(loop)
    if (document.hidden || !canvas.getClientRects().length) return
    clock.update()
    onTick(clock.getElapsed())
    controls.update()
    renderer.render(scene, camera)
  }
  loop()

  return new GLTFLoader().loadAsync(url).then((gltf): Stage => {
    holder.add(gltf.scene)
    return { root: gltf.scene, tick: (cb) => (onTick = cb) }
  })
}

/** Gives every mesh under `obj` its own materials (so one part can glow alone) and returns them. */
export function ownMaterials(obj: THREE.Object3D) {
  const out: THREE.MeshStandardMaterial[] = []
  obj.traverse((n) => {
    const mesh = n as THREE.Mesh
    if (!mesh.isMesh) return
    const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
      const c = (m as THREE.MeshStandardMaterial).clone()
      c.emissiveIntensity = 0
      out.push(c)
      return c
    })
    mesh.material = Array.isArray(mesh.material) ? list : list[0]
  })
  return out
}

export const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4c8dff'
