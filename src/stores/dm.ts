import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type Paginated } from '../lib/api'
import { getEcho } from '../lib/echo'
import { useAuthStore } from './auth'

export interface DMUser {
  id: number
  name: string
  email?: string
  friendship_status?: 'none' | 'pending_sent' | 'pending_received' | 'friends'
  friendship_id?: number | null
}
export interface LastMessage { id: number; message: string; sender_id: number; created_at: string; deleted_at?: string | null }
export interface Conversation {
  id: number
  other_user: DMUser
  unread_count?: number
  last_message?: LastMessage | null
}
export interface DirectMessage {
  id: number
  conversation_id: number
  sender_id: number
  message: string
  edited_at?: string | null
  deleted_at?: string | null
  read_at?: string | null
  created_at: string
  sender: DMUser
}

export const useDmStore = defineStore('dm', () => {
  const users = ref<DMUser[]>([])
  const conversations = ref<Conversation[]>([])
  const currentConv = ref<Conversation | null>(null)
  const messages = ref<DirectMessage[]>([])
  const loadingUsers = ref(false)
  const loadingMessages = ref(false)
  const sending = ref(false)
  const error = ref('')

  // Conversation ids we already have a live websocket subscription for
  const subscribed = new Set<number>()
  let selfSubscribed = false

  /**
   * Listen on our personal channel so the FIRST message of a brand-new
   * conversation arrives live — we can't be subscribed to a conversation
   * we don't know exists yet.
   */
  function subscribeSelf() {
    const auth = useAuthStore()
    if (selfSubscribed || !auth.user) return
    selfSubscribed = true

    getEcho().private(`user.${auth.user.id}`).listen('DirectMessageSent', async (e: DirectMessage) => {
      // Known conversation — its own channel listener already handles it
      if (conversations.value.find(c => c.id === e.conversation_id)) return
      // New conversation: pull the list (brings unread count + preview) and subscribe to it
      await fetchConversations()
    })
  }

  async function fetchUsers() {
    loadingUsers.value = true
    error.value = ''
    try {
      users.value = await api.get<DMUser[]>('/users')
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loadingUsers.value = false
    }
  }

  async function fetchConversations() {
    try {
      conversations.value = await api.get<Conversation[]>('/conversations')
      // Listen on every conversation so messages in closed chats still update the sidebar
      conversations.value.forEach(c => subscribe(c.id))
      subscribeSelf()
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function openConversation(userId: number) {
    error.value = ''
    try {
      const conv = await api.post<Conversation>('/conversations', { user_id: userId })
      const existing = conversations.value.find(c => c.id === conv.id)
      if (!existing) {
        conversations.value.unshift(conv)
      }
      subscribe(conv.id)
      await selectConversation(existing ?? conv)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function selectConversation(conv: Conversation) {
    currentConv.value = conv
    messages.value = []
    await fetchMessages()
    markRead(conv)
  }

  async function fetchMessages() {
    if (!currentConv.value) return
    loadingMessages.value = true
    try {
      const page = await api.get<Paginated<DirectMessage>>(`/conversations/${currentConv.value.id}/messages`)
      messages.value = [...page.data].reverse()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loadingMessages.value = false
    }
  }

  async function markRead(conv: Conversation) {
    conv.unread_count = 0
    try {
      await api.post(`/conversations/${conv.id}/read`, {})
    } catch {
      // Non-critical — unread state will self-correct on next conversations fetch
    }
  }

  async function sendMessage(content: string) {
    if (!currentConv.value || !content.trim() || sending.value) return
    sending.value = true
    error.value = ''
    try {
      const dm = await api.post<DirectMessage>(
        `/conversations/${currentConv.value.id}/messages`,
        { message: content },
      )
      if (!messages.value.find(m => m.id === dm.id)) {
        messages.value.push(dm)
      }
      touchConversation(dm)
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      sending.value = false
    }
  }

  function subscribe(convId: number) {
    if (subscribed.has(convId)) return
    subscribed.add(convId)

    getEcho().private(`conversation.${convId}`).listen('DirectMessageSent', (e: DirectMessage) => {
      if (currentConv.value?.id === e.conversation_id) {
        // Conversation is open — show the message and mark it read immediately
        if (!messages.value.find(m => m.id === e.id)) {
          messages.value.push(e)
        }
        markRead(currentConv.value)
      } else {
        // Closed conversation — bump its unread badge
        const conv = conversations.value.find(c => c.id === e.conversation_id)
        if (conv) conv.unread_count = (conv.unread_count ?? 0) + 1
      }
      touchConversation(e)
    }).listen('DirectMessageUpdated', (e: DirectMessage) => {
      applyUpdate(e)
      refreshPreview(e)
    }).listen('DirectMessageDeleted', (e: { id: number; conversation_id: number; deleted_at: string }) => {
      applyUpdate({ id: e.id, message: '', deleted_at: e.deleted_at })
      refreshPreview({ ...e, message: '' })
    })
  }

  /** Update a conversation's last-message preview and move it to the top of the list. */
  function touchConversation(dm: DirectMessage) {
    const idx = conversations.value.findIndex(c => c.id === dm.conversation_id)
    const conv = conversations.value[idx]
    if (!conv) return
    conv.last_message = {
      id: dm.id,
      message: dm.message,
      sender_id: dm.sender_id,
      created_at: dm.created_at,
      deleted_at: dm.deleted_at ?? null,
    }
    if (idx > 0) {
      conversations.value.splice(idx, 1)
      conversations.value.unshift(conv)
    }
  }

  function applyUpdate(updated: Partial<DirectMessage> & { id: number }) {
    const idx = messages.value.findIndex((m) => m.id === updated.id)
    if (idx !== -1) {
      messages.value[idx] = { ...messages.value[idx], ...updated } as DirectMessage
    }
  }

  /** If the changed message is a conversation's latest, sync the sidebar preview. */
  function refreshPreview(msg: {
    id: number
    conversation_id: number
    message: string
    deleted_at?: string | null
  }) {
    const conv = conversations.value.find((c) => c.id === msg.conversation_id)
    if (conv?.last_message && conv.last_message.id === msg.id) {
      conv.last_message = {
        ...conv.last_message,
        message: msg.message,
        deleted_at: msg.deleted_at ?? null,
      }
    }
  }

  async function editMessage(id: number, content: string) {
    if (!currentConv.value || !content.trim()) return
    try {
      const updated = await api.patch<DirectMessage>(
        `/conversations/${currentConv.value.id}/messages/${id}`,
        { message: content },
      )
      applyUpdate(updated)
      refreshPreview(updated)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteMessage(id: number) {
    if (!currentConv.value) return
    try {
      await api.del(`/conversations/${currentConv.value.id}/messages/${id}`)
      const change = {
        id,
        conversation_id: currentConv.value.id,
        message: '',
        deleted_at: new Date().toISOString(),
      }
      applyUpdate(change)
      refreshPreview(change)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  function reset() {
    const auth = useAuthStore()
    subscribed.forEach(id => getEcho().leaveChannel(`private-conversation.${id}`))
    subscribed.clear()
    if (selfSubscribed && auth.user) {
      getEcho().leaveChannel(`private-user.${auth.user.id}`)
    }
    selfSubscribed = false
    users.value = []
    conversations.value = []
    currentConv.value = null
    messages.value = []
    error.value = ''
  }

  return {
    users, conversations, currentConv, messages,
    loadingUsers, loadingMessages, sending, error,
    fetchUsers, fetchConversations, openConversation, selectConversation, sendMessage, markRead, reset,
    editMessage, deleteMessage,
  }
})
