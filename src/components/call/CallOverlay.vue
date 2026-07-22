<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { Icon } from '@iconify/vue'
import { useCallStore } from '../../stores/call'

const call = useCallStore()

const remoteVideo = ref<HTMLVideoElement | null>(null)
const localVideo = ref<HTMLVideoElement | null>(null)
watchEffect(() => {
  if (remoteVideo.value && call.remoteStream) remoteVideo.value.srcObject = call.remoteStream
  if (localVideo.value && call.localStream) localVideo.value.srcObject = call.localStream
})

const showRemoteVideo = computed(() => call.isVideo && !call.peerMediaState.cameraOff)
const showLocalVideo = computed(() => call.isVideo && !call.cameraOff)

const statusText = computed(() => {
  if (call.reconnecting) return 'Reconnecting…'
  if (call.status === 'outgoing-ringing') return 'Calling…'
  if (call.status === 'connecting') return 'Connecting…'
  const m = Math.floor(call.elapsedSeconds / 60)
  const s = call.elapsedSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-black">
    <!-- Remote video / avatar -->
    <div class="relative flex-1 overflow-hidden">
      <video
        v-show="showRemoteVideo"
        ref="remoteVideo"
        autoplay
        playsinline
        class="h-full w-full object-cover"
      />
      <div v-if="!showRemoteVideo" class="flex h-full w-full items-center justify-center">
        <div
          class="flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-semibold text-white"
        >
          {{ call.peerName.charAt(0).toUpperCase() }}
        </div>
      </div>

      <!-- Top bar -->
      <div
        class="absolute inset-x-0 top-0 flex items-center justify-between bg-linear-to-b from-black/60 to-transparent px-6 py-4"
      >
        <div class="text-white">
          <p class="text-base font-semibold">{{ call.peerName }}</p>
          <p class="text-sm opacity-80" :class="{ 'animate-pulse': call.reconnecting }">
            {{ statusText }}
          </p>
        </div>
        <div
          v-if="call.peerMediaState.muted"
          class="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
          title="Peer is muted"
        >
          <Icon icon="mdi:microphone-off" class="h-4 w-4" />
        </div>
      </div>

      <!-- Local preview -->
      <div
        v-if="showLocalVideo"
        class="absolute bottom-6 right-6 h-32 w-24 overflow-hidden rounded-xl border border-white/20 shadow-2xl sm:h-40 sm:w-30"
      >
        <video
          ref="localVideo"
          autoplay
          playsinline
          muted
          class="h-full w-full -scale-x-100 object-cover"
        />
      </div>
    </div>

    <!-- Controls -->
    <div class="flex items-center justify-center gap-3 bg-black/80 px-6 py-5 backdrop-blur-xl">
      <button
        class="flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors"
        :class="call.muted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'"
        :title="call.muted ? 'Unmute' : 'Mute'"
        @click="call.toggleMute()"
      >
        <Icon :icon="call.muted ? 'mdi:microphone-off' : 'mdi:microphone'" class="h-6 w-6" />
      </button>
      <button
        v-if="call.isVideo"
        class="flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors"
        :class="call.cameraOff ? 'bg-red-500 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'"
        :title="call.cameraOff ? 'Turn camera on' : 'Turn camera off'"
        @click="call.toggleCamera()"
      >
        <Icon :icon="call.cameraOff ? 'mdi:video-off' : 'mdi:video'" class="h-6 w-6" />
      </button>
      <button
        class="flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors"
        :class="call.screenSharing ? 'bg-violet-500 hover:bg-violet-600' : 'bg-white/10 hover:bg-white/20'"
        :title="call.screenSharing ? 'Stop screen share' : 'Share screen'"
        @click="call.toggleScreenShare()"
      >
        <Icon icon="mdi:monitor-share" class="h-6 w-6" />
      </button>
      <button
        class="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        title="Minimize"
        @click="call.setMinimized(true)"
      >
        <Icon icon="mdi:window-minimize" class="h-6 w-6" />
      </button>
      <button
        class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
        title="Hang up"
        @click="call.hangUp()"
      >
        <Icon icon="mdi:phone-hangup" class="h-6 w-6" />
      </button>
    </div>
  </div>
</template>
