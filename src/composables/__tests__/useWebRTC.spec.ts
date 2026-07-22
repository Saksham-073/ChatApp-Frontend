import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPeer, type Signal } from '../useWebRTC'

class FakePC {
  static last: FakePC
  localDescription: unknown = null
  remoteDescription: unknown = null
  signalingState = 'stable'
  connectionState = 'new'
  onnegotiationneeded: null | (() => void) = null
  onicecandidate: null | ((e: { candidate: unknown }) => void) = null
  ontrack: null | ((e: { streams: MediaStream[] }) => void) = null
  onconnectionstatechange: null | (() => void) = null
  senders: { track: { kind: string } | null; replaceTrack: ReturnType<typeof vi.fn> }[] = []
  constructor(public config: unknown) { FakePC.last = this }
  addTrack = vi.fn((track: { kind: string }) => {
    const sender = { track, replaceTrack: vi.fn().mockResolvedValue(undefined) }
    this.senders.push(sender)
    return sender
  })
  getSenders = () => this.senders
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'o' })
  createAnswer = vi.fn().mockResolvedValue({ type: 'answer', sdp: 'a' })
  setLocalDescription = vi.fn(async (d?: unknown) => { this.localDescription = d ?? { type: 'offer', sdp: 'implicit' } })
  setRemoteDescription = vi.fn(async (d: unknown) => { this.remoteDescription = d })
  addIceCandidate = vi.fn().mockResolvedValue(undefined)
  restartIce = vi.fn()
  close = vi.fn()
}

describe('createPeer', () => {
  let sent: Signal[]

  beforeEach(() => {
    sent = []
    vi.stubGlobal('RTCPeerConnection', FakePC as unknown as typeof RTCPeerConnection)
    vi.stubGlobal('RTCSessionDescription', class { constructor(public init: unknown) { Object.assign(this, init) } })
  })

  function make(polite = false) {
    return createPeer({
      polite,
      iceServers: [{ urls: 'stun:x' }],
      sendSignal: (s) => sent.push(s),
      onRemoteStream: vi.fn(),
      onConnectionState: vi.fn(),
    })
  }

  it('sends offer on negotiationneeded', async () => {
    make(false)
    await FakePC.last.onnegotiationneeded!()
    expect(sent[0].type).toBe('offer')
  })

  it('answers an incoming offer', async () => {
    const peer = make(true)
    await peer.handleSignal({ type: 'offer', payload: { type: 'offer', sdp: 'remote' } })
    expect(FakePC.last.setRemoteDescription).toHaveBeenCalled()
    expect(sent.some((s) => s.type === 'answer')).toBe(true)
  })

  it('forwards ice candidates out and in', async () => {
    const peer = make(false)
    FakePC.last.onicecandidate!({ candidate: { candidate: 'c1' } })
    expect(sent.some((s) => s.type === 'ice')).toBe(true)
    await peer.handleSignal({ type: 'ice', payload: { candidate: 'c2' } })
    expect(FakePC.last.addIceCandidate).toHaveBeenCalled()
  })

  it('impolite peer ignores offer collision; polite peer rolls back', async () => {
    const impolite = make(false)
    FakePC.last.signalingState = 'have-local-offer'
    await impolite.handleSignal({ type: 'offer', payload: { type: 'offer', sdp: 'x' } })
    expect(FakePC.last.setRemoteDescription).not.toHaveBeenCalled()

    const polite = make(true)
    FakePC.last.signalingState = 'have-local-offer'
    await polite.handleSignal({ type: 'offer', payload: { type: 'offer', sdp: 'x' } })
    expect(FakePC.last.setRemoteDescription).toHaveBeenCalled()
  })

  it('replaceVideoTrack swaps the video sender track', async () => {
    const peer = make(false)
    const stream = { getTracks: () => [{ kind: 'audio' }, { kind: 'video' }] } as unknown as MediaStream
    peer.attachLocalStream(stream)
    const newTrack = { kind: 'video' } as MediaStreamTrack
    await peer.replaceVideoTrack(newTrack)
    const videoSender = FakePC.last.senders.find((s) => s.track?.kind === 'video')!
    expect(videoSender.replaceTrack).toHaveBeenCalledWith(newTrack)
  })

  it('close closes the connection', () => {
    const peer = make(false)
    peer.close()
    expect(FakePC.last.close).toHaveBeenCalled()
  })
})
