import type _sodiumT from 'libsodium-wrappers-sumo'

// Lazily loaded so the login-page bundle doesn't carry ~230KB of wasm/asm crypto
let sodiumInstance: typeof _sodiumT | null = null

async function lib(): Promise<typeof _sodiumT> {
  if (!sodiumInstance) {
    const { default: _sodium } = await import('libsodium-wrappers-sumo')
    await _sodium.ready
    sodiumInstance = _sodium
  }
  return sodiumInstance
}

export interface Keypair {
  publicKey: string
  privateKey: string
}

export interface WrappedPrivateKey {
  encryptedPrivateKey: string
  salt: string
  nonce: string
}

export async function generateKeypair(): Promise<Keypair> {
  const s = await lib()
  const kp = s.crypto_box_keypair()
  return {
    publicKey: s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL),
    privateKey: s.to_base64(kp.privateKey, s.base64_variants.ORIGINAL),
  }
}

async function deriveWrappingKey(
  s: typeof _sodiumT,
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return s.crypto_pwhash(
    s.crypto_secretbox_KEYBYTES,
    passphrase,
    salt,
    s.crypto_pwhash_OPSLIMIT_MODERATE,
    s.crypto_pwhash_MEMLIMIT_MODERATE,
    s.crypto_pwhash_ALG_ARGON2ID13,
  )
}

export async function wrapPrivateKey(
  privateKeyB64: string,
  passphrase: string,
): Promise<WrappedPrivateKey> {
  const s = await lib()
  const salt = s.randombytes_buf(s.crypto_pwhash_SALTBYTES)
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const wrappingKey = await deriveWrappingKey(s, passphrase, salt)
  const ciphertext = s.crypto_secretbox_easy(
    s.from_base64(privateKeyB64, s.base64_variants.ORIGINAL),
    nonce,
    wrappingKey,
  )
  return {
    encryptedPrivateKey: s.to_base64(ciphertext, s.base64_variants.ORIGINAL),
    salt: s.to_base64(salt, s.base64_variants.ORIGINAL),
    nonce: s.to_base64(nonce, s.base64_variants.ORIGINAL),
  }
}

/** Throws if the passphrase is wrong (secretbox authentication failure). */
export async function unwrapPrivateKey(
  wrapped: WrappedPrivateKey,
  passphrase: string,
): Promise<string> {
  const s = await lib()
  const wrappingKey = await deriveWrappingKey(
    s,
    passphrase,
    s.from_base64(wrapped.salt, s.base64_variants.ORIGINAL),
  )
  const privateKey = s.crypto_secretbox_open_easy(
    s.from_base64(wrapped.encryptedPrivateKey, s.base64_variants.ORIGINAL),
    s.from_base64(wrapped.nonce, s.base64_variants.ORIGINAL),
    wrappingKey,
  )
  return s.to_base64(privateKey, s.base64_variants.ORIGINAL)
}

export async function generateConversationKey(): Promise<Uint8Array> {
  const s = await lib()
  return s.randombytes_buf(s.crypto_secretbox_KEYBYTES)
}

export async function sealKey(ck: Uint8Array, recipientPublicKeyB64: string): Promise<string> {
  const s = await lib()
  const sealed = s.crypto_box_seal(ck, s.from_base64(recipientPublicKeyB64, s.base64_variants.ORIGINAL))
  return s.to_base64(sealed, s.base64_variants.ORIGINAL)
}

/** Throws if the wrap was not sealed to this keypair. */
export async function unsealKey(wrappedB64: string, keypair: Keypair): Promise<Uint8Array> {
  const s = await lib()
  return s.crypto_box_seal_open(
    s.from_base64(wrappedB64, s.base64_variants.ORIGINAL),
    s.from_base64(keypair.publicKey, s.base64_variants.ORIGINAL),
    s.from_base64(keypair.privateKey, s.base64_variants.ORIGINAL),
  )
}

export async function encryptMessage(
  plaintext: string,
  ck: Uint8Array,
): Promise<{ ciphertext: string; nonce: string }> {
  const s = await lib()
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES)
  const ciphertext = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, ck)
  return {
    ciphertext: s.to_base64(ciphertext, s.base64_variants.ORIGINAL),
    nonce: s.to_base64(nonce, s.base64_variants.ORIGINAL),
  }
}

/** Throws on tampered ciphertext or wrong key. */
export async function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  ck: Uint8Array,
): Promise<string> {
  const s = await lib()
  const plaintext = s.crypto_secretbox_open_easy(
    s.from_base64(ciphertextB64, s.base64_variants.ORIGINAL),
    s.from_base64(nonceB64, s.base64_variants.ORIGINAL),
    ck,
  )
  return s.to_string(plaintext)
}
