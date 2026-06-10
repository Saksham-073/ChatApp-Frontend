import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api, type Paginated } from '../lib/api'
import { getEcho } from '../lib/echo'

export interface Room { id: number; name: string }
export interface ChatMessage {
  id: number
  chat_room_id: number
  user_id: number
  message: string
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

  async function createRoom(name: string) {
    const room = await api.post<Room>('/chat/rooms', { name })
    rooms.value.push(room)
    rooms.value.sort((a, b) => a.name.localeCompare(b.name))
    return room
  }

  function joinChannel(roomId: number) {
    getEcho().channel(`chat-room.${roomId}`).listen('MessageSent', (e: ChatMessage) => {
      if (!messages.value.find(m => m.id === e.id)) {
        messages.value.push(e)
      }
    })
  }

  function leaveCurrentChannel() {
    if (currentRoom.value) {
      getEcho().leaveChannel(`chat-room.${currentRoom.value.id}`)
    }
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
  }
})
