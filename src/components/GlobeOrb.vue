<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as THREE from 'three'

const canvas = ref<HTMLCanvasElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let sphereGroup: THREE.Group | null = null
let rings: THREE.Line[] = []
let rafId = 0
let ro: ResizeObserver | null = null

const RADIUS = 2.5
const POINT_COUNT = 200

function fibonacci(count: number, r: number): Float32Array {
  const pos = new Float32Array(count * 3)
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2
    const rr = Math.sqrt(Math.max(0, 1 - y * y)) * r
    const t = phi * i
    pos[i * 3]     = Math.cos(t) * rr
    pos[i * 3 + 1] = y * r
    pos[i * 3 + 2] = Math.sin(t) * rr
  }
  return pos
}

function buildLines(pos: Float32Array, count: number, maxDist: number): Float32Array {
  const segs: number[] = []
  const cap = 700
  for (let i = 0; i < count && segs.length / 6 < cap; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = pos[i*3]! - pos[j*3]!
      const dy = pos[i*3+1]! - pos[j*3+1]!
      const dz = pos[i*3+2]! - pos[j*3+2]!
      if (dx*dx + dy*dy + dz*dz < maxDist*maxDist) {
        segs.push(pos[i*3]!, pos[i*3+1]!, pos[i*3+2]!, pos[j*3]!, pos[j*3+1]!, pos[j*3+2]!)
        if (segs.length / 6 >= cap) break
      }
    }
  }
  return new Float32Array(segs)
}

function makeRing(rx: number, ry: number, rotX: number, rotZ: number, opacity: number): THREE.Line {
  const curve = new THREE.EllipseCurve(0, 0, rx, ry, 0, Math.PI * 2, false, 0)
  const pts = curve.getPoints(180)
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({
    color: 0x8B5CF6,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const line = new THREE.Line(geo, mat)
  line.rotation.x = rotX
  line.rotation.z = rotZ
  return line
}

function makeGroundRing(r: number, opacity: number): THREE.Line {
  const curve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2)
  const pts = curve.getPoints(96)
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({
    color: 0x8B5CF6,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const line = new THREE.Line(geo, mat)
  line.rotation.x = Math.PI / 2
  line.position.y = -(RADIUS + 0.1)
  return line
}

function build() {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100)
  camera.position.set(0, 0.4, 8.5)
  camera.lookAt(0, 0, 0)

  sphereGroup = new THREE.Group()
  scene.add(sphereGroup)

  // Particle sphere
  const pos = fibonacci(POINT_COUNT, RADIUS)
  const sphereGeo = new THREE.BufferGeometry()
  sphereGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  sphereGroup.add(new THREE.Points(sphereGeo, new THREE.PointsMaterial({
    color: 0xddd6fe,
    size: 0.06,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })))

  // Connecting mesh lines
  const linePos = buildLines(pos, POINT_COUNT, 1.75)
  if (linePos.length > 0) {
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3))
    sphereGroup.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
      color: 0x8B5CF6,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })))
  }

  // Bright top node
  const topNode = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
  )
  topNode.position.y = RADIUS
  sphereGroup.add(topNode)

  // Orbital rings — each at a different inclination
  const ringDefs: [number, number, number, number, number][] = [
    [3.55, 3.55, Math.PI / 2 - 0.22, 0.08,  0.52],   // near-flat equatorial
    [4.1,  4.1,  Math.PI / 2 - 0.55, -0.38, 0.38],   // more open, counter-tilt
    [3.15, 3.15, Math.PI / 4,         0.3,   0.3],    // 45° orbital plane
    [4.85, 4.85, Math.PI / 2 - 0.12,  0.02,  0.16],  // outer subtle flat
  ]
  rings = ringDefs.map(([rx, ry, rotX, rotZ, opacity]) => {
    const r = makeRing(rx, ry, rotX, rotZ, opacity)
    scene!.add(r)
    return r
  })

  // Ground concentric rings (XZ plane)
  for (let i = 0; i < 5; i++) {
    scene.add(makeGroundRing(RADIUS + 0.4 + i * 0.85, Math.max(0.04, 0.28 - i * 0.05)))
  }

  // Pedestal cone — tip at sphere bottom, opening downward
  const coneH = 5.0
  scene.add(Object.assign(
    new THREE.Mesh(
      new THREE.ConeGeometry(2.2, coneH, 32, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x8B5CF6,
        transparent: true,
        opacity: 0.09,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
    { position: new THREE.Vector3(0, -(RADIUS + coneH / 2), 0) },
  ))

  // Bright glow disk at sphere base
  scene.add(Object.assign(
    new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 32),
      new THREE.MeshBasicMaterial({
        color: 0xc4b5fd,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    ),
    { position: new THREE.Vector3(0, -RADIUS, 0), rotation: new THREE.Euler(-Math.PI / 2, 0, 0) },
  ))
}

function resize() {
  if (!renderer || !camera || !canvas.value) return
  const w = canvas.value.clientWidth
  const h = canvas.value.clientHeight
  if (!w || !h) return
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h, false)
}

function animate() {
  rafId = requestAnimationFrame(animate)
  if (sphereGroup) sphereGroup.rotation.y += 0.004
  const speeds = [0.005, 0.003, -0.004, 0.002]
  rings.forEach((r, i) => { r.rotation.y += speeds[i] ?? 0.003 })
  if (renderer && scene && camera) renderer.render(scene, camera)
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !canvas.value) return
  const el = canvas.value
  // Defer to next paint so flex layout has settled and clientWidth/clientHeight are non-zero
  requestAnimationFrame(() => {
    if (!el) return
    try {
      renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true })
    } catch {
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    build()
    resize()
    animate()
    ro = new ResizeObserver(resize)
    ro.observe(el)
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  ro?.disconnect()
  renderer?.forceContextLoss()
  renderer?.dispose()
  renderer = null
  rings = []
  sphereGroup = null
})
</script>

<template>
  <canvas ref="canvas" class="w-full h-full block" aria-hidden="true" />
</template>
