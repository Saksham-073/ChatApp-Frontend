<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useKeysStore } from './stores/keys'

const auth = useAuthStore()
const keys = useKeysStore()

const IDLE_LOCK_MS = 15 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const
let idleTimer: ReturnType<typeof setTimeout> | undefined

function resetIdleTimer() {
  clearTimeout(idleTimer)
  if (!auth.user || keys.status !== 'unlocked') return
  idleTimer = setTimeout(() => keys.lock(), IDLE_LOCK_MS)
}

onMounted(() => {
  ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, resetIdleTimer, { passive: true }))
  resetIdleTimer()
})

// Re-arm as soon as keys go from locked/unenrolled to unlocked (e.g. right after passphrase entry)
watch(() => keys.status, resetIdleTimer)

onUnmounted(() => {
  clearTimeout(idleTimer)
  ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, resetIdleTimer))
})
</script>

<template>
  <!-- Aurora gradient backdrop shared by every view -->
  <div class="aurora" aria-hidden="true">
    <div class="aurora-blob aurora-1" />
    <div class="aurora-blob aurora-2" />
    <div class="aurora-blob aurora-3" />
  </div>

  <!-- Full-screen loader while restoring session from token -->
  <div v-if="auth.loading" class="relative z-10 min-h-dvh flex flex-col items-center justify-center gap-5">
    <div class="w-14 h-14 rounded-2xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.5)]">
      <Icon icon="lucide:message-square" class="w-7 h-7 text-white animate-pulse" />
    </div>
    <p class="text-ink-3 text-sm tracking-wide">Restoring session...</p>
  </div>

  <RouterView v-else />
</template>
