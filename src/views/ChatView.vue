<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore, type Room } from '../stores/chat'
import { useDmStore, type Conversation } from '../stores/dm'
import { getEcho } from '../lib/echo'
import { initials, hue } from '../lib/ui'
import Navbar from '../components/Navbar.vue'
import Sidebar from '../components/Sidebar.vue'
import Header from '../components/Header.vue'

const auth = useAuthStore()
const chat = useChatStore()
const dm = useDmStore()
const router = useRouter()

const messageInput = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

const activeView = ref<'room' | 'dm' | 'users' | null>(null)
const sidebarOpen = ref(false)
const filter = ref<'all' | 'dms' | 'rooms'>('all')

// ── Helpers ──────────────────────────────────────────────────────────

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Unified message rendering ────────────────────────────────────────

interface UnifiedMsg {
  id: number
  senderId: number
  senderName: string
  text: string
  at: string
}

const activeMessages = computed<UnifiedMsg[]>(() => {
  if (activeView.value === 'room') {
    return chat.messages.map((m) => ({
      id: m.id,
      senderId: m.user_id,
      senderName: m.user?.name ?? 'Unknown',
      text: m.message,
      at: m.created_at,
    }))
  }
  if (activeView.value === 'dm') {
    return dm.messages.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.name ?? 'Unknown',
      text: m.message,
      at: m.created_at,
    }))
  }
  return []
})

type RenderItem =
  | { type: 'date'; key: string; label: string }
  | { type: 'msg'; key: number; msg: UnifiedMsg; showHeader: boolean }

const GROUP_GAP_MS = 2 * 60 * 1000

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = []
  let prev: UnifiedMsg | null = null
  for (const m of activeMessages.value) {
    if (!prev || dayLabel(prev.at) !== dayLabel(m.at)) {
      items.push({ type: 'date', key: `date-${m.id}`, label: dayLabel(m.at) })
      prev = null
    }
    const showHeader =
      !prev ||
      prev.senderId !== m.senderId ||
      new Date(m.at).getTime() - new Date(prev.at).getTime() > GROUP_GAP_MS
    items.push({ type: 'msg', key: m.id, msg: m, showHeader })
    prev = m
  }
  return items
})

const isLoadingMessages = computed(() =>
  activeView.value === 'room' ? chat.loadingMessages : dm.loadingMessages,
)
const isSending = computed(() => (activeView.value === 'room' ? chat.sending : dm.sending))

// ── Smart scrolling ──────────────────────────────────────────────────

const nearBottom = ref(true)
const newCount = ref(0)

function onScroll() {
  const el = messagesEl.value
  if (!el) return
  nearBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
  if (nearBottom.value) newCount.value = 0
}

function scrollToBottom() {
  const el = messagesEl.value
  if (el) el.scrollTop = el.scrollHeight
  newCount.value = 0
}

watch(
  () => activeMessages.value.length,
  (n, o) => {
    nextTick(() => {
      const last = activeMessages.value[activeMessages.value.length - 1]
      const isMine = last?.senderId === auth.user?.id
      if (nearBottom.value || isMine || !o) {
        scrollToBottom()
      } else {
        newCount.value += Math.max(0, n - o)
      }
    })
  },
)

// ── Sending ──────────────────────────────────────────────────────────

function autoGrow() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

async function send() {
  const content = messageInput.value.trim()
  if (!content || isSending.value) return
  messageInput.value = ''
  nextTick(autoGrow)
  if (activeView.value === 'room') await chat.sendMessage(content)
  else if (activeView.value === 'dm') await dm.sendMessage(content)
  inputEl.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// ── Navigation ───────────────────────────────────────────────────────

function selectRoom(room: Room) {
  activeView.value = 'room'
  sidebarOpen.value = false
  chat.selectRoom(room)
}

async function selectConv(conv: Conversation) {
  activeView.value = 'dm'
  sidebarOpen.value = false
  await dm.selectConversation(conv)
}

async function openNewDm(userId: number) {
  await dm.openConversation(userId)
  activeView.value = 'dm'
}

function showUsers() {
  activeView.value = 'users'
  sidebarOpen.value = false
  dm.fetchUsers()
}

async function logout() {
  chat.reset()
  dm.reset()
  await auth.logout()
  router.push('/login')
}

const toasts = ref<{ id: number; text: string }[]>([])
let toastSeq = 0

function toast(text: string) {
  const id = ++toastSeq
  toasts.value.push({ id, text })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 4000)
}

watch(
  () => chat.error,
  (e) => {
    if (e) {
      toast(e)
      chat.error = ''
    }
  },
)
watch(
  () => dm.error,
  (e) => {
    if (e) {
      toast(e)
      dm.error = ''
    }
  },
)

// ── Lifecycle ────────────────────────────────────────────────────────

onMounted(() => {
  getEcho() // connect the websocket right away so the status indicator is accurate
  chat.fetchRooms()
  dm.fetchConversations()
})

onUnmounted(() => {
  chat.reset()
  dm.reset()
})
</script>

<template>
  <div class="relative z-10 h-screen flex overflow-hidden text-ink-2">
    <Navbar v-model:filter="filter" @logout="logout" />

    <Sidebar
      v-model:open="sidebarOpen"
      v-model:filter="filter"
      :active-view="activeView"
      @select-room="selectRoom"
      @select-conv="selectConv"
      @show-users="showUsers"
      @logout="logout"
      @error="toast"
    />

    <!-- ════════ Thread pane ════════ -->
    <main class="flex-1 flex flex-col overflow-hidden min-w-0">
      <Header v-model:open="sidebarOpen" :active-view="activeView" />

      <!-- Empty state -->
      <template v-if="!activeView">
        <div class="flex-1 flex flex-col items-center justify-center gap-5 px-6">
          <div
            class="w-20 h-20 rounded-3xl glass flex items-center justify-center shadow-[0_0_60px_rgba(34,211,238,0.12)]"
          >
            <Icon icon="lucide:message-square" class="w-9 h-9 text-ink-4" />
          </div>
          <div class="text-center">
            <p class="text-ink-2 text-base font-semibold">Your messages live here</p>
            <p class="text-ink-4 text-sm mt-1">Pick a conversation or start a new one</p>
          </div>
        </div>
      </template>

      <!-- User picker -->
      <template v-else-if="activeView === 'users'">
        <div class="flex-1 overflow-y-auto px-4 md:px-6 py-5">
          <div v-if="dm.loadingUsers" class="flex justify-center py-8">
            <span
              class="w-5 h-5 border-2 border-edge border-t-cyan-500 rounded-full animate-spin"
            />
          </div>
          <ul v-else class="flex flex-col gap-2 max-w-xl">
            <li
              v-for="user in dm.users"
              :key="user.id"
              class="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl glass hover:bg-hovered cursor-pointer transition-all msg-rise"
              @click="openNewDm(user.id)"
            >
              <div
                class="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-400 to-violet-600 flex items-center justify-center text-white text-sm font-bold shrink-0"
                :style="{ filter: hue(user.id) }"
              >
                {{ initials(user.name) }}
              </div>
              <div class="min-w-0">
                <p class="text-ink text-sm font-semibold truncate">{{ user.name }}</p>
                <p class="text-ink-3 text-xs truncate">{{ user.email }}</p>
              </div>
              <Icon icon="lucide:chevron-right" class="w-4 h-4 text-ink-4 ml-auto shrink-0" />
            </li>
          </ul>
          <p
            v-if="!dm.loadingUsers && !dm.users.length"
            class="text-ink-4 text-sm text-center py-8"
          >
            No other users found
          </p>
        </div>
      </template>

      <!-- Chat area -->
      <template v-else>
        <div class="flex-1 relative overflow-hidden flex flex-col">
          <div
            ref="messagesEl"
            class="flex-1 overflow-y-auto flex flex-col px-4 md:px-6 py-5"
            @scroll="onScroll"
          >
            <div v-if="isLoadingMessages && !renderItems.length" class="flex justify-center py-8">
              <span
                class="w-5 h-5 border-2 border-edge border-t-cyan-500 rounded-full animate-spin"
              />
            </div>

            <div v-else-if="!renderItems.length" class="flex-1 flex items-center justify-center">
              <p class="text-ink-4 text-sm">No messages yet — say something!</p>
            </div>

            <template v-for="item in renderItems" :key="item.key">
              <!-- Date separator -->
              <div v-if="item.type === 'date'" class="flex justify-center my-5">
                <span
                  class="glass text-ink-3 text-[11px] font-semibold rounded-full px-3.5 py-1 tracking-wide"
                >
                  {{ item.label }}
                </span>
              </div>

              <!-- Message -->
              <div
                v-else
                :class="[
                  'flex gap-3 max-w-[88%] md:max-w-[70%] msg-rise',
                  item.showHeader ? 'mt-3' : 'mt-1',
                  item.msg.senderId === auth.user?.id ? 'self-end flex-row-reverse' : 'self-start',
                ]"
              >
                <!-- Avatar (theirs, first of group only) -->
                <div v-if="item.msg.senderId !== auth.user?.id" class="w-8 shrink-0">
                  <div
                    v-if="item.showHeader"
                    class="w-8 h-8 rounded-lg bg-linear-to-br from-cyan-400 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold"
                    :style="{ filter: hue(item.msg.senderId) }"
                  >
                    {{ initials(item.msg.senderName) }}
                  </div>
                </div>

                <div
                  :class="[
                    'flex flex-col min-w-0',
                    item.msg.senderId === auth.user?.id ? 'items-end' : 'items-start',
                  ]"
                >
                  <div v-if="item.showHeader" class="flex items-baseline gap-2 mb-1 px-0.5">
                    <span class="text-ink-3 text-xs font-semibold">
                      {{ item.msg.senderId === auth.user?.id ? 'You' : item.msg.senderName }}
                    </span>
                    <span class="text-ink-4 text-[10px]">{{ fmt(item.msg.at) }}</span>
                  </div>
                  <div
                    :class="[
                      'px-4 py-2.5 text-sm leading-relaxed wrap-break-words whitespace-pre-wrap rounded-2xl',
                      item.msg.senderId === auth.user?.id
                        ? 'bg-linear-to-br from-cyan-500 to-violet-600 text-white rounded-br-md shadow-[0_6px_24px_rgba(124,58,237,0.3)]'
                        : 'glass text-ink-2 rounded-bl-md',
                    ]"
                  >
                    {{ item.msg.text }}
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- New messages pill -->
          <button
            v-if="newCount > 0"
            class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-linear-to-r from-cyan-500 to-violet-600 text-white text-xs font-semibold rounded-full px-4 py-2 shadow-[0_8px_30px_rgba(124,58,237,0.5)] flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform"
            @click="scrollToBottom"
          >
            <Icon icon="lucide:arrow-down" class="w-3.5 h-3.5" />
            {{ newCount }} new {{ newCount === 1 ? 'message' : 'messages' }}
          </button>
        </div>

        <!-- Composer -->
        <div class="px-4 md:px-6 pb-5 pt-2 shrink-0">
          <div
            class="glass rounded-2xl flex items-end gap-2 p-2 focus-within:border-cyan-400/40 transition-colors"
          >
            <textarea
              ref="inputEl"
              v-model="messageInput"
              rows="1"
              :placeholder="
                activeView === 'room' && chat.currentRoom
                  ? `Message #${chat.currentRoom.name}`
                  : dm.currentConv
                    ? `Message ${dm.currentConv.other_user.name}`
                    : 'Message'
              "
              maxlength="2000"
              class="flex-1 resize-none bg-transparent px-3 py-2 text-ink text-sm outline-none placeholder-ink-4"
              @input="autoGrow"
              @keydown="onKeydown"
            />
            <button
              :disabled="!messageInput.trim() || isSending"
              class="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-violet-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white shrink-0 transition-all hover:shadow-[0_4px_20px_rgba(124,58,237,0.5)] cursor-pointer"
              @click="send"
            >
              <span
                v-if="isSending"
                class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              />
              <Icon v-else icon="ic:round-send" class="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </template>
    </main>

    <!-- Error toasts -->
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="glass border-rose-500/40 text-rose-600 dark:text-rose-300 text-sm rounded-2xl px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.25)] max-w-xs msg-rise"
      >
        {{ t.text }}
      </div>
    </div>
  </div>
</template>
