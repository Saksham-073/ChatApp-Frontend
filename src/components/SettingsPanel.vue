<script setup lang="ts">
import { useAuthStore } from '../stores/auth'
import { initials, hue } from '../lib/ui'

const auth = useAuthStore()
</script>

<template>
  <div class="flex-1 overflow-y-auto px-4 md:px-6 py-5 max-w-xl">
    <div class="glass rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
      <div
        class="w-20 h-20 rounded-2xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-2xl font-bold shrink-0"
        :style="{ filter: auth.user ? hue(auth.user.id) : undefined }"
      >
        {{ auth.user ? initials(auth.user.name) : '?' }}
      </div>
      <div>
        <p class="text-ink text-lg font-semibold">{{ auth.user?.name }}</p>
        <p class="text-ink-3 text-sm mt-0.5">{{ auth.user?.email }}</p>
      </div>
    </div>
  </div>
</template>
