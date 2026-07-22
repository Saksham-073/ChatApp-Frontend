<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { Icon } from '@iconify/vue'
import { useCallStore } from '../../stores/call'

const call = useCallStore()

const remoteVideo = ref<HTMLVideoElement | null>(null)
watchEffect(() => {
  if (remoteVideo.value && call.remoteStream) remoteVideo.value.srcObject = call.remoteStream
})

const showRemoteVideo = computed(() => call.isVideo && !call.peerMediaState.cameraOff)

const timeText = computed(() => {
  const m = Math.floor(call.elapsedSeconds / 60)
  const s = call.elapsedSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const pos = ref({ x: window.innerWidth - 280, y: window.innerHeight - 200 })
let dragOffset: { x: number; y: number } | null = null
function onPointerDown(e: PointerEvent) {
  dragOffset = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (dragOffset) pos.value = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
}
function onPointerUp() {
  dragOffset = null
}
</script>

<template>
  <div
    class="fixed z-50 w-64 select-none overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
    :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
  >
    <div
      class="relative flex h-36 items-center justify-center bg-black/60 touch-none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <video
        v-show="showRemoteVideo"
        ref="remoteVideo"
        autoplay
        playsinline
        class="h-full w-full object-cover"
      />
      <div v-if="!showRemoteVideo" class="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-xl font-semibold text-white">
        {{ call.peerName.charAt(0).toUpperCase() }}
      </div>
      <span
        class="absolute bottom-2 left-2 rounded-md bg-black/50 px-1.5 py-0.5 text-xs text-white"
        :class="{ 'animate-pulse': call.reconnecting }"
      >
        {{ call.reconnecting ? 'Reconnecting…' : timeText }}
      </span>
    </div>
    <div class="flex items-center justify-center gap-3 bg-black/80 px-3 py-2.5">
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        title="Restore"
        @click="call.setMinimized(false)"
      >
        <Icon icon="mdi:arrow-expand" class="h-5 w-5" />
      </button>
      <button
        class="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
        title="Hang up"
        @click="call.hangUp()"
      >
        <Icon icon="mdi:phone-hangup" class="h-5 w-5" />
      </button>
    </div>
  </div>
</template>
