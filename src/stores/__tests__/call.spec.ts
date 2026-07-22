import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}))
vi.mock('../../lib/api', () => ({ api: apiMock }))

const channelMock = vi.hoisted(() => ({
  listen: vi.fn().mockReturnThis(),
  listenForWhisper: vi.fn().mockReturnThis(),
  whisper: vi.fn().mockReturnThis(),
  stopListening: vi.fn().mockReturnThis(),
}))
const echoMock = vi.hoisted(() => ({
  private: vi.fn(() => channelMock),
  leaveChannel: vi.fn(),
}))
vi.mock('../../lib/echo', () => ({ getEcho: () => echoMock }))

const peerMock = vi.hoisted(() => ({
  pc: {},
  attachLocalStream: vi.fn(),
  handleSignal: vi.fn(),
  replaceVideoTrack: vi.fn(),
  restartIce: vi.fn(),
  close: vi.fn(),
}))
vi.mock('../../composables/useWebRTC', () => ({ createPeer: vi.fn(() => peerMock) }))

import { useCallStore } from '../call'
import { useAuthStore } from '../auth'
import { createPeer } from '../../composables/useWebRTC'

const fakeStream = {
  getTracks: () => [{ kind: 'audio', stop: vi.fn(), enabled: true }],
  getAudioTracks: () => [{ enabled: true }],
  getVideoTracks: () => [],
} as unknown as MediaStream

function fakeCall(overrides = {}) {
  return {
    id: 7, conversation_id: 3, caller_id: 1, callee_id: 2, type: 'video',
    status: 'ringing', started_at: new Date().toISOString(),
    answered_at: null, ended_at: null, seen_at: null,
    caller: { id: 1, name: 'Alice' }, callee: { id: 2, name: 'Bob' },
    ...overrides,
  }
}

describe('call store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
      configurable: true,
    })
    const auth = useAuthStore()
    // @ts-expect-error test seed
    auth.user = { id: 1, name: 'Alice' }
  })

  it('startCall posts and enters outgoing-ringing', async () => {
    apiMock.post.mockResolvedValueOnce(fakeCall())
    apiMock.get.mockResolvedValueOnce({ iceServers: [{ urls: 'stun:x' }] })
    const store = useCallStore()

    await store.startCall(3, 'video')

    expect(apiMock.post).toHaveBeenCalledWith('/calls', { conversation_id: 3, type: 'video' })
    expect(store.status).toBe('outgoing-ringing')
  })

  it('busy 409 surfaces error and stays idle', async () => {
    apiMock.get.mockResolvedValueOnce({ iceServers: [] })
    apiMock.post.mockRejectedValueOnce(new Error('busy'))
    const store = useCallStore()

    await store.startCall(3, 'audio')

    expect(store.status).toBe('idle')
    expect(store.callError).toBeTruthy()
  })

  it('incoming CallInitiated sets incoming-ringing', () => {
    const store = useCallStore()
    store.init()
    const initiatedHandler = channelMock.listen.mock.calls
      .find(([event]) => event === 'CallInitiated')![1]

    initiatedHandler({ call: fakeCall() })

    expect(store.status).toBe('incoming-ringing')
    expect(store.current?.id).toBe(7)
  })

  it('declineCall posts decline and returns to idle', async () => {
    const store = useCallStore()
    store.init()
    const initiatedHandler = channelMock.listen.mock.calls
      .find(([event]) => event === 'CallInitiated')![1]
    initiatedHandler({ call: fakeCall() })
    apiMock.post.mockResolvedValueOnce({})

    await store.declineCall()

    expect(apiMock.post).toHaveBeenCalledWith('/calls/7/decline', {})
    expect(store.status).toBe('idle')
  })

  it('hangUp posts end and cleans up', async () => {
    apiMock.post.mockResolvedValueOnce(fakeCall())
    apiMock.get.mockResolvedValueOnce({ iceServers: [] })
    const store = useCallStore()
    await store.startCall(3, 'video')
    apiMock.post.mockResolvedValueOnce({})

    await store.hangUp()

    expect(apiMock.post).toHaveBeenLastCalledWith('/calls/7/end', {})
    expect(store.status).toBe('idle')
    expect(echoMock.leaveChannel).toHaveBeenCalledWith('private-call.7')
  })

  it('fetchMissed loads unseen missed calls and counts per conversation', async () => {
    // GET /calls/missed is a bare, non-paginated array — no `data` key (see Task 4 Interfaces)
    apiMock.get.mockResolvedValueOnce([fakeCall({ status: 'missed' })])
    const store = useCallStore()

    await store.fetchMissed()

    expect(store.missedCalls).toHaveLength(1)
    expect(store.missedCountByConv.get(3)).toBe(1)
  })

  it('preserves elapsed time across an ICE reconnect', async () => {
    apiMock.post.mockResolvedValueOnce(fakeCall())
    apiMock.get.mockResolvedValueOnce({ iceServers: [] })
    const store = useCallStore()
    await store.startCall(3, 'video')

    const callAcceptedHandler = channelMock.listen.mock.calls
      .find(([event]) => event === 'CallAccepted')![1]
    callAcceptedHandler({ call: fakeCall() })

    const onConnectionState = (createPeer as any).mock.calls[0][0].onConnectionState
    onConnectionState('connected')
    expect(store.elapsedSeconds).toBe(0)

    store.elapsedSeconds = 10
    onConnectionState('disconnected')
    expect(store.reconnecting).toBe(true)

    onConnectionState('connected')
    expect(store.elapsedSeconds).toBe(10)
    expect(store.reconnecting).toBe(false)
  })
})
