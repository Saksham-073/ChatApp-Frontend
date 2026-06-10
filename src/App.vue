<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
</script>

<template>
  <!-- Aurora gradient backdrop shared by every view -->
  <div class="aurora" aria-hidden="true">
    <div class="aurora-blob aurora-1" />
    <div class="aurora-blob aurora-2" />
    <div class="aurora-blob aurora-3" />
  </div>

  <!-- Full-screen loader while restoring session from token -->
  <div v-if="auth.loading" class="relative z-10 min-h-screen flex flex-col items-center justify-center gap-5">
    <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-600 flex items-center justify-center shadow-[0_0_50px_rgba(124,58,237,0.45)]">
      <Icon icon="lucide:message-square" class="w-7 h-7 text-white animate-pulse" />
    </div>
    <p class="text-ink-3 text-sm tracking-wide">Restoring session...</p>
  </div>

  <RouterView v-else />
</template>
