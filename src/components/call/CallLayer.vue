<script setup lang="ts">
import { computed } from 'vue'
import { useCallStore } from '../../stores/call'
import IncomingCallModal from './IncomingCallModal.vue'
import CallOverlay from './CallOverlay.vue'
import CallPiP from './CallPiP.vue'

const call = useCallStore()
const inCall = computed(() =>
  ['outgoing-ringing', 'connecting', 'active'].includes(call.status),
)
const overlayVisible = computed(() => inCall.value && !call.minimized)
const pipVisible = computed(() => inCall.value && call.minimized)
</script>

<template>
  <IncomingCallModal v-if="call.status === 'incoming-ringing'" />
  <CallOverlay v-if="overlayVisible" />
  <CallPiP v-if="pipVisible" />
  <div
    v-if="call.callError"
    class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-red-500/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur"
  >
    {{ call.callError }}
    <button class="ml-3 opacity-70 hover:opacity-100" @click="call.callError = ''">✕</button>
  </div>
</template>
