import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, ApiError, type Paginated } from '../lib/api'
import { getEcho } from '../lib/echo'
import { API_ORIGIN } from '../lib/config'
import { useAuthStore } from './auth'
import { createPeer, type Peer, type Signal } from '../composables/useWebRTC'

export type CallStatus = 'idle' | 'outgoing-ringing' | 'incoming-ringing' | 'connecting' | 'active'

export interface CallRecord {
  id: number
  conversation_id: number
  caller_id: number
  callee_id: number
  type: 'audio' | 'video'
  status: 'ringing' | 'ongoing' | 'ended' | 'declined' | 'missed' | 'failed'
  started_at: string
  answered_at: string | null
  ended_at: string | null
  seen_at: string | null
  caller: { id: number; name: string }
  callee: { id: number; name: string }
}

const RING_TIMEOUT_MS = 30_000
const HEARTBEAT_MS = 30_000
const RECONNECT_GRACE_MS = 10_000

export const useCallStore = defineStore('call', () => {
  const status = ref<CallStatus>('idle')
  const current = ref<CallRecord | null>(null)
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const muted = ref(false)
  const cameraOff = ref(false)
  const screenSharing = ref(false)
  const minimized = ref(false)
  const elapsedSeconds = ref(0)
  const reconnecting = ref(false)
  const peerMediaState = ref({ muted: false, cameraOff: false })
  const callError = ref('')
  const missedCalls = ref<CallRecord[]>([])
  const historyByConv = ref(new Map<number, CallRecord[]>())

  let peer: Peer | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let callChannel: any = null
  let cameraTrack: MediaStreamTrack | null = null
  let screenStream: MediaStream | null = null
  let cachedIceServers: RTCIceServer[] | null = null
  let cachedIceServersAt = 0
  const ICE_SERVERS_TTL_MS = 12 * 60 * 60 * 1000 // safe margin under the 24h backend credential TTL
  let ringTimer: number | undefined
  let heartbeatTimer: number | undefined
  let elapsedTimer: number | undefined
  let reconnectTimer: number | undefined
  let initialized = false

  const peerName = computed(() => {
    const auth = useAuthStore()
    if (!current.value) return ''
    return current.value.caller_id === auth.user?.id
      ? current.value.callee.name
      : current.value.caller.name
  })
  const isVideo = computed(() => current.value?.type === 'video')
  const missedCountByConv = computed(() => {
    const map = new Map<number, number>()
    for (const c of missedCalls.value) {
      map.set(c.conversation_id, (map.get(c.conversation_id) ?? 0) + 1)
    }
    return map
  })

  function stopStream(stream: MediaStream | null): void {
    stream?.getTracks().forEach((t) => t.stop())
  }

  function clearRingTimer(): void {
    if (ringTimer !== undefined) { window.clearTimeout(ringTimer); ringTimer = undefined }
  }
  function clearHeartbeatTimer(): void {
    if (heartbeatTimer !== undefined) { window.clearInterval(heartbeatTimer); heartbeatTimer = undefined }
  }
  function clearElapsedTimer(): void {
    if (elapsedTimer !== undefined) { window.clearInterval(elapsedTimer); elapsedTimer = undefined }
  }
  function clearReconnectTimer(): void {
    if (reconnectTimer !== undefined) { window.clearTimeout(reconnectTimer); reconnectTimer = undefined }
  }

  async function ensureIceServers(): Promise<RTCIceServer[]> {
    if (cachedIceServers && Date.now() - cachedIceServersAt < ICE_SERVERS_TTL_MS) return cachedIceServers
    const res = await api.get<{ iceServers: RTCIceServer[] }>('/ice-servers')
    cachedIceServers = res.iceServers
    cachedIceServersAt = Date.now()
    return cachedIceServers
  }

  /** getUserMedia preflight. Camera denial on a video call downgrades to audio; mic denial aborts. */
  async function preflightMedia(wantVideo: boolean): Promise<MediaStream | null> {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo })
    } catch {
      if (!wantVideo) {
        callError.value = 'Microphone access is required to make a call.'
        return null
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        callError.value = 'Camera unavailable — continuing with audio only.'
        return stream
      } catch {
        callError.value = 'Microphone access is required to make a call.'
        return null
      }
    }
  }

  function sendMediaState(): void {
    callChannel?.whisper('media-state', { muted: muted.value, cameraOff: cameraOff.value })
  }

  function createAndWirePeer(polite: boolean): void {
    peer = createPeer({
      polite,
      iceServers: cachedIceServers ?? [],
      sendSignal: (s: Signal) => callChannel?.whisper(s.type, s.payload),
      onRemoteStream: (stream) => { remoteStream.value = stream },
      onConnectionState: handleConnectionState,
    })
    if (localStream.value) peer.attachLocalStream(localStream.value)
  }

  function handleConnectionState(state: RTCPeerConnectionState): void {
    if (state === 'connected') {
      clearReconnectTimer()
      reconnecting.value = false
      status.value = 'active'
      if (elapsedTimer === undefined) {
        elapsedSeconds.value = 0
        elapsedTimer = window.setInterval(() => { elapsedSeconds.value += 1 }, 1000)
      }
      clearHeartbeatTimer()
      const record = current.value
      if (record) {
        heartbeatTimer = window.setInterval(() => {
          api.post(`/calls/${record.id}/heartbeat`, {}).catch(() => {})
        }, HEARTBEAT_MS)
      }
    } else if (state === 'disconnected' || state === 'failed') {
      reconnecting.value = true
      peer?.restartIce()
      clearReconnectTimer()
      reconnectTimer = window.setTimeout(() => { hangUp('failed') }, RECONNECT_GRACE_MS)
    }
  }

  function handleCallAccepted(call: CallRecord): void {
    if (!current.value || current.value.id !== call.id) return
    if (status.value !== 'outgoing-ringing') return
    clearRingTimer()
    current.value = call
    status.value = 'connecting'
    createAndWirePeer(false)
  }

  function handleCallEndedEvent(call: CallRecord): void {
    if (!current.value || current.value.id !== call.id) return
    cleanup()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function joinCallChannel(record: CallRecord): any {
    const channel = getEcho().private(`call.${record.id}`)
    channel
      .listenForWhisper('offer', (payload: unknown) => peer?.handleSignal({ type: 'offer', payload }))
      .listenForWhisper('answer', (payload: unknown) => peer?.handleSignal({ type: 'answer', payload }))
      .listenForWhisper('ice', (payload: unknown) => peer?.handleSignal({ type: 'ice', payload }))
      .listenForWhisper('media-state', (payload: { muted: boolean; cameraOff: boolean }) => {
        peerMediaState.value = payload
      })
      .listen('CallAccepted', (e: { call: CallRecord }) => handleCallAccepted(e.call))
      .listen('CallDeclined', (e: { call: CallRecord }) => handleCallEndedEvent(e.call))
      .listen('CallEnded', (e: { call: CallRecord }) => handleCallEndedEvent(e.call))
    callChannel = channel
    return channel
  }

  function handleUnload(): void {
    if (status.value === 'idle' || !current.value) return
    const token = localStorage.getItem('auth_token')
    fetch(`${API_ORIGIN}/api/calls/${current.value.id}/end`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ reason: 'unload' }),
    }).catch(() => {})
  }

  function init(): void {
    if (initialized) return
    const auth = useAuthStore()
    if (!auth.user) return
    initialized = true

    getEcho().private(`user.${auth.user.id}`)
      .listen('CallInitiated', (e: { call: CallRecord }) => {
        if (status.value !== 'idle') return
        current.value = e.call
        status.value = 'incoming-ringing'
      })
      .listen('CallMissed', (e: { call: CallRecord }) => {
        if (missedCalls.value.find((c) => c.id === e.call.id)) return
        missedCalls.value.push(e.call)
      })
      .listen('CallAccepted', (e: { call: CallRecord }) => handleCallAccepted(e.call))
      .listen('CallDeclined', (e: { call: CallRecord }) => handleCallEndedEvent(e.call))
      .listen('CallEnded', (e: { call: CallRecord }) => handleCallEndedEvent(e.call))

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
  }

  async function startCall(conversationId: number, type: 'audio' | 'video'): Promise<void> {
    if (status.value !== 'idle') return
    callError.value = ''
    let stream: MediaStream | null = null
    try {
      await ensureIceServers()
      stream = await preflightMedia(type === 'video')
      if (!stream) return

      let record: CallRecord
      try {
        record = await api.post<CallRecord>('/calls', { conversation_id: conversationId, type })
      } catch (e) {
        stopStream(stream)
        callError.value = e instanceof ApiError && e.status === 409
          ? 'busy'
          : (e as Error).message || 'Could not start call'
        return
      }

      localStream.value = stream
      cameraTrack = stream.getVideoTracks()[0] ?? null
      current.value = record
      status.value = 'outgoing-ringing'
      joinCallChannel(record)
      clearRingTimer()
      ringTimer = window.setTimeout(() => { hangUp('timeout') }, RING_TIMEOUT_MS)
    } catch (e) {
      stopStream(stream)
      callError.value = (e as Error).message || 'Could not start call'
    }
  }

  async function acceptCall(withVideo: boolean): Promise<void> {
    const record = current.value
    if (!record || status.value !== 'incoming-ringing') return
    callError.value = ''

    try {
      await ensureIceServers()
    } catch (e) {
      callError.value = (e as Error).message || 'Could not accept call'
      return
    }

    joinCallChannel(record)

    const wantVideo = record.type === 'video' && withVideo
    const stream = await preflightMedia(wantVideo)
    if (!stream) {
      cleanup()
      return
    }

    try {
      const updated = await api.post<CallRecord>(`/calls/${record.id}/accept`, {})
      localStream.value = stream
      cameraTrack = stream.getVideoTracks()[0] ?? null
      current.value = updated
      status.value = 'connecting'
      createAndWirePeer(true)
    } catch (e) {
      stopStream(stream)
      callError.value = (e as Error).message || 'Could not accept call'
      cleanup()
    }
  }

  async function declineCall(): Promise<void> {
    const record = current.value
    if (!record) return
    try {
      await api.post(`/calls/${record.id}/decline`, {})
    } catch {
      // Best-effort — the server may already know; clean up locally regardless.
    }
    cleanup()
  }

  async function hangUp(reason?: 'timeout' | 'cancel' | 'failed'): Promise<void> {
    const record = current.value
    if (!record) {
      cleanup()
      return
    }
    try {
      await api.post(`/calls/${record.id}/end`, reason ? { reason } : {})
    } catch {
      // Best-effort — cleanup locally regardless (idempotent server makes double-end harmless).
    }
    cleanup()
  }

  function toggleMute(): void {
    muted.value = !muted.value
    const track = localStream.value?.getAudioTracks()[0]
    if (track) track.enabled = !muted.value
    sendMediaState()
  }

  function toggleCamera(): void {
    cameraOff.value = !cameraOff.value
    const track = localStream.value?.getVideoTracks()[0]
    if (track) track.enabled = !cameraOff.value
    sendMediaState()
  }

  async function toggleScreenShare(): Promise<void> {
    if (screenSharing.value) {
      await revertScreenShare()
      return
    }
    try {
      const captured = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = captured.getVideoTracks()[0]
      if (!track) return
      screenStream = captured
      await peer?.replaceVideoTrack(track)
      screenSharing.value = true
      track.onended = () => { revertScreenShare() }
    } catch {
      // User cancelled the screen picker — no-op
    }
  }

  async function revertScreenShare(): Promise<void> {
    if (screenStream) {
      stopStream(screenStream)
      screenStream = null
    }
    const track = cameraTrack && cameraTrack.readyState === 'live' ? cameraTrack : null
    await peer?.replaceVideoTrack(track)
    screenSharing.value = false
  }

  function setMinimized(v: boolean): void {
    minimized.value = v
  }

  async function fetchMissed(): Promise<void> {
    try {
      missedCalls.value = await api.get<CallRecord[]>('/calls/missed')
    } catch (e) {
      callError.value = (e as Error).message
    }
  }

  async function markConversationCallsSeen(conversationId: number): Promise<void> {
    const toMark = missedCalls.value.filter((c) => c.conversation_id === conversationId)
    await Promise.all(toMark.map((c) => api.post(`/calls/${c.id}/seen`, {}).catch(() => {})))
    missedCalls.value = missedCalls.value.filter((c) => c.conversation_id !== conversationId)
  }

  async function fetchHistory(conversationId: number): Promise<void> {
    try {
      const page = await api.get<Paginated<CallRecord>>(`/conversations/${conversationId}/calls`)
      historyByConv.value.set(conversationId, page.data)
    } catch (e) {
      callError.value = (e as Error).message
    }
  }

  function cleanup(): void {
    const record = current.value
    stopStream(localStream.value)
    localStream.value = null
    if (screenStream) { stopStream(screenStream); screenStream = null }
    remoteStream.value = null
    peer?.close()
    peer = null
    cameraTrack = null
    if (record) getEcho().leaveChannel(`private-call.${record.id}`)
    callChannel = null
    clearRingTimer()
    clearHeartbeatTimer()
    clearElapsedTimer()
    clearReconnectTimer()
    status.value = 'idle'
    current.value = null
    muted.value = false
    cameraOff.value = false
    screenSharing.value = false
    elapsedSeconds.value = 0
    reconnecting.value = false
    peerMediaState.value = { muted: false, cameraOff: false }
  }

  function reset(): void {
    cleanup()
    const auth = useAuthStore()
    if (initialized && auth.user) {
      getEcho().leaveChannel(`private-user.${auth.user.id}`)
    }
    if (initialized) {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
    initialized = false
    cachedIceServers = null
    cachedIceServersAt = 0
    missedCalls.value = []
    historyByConv.value = new Map()
    callError.value = ''
  }

  return {
    status, current, localStream, remoteStream, muted, cameraOff, screenSharing,
    minimized, elapsedSeconds, reconnecting, peerMediaState, callError,
    missedCalls, historyByConv,
    peerName, isVideo, missedCountByConv,
    init, startCall, acceptCall, declineCall, hangUp,
    toggleMute, toggleCamera, toggleScreenShare, setMinimized,
    fetchMissed, markConversationCallsSeen, fetchHistory, reset,
  }
})
