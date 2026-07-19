<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '../stores/auth'
import { useKeysStore } from '../stores/keys'
import { initials, hue } from '../lib/ui'

const auth = useAuthStore()
const keys = useKeysStore()

const oldPass = ref('')
const newPass = ref('')
const changeMsg = ref('')
const changeOk = ref(false)

const resetPass = ref('')
const resetConfirm = ref('')
const resetMsg = ref('')
const showReset = ref(false)

async function submitChange() {
  changeMsg.value = ''
  changeOk.value = false
  if (newPass.value.length < 8) {
    changeMsg.value = 'New passphrase must be at least 8 characters.'
    return
  }
  const ok = await keys.changePassphrase(oldPass.value, newPass.value)
  if (ok) {
    changeOk.value = true
    changeMsg.value = 'Passphrase updated.'
    oldPass.value = ''
    newPass.value = ''
  } else {
    changeMsg.value = 'Could not update — check your current passphrase.'
  }
}

async function submitReset() {
  resetMsg.value = ''
  if (resetConfirm.value !== 'reset') {
    resetMsg.value = 'Type "reset" to confirm.'
    return
  }
  if (resetPass.value.length < 8) {
    resetMsg.value = 'New passphrase must be at least 8 characters.'
    return
  }
  const ok = await keys.resetKeys(resetPass.value)
  if (ok) {
    showReset.value = false
    resetPass.value = ''
    resetConfirm.value = ''
  } else {
    resetMsg.value = keys.error || 'Reset failed.'
  }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-4 md:px-6 py-5 max-w-xl flex flex-col gap-4">
    <div class="glass rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
      <div
        class="w-20 h-20 rounded-2xl bg-linear-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-2xl font-bold shrink-0"
        :style="{ filter: auth.user ? hue(auth.user.id) : undefined }"
      >
        {{ auth.user ? initials(auth.user.name) : '?' }}
      </div>
      <div>
        <p class="text-ink text-lg font-semibold">{{ auth.user?.name }}</p>
        <p class="text-ink-3 text-sm mt-0.5">{{ auth.user?.email }}</p>
      </div>
    </div>

    <!-- Encryption -->
    <div v-if="keys.status === 'unlocked'" class="glass rounded-2xl p-6 flex flex-col gap-4">
      <h3 class="text-ink text-sm font-semibold flex items-center gap-2">
        <Icon icon="lucide:lock" class="w-4 h-4 text-violet-500" />
        Encryption
      </h3>

      <!-- Change passphrase -->
      <form class="flex flex-col gap-2.5" @submit.prevent="submitChange">
        <p class="text-xs text-ink-3">Change your encryption passphrase. Your keys and message history are unaffected.</p>
        <input
          v-model="oldPass"
          type="password"
          placeholder="Current passphrase"
          autocomplete="off"
          class="bg-field border border-edge rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-violet-500/40 transition-colors placeholder-ink-4"
        />
        <input
          v-model="newPass"
          type="password"
          placeholder="New passphrase (min 8 characters)"
          autocomplete="off"
          class="bg-field border border-edge rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-violet-500/40 transition-colors placeholder-ink-4"
        />
        <p v-if="changeMsg" class="text-xs" :class="changeOk ? 'text-emerald-500' : 'text-rose-500'">
          {{ changeMsg }}
        </p>
        <button
          type="submit"
          :disabled="!oldPass || !newPass"
          class="self-start text-xs font-semibold rounded-lg px-3.5 py-2 bg-linear-to-r from-violet-500 to-violet-700 text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
        >
          Update passphrase
        </button>
      </form>

      <hr class="border-edge" />

      <!-- Reset keys -->
      <div class="flex flex-col gap-2.5">
        <p class="text-xs text-ink-3">
          Forgot your passphrase on another device? Resetting generates a new key.
          <strong class="text-rose-500">Encrypted history stays unreadable until a friend re-shares each conversation key, and is lost permanently if they reset too.</strong>
        </p>
        <button
          v-if="!showReset"
          class="self-start text-xs font-semibold rounded-lg px-3.5 py-2 border border-rose-500/40 text-rose-500 hover:bg-rose-500/10 cursor-pointer transition-colors"
          @click="showReset = true"
        >
          Reset encryption keys…
        </button>
        <form v-else class="flex flex-col gap-2.5" @submit.prevent="submitReset">
          <input
            v-model="resetPass"
            type="password"
            placeholder="New passphrase (min 8 characters)"
            autocomplete="off"
            class="bg-field border border-edge rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-rose-500/40 transition-colors placeholder-ink-4"
          />
          <input
            v-model="resetConfirm"
            type="text"
            placeholder='Type "reset" to confirm'
            autocomplete="off"
            class="bg-field border border-edge rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-rose-500/40 transition-colors placeholder-ink-4"
          />
          <p v-if="resetMsg" class="text-xs text-rose-500">{{ resetMsg }}</p>
          <div class="flex gap-2">
            <button
              type="submit"
              class="text-xs font-semibold rounded-lg px-3.5 py-2 bg-rose-500 text-white cursor-pointer active:scale-95 transition-transform ease-(--ease-spring)"
            >
              Reset keys
            </button>
            <button
              type="button"
              class="text-xs text-ink-4 hover:text-ink-2 cursor-pointer"
              @click="showReset = false"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
