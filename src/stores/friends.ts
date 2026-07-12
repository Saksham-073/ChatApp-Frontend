import { ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../lib/api'
import { getEcho } from '../lib/echo'
import { useAuthStore } from './auth'
import { useDmStore } from './dm'
import type { DMUser } from './dm'

export interface FriendRequest {
  id: number
  status: 'pending' | 'accepted'
  sender: DMUser
  recipient: DMUser
  created_at: string
}

export const useFriendsStore = defineStore('friends', () => {
  const friends = ref<DMUser[]>([])
  const incoming = ref<FriendRequest[]>([])
  const outgoing = ref<FriendRequest[]>([])
  const loading = ref(false)
  const error = ref('')

  let selfSubscribed = false

  function syncDmFriendshipStatus(
    userId: number,
    status: 'none' | 'pending_sent' | 'pending_received' | 'friends',
    friendshipId: number | null = null,
  ) {
    const dm = useDmStore()
    if (dm.currentConv?.other_user.id === userId) {
      dm.currentConv.other_user.friendship_status = status
      dm.currentConv.other_user.friendship_id = friendshipId
    }
  }

  /** The user on the other side of a request, relative to the signed-in user. */
  function otherPartyOf(req: FriendRequest) {
    const auth = useAuthStore()
    return req.sender.id === auth.user?.id ? req.recipient : req.sender
  }

  function subscribeSelf() {
    const auth = useAuthStore()
    if (selfSubscribed || !auth.user) return
    selfSubscribed = true

    getEcho()
      .private(`user.${auth.user.id}`)
      .listen('FriendRequestSent', (e: FriendRequest) => {
        if (!incoming.value.find((r) => r.id === e.id)) incoming.value.unshift(e)
        syncDmFriendshipStatus(e.sender.id, 'pending_received', e.id)
      })
      .listen('FriendRequestAccepted', (e: FriendRequest) => {
        outgoing.value = outgoing.value.filter((r) => r.id !== e.id)
        if (!friends.value.find((f) => f.id === e.recipient.id)) friends.value.push(e.recipient)
        syncDmFriendshipStatus(e.recipient.id, 'friends')
      })
      .listen('FriendRequestCancelled', (e: { id: number }) => {
        const req = incoming.value.find((r) => r.id === e.id) ?? outgoing.value.find((r) => r.id === e.id)
        incoming.value = incoming.value.filter((r) => r.id !== e.id)
        outgoing.value = outgoing.value.filter((r) => r.id !== e.id)
        if (req) syncDmFriendshipStatus(otherPartyOf(req).id, 'none')
      })
      .listen('FriendRemoved', (e: { user_id: number }) => {
        friends.value = friends.value.filter((f) => f.id !== e.user_id)
        syncDmFriendshipStatus(e.user_id, 'none')
      })
  }

  async function fetchFriends() {
    loading.value = true
    error.value = ''
    try {
      friends.value = await api.get<DMUser[]>('/friends')
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function fetchRequests() {
    error.value = ''
    try {
      const data = await api.get<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>(
        '/friend-requests',
      )
      incoming.value = data.incoming
      outgoing.value = data.outgoing
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function sendRequest(userId: number) {
    error.value = ''
    try {
      const req = await api.post<FriendRequest>('/friend-requests', { recipient_id: userId })
      if (req.status === 'accepted') {
        // Crossed request: the backend auto-accepted the OTHER side's pending row, so the
        // current user is whichever of sender/recipient does NOT match the id we requested.
        const friend = req.sender.id === userId ? req.sender : req.recipient
        incoming.value = incoming.value.filter((r) => r.id !== req.id)
        outgoing.value = outgoing.value.filter((r) => r.id !== req.id)
        if (!friends.value.find((f) => f.id === friend.id)) friends.value.push(friend)
        syncDmFriendshipStatus(friend.id, 'friends')
      } else {
        if (!outgoing.value.find((r) => r.id === req.id)) outgoing.value.push(req)
        syncDmFriendshipStatus(userId, 'pending_sent', req.id)
      }
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function acceptRequest(id: number) {
    error.value = ''
    try {
      const req = await api.post<FriendRequest>(`/friend-requests/${id}/accept`, {})
      incoming.value = incoming.value.filter((r) => r.id !== id)
      if (!friends.value.find((f) => f.id === req.sender.id)) friends.value.push(req.sender)
      syncDmFriendshipStatus(req.sender.id, 'friends')
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function cancelOrDecline(id: number) {
    error.value = ''
    try {
      const req = incoming.value.find((r) => r.id === id) ?? outgoing.value.find((r) => r.id === id)
      await api.del(`/friend-requests/${id}`)
      incoming.value = incoming.value.filter((r) => r.id !== id)
      outgoing.value = outgoing.value.filter((r) => r.id !== id)
      if (req) syncDmFriendshipStatus(otherPartyOf(req).id, 'none')
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function unfriend(userId: number) {
    error.value = ''
    try {
      await api.del(`/friends/${userId}`)
      friends.value = friends.value.filter((f) => f.id !== userId)
      syncDmFriendshipStatus(userId, 'none')
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  function reset() {
    const auth = useAuthStore()
    if (selfSubscribed && auth.user) {
      getEcho().leaveChannel(`private-user.${auth.user.id}`)
    }
    selfSubscribed = false
    friends.value = []
    incoming.value = []
    outgoing.value = []
    error.value = ''
  }

  return {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    fetchFriends,
    fetchRequests,
    sendRequest,
    acceptRequest,
    cancelOrDecline,
    unfriend,
    subscribeSelf,
    reset,
  }
})
