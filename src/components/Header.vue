<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useChatStore } from '../stores/chat'
import { useDmStore } from '../stores/dm'
import { useKeysStore } from '../stores/keys'
import { useCallStore } from '../stores/call'
import { initials, hue, connStatus } from '../lib/ui'

defineProps<{
  activeView: 'room' | 'dm' | 'users' | 'friends' | 'settings' | null
}>()

const open = defineModel<boolean>('open', { required: true })

const chat = useChatStore()
const dm = useDmStore()
const keys = useKeysStore()
const call = useCallStore()

const hasMediaDevices = computed(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices)
const callDisabled = computed(() => call.status !== 'idle' || !hasMediaDevices.value)

function callTooltip(kind: 'audio' | 'video') {
  if (!hasMediaDevices.value) return 'No microphone available'
  if (call.status !== 'idle') return 'Already in a call'
  return kind === 'audio' ? 'Start audio call' : 'Start video call'
}
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
      <Icon
        v-if="keys.hasKey(dm.currentConv.id)"
        icon="lucide:lock"
        class="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 shrink-0"
        title="End-to-end encrypted"
      />
      <div class="flex items-center gap-1 shrink-0">
        <button
          :disabled="callDisabled"
          :title="callTooltip('audio')"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-hovered disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          @click="call.startCall(dm.currentConv!.id, 'audio')"
        >
          <Icon icon="mdi:phone" class="w-4 h-4" />
        </button>
        <button
          :disabled="callDisabled"
          :title="callTooltip('video')"
          class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-hovered disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          @click="call.startCall(dm.currentConv!.id, 'video')"
        >
          <Icon icon="mdi:video" class="w-4 h-4" />
        </button>
      </div>
    </template>

    <template v-else-if="activeView === 'users'">
      <span class="text-ink text-sm font-semibold">New Direct Message</span>
    </template>

    <template v-else-if="activeView === 'friends'">
      <span class="text-ink text-sm font-semibold">Friends</span>
    </template>

    <template v-else-if="activeView === 'settings'">
      <span class="text-ink text-sm font-semibold">Settings</span>
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
