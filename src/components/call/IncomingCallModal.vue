<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useCallStore } from '../../stores/call'

const call = useCallStore()

let audioCtx: AudioContext | null = null
let ringInterval: number | undefined

function ringOnce() {
  if (!audioCtx) return
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.frequency.value = 440
  gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9)
  osc.start()
  osc.stop(audioCtx.currentTime + 1)
}

onMounted(() => {
  audioCtx = new AudioContext()
  ringOnce()
  ringInterval = window.setInterval(ringOnce, 2000)
})
onUnmounted(() => {
  window.clearInterval(ringInterval)
  audioCtx?.close()
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div class="w-80 rounded-2xl border border-white/10 bg-white/10 p-6 text-center shadow-2xl backdrop-blur-xl dark:bg-black/30">
      <div class="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl">
        {{ call.peerName.charAt(0).toUpperCase() }}
      </div>
      <p class="text-lg font-semibold">{{ call.peerName }}</p>
      <p class="mb-6 text-sm opacity-70">
        Incoming {{ call.isVideo ? 'video' : 'audio' }} call…
      </p>
      <div class="flex justify-center gap-3">
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
          title="Decline"
          @click="call.declineCall()"
        >
          <Icon icon="mdi:phone-hangup" class="h-6 w-6" />
        </button>
        <button
          class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600"
          title="Accept (audio)"
          @click="call.acceptCall(false)"
        >
          <Icon icon="mdi:phone" class="h-6 w-6" />
        </button>
        <button
          v-if="call.isVideo"
          class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white hover:bg-green-600"
          title="Accept with video"
          @click="call.acceptCall(true)"
        >
          <Icon icon="mdi:video" class="h-6 w-6" />
        </button>
      </div>
    </div>
  </div>
</template>
