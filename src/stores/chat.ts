import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type Paginated } from '../lib/api'
import { getEcho } from '../lib/echo'
import { throttle } from '../lib/throttle'
import { createTypingIndicator } from '../composables/useTypingIndicator'
import { useAuthStore } from './auth'

export interface Room { id: number; name: string }
export interface ChatMessage {
  id: number
  chat_room_id: number
  user_id: number
  message: string
  edited_at?: string | null
  deleted_at?: string | null
  created_at: string
  user: { id: number; name: string }
}

export const useChatStore = defineStore('chat', () => {
  const rooms = ref<Room[]>([])
  const currentRoom = ref<Room | null>(null)
  const messages = ref<ChatMessage[]>([])
  const loadingRooms = ref(false)
  const loadingMessages = ref(false)
  const sending = ref(false)
  const error = ref('')

  const typing = createTypingIndicator()

  async function fetchRooms() {
    loadingRooms.value = true
    error.value = ''
    try {
      rooms.value = await api.get<Room[]>('/chat/rooms')
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loadingRooms.value = false
    }
  }

  async function selectRoom(room: Room) {
    leaveCurrentChannel()
    currentRoom.value = room
    messages.value = []
    await fetchMessages()
    joinChannel(room.id)
  }

  async function fetchMessages() {
    if (!currentRoom.value) return
    loadingMessages.value = true
    try {
      const page = await api.get<Paginated<ChatMessage>>(`/chat/room/${currentRoom.value.id}/messages`)
      messages.value = [...page.data].reverse()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loadingMessages.value = false
    }
  }

  async function sendMessage(content: string) {
    if (!currentRoom.value || !content.trim() || sending.value) return
    sending.value = true
    try {
      const msg = await api.post<ChatMessage>(`/chat/room/${currentRoom.value.id}/messages`, { message: content })
      if (!messages.value.find(m => m.id === msg.id)) {
        messages.value.push(msg)
      }
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      sending.value = false
    }
  }

  const notifyTyping = throttle(() => {
    if (!currentRoom.value) return
    api.post(`/chat/room/${currentRoom.value.id}/typing`, {}).catch(() => {})
  }, 2000)

  function applyUpdate(updated: Partial<ChatMessage> & { id: number }) {
    const idx = messages.value.findIndex((m) => m.id === updated.id)
    if (idx !== -1) {
      messages.value[idx] = { ...messages.value[idx], ...updated } as ChatMessage
    }
  }

  async function editMessage(id: number, content: string) {
    if (!currentRoom.value || !content.trim()) return
    try {
      const updated = await api.patch<ChatMessage>(
        `/chat/room/${currentRoom.value.id}/messages/${id}`,
        { message: content },
      )
      applyUpdate(updated)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function deleteMessage(id: number) {
    if (!currentRoom.value) return
    try {
      await api.del(`/chat/room/${currentRoom.value.id}/messages/${id}`)
      applyUpdate({ id, message: '', deleted_at: new Date().toISOString() })
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function createRoom(name: string) {
    const room = await api.post<Room>('/chat/rooms', { name })
    rooms.value.push(room)
    rooms.value.sort((a, b) => a.name.localeCompare(b.name))
    return room
  }

  function joinChannel(roomId: number) {
    const channel = getEcho().channel(`chat-room.${roomId}`)
    channel.listen('MessageSent', (e: ChatMessage) => {
      if (!messages.value.find(m => m.id === e.id)) {
        messages.value.push(e)
      }
    })
    channel.listen('MessageUpdated', (e: ChatMessage) => applyUpdate(e))
    channel.listen('MessageDeleted', (e: { id: number; deleted_at: string }) =>
      applyUpdate({ id: e.id, message: '', deleted_at: e.deleted_at }),
    )
    channel.listen('UserTyping', (e: { user_id: number; user: { id: number; name: string } }) => {
      const auth = useAuthStore()
      if (e.user_id === auth.user?.id) return
      typing.handleEvent(e.user_id, e.user.name)
    })
  }

  function leaveCurrentChannel() {
    if (currentRoom.value) {
      getEcho().leaveChannel(`chat-room.${currentRoom.value.id}`)
    }
    typing.clear()
  }

  function reset() {
    leaveCurrentChannel()
    rooms.value = []
    currentRoom.value = null
    messages.value = []
    error.value = ''
  }

  return {
    rooms, currentRoom, messages,
    loadingRooms, loadingMessages, sending, error,
    fetchRooms, selectRoom, sendMessage, createRoom, reset,
    editMessage, deleteMessage,
    notifyTyping, typingLabel: typing.label,
  }
})
