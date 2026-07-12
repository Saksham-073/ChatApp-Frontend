<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '../stores/auth'
import { useChatStore, type Room } from '../stores/chat'
import { useDmStore, type Conversation } from '../stores/dm'
import { useFriendsStore } from '../stores/friends'
import { theme, toggleTheme } from '../lib/theme'
import { initials, hue, rel, connStatus } from '../lib/ui'

const props = defineProps<{
  activeView: 'room' | 'dm' | 'users' | 'friends' | null
}>()

const open = defineModel<boolean>('open', { required: true })
const filter = defineModel<'all' | 'dms' | 'rooms'>('filter', { required: true })

const emit = defineEmits<{
  'select-room': [room: Room]
  'select-conv': [conv: Conversation]
  'show-users': []
  'show-friends': []
  logout: []
  error: [message: string]
}>()

const auth = useAuthStore()
const chat = useChatStore()
const dm = useDmStore()
const friends = useFriendsStore()

// ── Search & filtering ───────────────────────────────────────────────

const search = ref('')

const filteredRooms = computed(() => {
  if (filter.value === 'dms') return []
  const q = search.value.trim().toLowerCase()
  return q ? chat.rooms.filter((r) => r.name.toLowerCase().includes(q)) : chat.rooms
})

const filteredConvs = computed(() => {
  if (filter.value === 'rooms') return []
  const q = search.value.trim().toLowerCase()
  return q
    ? dm.conversations.filter((c) => c.other_user.name.toLowerCase().includes(q))
    : dm.conversations
})

// ── Create room ──────────────────────────────────────────────────────

const showRoomForm = ref(false)
const roomName = ref('')
const creatingRoom = ref(false)

async function addRoom() {
  const name = roomName.value.trim()
  if (!name || creatingRoom.value) return
  creatingRoom.value = true
  try {
    const room = await chat.createRoom(name)
    roomName.value = ''
    showRoomForm.value = false
    emit('select-room', room)
  } catch (e) {
    emit('error', (e as Error).message)
  } finally {
    creatingRoom.value = false
  }
}

function isActiveRoom(room: Room) {
  return props.activeView === 'room' && chat.currentRoom?.id === room.id
}

function isActiveConv(conv: Conversation) {
  return props.activeView === 'dm' && dm.currentConv?.id === conv.id
}
</script>

<template>
  <!-- Mobile backdrop -->
  <div
    v-if="open"
    class="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 md:hidden"
    @click="open = false"
  />

  <!-- List pane -->
  <section
    :class="[
      'fixed inset-y-0 left-0 z-40 w-[310px] glass border-r border-edge flex flex-col',
      'transition-transform duration-200 md:static md:translate-x-0 md:shrink-0',
      open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
    ]"
  >
    <!-- Header -->
    <div class="px-5 pt-6 pb-4">
      <div class="flex items-center justify-between mb-1">
        <h1 class="text-ink text-lg font-bold tracking-tight">Messages</h1>
        <div class="flex items-center gap-1">
          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-hovered transition-all cursor-pointer"
            title="New direct message"
            @click="emit('show-users')"
          >
            <Icon icon="lucide:user-plus" class="w-4 h-4" />
          </button>
          <button
            class="relative w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-hovered transition-all cursor-pointer"
            title="Friends"
            @click="emit('show-friends')"
          >
            <Icon icon="lucide:users" class="w-4 h-4" />
            <span
              v-if="friends.incoming.length"
              class="absolute -top-1 -right-1 bg-linear-to-r from-violet-500 to-violet-700 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] px-1 flex items-center justify-center"
              >{{ friends.incoming.length }}</span
            >
          </button>
          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-hovered transition-all cursor-pointer"
            title="Create room"
            @click="showRoomForm = !showRoomForm"
          >
            <Icon icon="lucide:plus" class="w-4 h-4" />
          </button>
          <button
            class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-ink md:hidden"
            @click="open = false"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Mobile user row -->
      <div class="flex md:hidden items-center gap-2 mb-3 mt-2">
        <div
          class="w-7 h-7 rounded-lg bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[10px] font-bold"
          :style="{ filter: auth.user ? hue(auth.user.id) : undefined }"
        >
          {{ auth.user ? initials(auth.user.name) : '?' }}
        </div>
        <span class="text-ink-2 text-sm font-medium flex-1 truncate">{{ auth.user?.name }}</span>
        <span class="text-xs flex items-center gap-1.5" :class="connStatus.text">
          <span class="w-1.5 h-1.5 rounded-full" :class="connStatus.dot" />
          {{ connStatus.label }}
        </span>
        <button
          class="text-ink-4 hover:text-ink-2 ml-1 active:scale-90 transition-transform ease-(--ease-spring)"
          :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
          @click="toggleTheme"
        >
          <Icon :icon="theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-4 h-4" />
        </button>
        <button
          class="text-ink-4 hover:text-rose-500 ml-1 active:scale-90 transition-transform ease-(--ease-spring)"
          title="Logout"
          @click="emit('logout')"
        >
          <Icon icon="lucide:log-out" class="w-4 h-4" />
        </button>
      </div>

      <!-- Search -->
      <div class="relative mt-2">
        <Icon
          icon="lucide:search"
          class="w-4 h-4 text-ink-4 absolute left-3.5 top-1/2 -translate-y-1/2"
        />
        <input
          v-model="search"
          placeholder="Search conversations"
          class="w-full bg-field border border-edge rounded-xl pl-10 pr-4 py-2.5 text-ink text-sm outline-none placeholder-ink-4 focus:border-violet-500/50 transition-all"
        />
      </div>

      <!-- Mobile filter tabs -->
      <div class="flex md:hidden gap-1.5 mt-3">
        <button
          v-for="f in ['all', 'dms', 'rooms'] as const"
          :key="f"
          :class="[
            'flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer',
            filter === f
              ? 'bg-active text-violet-500 dark:text-violet-400'
              : 'text-ink-4 hover:text-ink-2',
          ]"
          @click="filter = f"
        >
          {{ f }}
        </button>
      </div>
    </div>

    <form v-if="showRoomForm" class="flex gap-2 px-5 pb-3" @submit.prevent="addRoom">
      <input
        v-model="roomName"
        placeholder="Room name"
        maxlength="50"
        class="flex-1 min-w-0 bg-field border border-edge rounded-lg px-3 py-2 text-ink text-xs outline-none placeholder-ink-4 focus:border-violet-500/50"
      />
      <button
        type="submit"
        :disabled="!roomName.trim() || creatingRoom"
        class="bg-linear-to-r from-violet-500 to-violet-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg px-3.5 cursor-pointer active:scale-97 transition-transform ease-(--ease-spring)"
      >
        {{ creatingRoom ? '...' : 'Add' }}
      </button>
    </form>

    <!-- Conversation list -->
    <div class="flex-1 overflow-y-auto px-3 pb-4">
      <!-- Rooms -->
      <template v-if="filteredRooms.length || filter === 'rooms'">
        <p class="text-ink-4 text-[10px] font-semibold px-3 mb-1.5 mt-1">Rooms</p>
        <div v-if="chat.loadingRooms" class="flex justify-center py-4">
          <span
            class="w-4 h-4 border-2 border-edge border-t-violet-500 rounded-full animate-spin"
          />
        </div>
        <ul v-else class="flex flex-col gap-0.5 mb-3">
          <li
            v-for="(room, idx) in filteredRooms"
            :key="room.id"
            v-glow
            :style="{ '--i': Math.min(idx, 10) }"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer transition-all stagger-rise glow-border ease-(--ease-spring)',
              isActiveRoom(room)
                ? 'bg-active shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                : 'hover:bg-hovered',
            ]"
            @click="emit('select-room', room)"
          >
            <span
              class="w-9 h-9 rounded-xl flex items-center justify-center text-base font-bold shrink-0"
              :class="
                isActiveRoom(room)
                  ? 'bg-linear-to-br from-violet-500/30 to-violet-700/30 text-violet-500 dark:text-violet-400'
                  : 'bg-field text-ink-3'
              "
              >#</span
            >
            <span
              :class="isActiveRoom(room) ? 'text-violet-600 dark:text-violet-300' : 'text-ink-2'"
            >
              {{ room.name }}
            </span>
          </li>
        </ul>
        <p v-if="!chat.loadingRooms && !filteredRooms.length" class="text-ink-4 text-xs px-3 mb-3">
          No rooms — create one with +
        </p>
      </template>

      <!-- DMs -->
      <template v-if="filteredConvs.length || filter !== 'rooms'">
        <p class="text-ink-4 text-[10px] font-semibold px-3 mb-1.5 mt-1">Direct</p>
        <ul class="flex flex-col gap-0.5">
          <li
            v-for="(conv, idx) in filteredConvs"
            :key="conv.id"
            v-glow
            :style="{ '--i': Math.min(idx, 10) }"
            :class="[
              'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all stagger-rise glow-border ease-(--ease-spring)',
              isActiveConv(conv)
                ? 'bg-active shadow-[inset_0_0_0_1px_rgba(139,92,246,0.2)]'
                : 'hover:bg-hovered',
            ]"
            @click="emit('select-conv', conv)"
          >
            <div
              class="w-9 h-9 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[11px] font-bold shrink-0"
              :style="{ filter: hue(conv.other_user.id) }"
            >
              {{ initials(conv.other_user.name) }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-2">
                <span
                  class="text-sm truncate"
                  :class="[
                    isActiveConv(conv) ? 'text-violet-600 dark:text-violet-300' : 'text-ink-2',
                    (conv.unread_count ?? 0) > 0 ? 'font-bold' : 'font-medium',
                  ]"
                  >{{ conv.other_user.name }}</span
                >
                <span v-if="conv.last_message" class="text-ink-4 text-[10px] shrink-0">
                  {{ rel(conv.last_message.created_at) }}
                </span>
              </div>
              <p
                class="text-xs truncate mt-0.5"
                :class="(conv.unread_count ?? 0) > 0 ? 'text-ink-2 font-medium' : 'text-ink-3'"
              >
                <template v-if="conv.last_message">
                  <span v-if="conv.last_message.deleted_at" class="italic">Message deleted</span>
                  <template v-else>
                    {{ conv.last_message.sender_id === auth.user?.id ? 'You: ' : ''
                    }}{{ conv.last_message.message }}
                  </template>
                </template>
                <template v-else>No messages yet</template>
              </p>
            </div>
            <span
              v-if="(conv.unread_count ?? 0) > 0"
              class="bg-linear-to-r from-violet-500 to-violet-700 text-white text-[10px] font-bold rounded-full min-w-[19px] h-[19px] px-1.5 flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(139,92,246,0.5)]"
              >{{ (conv.unread_count ?? 0) > 99 ? '99+' : conv.unread_count }}</span
            >
          </li>
        </ul>
        <p v-if="!filteredConvs.length" class="text-ink-4 text-xs px-3">No conversations yet</p>
      </template>
    </div>
  </section>
</template>
