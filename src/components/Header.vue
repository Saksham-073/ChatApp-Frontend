<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useChatStore } from '../stores/chat'
import { useDmStore } from '../stores/dm'
import { initials, hue, connStatus } from '../lib/ui'

defineProps<{
  activeView: 'room' | 'dm' | 'users' | 'friends' | null
}>()

const open = defineModel<boolean>('open', { required: true })

const chat = useChatStore()
const dm = useDmStore()
</script>

<template>
  <header
    class="flex items-center gap-3 px-4 md:px-6 py-3.5 glass-soft border-b border-edge shrink-0"
  >
    <!-- Mobile: open the sidebar drawer -->
    <button class="text-ink-3 hover:text-ink md:hidden" @click="open = true">
      <Icon icon="lucide:menu" class="w-5 h-5" />
    </button>

    <template v-if="activeView === 'room' && chat.currentRoom">
      <span
        class="w-8 h-8 rounded-lg bg-linear-to-br from-violet-500/25 to-violet-700/25 flex items-center justify-center text-violet-500 dark:text-violet-400 font-bold shrink-0"
        >#</span
      >
      <span class="text-ink text-sm font-semibold truncate">{{ chat.currentRoom.name }}</span>
    </template>

    <template v-else-if="activeView === 'dm' && dm.currentConv">
      <div
        class="w-8 h-8 rounded-lg bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[11px] font-bold shrink-0"
        :style="{ filter: hue(dm.currentConv.other_user.id) }"
      >
        {{ initials(dm.currentConv.other_user.name) }}
      </div>
      <span class="text-ink text-sm font-semibold truncate">{{
        dm.currentConv.other_user.name
      }}</span>
    </template>

    <template v-else-if="activeView === 'users'">
      <span class="text-ink text-sm font-semibold">New Direct Message</span>
    </template>

    <template v-else-if="activeView === 'friends'">
      <span class="text-ink text-sm font-semibold">Friends</span>
    </template>

    <template v-else>
      <span class="text-ink-3 text-sm font-medium">Echo</span>
    </template>

    <span class="ml-auto text-xs flex items-center gap-1.5 shrink-0" :class="connStatus.text">
      <span class="w-1.5 h-1.5 rounded-full" :class="[connStatus.dot, connStatus.glow]" />
      <span class="hidden sm:inline">{{ connStatus.label }}</span>
    </span>
  </header>
</template>
