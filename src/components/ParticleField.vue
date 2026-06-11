<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { theme } from '../lib/theme'

// Hidden entirely when WebGL is unavailable or the user prefers reduced motion —
// the global CSS aurora then remains the visible background.
const enabled = ref(true)
const canvas = ref<HTMLCanvasElement | null>(null)

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches

// Quality scaling
const PARTICLE_COUNT = isMobile ? 50 : 120
const MAX_DPR = isMobile ? 1.5 : 2
const LINK_DISTANCE = 1.6 // world units; particles closer than this get a connecting line
const SPREAD = 7 // half-size of the cube particles live in

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let points: THREE.Points | null = null
let lines: THREE.LineSegments | null = null
let pointsMaterial: THREE.PointsMaterial | null = null
let lineMaterial: THREE.LineBasicMaterial | null = null
let rafId = 0

const positions = new Float32Array(PARTICLE_COUNT * 3)
const velocities = new Float32Array(PARTICLE_COUNT * 3)
// Worst case every pair links: pre-allocate the line buffer once and reuse it.
const linePositions = new Float32Array(PARTICLE_COUNT * PARTICLE_COUNT * 3)

const mouse = { x: 0, y: 0 }

function particleColor(): number {
  // Brighter in dark mode, deeper for contrast on the light background.
  return theme.value === 'dark' ? 0x67e8f9 : 0x7c3aed
}

function seedParticles() {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * SPREAD
    positions[i * 3 + 1] = (Math.random() * 2 - 1) * SPREAD
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * SPREAD
    velocities[i * 3] = (Math.random() * 2 - 1) * 0.004
    velocities[i * 3 + 1] = (Math.random() * 2 - 1) * 0.004
    velocities[i * 3 + 2] = (Math.random() * 2 - 1) * 0.004
  }
}

function buildScene() {
  scene = new THREE.Scene()

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
  camera.position.z = 10

  const pointsGeo = new THREE.BufferGeometry()
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  pointsMaterial = new THREE.PointsMaterial({
    color: particleColor(),
    size: 0.08,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  })
  points = new THREE.Points(pointsGeo, pointsMaterial)
  scene.add(points)

  const lineGeo = new THREE.BufferGeometry()
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  lineMaterial = new THREE.LineBasicMaterial({
    color: particleColor(),
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  })
  lines = new THREE.LineSegments(lineGeo, lineMaterial)
  scene.add(lines)
}

function updateLines() {
  let v = 0
  const linkSq = LINK_DISTANCE * LINK_DISTANCE
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const ix = positions[i * 3]!
    const iy = positions[i * 3 + 1]!
    const iz = positions[i * 3 + 2]!
    for (let j = i + 1; j < PARTICLE_COUNT; j++) {
      const dx = ix - positions[j * 3]!
      const dy = iy - positions[j * 3 + 1]!
      const dz = iz - positions[j * 3 + 2]!
      if (dx * dx + dy * dy + dz * dz < linkSq) {
        linePositions[v++] = ix
        linePositions[v++] = iy
        linePositions[v++] = iz
        linePositions[v++] = positions[j * 3]!
        linePositions[v++] = positions[j * 3 + 1]!
        linePositions[v++] = positions[j * 3 + 2]!
      }
    }
  }
  const geo = lines!.geometry
  geo.setDrawRange(0, v / 3)
  geo.attributes.position!.needsUpdate = true
}

function animate() {
  rafId = requestAnimationFrame(animate)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    for (let a = 0; a < 3; a++) {
      const k = i * 3 + a
      positions[k] = positions[k]! + velocities[k]!
      if (positions[k]! > SPREAD || positions[k]! < -SPREAD) velocities[k] = velocities[k]! * -1
    }
  }
  points!.geometry.attributes.position!.needsUpdate = true
  updateLines()

  // Camera parallax: drift gently toward the pointer.
  camera!.position.x += (mouse.x * 2 - camera!.position.x) * 0.03
  camera!.position.y += (mouse.y * 2 - camera!.position.y) * 0.03
  camera!.lookAt(scene!.position)

  renderer!.render(scene!, camera!)
}

function onResize() {
  if (!renderer || !camera) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function onMouseMove(e: MouseEvent) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -((e.clientY / window.innerHeight) * 2 - 1)
}

function onVisibility() {
  if (document.hidden) {
    cancelAnimationFrame(rafId)
    rafId = 0
  } else if (rafId === 0 && enabled.value) {
    animate()
  }
}

// Recolor on theme toggle.
watch(theme, () => {
  pointsMaterial?.color.set(particleColor())
  lineMaterial?.color.set(particleColor())
})

onMounted(() => {
  if (prefersReducedMotion || !canvas.value) {
    enabled.value = false
    return
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, alpha: true, antialias: true })
  } catch {
    enabled.value = false
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(0x000000, 0) // transparent — aurora shows through

  seedParticles()
  buildScene()

  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('visibilitychange', onVisibility)

  animate()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('visibilitychange', onVisibility)
  points?.geometry.dispose()
  lines?.geometry.dispose()
  pointsMaterial?.dispose()
  lineMaterial?.dispose()
  // forceContextLoss before dispose() releases the WebGL context — dispose() alone
  // leaves it for GC, leaking contexts across login/logout re-mount cycles.
  renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
})
</script>

<template>
  <canvas
    v-show="enabled"
    ref="canvas"
    class="fixed inset-0 z-0 pointer-events-none"
    aria-hidden="true"
  />
</template>
