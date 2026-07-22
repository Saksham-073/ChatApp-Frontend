/**
 * Thin wrapper around RTCPeerConnection implementing the "perfect negotiation"
 * pattern (https://w3c.github.io/webrtc-pc/#perfect-negotiation-example).
 * Knows nothing about Echo or Pinia — signaling I/O is injected.
 */
export type SignalType = 'offer' | 'answer' | 'ice'
export interface Signal {
  type: SignalType
  payload: unknown
}

export interface PeerOptions {
  polite: boolean
  iceServers: RTCIceServer[]
  sendSignal: (s: Signal) => void
  onRemoteStream: (stream: MediaStream) => void
  onConnectionState: (state: RTCPeerConnectionState) => void
}

export interface Peer {
  pc: RTCPeerConnection
  attachLocalStream(stream: MediaStream): void
  handleSignal(s: Signal): Promise<void>
  replaceVideoTrack(track: MediaStreamTrack | null): Promise<void>
  restartIce(): void
  close(): void
}

export function createPeer(opts: PeerOptions): Peer {
  const pc = new RTCPeerConnection({ iceServers: opts.iceServers })

  let makingOffer = false
  let ignoreOffer = false

  pc.onnegotiationneeded = async () => {
    try {
      makingOffer = true
      await pc.setLocalDescription()
      opts.sendSignal({ type: 'offer', payload: pc.localDescription })
    } finally {
      makingOffer = false
    }
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) opts.sendSignal({ type: 'ice', payload: e.candidate })
  }

  pc.ontrack = (e) => {
    if (e.streams[0]) opts.onRemoteStream(e.streams[0])
  }

  pc.onconnectionstatechange = () => {
    opts.onConnectionState(pc.connectionState)
  }

  async function handleSignal(s: Signal): Promise<void> {
    if (s.type === 'ice') {
      try {
        await pc.addIceCandidate(s.payload as RTCIceCandidateInit)
      } catch {
        // Candidates for an ignored offer — safe to drop
      }
      return
    }

    const description = s.payload as RTCSessionDescriptionInit
    const offerCollision =
      description.type === 'offer' && (makingOffer || pc.signalingState !== 'stable')

    ignoreOffer = !opts.polite && offerCollision
    if (ignoreOffer) return

    await pc.setRemoteDescription(description)
    if (description.type === 'offer') {
      await pc.setLocalDescription()
      opts.sendSignal({ type: 'answer', payload: pc.localDescription })
    }
  }

  function attachLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream)
    }
  }

  async function replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(track)
  }

  return {
    pc,
    attachLocalStream,
    handleSignal,
    replaceVideoTrack,
    restartIce: () => pc.restartIce(),
    close: () => pc.close(),
  }
}
