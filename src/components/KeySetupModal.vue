<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useKeysStore } from '../stores/keys'

const emit = defineEmits<{ close: [] }>()
const keys = useKeysStore()

const passphrase = ref('')
const confirm = ref('')
const errorMsg = ref('')
const busy = ref(false)

const mode = computed(() => (keys.status === 'unenrolled' ? 'enroll' : 'unlock'))

async function submit() {
  errorMsg.value = ''
  if (passphrase.value.length < 8) {
    errorMsg.value = 'Passphrase must be at least 8 characters.'
    return
  }
  if (mode.value === 'enroll' && passphrase.value !== confirm.value) {
    errorMsg.value = 'Passphrases do not match.'
    return
  }
  busy.value = true
  try {
    const ok =
      mode.value === 'enroll' ? await keys.enroll(passphrase.value) : await keys.unlock(passphrase.value)
    if (ok) {
      emit('close')
    } else {
      errorMsg.value =
        mode.value === 'unlock' ? 'Wrong passphrase — try again.' : keys.error || 'Something went wrong.'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="glass border border-edge rounded-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-4 shadow-2xl">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-ink flex items-center gap-2">
            <Icon icon="lucide:lock" class="w-4 h-4 text-violet-500" />
            {{ mode === 'enroll' ? 'Set up encryption' : 'Unlock encryption' }}
          </h2>
          <p class="text-sm text-ink-4 mt-0.5">
            {{
              mode === 'enroll'
                ? 'Direct messages are end-to-end encrypted. Choose a passphrase to protect your keys.'
                : 'Enter your encryption passphrase to read and send encrypted messages on this device.'
            }}
          </p>
        </div>
        <button
          class="w-8 h-8 rounded-lg flex items-center justify-center text-ink-4 hover:text-ink-2 hover:bg-hovered transition-all cursor-pointer shrink-0"
          @click="emit('close')"
        >
          <Icon icon="lucide:x" class="w-4 h-4" />
        </button>
      </div>

      <div
        v-if="mode === 'enroll'"
        class="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2.5 flex gap-2"
      >
        <Icon icon="lucide:triangle-alert" class="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          This passphrase is separate from your login password and is never sent to the server.
          <strong>If you forget it, your encrypted messages cannot be recovered.</strong>
        </span>
      </div>

      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <input
          v-model="passphrase"
          type="password"
          :placeholder="mode === 'enroll' ? 'New passphrase (min 8 characters)' : 'Passphrase'"
          autocomplete="off"
          class="bg-field border border-edge rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-violet-500/40 transition-colors placeholder-ink-4"
        />
        <input
          v-if="mode === 'enroll'"
          v-model="confirm"
          type="password"
          placeholder="Confirm passphrase"
          autocomplete="off"
          class="bg-field border border-edge rounded-xl px-3.5 py-2.5 text-sm text-ink outline-none focus:border-violet-500/40 transition-colors placeholder-ink-4"
        />

        <p v-if="errorMsg" class="text-xs text-rose-500">{{ errorMsg }}</p>

        <button
          type="submit"
          :disabled="busy || !passphrase"
          class="rounded-xl bg-linear-to-r from-violet-500 to-violet-700 text-white text-sm font-semibold py-2.5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer active:scale-[0.98] transition-transform ease-(--ease-spring)"
        >
          <span v-if="busy">Working…</span>
          <span v-else>{{ mode === 'enroll' ? 'Enable encryption' : 'Unlock' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
