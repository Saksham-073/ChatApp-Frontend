<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { theme } from '../lib/theme'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

const CFG = {
  color: {
    accent: 0x8b5cf6,
    bright: 0xc4b5fd,
    deep:   0x6d28d9,
  },
  sphere: {
    radius: 2.8,
    count: 600,
    pointSize: 0.065,
    connectionDist: 1.55,
    connectionCap: 1100,
  },
  rings: [
    { radius: 3.6, tilt: 0.42, speed:  0.10, opacity: 0.55 },
    { radius: 4.1, tilt: 0.42, speed: -0.06, opacity: 0.35 },
    { radius: 4.7, tilt: 0.42, speed:  0.035, opacity: 0.20 },
  ],
  ground: {
    ringRadii: [3.2, 4.0],
    pulseMax: 4.4,
  },
  camera: {
    fov: 50,
    fitPadding: 1.12,     
    driftAmp: 0.18,       
    parallax: 0.6,        
  },
  bloom: { strength: 1.15, radius: 0.7, threshold: 0.5 },
  exposure: 1.05,
  enterDuration: 1.4,
} as const


const FIT_RADIUS = Math.max(...CFG.rings.map(r => r.radius)) * CFG.camera.fitPadding

const canvas = ref<HTMLCanvasElement | null>(null)

type Updater = (t: number, dt: number) => void

let renderer:  THREE.WebGLRenderer | null = null
let composer:  EffectComposer | null = null
let bloomPass: UnrealBloomPass | null = null
let scene:     THREE.Scene | null = null
let camera:    THREE.PerspectiveCamera | null = null
let clock:     THREE.Clock | null = null
let sphereGroup: THREE.Group | null = null

let updaters: Updater[] = []
let disposables: { dispose(): void }[] = []

// Theme-reactive colour state — read each frame by updaters
type HasColor = { color: THREE.Color }
const coloredMats: Array<{ mat: HasColor; key: 'accent' | 'bright' }> = []
let accentHex:   number = CFG.color.accent
let brightHex:   number = CFG.color.bright
let glowMult:    number = 1.0
let bloomTarget: number = CFG.bloom.strength

const mouse  = { x: 0, y: 0 }
const smooth = { x: 0, y: 0 }
let enterT = 0
let lastT = 0
let rafId = 0
let baseDist = 9
let ro: ResizeObserver | null = null

function track<T extends { dispose(): void }>(d: T): T {
  disposables.push(d)
  return d
}

function fibonacciSphere(n: number, r: number): Float32Array {
  const buf = new Float32Array(n * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const rr = Math.sqrt(Math.max(0, 1 - y * y)) * r
    const a = golden * i
    buf[i * 3]     = Math.cos(a) * rr
    buf[i * 3 + 1] = y * r
    buf[i * 3 + 2] = Math.sin(a) * rr
  }
  return buf
}

function connectionGeometry(pos: Float32Array, n: number, maxDist: number, cap: number) {
  const c = new THREE.Color(CFG.color.accent)
  const ps: number[] = []
  const cs: number[] = []
  const maxD2 = maxDist * maxDist
  outer: for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = pos[i * 3]! - pos[j * 3]!
      const dy = pos[i * 3 + 1]! - pos[j * 3 + 1]!
      const dz = pos[i * 3 + 2]! - pos[j * 3 + 2]!
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 >= maxD2) continue
      const a = 1 - Math.sqrt(d2) / maxDist
      ps.push(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!,
              pos[j * 3]!, pos[j * 3 + 1]!, pos[j * 3 + 2]!)
      cs.push(c.r * a, c.g * a, c.b * a, c.r * a * 0.25, c.g * a * 0.25, c.b * a * 0.25)
      if (ps.length / 6 >= cap) break outer
    }
  }
  const geo = track(new THREE.BufferGeometry())
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ps), 3))
  geo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(cs), 3))
  return geo
}

function circleGeo(r: number, segs = 128): THREE.BufferGeometry {
  const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2)
  return track(new THREE.BufferGeometry().setFromPoints(curve.getPoints(segs)))
}

function glowTexture(): THREE.Texture {
  const S = 256
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0,    'rgba(196,181,253,0.9)')
  g.addColorStop(0.3,  'rgba(139,92,246,0.5)')
  g.addColorStop(0.65, 'rgba(109,40,217,0.15)')
  g.addColorStop(1,    'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return track(new THREE.CanvasTexture(cv))
}

function additiveLineMat(color: number, opacity: number): THREE.LineBasicMaterial {
  return track(new THREE.LineBasicMaterial({
    color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
}

const easeOut3 = (x: number) => 1 - (1 - Math.min(1, x)) ** 3

function applyColors() {
  const dark = theme.value === 'dark'
  accentHex   = dark ? CFG.color.accent : 0x7c3aed
  brightHex   = dark ? CFG.color.bright : 0x8b5cf6
  glowMult    = dark ? 1.0 : 0.55
  bloomTarget = dark ? CFG.bloom.strength : CFG.bloom.strength * 0.7

  for (const { mat, key } of coloredMats) {
    mat.color.set(key === 'accent' ? accentHex : brightHex)
  }
  if (bloomPass && enterT >= 1) bloomPass.strength = bloomTarget
}

watch(theme, applyColors)

function buildSphere(parent: THREE.Group): Updater {
  const { radius, count, pointSize, connectionDist, connectionCap } = CFG.sphere

  const origPos = fibonacciSphere(count, radius)
  const posBuf = new Float32Array(origPos)
  const geo = track(new THREE.BufferGeometry())
  geo.setAttribute('position', new THREE.BufferAttribute(posBuf, 3))

  const ptsMat = track(new THREE.PointsMaterial({
    color: CFG.color.bright, size: pointSize, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  }))
  coloredMats.push({ mat: ptsMat, key: 'bright' })
  parent.add(new THREE.Points(geo, ptsMat))

  const connMat = track(new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }))
  parent.add(new THREE.LineSegments(
    connectionGeometry(origPos, count, connectionDist, connectionCap), connMat,
  ))

  return (t) => {
    parent.rotation.y += 0.004
    const breathe = 1 + Math.sin(t * 0.65) * 0.02
    for (let i = 0; i < count; i++) {
      const shimmer = Math.sin(t * 2.3 + i * 0.09) * 0.01
      const f = breathe + shimmer
      posBuf[i * 3]     = origPos[i * 3]! * f
      posBuf[i * 3 + 1] = origPos[i * 3 + 1]! * f
      posBuf[i * 3 + 2] = origPos[i * 3 + 2]! * f
    }
    ;(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    connMat.opacity = 0.72 + Math.sin(t * 0.9) * 0.18
  }
}

function buildGlow(parent: THREE.Scene): Updater {
  const tex = glowTexture()
  const layers = [
    { scale: 5.4, opacity: 0.14 },
    { scale: 4.0, opacity: 0.20 },
    { scale: 2.9, opacity: 0.26 },
  ].map(({ scale, opacity }) => {
    const mat = track(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(scale, scale, 1)
    parent.add(sprite)
    return { mat, sprite, scale, opacity }
  })

  return (t) => {
    const ef = easeOut3(enterT)
    layers.forEach((l, i) => {
      const b = 1 + Math.sin(t * 0.5 + i * 0.9) * 0.06
      l.sprite.scale.set(l.scale * b, l.scale * b, 1)
      l.mat.opacity = l.opacity * ef * glowMult * (0.85 + Math.sin(t * 0.7 + i * 1.3) * 0.15)
    })
  }
}

function buildRings(parent: THREE.Scene): Updater {
  const items = CFG.rings.map((d, i) => {
    const mat = additiveLineMat(CFG.color.accent, d.opacity)
    coloredMats.push({ mat, key: 'accent' })
    const pivot = new THREE.Group()
    const line = new THREE.Line(circleGeo(d.radius, 180), mat)
    line.rotation.x = Math.PI / 2          
    pivot.rotation.x = d.tilt              
    pivot.rotation.z = 0.12
    pivot.add(line)
    parent.add(pivot)
    return { pivot, mat, base: d.opacity, speed: d.speed, phase: i * 1.6 }
  })

  return (t) => {
    const ef = easeOut3(enterT)
    for (const r of items) {
      r.pivot.rotation.y = t * r.speed
      r.mat.opacity = r.base * ef * (0.75 + Math.sin(t * 1.1 + r.phase) * 0.25)
    }
  }
}

function buildGround(parent: THREE.Scene): Updater {
  const groundY = -(CFG.sphere.radius + 0.3)

  const staticMats = CFG.ground.ringRadii.map((r, i) => {
    const mat = additiveLineMat(CFG.color.accent, 0.22 - i * 0.08)
    coloredMats.push({ mat, key: 'accent' })
    const line = new THREE.Line(circleGeo(r), mat)
    line.rotation.x = Math.PI / 2
    line.position.y = groundY
    parent.add(line)
    return { mat, base: 0.22 - i * 0.08 }
  })

  const pulseMat = additiveLineMat(CFG.color.bright, 0)
  coloredMats.push({ mat: pulseMat, key: 'bright' })
  const pulse = new THREE.Line(circleGeo(1), pulseMat)
  pulse.rotation.x = Math.PI / 2
  pulse.position.y = groundY
  parent.add(pulse)

  const discMat = track(new THREE.MeshBasicMaterial({
    color: CFG.color.bright, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
  }))
  coloredMats.push({ mat: discMat, key: 'bright' })
  const disc = new THREE.Mesh(track(new THREE.CircleGeometry(0.55, 48)), discMat)
  disc.rotation.x = -Math.PI / 2
  disc.position.y = groundY + 0.02
  parent.add(disc)

  return (t) => {
    const ef = easeOut3(enterT)
    staticMats.forEach((s, i) => {
      s.mat.opacity = s.base * ef * (0.7 + Math.sin(t * 0.4 + i) * 0.3)
    })
    const pt = (t * 0.35) % 1
    pulse.scale.setScalar(1.2 + pt * (CFG.ground.pulseMax - 1.2))
    pulseMat.opacity = 0.4 * ef * (1 - pt)
    discMat.opacity = ef * (0.32 + Math.abs(Math.sin(t * 1.1)) * 0.3)
  }
}


function fitCamera(w: number, h: number) {
  if (!camera) return
  camera.aspect = w / h
  const vHalf = THREE.MathUtils.degToRad(CFG.camera.fov / 2)
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect)
  baseDist = FIT_RADIUS / Math.sin(Math.min(vHalf, hHalf))
  camera.updateProjectionMatrix()
}

function animate() {
  rafId = requestAnimationFrame(animate)
  if (!clock || !camera || !composer) return
  const t = clock.getElapsedTime()
  const dt = t - lastT
  lastT = t

  if (enterT < 1) {
    enterT = Math.min(1, enterT + dt / CFG.enterDuration)
    const ef = easeOut3(enterT)
    sphereGroup?.scale.setScalar(ef)
    if (bloomPass) bloomPass.strength = ef * bloomTarget
  }

  smooth.x += (mouse.x - smooth.x) * 0.05
  smooth.y += (mouse.y - smooth.y) * 0.05
  const { driftAmp, parallax } = CFG.camera
  camera.position.set(
    Math.sin(t * 0.22) * driftAmp + smooth.x * parallax,
    0.2 + Math.sin(t * 0.35) * driftAmp * 0.6 + smooth.y * parallax * 0.6,
    baseDist,
  )
  camera.lookAt(0, -0.2, 0)

  for (const u of updaters) u(t, dt)
  composer.render()
}

function resize() {
  if (!renderer || !composer || !canvas.value) return
  const w = canvas.value.clientWidth
  const h = canvas.value.clientHeight
  if (!w || !h) return
  fitCamera(w, h)
  renderer.setSize(w, h, false)
  composer.setSize(w, h)
  bloomPass?.setSize(w, h)
}

function init() {
  const el = canvas.value
  if (!el) return
  const w = el.clientWidth || 400
  const h = el.clientHeight || 400

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: el, alpha: true, antialias: true, powerPreference: 'high-performance',
    })
  } catch {
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = CFG.exposure

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(CFG.camera.fov, w / h, 0.1, 100)
  clock = new THREE.Clock()

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
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h), CFG.bloom.strength, CFG.bloom.radius, CFG.bloom.threshold,
  )
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

  sphereGroup = new THREE.Group()
  scene.add(sphereGroup)
  updaters = [
    buildSphere(sphereGroup),
    buildGlow(scene),
    buildRings(scene),
    buildGround(scene),
  ]

  enterT = 0
  sphereGroup.scale.setScalar(0)
  fitCamera(w, h)
  applyColors()
  animate()

  ro = new ResizeObserver(resize)
  ro.observe(el)
}

function onMouse(e: MouseEvent) {
  mouse.x = (e.clientX / window.innerWidth - 0.5) * 2
  mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas.value) return
  window.addEventListener('mousemove', onMouse, { passive: true })
  requestAnimationFrame(init)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  ro?.disconnect()
  window.removeEventListener('mousemove', onMouse)
  for (const d of disposables) d.dispose()
  disposables = []
  updaters = []
  coloredMats.length = 0
  composer?.dispose()
  renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
  composer = null
  scene = null
  camera = null
  sphereGroup = null
})
</script>

<template>
  <canvas ref="canvas" class="w-full h-full block" aria-hidden="true" />
</template>