import { ref, reactive } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../lib/api'
import { useAuthStore } from './auth'
import {
  generateKeypair, wrapPrivateKey, unwrapPrivateKey,
  generateConversationKey, sealKey, unsealKey,
  type Keypair, type WrappedPrivateKey,
} from '../lib/crypto'

interface EscrowPayload {
  public_key: string
  encrypted_private_key: string
  key_salt: string
  key_nonce: string
}

interface WrapRow {
  conversation_id: number
  key_version: number
  wrapped_key: string
}

export const useKeysStore = defineStore('keys', () => {
  const status = ref<'unknown' | 'unenrolled' | 'locked' | 'unlocked'>('unknown')
  const error = ref('')
  const peerKeyChanged = ref(new Set<number>())

  // Non-exported internals: keypair stays out of reactive state on purpose
  let keypair: Keypair | null = null
  let escrow: WrappedPrivateKey | null = null
  const convKeys = reactive(new Map<number, Uint8Array>())

  const privStorageKey = () => `e2e_priv_${useAuthStore().user?.id}`
  const pubStorageKey = () => `e2e_pub_${useAuthStore().user?.id}`

  async function init() {
    try {
      const res = await api.get<EscrowPayload>('/me/keys')
      escrow = {
        encryptedPrivateKey: res.encrypted_private_key,
        salt: res.key_salt,
        nonce: res.key_nonce,
      }
      const localPriv = localStorage.getItem(privStorageKey())
      const localPub = localStorage.getItem(pubStorageKey())
      if (localPriv && localPub === res.public_key) {
        keypair = { publicKey: localPub, privateKey: localPriv }
        status.value = 'unlocked'
        await loadConversationKeys()
      } else {
        // New device, cleared storage, or keys were reset from another device
        status.value = 'locked'
      }
    } catch (e) {
      if ((e as Error).message.includes('Not enrolled') || (e as Error).message.includes('404')) {
        status.value = 'unenrolled'
      } else {
        error.value = (e as Error).message
      }
    }
  }

  async function enroll(passphrase: string): Promise<boolean> {
    try {
      const kp = await generateKeypair()
      const wrapped = await wrapPrivateKey(kp.privateKey, passphrase)
      await api.post('/me/keys', {
        public_key: kp.publicKey,
        encrypted_private_key: wrapped.encryptedPrivateKey,
        key_salt: wrapped.salt,
        key_nonce: wrapped.nonce,
      })
      keypair = kp
      escrow = wrapped
      localStorage.setItem(privStorageKey(), kp.privateKey)
      localStorage.setItem(pubStorageKey(), kp.publicKey)
      status.value = 'unlocked'
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function unlock(passphrase: string): Promise<boolean> {
    if (!escrow) return false
    try {
      const priv = await unwrapPrivateKey(escrow, passphrase)
      const res = await api.get<EscrowPayload>('/me/keys')
      keypair = { publicKey: res.public_key, privateKey: priv }
      localStorage.setItem(privStorageKey(), priv)
      localStorage.setItem(pubStorageKey(), res.public_key)
      status.value = 'unlocked'
      await loadConversationKeys()
      return true
    } catch {
      // secretbox auth failure — wrong passphrase
      return false
    }
  }

  async function changePassphrase(oldP: string, newP: string): Promise<boolean> {
    if (!keypair) return false
    try {
      const res = await api.get<EscrowPayload>('/me/keys')
      const currentEscrow: WrappedPrivateKey = {
        encryptedPrivateKey: res.encrypted_private_key,
        salt: res.key_salt,
        nonce: res.key_nonce,
      }
      await unwrapPrivateKey(currentEscrow, oldP) // throws if old passphrase wrong
      const wrapped = await wrapPrivateKey(keypair.privateKey, newP)
      await api.patch('/me/keys', {
        encrypted_private_key: wrapped.encryptedPrivateKey,
        key_salt: wrapped.salt,
        key_nonce: wrapped.nonce,
      })
      escrow = wrapped
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function resetKeys(passphrase: string): Promise<boolean> {
    try {
      const kp = await generateKeypair()
      const wrapped = await wrapPrivateKey(kp.privateKey, passphrase)
      await api.post('/me/keys/reset', {
        public_key: kp.publicKey,
        encrypted_private_key: wrapped.encryptedPrivateKey,
        key_salt: wrapped.salt,
        key_nonce: wrapped.nonce,
      })
      keypair = kp
      escrow = wrapped
      localStorage.setItem(privStorageKey(), kp.privateKey)
      localStorage.setItem(pubStorageKey(), kp.publicKey)
      convKeys.clear() // old CKs sealed to the old key are gone; peers re-wrap for us
      status.value = 'unlocked'
      return true
    } catch (e) {
      error.value = (e as Error).message
      return false
    }
  }

  async function loadConversationKeys() {
    if (!keypair) return
    try {
      const rows = await api.get<WrapRow[]>('/me/conversation-keys')
      for (const row of rows) {
        if (convKeys.has(row.conversation_id)) continue
        try {
          convKeys.set(row.conversation_id, await unsealKey(row.wrapped_key, keypair))
        } catch {
          // Wrap sealed to a previous keypair (pre-reset) — peer re-wrap will heal it
        }
      }
    } catch {
      // Non-critical: keys refetch on demand in ensureConversationKey
    }
  }

  function hasKey(convId: number): boolean {
    return convKeys.has(convId)
  }

  function getCachedKey(convId: number): Uint8Array | undefined {
    return convKeys.get(convId)
  }

  async function ensureConversationKey(
    convId: number,
    peer: { id: number; public_key?: string | null },
  ): Promise<Uint8Array | null> {
    if (convKeys.has(convId)) return convKeys.get(convId)!
    if (status.value !== 'unlocked' || !keypair) return null

    // A wrap may have been created since our last bulk load — refetch
    await loadConversationKeys()
    if (convKeys.has(convId)) return convKeys.get(convId)!

    // No CK anywhere: create one if the peer is enrolled
    if (!peer.public_key) return null
    const auth = useAuthStore()
    if (!auth.user) return null

    const ck = await generateConversationKey()
    try {
      await api.post(`/conversations/${convId}/keys`, {
        keys: [
          { user_id: auth.user.id, wrapped_key: await sealKey(ck, keypair.publicKey) },
          { user_id: peer.id, wrapped_key: await sealKey(ck, peer.public_key) },
        ],
      })
      convKeys.set(convId, ck)
      return ck
    } catch {
      // Lost the creation race — fetch the winner's wrap
      await loadConversationKeys()
      return convKeys.get(convId) ?? null
    }
  }

  async function rewrapForPeer(convId: number, peerUserId: number, peerPublicKey: string) {
    const ck = convKeys.get(convId)
    if (!ck) return
    try {
      await api.post(`/conversations/${convId}/keys`, {
        keys: [{ user_id: peerUserId, wrapped_key: await sealKey(ck, peerPublicKey) }],
      })
    } catch {
      // 409 = already re-wrapped (other tab/device beat us) — fine
    }
  }

  function notePeerKeyChange(userId: number) {
    peerKeyChanged.value = new Set([...peerKeyChanged.value, userId])
  }

  function dismissPeerKeyChange(userId: number) {
    const next = new Set(peerKeyChanged.value)
    next.delete(userId)
    peerKeyChanged.value = next
  }

  function reset() {
    // Logout: drop in-memory secrets but keep localStorage (trusted-device model;
    // init() ignores it if a different user logs in — pub key comparison fails)
    keypair = null
    escrow = null
    convKeys.clear()
    peerKeyChanged.value = new Set()
    status.value = 'unknown'
    error.value = ''
  }

  return {
    status, error, peerKeyChanged,
    init, enroll, unlock, changePassphrase, resetKeys,
    hasKey, getCachedKey, ensureConversationKey, rewrapForPeer,
    notePeerKeyChange, dismissPeerKeyChange, reset,
  }
})
