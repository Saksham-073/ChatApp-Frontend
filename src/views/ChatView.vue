<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore, type Room } from '../stores/chat'
import { useDmStore, type Conversation, type DMUser } from '../stores/dm'
import { useFriendsStore } from '../stores/friends'
import { getEcho } from '../lib/echo'
import { initials, hue } from '../lib/ui'
import Navbar from '../components/Navbar.vue'
import Sidebar from '../components/Sidebar.vue'
import Header from '../components/Header.vue'
import OnboardingModal from '../components/OnboardingModal.vue'
import FriendsPanel from '../components/FriendsPanel.vue'
import SettingsPanel from '../components/SettingsPanel.vue'

const auth = useAuthStore()
const chat = useChatStore()
const dm = useDmStore()
const friends = useFriendsStore()
const router = useRouter()

const messageInput = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

const activeView = ref<'room' | 'dm' | 'users' | 'friends' | 'settings' | null>(null)
const sidebarOpen = ref(false)
const filter = ref<'all' | 'dms' | 'rooms'>('all')
const showOnboarding = ref(false)

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
  editedAt?: string | null
  deletedAt?: string | null
}

const activeMessages = computed<UnifiedMsg[]>(() => {
  if (activeView.value === 'room') {
    return chat.messages.map((m) => ({
      id: m.id,
      senderId: m.user_id,
      senderName: m.user?.name ?? 'Unknown',
      text: m.message,
      at: m.created_at,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
    }))
  }
  if (activeView.value === 'dm') {
    return dm.messages.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      senderName: m.sender?.name ?? 'Unknown',
      text: m.message,
      at: m.created_at,
      editedAt: m.edited_at,
      deletedAt: m.deleted_at,
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
const canMessageCurrentConv = computed(
  () => activeView.value !== 'dm' || dm.currentConv?.other_user.friendship_status === 'friends',
)
const nonFriendComposerAction = computed(() => {
  const status = dm.currentConv?.other_user.friendship_status
  if (status === 'pending_sent') return 'sent'
  if (status === 'pending_received') return 'received'
  return 'none'
})

function acceptCurrentConvRequest() {
  const id = dm.currentConv?.other_user.friendship_id
  if (id) friends.acceptRequest(id)
}

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

const supportsFieldSizing = CSS.supports('field-sizing', 'content')

function autoGrow() {
  if (supportsFieldSizing) return
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
}

// ── Edit / delete ────────────────────────────────────────────────────

const editingId = ref<number | null>(null)
let draftBeforeEdit = ''
const confirmDeleteId = ref<number | null>(null)
let confirmTimer: number | undefined
const actionBarId = ref<number | null>(null) // tap-toggled action bar (mobile)

const EDIT_WINDOW_MS = 15 * 60 * 1000

function isMine(m: UnifiedMsg) {
  return m.senderId === auth.user?.id
}

function canEdit(m: UnifiedMsg) {
  return !m.deletedAt && Date.now() - new Date(m.at).getTime() < EDIT_WINDOW_MS
}

function toggleActions(m: UnifiedMsg) {
  if (!isMine(m) || m.deletedAt) return
  actionBarId.value = actionBarId.value === m.id ? null : m.id
}

function startEdit(m: UnifiedMsg) {
  if (editingId.value === null) {
    draftBeforeEdit = messageInput.value // capture only when entering edit mode, not when switching targets
  }
  editingId.value = m.id
  messageInput.value = m.text
  nextTick(() => {
    autoGrow()
    inputEl.value?.focus()
  })
}

function cancelEdit() {
  editingId.value = null
  actionBarId.value = null
  messageInput.value = draftBeforeEdit
  draftBeforeEdit = ''
  nextTick(autoGrow)
}

function requestDelete(m: UnifiedMsg) {
  if (confirmDeleteId.value === m.id) {
    confirmDeleteId.value = null
    window.clearTimeout(confirmTimer)
    if (activeView.value === 'room') chat.deleteMessage(m.id)
    else dm.deleteMessage(m.id)
    if (editingId.value === m.id) cancelEdit()
    actionBarId.value = null
  } else {
    confirmDeleteId.value = m.id
    window.clearTimeout(confirmTimer)
    confirmTimer = window.setTimeout(() => (confirmDeleteId.value = null), 3000)
  }
}

async function send() {
  const content = messageInput.value.trim()
  if (!content || isSending.value) return

  if (editingId.value !== null) {
    const id = editingId.value
    editingId.value = null
    actionBarId.value = null
    messageInput.value = draftBeforeEdit
    draftBeforeEdit = ''
    nextTick(autoGrow)
    if (activeView.value === 'room') await chat.editMessage(id, content)
    else await dm.editMessage(id, content)
  } else {
    messageInput.value = ''
    nextTick(autoGrow)
    if (activeView.value === 'room') await chat.sendMessage(content)
    else if (activeView.value === 'dm') await dm.sendMessage(content)
  }
  inputEl.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  } else if (e.key === 'Escape' && editingId.value !== null) {
    cancelEdit()
  }
}

// ── Navigation ───────────────────────────────────────────────────────

function selectRoom(room: Room) {
  if (editingId.value !== null) cancelEdit()
  actionBarId.value = null
  confirmDeleteId.value = null
  activeView.value = 'room'
  sidebarOpen.value = false
  chat.selectRoom(room)
}

async function selectConv(conv: Conversation) {
  if (editingId.value !== null) cancelEdit()
  actionBarId.value = null
  confirmDeleteId.value = null
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

function showFriends() {
  activeView.value = 'friends'
  sidebarOpen.value = false
}

function showSettings() {
  activeView.value = 'settings'
  sidebarOpen.value = false
}

function friendButtonLabel(user: DMUser) {
  switch (user.friendship_status) {
    case 'pending_sent':
      return 'Pending'
    case 'pending_received':
      return 'Accept'
    case 'friends':
      return 'Message'
    default:
      return 'Add Friend'
  }
}

async function handleUserRowClick(user: DMUser) {
  if (user.friendship_status === 'friends') {
    await openNewDm(user.id)
    return
  }
  if (user.friendship_status === 'pending_received' && user.friendship_id) {
    await friends.acceptRequest(user.friendship_id)
  } else if (user.friendship_status === 'pending_sent' && user.friendship_id) {
    await friends.cancelOrDecline(user.friendship_id)
  } else if (!user.friendship_status || user.friendship_status === 'none') {
    await friends.sendRequest(user.id)
  }
  await dm.fetchUsers()
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
watch(
  () => friends.error,
  (e) => {
    if (e) {
      toast(e)
      friends.error = ''
    }
  },
)

// ── Lifecycle ────────────────────────────────────────────────────────

onMounted(() => {
  getEcho() // connect the websocket right away so the status indicator is accurate
  chat.fetchRooms()
  dm.fetchConversations()
  friends.fetchFriends()
  friends.fetchRequests()
  friends.subscribeSelf()
  if (!localStorage.getItem('onboarding_seen')) {
    showOnboarding.value = true
  }
})

function closeOnboarding() {
  localStorage.setItem('onboarding_seen', '1')
  showOnboarding.value = false
}

onUnmounted(() => {
  chat.reset()
  dm.reset()
  friends.reset()
})
</script>

<template>
  <div class="relative z-10 h-dvh flex overflow-hidden text-ink-2">
    <Navbar v-model:filter="filter" @logout="logout" @show-settings="showSettings" />

    <Sidebar
      v-model:open="sidebarOpen"
      v-model:filter="filter"
      :active-view="activeView"
      @select-room="selectRoom"
      @select-conv="selectConv"
      @show-users="showUsers"
      @show-friends="showFriends"
      @show-settings="showSettings"
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
            class="w-20 h-20 rounded-3xl glass flex items-center justify-center shadow-[0_0_60px_rgba(139,92,246,0.15)]"
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
              class="w-5 h-5 border-2 border-edge border-t-violet-500 rounded-full animate-spin"
            />
          </div>
          <ul v-else class="flex flex-col gap-2 max-w-xl">
            <li
              v-for="user in dm.users"
              :key="user.id"
              class="flex items-center gap-3.5 px-4 py-3.5 rounded-2xl glass hover:bg-hovered cursor-pointer transition-all msg-rise"
              @click="handleUserRowClick(user)"
            >
              <div
                class="w-10 h-10 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-sm font-bold shrink-0"
                :style="{ filter: hue(user.id) }"
              >
                {{ initials(user.name) }}
              </div>
              <div class="min-w-0">
                <p class="text-ink text-sm font-semibold truncate">{{ user.name }}</p>
                <p class="text-ink-3 text-xs truncate">{{ user.email }}</p>
              </div>
              <span
                class="ml-auto shrink-0 text-xs font-semibold"
                :class="
                  user.friendship_status === 'friends'
                    ? 'text-violet-500 dark:text-violet-400'
                    : 'text-ink-3'
                "
              >
                {{ friendButtonLabel(user) }}
              </span>
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

      <!-- Friends -->
      <template v-else-if="activeView === 'friends'">
        <FriendsPanel />
      </template>

      <!-- Settings -->
      <template v-else-if="activeView === 'settings'">
        <SettingsPanel />
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
                class="w-5 h-5 border-2 border-edge border-t-violet-500 rounded-full animate-spin"
              />
            </div>

            <div v-else-if="!renderItems.length" class="flex-1 flex items-center justify-center">
              <p class="text-ink-4 text-sm">No messages yet — say something!</p>
            </div>

            <template v-for="(item, idx) in renderItems" :key="item.key">
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
                :style="{ '--i': Math.min(idx, 10) }"
                :class="[
                  'flex gap-3 max-w-[88%] md:max-w-[70%] stagger-rise',
                  item.showHeader ? 'mt-3' : 'mt-1',
                  isMine(item.msg) ? 'self-end flex-row-reverse' : 'self-start',
                ]"
              >
                <!-- Avatar (theirs, first of group only) -->
                <div v-if="!isMine(item.msg)" class="w-8 shrink-0">
                  <div
                    v-if="item.showHeader"
                    class="w-8 h-8 rounded-lg bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-[10px] font-bold"
                    :style="{ filter: hue(item.msg.senderId) }"
                  >
                    {{ initials(item.msg.senderName) }}
                  </div>
                </div>

                <div
                  :class="['flex flex-col min-w-0', isMine(item.msg) ? 'items-end' : 'items-start']"
                >
                  <div v-if="item.showHeader" class="flex items-baseline gap-2 mb-1 px-0.5">
                    <span class="text-ink-3 text-xs font-semibold">
                      {{ isMine(item.msg) ? 'You' : item.msg.senderName }}
                    </span>
                    <span class="text-ink-4 text-[10px]">{{ fmt(item.msg.at) }}</span>
                    <span
                      v-if="item.msg.editedAt && !item.msg.deletedAt"
                      class="text-ink-4 text-[10px] italic"
                      >(edited)</span
                    >
                  </div>
                  <div
                    class="group flex items-center gap-1.5"
                    :class="isMine(item.msg) ? 'flex-row-reverse' : ''"
                  >
                    <!-- Tombstone -->
                    <div
                      v-if="item.msg.deletedAt"
                      class="px-4 py-2.5 text-sm italic rounded-2xl glass text-ink-4 flex items-center gap-1.5"
                    >
                      <Icon icon="lucide:ban" class="w-3.5 h-3.5" />
                      This message was deleted
                    </div>

                    <!-- Normal bubble -->
                    <div
                      v-else
                      v-glow
                      :class="[
                        'px-4 py-2.5 text-sm leading-relaxed wrap-break-words whitespace-pre-wrap rounded-2xl',
                        isMine(item.msg)
                          ? 'bg-linear-to-br from-violet-500 to-violet-700 text-white rounded-br-md shadow-[0_6px_24px_rgba(139,92,246,0.35)] glow-border'
                          : 'glass text-ink-2 rounded-bl-md',
                      ]"
                      @click="toggleActions(item.msg)"
                    >
                      {{ item.msg.text }}
                    </div>

                    <!-- Edit/delete actions (own, non-deleted messages) -->
                    <div
                      v-if="isMine(item.msg) && !item.msg.deletedAt"
                      :class="[
                        'flex items-center gap-0.5 transition-opacity',
                        actionBarId === item.msg.id
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100',
                      ]"
                    >
                      <button
                        v-if="canEdit(item.msg)"
                        class="w-7 h-7 rounded-lg flex items-center justify-center text-ink-4 hover:text-violet-500 dark:hover:text-violet-400 hover:bg-hovered active:scale-90 transition-transform ease-(--ease-spring) cursor-pointer"
                        title="Edit message"
                        @click="startEdit(item.msg)"
                      >
                        <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        :class="[
                          'w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer hover:bg-hovered active:scale-90 transition-transform ease-(--ease-spring)',
                          confirmDeleteId === item.msg.id
                            ? 'text-rose-500'
                            : 'text-ink-4 hover:text-rose-500',
                        ]"
                        :title="
                          confirmDeleteId === item.msg.id
                            ? 'Tap again to confirm'
                            : 'Delete message'
                        "
                        @click="requestDelete(item.msg)"
                      >
                        <Icon
                          :icon="
                            confirmDeleteId === item.msg.id ? 'lucide:check' : 'lucide:trash-2'
                          "
                          class="w-3.5 h-3.5"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- New messages pill -->
          <button
            v-if="newCount > 0"
            class="absolute bottom-4 left-1/2 -translate-x-1/2 bg-linear-to-r from-violet-500 to-violet-700 text-white text-xs font-semibold rounded-full px-4 py-2 shadow-[0_8px_30px_rgba(139,92,246,0.5)] flex items-center gap-1.5 cursor-pointer hover:scale-105 transition-transform"
            @click="scrollToBottom"
          >
            <Icon icon="lucide:arrow-down" class="w-3.5 h-3.5" />
            {{ newCount }} new {{ newCount === 1 ? 'message' : 'messages' }}
          </button>
        </div>

        <!-- Composer -->
        <div class="px-4 md:px-6 pb-5 pt-2 shrink-0">
          <div
            v-if="editingId !== null"
            class="flex items-center justify-between px-3 pb-1.5 text-xs text-ink-3"
          >
            <span class="flex items-center gap-1.5">
              <Icon icon="lucide:pencil" class="w-3 h-3" />
              Editing message
            </span>
            <button class="hover:text-ink cursor-pointer" @click="cancelEdit">Cancel (Esc)</button>
          </div>
          <div
            v-if="canMessageCurrentConv"
            class="glass rounded-2xl flex items-end gap-2 p-2 focus-within:border-violet-500/40 transition-colors"
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
              class="flex-1 resize-none bg-transparent px-3 py-2 text-ink text-sm outline-none placeholder-ink-4 field-sizing-content max-h-[120px]"
              @input="autoGrow"
              @keydown="onKeydown"
            />
            <button
              :disabled="!messageInput.trim() || isSending"
              class="w-10 h-10 rounded-xl bg-linear-to-br from-violet-500 to-violet-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white shrink-0 transition-all active:scale-90 ease-(--ease-spring) hover:shadow-[0_4px_20px_rgba(139,92,246,0.5)] cursor-pointer"
              @click="send"
            >
              <span
                v-if="isSending"
                class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              />
              <Icon v-else icon="lucide:send-horizontal" class="w-[18px] h-[18px]" />
            </button>
          </div>
          <div v-else class="glass rounded-2xl flex items-center justify-between gap-3 p-4">
            <span class="text-ink-3 text-sm"
              >You're not friends yet — add them to start messaging.</span
            >
            <button
              v-if="nonFriendComposerAction === 'received'"
              class="text-xs font-semibold rounded-lg px-3.5 py-2 bg-linear-to-r from-violet-500 to-violet-700 text-white shrink-0 cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
              @click="acceptCurrentConvRequest"
            >
              Accept Request
            </button>
            <button
              v-else-if="nonFriendComposerAction === 'sent'"
              disabled
              class="text-xs font-semibold rounded-lg px-3.5 py-2 bg-field text-ink-4 shrink-0 cursor-not-allowed"
            >
              Request Sent
            </button>
            <button
              v-else
              class="text-xs font-semibold rounded-lg px-3.5 py-2 bg-linear-to-r from-violet-500 to-violet-700 text-white shrink-0 cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
              @click="dm.currentConv && friends.sendRequest(dm.currentConv.other_user.id)"
            >
              Add Friend
            </button>
          </div>
        </div>
      </template>
    </main>

    <OnboardingModal v-if="showOnboarding" @close="closeOnboarding" />

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
