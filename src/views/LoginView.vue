<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { theme, toggleTheme } from '../lib/theme'

const ParticleField = defineAsyncComponent(() => import('../components/ParticleField.vue'))

const auth = useAuthStore()
const router = useRouter()

const mode = ref<'login' | 'register'>('login')
const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(email.value.trim(), password.value)
    } else {
      await auth.register(name.value.trim(), email.value.trim(), password.value)
    }
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function toggle() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}
</script>

<template>
  <ParticleField />

  <!-- Theme toggle -->
  <button
    class="fixed top-5 right-5 z-20 w-10 h-10 rounded-xl glass flex items-center justify-center text-ink-3 hover:text-ink transition-all active:scale-90 ease-(--ease-spring) cursor-pointer"
    :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <Icon :icon="theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-[18px] h-[18px]" />
  </button>

  <div class="relative z-10 min-h-dvh flex">
    <!-- ── Left panel: brand identity (lg+) ──────────────────────── -->
    <div class="hidden lg:flex w-[45%] shrink-0 items-center justify-center p-12">
      <div
        v-glow
        class="glass glow-border rounded-3xl p-10 flex flex-col items-center gap-8 w-full max-w-md shadow-[0_32px_80px_rgba(139,92,246,0.22)] stagger-rise"
        :style="{ '--i': 0 }"
      >
        <!-- Holographic orb -->
        <div class="relative w-52 h-52 flex items-center justify-center">
          <!-- Outer rotating ring -->
          <div
            class="absolute inset-0 rounded-full border border-violet-500/25 animate-spin"
            style="animation-duration: 10s"
          >
            <span class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.9)]" />
          </div>
          <!-- Inner reverse ring -->
          <div
            class="absolute inset-5 rounded-full border border-violet-400/20 animate-spin"
            style="animation-duration: 7s; animation-direction: reverse"
          >
            <span class="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-violet-300 shadow-[0_0_6px_rgba(167,139,250,0.9)]" />
          </div>
          <!-- Equatorial ring -->
          <div
            class="absolute inset-10 rounded-full border border-violet-300/15 animate-spin"
            style="animation-duration: 14s"
          >
            <span class="absolute top-1/2 -right-1 -translate-y-1/2 w-1 h-1 rounded-full bg-violet-200 shadow-[0_0_4px_rgba(196,181,253,0.9)]" />
          </div>
          <!-- Core orb -->
          <div class="absolute inset-14 rounded-full bg-linear-to-br from-violet-400/60 to-violet-900/80 shadow-[0_0_40px_rgba(139,92,246,0.7),inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center justify-center">
            <Icon icon="raphael:chat" class="w-7 h-7 text-violet-100" />
          </div>
          <!-- Ambient glow -->
          <div class="absolute inset-0 rounded-full shadow-[0_0_80px_rgba(139,92,246,0.22)]" />
        </div>

        <!-- Brand -->
        <div class="text-center stagger-rise" :style="{ '--i': 1 }">
          <h1 class="text-4xl font-bold text-ink tracking-tight">Echo</h1>
          <p class="text-ink-3 text-xs mt-2 tracking-[0.2em] uppercase">Decentralized Intelligence</p>
        </div>

        <!-- Terminal status lines -->
        <div class="w-full flex flex-col gap-2.5 font-mono stagger-rise" :style="{ '--i': 2 }">
          <div class="flex items-center gap-2.5 text-xs text-ink-3">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] shrink-0" />
            Neural Link Established
          </div>
          <div class="flex items-center gap-2.5 text-xs text-ink-3">
            <span class="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)] shrink-0" />
            Status: Synchronized
          </div>
          <div class="flex items-center gap-2.5 text-xs text-ink-4">
            <span class="w-1.5 h-1.5 rounded-full bg-violet-500/50 shrink-0" />
            End-to-end encrypted
          </div>
        </div>
      </div>
    </div>

    <!-- ── Right panel: login form ────────────────────────────────── -->
    <div class="flex-1 flex items-center justify-center px-6 py-10">
      <div class="w-full max-w-sm">
        <!-- Mobile logo (hidden on lg+) -->
        <div class="flex flex-col items-center gap-4 mb-8 lg:hidden">
          <div
            class="w-14 h-14 rounded-2xl bg-linear-to-br from-violet-500 to-violet-800 flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.6)] stagger-rise"
            :style="{ '--i': 0 }"
          >
            <Icon icon="raphael:chat" class="w-7 h-7 text-white" />
          </div>
          <div class="text-center stagger-rise" :style="{ '--i': 1 }">
            <h1 class="text-ink text-3xl font-bold tracking-tight">Echo</h1>
            <p class="text-ink-3 text-xs mt-1.5 tracking-[0.18em] uppercase">Decentralized Intelligence</p>
          </div>
        </div>

        <!-- Desktop heading -->
        <div class="hidden lg:block mb-6 stagger-rise" :style="{ '--i': 1 }">
          <h2 class="text-ink text-3xl font-bold tracking-tight">
            {{ mode === 'login' ? 'Echo Terminal' : 'Register Node' }}
          </h2>
          <p class="text-ink-3 text-sm mt-2">
            {{ mode === 'login' ? 'Authenticate to access the network' : 'Create your node identity' }}
          </p>
        </div>

        <!-- Glass form card -->
        <div
          v-glow
          class="glass rounded-3xl p-8 shadow-[0_24px_80px_rgba(139,92,246,0.18)] stagger-rise glow-border"
          :style="{ '--i': 2 }"
        >
          <form class="flex flex-col gap-4" @submit.prevent="submit">
            <div v-if="mode === 'register'" class="flex flex-col gap-1.5">
              <label for="login-name" class="text-ink-3 text-xs font-medium">Node Identity</label>
              <input
                id="login-name"
                v-model="name"
                type="text"
                placeholder="Your display name"
                required
                autofocus
                class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm font-mono outline-none placeholder-ink-4 focus:border-violet-500/60 transition-all"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="login-email" class="text-ink-3 text-xs font-medium">Terminal ID</label>
              <input
                id="login-email"
                v-model="email"
                type="email"
                placeholder="node@echo.network"
                required
                :autofocus="mode === 'login'"
                class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm font-mono outline-none placeholder-ink-4 focus:border-violet-500/60 transition-all"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="login-password" class="text-ink-3 text-xs font-medium">Security Key</label>
              <input
                id="login-password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                required
                class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm font-mono outline-none placeholder-ink-4 focus:border-violet-500/60 transition-all"
              />
            </div>

            <p v-if="error" class="text-rose-600 dark:text-rose-400 text-sm font-mono">{{ error }}</p>

            <button
              type="submit"
              :disabled="loading"
              class="mt-1 bg-linear-to-r from-violet-500 to-violet-700 hover:from-violet-400 hover:to-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-all active:scale-97 ease-(--ease-spring) shadow-[0_8px_30px_rgba(139,92,246,0.4)] hover:shadow-[0_8px_40px_rgba(139,92,246,0.6)] cursor-pointer"
            >
              <span
                v-if="loading"
                class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
              />
              {{ loading ? (mode === 'login' ? 'Authenticating...' : 'Registering node...') : (mode === 'login' ? 'Initialize Session' : 'Register Node') }}
            </button>
          </form>
        </div>

        <!-- Mode toggle -->
        <p class="text-ink-3 text-sm text-center mt-6 stagger-rise" :style="{ '--i': 3 }">
          {{ mode === 'login' ? 'Need network access?' : 'Already have a node?' }}
          <button
            class="text-violet-500 dark:text-violet-400 font-semibold ml-1 cursor-pointer hover:text-violet-400 dark:hover:text-violet-300 transition-colors"
            @click="toggle"
          >
            {{ mode === 'login' ? 'Register Node' : 'Return to Terminal' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
