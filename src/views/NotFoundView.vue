<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { theme, toggleTheme } from '../lib/theme'

const router = useRouter()
</script>

<template>
  <button
    class="fixed top-5 right-5 z-20 w-10 h-10 rounded-xl glass flex items-center justify-center text-ink-3 hover:text-ink transition-all active:scale-90 ease-(--ease-spring) cursor-pointer"
    :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <Icon :icon="theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-[18px] h-[18px]" />
  </button>

  <div class="relative z-10 min-h-dvh flex items-center justify-center px-6">
    <div class="w-full max-w-sm text-center">
      <div
        class="w-14 h-14 mx-auto rounded-2xl bg-linear-to-br from-violet-500 to-violet-800 flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.6)] mb-6"
      >
        <Icon icon="lucide:signal-zero" class="w-7 h-7 text-white" />
      </div>

      <h1 class="text-ink text-5xl font-bold tracking-tight">404</h1>
      <p class="text-ink-3 text-sm mt-3 tracking-[0.1em]">Signal lost. This route does not exist on the network.</p>

      <div v-glow class="glass rounded-3xl p-6 mt-8 shadow-[0_24px_80px_rgba(139,92,246,0.18)] glow-border">
        <button
          class="w-full bg-linear-to-r from-violet-500 to-violet-700 hover:from-violet-400 hover:to-violet-600 text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-all active:scale-97 ease-(--ease-spring) shadow-[0_8px_30px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_40px_rgba(139,92,246,0.6)] cursor-pointer"
          @click="router.push('/')"
        >
          <Icon icon="lucide:home" class="w-4 h-4" />
          Return to Base
        </button>
      </div>
    </div>
  </div>
</template>
