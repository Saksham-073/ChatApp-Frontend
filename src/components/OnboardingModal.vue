<script setup lang="ts">
import { onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useDmStore, type DMUser } from '../stores/dm'
import { useFriendsStore } from '../stores/friends'
import { initials, hue } from '../lib/ui'

const emit = defineEmits<{ close: [] }>()
const dm = useDmStore()
const friends = useFriendsStore()

onMounted(async () => {
  if (!dm.users.length) await dm.fetchUsers()
})

async function selectUser(user: DMUser) {
  await friends.sendRequest(user.id)
  emit('close')
}
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <!-- Modal card -->
    <div class="glass border border-edge rounded-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4 shadow-2xl">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-ink">Welcome! 👋</h2>
          <p class="text-sm text-ink-4 mt-0.5">Send a friend request to get started</p>
        </div>
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-ink-2 hover:bg-hovered transition-all cursor-pointer"
          @click="emit('close')"
        >
          <Icon icon="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <!-- User list -->
      <div class="flex flex-col gap-1 max-h-72 overflow-y-auto">
        <div v-if="dm.loadingUsers" class="text-sm text-ink-4 text-center py-6">
          Loading users…
        </div>
        <div v-else-if="!dm.users.length" class="text-sm text-ink-4 text-center py-6">
          No other users yet.
        </div>
        <button
          v-for="user in dm.users"
          :key="user.id"
          class="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:bg-hovered glow-border text-left w-full"
          @click="selectUser(user)"
        >
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-violet-600"
            :style="{ filter: hue(user.id) }"
          >
            {{ initials(user.name) }}
          </div>
          <span class="text-sm text-ink font-medium">{{ user.name }}</span>
        </button>
      </div>

      <!-- Skip -->
      <button
        class="text-xs text-ink-4 hover:text-ink-2 transition-colors cursor-pointer self-center"
        @click="emit('close')"
      >
        Skip for now
      </button>
    </div>
  </div>
</template>
