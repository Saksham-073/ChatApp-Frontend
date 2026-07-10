<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useAuthStore } from '../stores/auth'
import { theme, toggleTheme } from '../lib/theme'
import { initials, hue, connStatus } from '../lib/ui'

const filter = defineModel<'all' | 'dms' | 'rooms'>('filter', { required: true })

const emit = defineEmits<{ logout: [] }>()

const auth = useAuthStore()
</script>

<template>
  <!-- Icon rail (desktop) -->
  <nav
    class="hidden md:flex w-[68px] shrink-0 flex-col items-center py-5 gap-2 glass-soft border-r border-edge"
  >
    <!-- Logo orb -->
    <div
      class="w-10 h-10 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-[0_0_28px_rgba(139,92,246,0.5)] mb-4"
    >
      <Icon icon="raphael:chat" class="w-5 h-5 text-white" />
    </div>

    <!-- Filters -->
    <button
      v-for="f in [
        { key: 'all', title: 'All conversations', icon: 'lucide:message-square' },
        { key: 'dms', title: 'Direct messages', icon: 'lucide:user' },
      ] as const"
      :key="f.key"
      :title="f.title"
      :class="[
        'w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-90 ease-(--ease-spring) cursor-pointer',
        filter === f.key
          ? 'bg-active text-violet-500 dark:text-violet-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.25)]'
          : 'text-ink-4 hover:text-ink-2 hover:bg-hovered',
      ]"
      @click="filter = f.key"
    >
      <Icon :icon="f.icon" class="w-[18px] h-[18px]" />
    </button>
    <button
      title="Rooms"
      :class="[
        'w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold transition-all active:scale-90 ease-(--ease-spring) cursor-pointer',
        filter === 'rooms'
          ? 'bg-active text-violet-500 dark:text-violet-400 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.25)]'
          : 'text-ink-4 hover:text-ink-2 hover:bg-hovered',
      ]"
      @click="filter = 'rooms'"
    >
      #
    </button>

    <div class="flex-1" />

    <!-- Theme toggle -->
    <button
      class="w-10 h-10 rounded-xl flex items-center justify-center text-ink-4 hover:text-ink-2 hover:bg-hovered transition-all active:scale-90 ease-(--ease-spring) cursor-pointer"
      :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Icon :icon="theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-[18px] h-[18px]" />
    </button>

    <!-- Connection dot -->
    <div class="flex flex-col items-center gap-1 mb-2" :title="connStatus.label">
      <span class="w-2 h-2 rounded-full" :class="[connStatus.dot, connStatus.glow]" />
    </div>

    <!-- User avatar + logout -->
    <div
      class="w-10 h-10 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-xs font-bold"
      :style="{ filter: auth.user ? hue(auth.user.id) : undefined }"
      :title="auth.user?.name"
    >
      {{ auth.user ? initials(auth.user.name) : '?' }}
    </div>
    <button
      class="w-10 h-10 rounded-xl flex items-center justify-center text-ink-4 hover:text-rose-500 hover:bg-hovered transition-all active:scale-90 ease-(--ease-spring) cursor-pointer"
      title="Logout"
      @click="emit('logout')"
    >
      <Icon icon="lucide:log-out" class="w-[18px] h-[18px]" />
    </button>
  </nav>
</template>
