<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// ── Constants ──────────────────────────────────────────────────────────────
const RADIUS       = 2.8
const SPHERE_COUNT = 700
const BG_COUNT     = 400
const ACCENT = 0x8B5CF6
const BRIGHT = 0xC4B5FD

// ── Canvas ─────────────────────────────────────────────────────────────────
const canvas = ref<HTMLCanvasElement | null>(null)

// ── Scene objects ──────────────────────────────────────────────────────────
let renderer:  THREE.WebGLRenderer | null = null
let composer:  EffectComposer       | null = null
let bloomPass: UnrealBloomPass      | null = null

let scene!:       THREE.Scene
let camera!:      THREE.PerspectiveCamera
let clock!:       THREE.Clock
let sphereGroup!: THREE.Group
let bgGroup!:     THREE.Group

// Sphere
let sphereGeo!:     THREE.BufferGeometry
let sphereOrigPos!: Float32Array
let spherePosBuf!:  Float32Array
let connectionsMat: THREE.LineBasicMaterial | null = null
let topNodeMat!:    THREE.MeshBasicMaterial
let topNodeMesh!:   THREE.Mesh

// Rings
type RingData = {
  line: THREE.Line; mat: THREE.LineBasicMaterial
  speed: number; baseRotX: number; baseOpacity: number
  wobbleMag: number; wobblePhase: number; pulsePhase: number
}
let rings: RingData[] = []

// Glow sprites
type GlowData = { sprite: THREE.Sprite; mat: THREE.SpriteMaterial; baseOpacity: number; baseScale: number }
let glowSprites: GlowData[] = []

// Energy streams
type StreamData = { line: THREE.Line; mat: THREE.LineBasicMaterial; phase: number; rotSpeed: number }
let streams: StreamData[] = []

// Ground
let groundRingMats: THREE.LineBasicMaterial[] = []
let scanRingLine:   THREE.Line                | null = null
let scanRingMat:    THREE.LineBasicMaterial   | null = null
type PulseRing = { line: THREE.Line; mat: THREE.LineBasicMaterial; delay: number }
let pulseRings:  PulseRing[] = []
let projDiscMat!: THREE.MeshBasicMaterial
let beamMat!:     THREE.MeshBasicMaterial

// Mouse + timing
const mouse  = { x: 0, y: 0 }
const smooth = { x: 0, y: 0 }
let enterT  = 0
const ENTER_DUR = 1.4
let lastT = 0
let rafId = 0
let ro: ResizeObserver | null = null

// Disposal lists
const geos: THREE.BufferGeometry[] = []
const mats: THREE.Material[]       = []
const texs: THREE.Texture[]        = []

// ── Cleanup helpers ────────────────────────────────────────────────────────
function trackG<T extends THREE.BufferGeometry>(g: T): T { geos.push(g); return g }
function trackM<T extends THREE.Material>(m: T): T       { mats.push(m); return m }
function trackT<T extends THREE.Texture>(t: T): T        { texs.push(t); return t }

// ── Fibonacci sphere ───────────────────────────────────────────────────────
function fibonacci(n: number, r: number): Float32Array {
  const buf = new Float32Array(n * 3)
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y  = 1 - (i / (n - 1)) * 2
    const rr = Math.sqrt(Math.max(0, 1 - y * y)) * r
    const a  = phi * i
    buf[i*3]   = Math.cos(a) * rr
    buf[i*3+1] = y * r
    buf[i*3+2] = Math.sin(a) * rr
  }
  return buf
}

// ── Connection lines with distance-faded vertex colours ────────────────────
function buildConnections(pos: Float32Array, n: number, maxDist: number, cap: number) {
  const ps: number[] = [], cs: number[] = []
  const cr = 0x8B/255, cg = 0x5C/255, cb = 0xF6/255
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pos[i*3]!   - pos[j*3]!
      const dy = pos[i*3+1]! - pos[j*3+1]!
      const dz = pos[i*3+2]! - pos[j*3+2]!
      const d2 = dx*dx + dy*dy + dz*dz
      if (d2 < maxDist * maxDist) {
        const a = (1 - Math.sqrt(d2) / maxDist) * 0.72
        ps.push(pos[i*3]!, pos[i*3+1]!, pos[i*3+2]!, pos[j*3]!, pos[j*3+1]!, pos[j*3+2]!)
        cs.push(cr*a, cg*a, cb*a, cr*a*0.22, cg*a*0.22, cb*a*0.22)
        if (ps.length / 6 >= cap) break outer
      }
    }
  }
  return { pos: new Float32Array(ps), col: new Float32Array(cs) }
}

// ── Glow texture ───────────────────────────────────────────────────────────
function makeGlowTex(): THREE.Texture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(S/2, S/2, 0, S/2, S/2, S/2)
  g.addColorStop(0,    'rgba(196,181,253,0.88)')
  g.addColorStop(0.28, 'rgba(139,92,246,0.48)')
  g.addColorStop(0.62, 'rgba(109,40,217,0.16)')
  g.addColorStop(1,    'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return trackT(new THREE.CanvasTexture(cv))
}

// ── Geometry helpers ───────────────────────────────────────────────────────
function ellipseGeo(rx: number, ry: number): THREE.BufferGeometry {
  const c = new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2)
  return trackG(new THREE.BufferGeometry().setFromPoints(c.getPoints(180)))
}

function circleGeo(r: number, segs = 96): THREE.BufferGeometry {
  const c = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2)
  return trackG(new THREE.BufferGeometry().setFromPoints(c.getPoints(segs)))
}

// ── Build: sphere particles ────────────────────────────────────────────────
function buildSphere() {
  sphereOrigPos = fibonacci(SPHERE_COUNT, RADIUS)
  spherePosBuf  = new Float32Array(sphereOrigPos)

  sphereGeo = trackG(new THREE.BufferGeometry())
  sphereGeo.setAttribute('position', new THREE.BufferAttribute(spherePosBuf, 3))

  sphereGroup.add(new THREE.Points(sphereGeo, trackM(new THREE.PointsMaterial({
    color: BRIGHT, size: 0.055, transparent: true, opacity: 0.92,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }))))

  const { pos: cP, col: cC } = buildConnections(sphereOrigPos, SPHERE_COUNT, 1.55, 1200)
  if (cP.length > 0) {
    const cGeo = trackG(new THREE.BufferGeometry())
    cGeo.setAttribute('position', new THREE.BufferAttribute(cP, 3))
    cGeo.setAttribute('color',    new THREE.BufferAttribute(cC, 3))
    connectionsMat = trackM(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.82,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    sphereGroup.add(new THREE.LineSegments(cGeo, connectionsMat))
  }

  // Top energy node
  topNodeMat = trackM(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending,
  }))
  topNodeMesh = new THREE.Mesh(trackG(new THREE.SphereGeometry(0.14, 10, 10)), topNodeMat)
  topNodeMesh.position.y = RADIUS
  sphereGroup.add(topNodeMesh)
}

// ── Build: glow sprites ────────────────────────────────────────────────────
function buildGlow() {
  const tex = makeGlowTex()
  for (const d of [
    { scale: 8.5,  opacity: 0.22 },
    { scale: 5.8,  opacity: 0.21 },
    { scale: 4.3,  opacity: 0.29 },
    { scale: 13.5, opacity: 0.09 },
  ]) {
    const mat = trackM(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: d.opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(d.scale, d.scale, 1)
    glowSprites.push({ sprite, mat, baseOpacity: d.opacity, baseScale: d.scale })
    scene.add(sprite)
  }
}

// ── Build: orbital rings ───────────────────────────────────────────────────
function buildRings() {
  const defs = [
    { rx:3.5,  ry:3.5,  rotX: Math.PI/2-0.20,  rotZ: 0.08,  speed:  0.0050, wobble:0.030, op:0.55 },
    { rx:4.1,  ry:4.1,  rotX: Math.PI/2-0.55,  rotZ:-0.38,  speed:  0.0032, wobble:0.020, op:0.40 },
    { rx:3.2,  ry:3.2,  rotX: Math.PI/4,        rotZ: 0.28,  speed: -0.0040, wobble:0.040, op:0.30 },
    { rx:4.8,  ry:4.8,  rotX: Math.PI/2-0.10,  rotZ: 0.00,  speed:  0.0020, wobble:0.010, op:0.17 },
    { rx:3.7,  ry:2.3,  rotX: Math.PI/2+0.30,  rotZ: 0.55,  speed: -0.0060, wobble:0.050, op:0.35 },
    { rx:2.9,  ry:2.9,  rotX:-Math.PI/4,        rotZ:-0.20,  speed:  0.0070, wobble:0.030, op:0.25 },
    { rx:5.6,  ry:5.6,  rotX: Math.PI/2-0.05,  rotZ: 0.00,  speed:  0.0015, wobble:0.010, op:0.11 },
    { rx:4.3,  ry:3.1,  rotX: Math.PI/3,        rotZ:-0.40,  speed: -0.0030, wobble:0.040, op:0.30 },
  ] as const
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i]!
    const mat = trackM(new THREE.LineBasicMaterial({
      color: ACCENT, transparent: true, opacity: d.op,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const line = new THREE.Line(ellipseGeo(d.rx, d.ry), mat)
    line.rotation.x = d.rotX
    line.rotation.z = d.rotZ
    scene.add(line)
    rings.push({
      line, mat, speed: d.speed, baseRotX: d.rotX, baseOpacity: d.op,
      wobbleMag: d.wobble, wobblePhase: i * 0.85, pulsePhase: i * 1.2,
    })
  }
}

// ── Build: energy streams ──────────────────────────────────────────────────
function buildStreams() {
  for (let i = 0; i < 5; i++) {
    const phi  = (i / 5) * Math.PI * 2
    const tilt = 0.35 + i * 0.12
    const pts: THREE.Vector3[] = []
    for (let j = 0; j <= 80; j++) {
      const t = j / 80
      const a = phi + t * Math.PI * (1.4 + i * 0.13)
      const r = RADIUS + 1.0 + Math.sin(t * Math.PI) * 2.2
      pts.push(new THREE.Vector3(
        Math.sin(tilt) * Math.cos(a) * r,
        Math.cos(tilt) * 0.45 * r + (t - 0.5) * 3.5,
        Math.sin(tilt) * Math.sin(a) * r,
      ))
    }
    const curve = new THREE.CatmullRomCurve3(pts)
    const mat = trackM(new THREE.LineBasicMaterial({
      color: ACCENT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const line = new THREE.Line(
      trackG(new THREE.BufferGeometry().setFromPoints(curve.getPoints(120))),
      mat,
    )
    scene.add(line)
    streams.push({ line, mat, phase: i * (Math.PI * 2 / 5), rotSpeed: 0.003 + i * 0.001 })
  }
}

// ── Build: ground projection ───────────────────────────────────────────────
function buildGround() {
  const groundY = -(RADIUS + 0.15)

  for (let i = 0; i < 6; i++) {
    const r  = RADIUS + 0.3 + i * 0.9
    const op = Math.max(0.04, 0.32 - i * 0.05)
    const mat = trackM(new THREE.LineBasicMaterial({
      color: ACCENT, transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    groundRingMats.push(mat)
    const line = new THREE.Line(circleGeo(r), mat)
    line.rotation.x = Math.PI / 2
    line.position.y = groundY
    scene.add(line)
  }

  scanRingMat = trackM(new THREE.LineBasicMaterial({
    color: BRIGHT, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  scanRingLine = new THREE.Line(circleGeo(RADIUS + 2.8), scanRingMat)
  scanRingLine.rotation.x = Math.PI / 2
  scanRingLine.position.y = groundY
  scene.add(scanRingLine)

  for (let i = 0; i < 3; i++) {
    const mat = trackM(new THREE.LineBasicMaterial({
      color: BRIGHT, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const line = new THREE.Line(circleGeo(1), mat)
    line.rotation.x = Math.PI / 2
    line.position.y = groundY
    scene.add(line)
    pulseRings.push({ line, mat, delay: i * 0.38 })
  }

  projDiscMat = trackM(new THREE.MeshBasicMaterial({
    color: BRIGHT, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  }))
  const disc = new THREE.Mesh(trackG(new THREE.CircleGeometry(0.6, 48)), projDiscMat)
  disc.rotation.x = -Math.PI / 2
  disc.position.y = groundY + 0.07
  scene.add(disc)
}

// ── Build: holographic beam ────────────────────────────────────────────────
function buildBeam() {
  const h = 5.5
  beamMat = trackM(new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0.07,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  }))
  const beam = new THREE.Mesh(
    trackG(new THREE.CylinderGeometry(2.6, 0.32, h, 32, 1, true)),
    beamMat,
  )
  beam.position.y = -(RADIUS + h / 2)
  scene.add(beam)
}

// ── Build: background particle network ────────────────────────────────────
function buildBg() {
  const spread = 18
  const bgPos = new Float32Array(BG_COUNT * 3)
  for (let i = 0; i < BG_COUNT; i++) {
    bgPos[i*3]   = (Math.random() * 2 - 1) * spread
    bgPos[i*3+1] = (Math.random() * 2 - 1) * spread * 0.45
    bgPos[i*3+2] = (Math.random() * 2 - 1) * spread
  }
  const pGeo = trackG(new THREE.BufferGeometry())
  pGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3))
  bgGroup.add(new THREE.Points(pGeo, trackM(new THREE.PointsMaterial({
    color: 0x6d28d9, size: 0.032, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }))))

  const { pos: cP, col: cC } = buildConnections(bgPos, BG_COUNT, 5.5, 350)
  if (cP.length > 0) {
    const cGeo = trackG(new THREE.BufferGeometry())
    cGeo.setAttribute('position', new THREE.BufferAttribute(cP, 3))
    cGeo.setAttribute('color',    new THREE.BufferAttribute(cC, 3))
    bgGroup.add(new THREE.LineSegments(cGeo, trackM(new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))))
  }
}

// ── Orchestrate build ──────────────────────────────────────────────────────
function build() {
  sphereGroup = new THREE.Group()
  bgGroup     = new THREE.Group()
  bgGroup.position.z = -9
  scene.add(sphereGroup)
  scene.add(bgGroup)

  buildSphere()
  buildGlow()
  buildRings()
  buildStreams()
  buildGround()
  buildBeam()
  buildBg()
}

// ── Easing ─────────────────────────────────────────────────────────────────
function easeOut3(x: number): number { return 1 - (1 - Math.min(1, x)) ** 3 }

// ── Per-frame updates ──────────────────────────────────────────────────────
function updateBreathing(t: number) {
  const breathe = 1 + Math.sin(t * 0.65) * 0.025
  for (let i = 0; i < SPHERE_COUNT; i++) {
    const shimmer = Math.sin(t * 2.3 + i * 0.09) * 0.012
    const f = breathe + shimmer
    spherePosBuf[i*3]   = sphereOrigPos[i*3]!   * f
    spherePosBuf[i*3+1] = sphereOrigPos[i*3+1]! * f
    spherePosBuf[i*3+2] = sphereOrigPos[i*3+2]! * f
  }
  ;(sphereGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
}

function updateRings(t: number) {
  const ef = easeOut3(enterT)
  for (const r of rings) {
    r.line.rotation.y += r.speed
    r.line.rotation.x  = r.baseRotX + Math.sin(t * 0.8 + r.wobblePhase) * r.wobbleMag
    r.mat.opacity       = r.baseOpacity * ef * (0.68 + Math.sin(t * 1.2 + r.pulsePhase) * 0.32)
  }
}

function updateStreams(t: number) {
  for (const s of streams) {
    s.line.rotation.y += s.rotSpeed
    s.mat.opacity = Math.max(0, Math.sin(t * 0.45 + s.phase) * 0.28)
  }
}

function updateTopNode(t: number) {
  const pulse = 0.68 + Math.abs(Math.sin(t * 1.8)) * 0.55
  const flash = Math.random() > 0.994 ? 2.1 : 1.0
  topNodeMat.opacity = Math.min(1, pulse * flash)
  topNodeMesh.scale.setScalar(1 + Math.sin(t * 1.8) * 0.22)
}

function updateGlow(t: number) {
  const ef = easeOut3(enterT)
  for (let i = 0; i < glowSprites.length; i++) {
    const g = glowSprites[i]!
    const b = 1 + Math.sin(t * 0.5 + i * 0.9) * 0.07
    g.sprite.scale.set(g.baseScale * b, g.baseScale * b, 1)
    g.mat.opacity = g.baseOpacity * ef * (0.82 + Math.sin(t * 0.7 + i * 1.3) * 0.18)
  }
}

function updateConnections(t: number) {
  connectionsMat!.opacity = 0.6 + Math.sin(t * 0.9) * 0.22
}

function updateGround(t: number) {
  if (scanRingLine) scanRingLine.rotation.z = t * 0.52

  for (let i = 0; i < groundRingMats.length; i++) {
    const base = Math.max(0.04, 0.32 - i * 0.05)
    groundRingMats[i]!.opacity = base * (0.65 + Math.sin(t * 0.4 + i * 0.35) * 0.35)
  }

  projDiscMat.opacity = 0.35 + Math.abs(Math.sin(t * 1.1)) * 0.44

  for (const p of pulseRings) {
    const pt = ((t * 0.45 + p.delay) % 1)
    p.line.scale.setScalar(RADIUS + 0.3 + pt * 5.0)
    p.mat.opacity = Math.max(0, 0.55 * (1 - pt))
  }
}

function updateBeam(t: number) {
  beamMat.opacity = 0.045 + Math.abs(Math.sin(t * 0.55)) * 0.055
}

function updateBg(t: number) {
  bgGroup.position.x = smooth.x * -1.8
  bgGroup.position.y = smooth.y * -1.2
  bgGroup.rotation.y = t * 0.008
}

// ── Animation loop ─────────────────────────────────────────────────────────
function animate() {
  rafId = requestAnimationFrame(animate)
  const t  = clock.getElapsedTime()
  const dt = t - lastT
  lastT = t

  // Mouse → smooth → camera float
  smooth.x += (mouse.x - smooth.x) * 0.05
  smooth.y += (mouse.y - smooth.y) * 0.05
  camera.position.x = Math.sin(t * 0.25) * 0.5  + smooth.x * 2.5
  camera.position.y = 0.4 + Math.sin(t * 0.4) * 0.2 + smooth.y * 1.5
  camera.position.z = 8.5 + Math.sin(t * 0.35) * 0.3
  camera.lookAt(0, 0, 0)

  // Entrance fade-in
  if (enterT < 1) {
    enterT = Math.min(1, enterT + dt / ENTER_DUR)
    const ef = easeOut3(enterT)
    sphereGroup.scale.setScalar(ef)
    if (bloomPass) bloomPass.strength = ef * 1.2
  }

  // Sphere
  sphereGroup.rotation.y += 0.004
  updateBreathing(t)
  if (connectionsMat) updateConnections(t)
  updateTopNode(t)

  // Orbital rings
  updateRings(t)

  // Energy streams
  updateStreams(t)

  // Glow sprites
  updateGlow(t)

  // Ground + beam
  updateGround(t)
  updateBeam(t)

  // Background parallax
  updateBg(t)

  composer!.render()
}

// ── Resize ─────────────────────────────────────────────────────────────────
function resize() {
  if (!renderer || !composer || !canvas.value) return
  const w = canvas.value.clientWidth
  const h = canvas.value.clientHeight
  if (!w || !h) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  bloomPass?.setSize(w, h)
}

// ── Initialise renderer + scene ────────────────────────────────────────────
function init() {
  if (!canvas.value) return
  const el = canvas.value
  const w = el.clientWidth  || 400
  const h = el.clientHeight || 400

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: el, alpha: true, antialias: true, powerPreference: 'high-performance',
    })
  } catch { return }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1

  scene  = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x0d0020, 0.022)

  camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100)
  camera.position.set(0, 0.4, 8.5)
  camera.lookAt(0, 0, 0)

  clock = new THREE.Clock()

  // Post-processing
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
  })
  composer = new EffectComposer(renderer, rt)

  const renderPass = new RenderPass(scene, camera)
  renderPass.clearColor = new THREE.Color(0x000000)
  renderPass.clearAlpha = 0
  composer.addPass(renderPass)

  bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0, 0.45, 0.08)
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  enterT = 0
  build()
  sphereGroup.scale.setScalar(0)

  animate()

  ro = new ResizeObserver(resize)
  ro.observe(el)
}

// ── Mouse handler ──────────────────────────────────────────────────────────
function onMouse(e: MouseEvent) {
  mouse.x =  (e.clientX / window.innerWidth  - 0.5) * 2
  mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas.value) return
  window.addEventListener('mousemove', onMouse, { passive: true })
  requestAnimationFrame(() => { init() })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  ro?.disconnect()
  window.removeEventListener('mousemove', onMouse)
  for (const g of geos) g.dispose()
  for (const m of mats) m.dispose()
  for (const t of texs) t.dispose()
  composer?.dispose()
  renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
  rings = []; glowSprites = []; streams = []; groundRingMats = []; pulseRings = []
  geos.length = 0; mats.length = 0; texs.length = 0
})
</script>

<template>
  <canvas ref="canvas" class="w-full h-full block" aria-hidden="true" />
</template>
