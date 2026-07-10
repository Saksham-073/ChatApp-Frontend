<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { theme, toggleTheme } from '../lib/theme'

const ParticleField = defineAsyncComponent(() => import('../components/ParticleField.vue'))
const GlobeOrb = defineAsyncComponent(() => import('../components/GlobeOrb.vue'))

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
    <!-- ── Left panel: 3D terminal ────────────────────────────────── -->
    <div class="hidden lg:flex w-[45%] shrink-0 p-6">
      <div class="flex-1 min-h-0 rounded-2xl border border-violet-500/25 bg-black/65 backdrop-blur-md flex flex-col overflow-hidden shadow-[0_0_80px_rgba(139,92,246,0.1)] stagger-rise" :style="{ '--i': 0 }">

        <!-- Top status bar -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-violet-500/10 shrink-0">
          <div class="flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,0.9)] shrink-0" />
            <span class="text-[9px] font-mono tracking-[0.18em] text-emerald-400/90 uppercase">Neural Link Established</span>
          </div>
          <svg viewBox="0 0 90 18" class="w-[68px] h-3.5 text-violet-400/50 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polyline points="0,9 10,9 14,2 19,16 24,3 29,9 38,9 43,5 47,13 51,9 90,9" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
        </div>

        <!-- Title -->
        <div class="px-8 pt-6 pb-2 text-center shrink-0">
          <p class="text-base font-bold tracking-[0.28em] text-white/90 uppercase select-none">Decentralized</p>
          <p class="text-base font-bold tracking-[0.28em] text-violet-400 uppercase select-none mt-0.5">Intelligence</p>
        </div>

        <!-- 3D Globe -->
        <div class="flex-1 min-h-0 overflow-hidden">
          <GlobeOrb />
        </div>

        <!-- Info card -->
        <div class="mx-5 mb-4 border border-violet-500/20 rounded-xl p-4 flex items-start gap-3.5 bg-violet-950/25 shrink-0">
          <svg viewBox="0 0 36 36" class="w-9 h-9 shrink-0 text-violet-400/80 mt-0.5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="18,2 32,10 32,26 18,34 4,26 4,10" stroke="currentColor" stroke-width="1.2" />
            <polygon points="18,8 26,12.5 26,23.5 18,28 10,23.5 10,12.5" stroke="currentColor" stroke-width="0.8" opacity="0.55" />
            <line x1="18" y1="2" x2="18" y2="8" stroke="currentColor" stroke-width="0.7" opacity="0.4" />
            <line x1="32" y1="10" x2="26" y2="12.5" stroke="currentColor" stroke-width="0.7" opacity="0.4" />
            <line x1="32" y1="26" x2="26" y2="23.5" stroke="currentColor" stroke-width="0.7" opacity="0.4" />
            <line x1="18" y1="34" x2="18" y2="28" stroke="currentColor" stroke-width="0.7" opacity="0.4" />
            <line x1="4" y1="26" x2="10" y2="23.5" stroke="currentColor" stroke-width="0.7" opacity="0.4" />
            <line x1="4" y1="10" x2="10" y2="12.5" stroke="currentColor" stroke-width="0.7" opacity="0.4" />
          </svg>
          <div>
            <p class="text-[11px] leading-relaxed text-ink-3">The future of communication is private, intelligent, and decentralized.</p>
            <p class="text-[11px] text-violet-400 font-semibold mt-1.5">Built on trust. Secured by you.</p>
          </div>
        </div>

        <!-- Bottom status bar -->
        <div class="flex items-center justify-between px-5 py-2.5 border-t border-violet-500/10 shrink-0">
          <span class="flex items-center gap-1.5 text-[9px] font-mono tracking-widest text-ink-4 uppercase">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            Network: Echo Protocol
          </span>
          <div class="flex items-center gap-1.5">
            <span class="w-5 h-[2px] rounded-full bg-violet-500/80" />
            <span class="w-5 h-[2px] rounded-full bg-violet-500" />
            <span class="w-5 h-[2px] rounded-full bg-violet-500/35" />
          </div>
          <span class="flex items-center gap-1.5 text-[9px] font-mono tracking-widest text-ink-4 uppercase">
            Status: Synchronized
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
          </span>
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
            {{ mode === 'login' ? 'Echo Terminal' : 'Register' }}
          </h2>
          <p class="text-ink-3 text-sm mt-2">
            {{ mode === 'login' ? 'Authenticate to access the network' : 'Create your account' }}
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
              <label for="login-name" class="text-ink-3 text-xs font-medium">Name</label>
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
              <label for="login-email" class="text-ink-3 text-xs font-medium">Username</label>
              <input
                id="login-email"
                v-model="email"
                type="email"
                placeholder="Username/Email"
                required
                :autofocus="mode === 'login'"
                class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm font-mono outline-none placeholder-ink-4 focus:border-violet-500/60 transition-all"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label for="login-password" class="text-ink-3 text-xs font-medium">Password</label>
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
              {{ loading ? (mode === 'login' ? 'Authenticating...' : 'Registering...') : (mode === 'login' ? 'Initialize Session' : 'Register ') }}
            </button>
          </form>
        </div>

        <!-- Mode toggle -->
        <p class="text-ink-3 text-sm text-center mt-6 stagger-rise" :style="{ '--i': 3 }">
          {{ mode === 'login' ? 'Need network access?' : 'Already have an account?' }}
          <button
            class="text-violet-500 dark:text-violet-400 font-semibold ml-1 cursor-pointer hover:text-violet-400 dark:hover:text-violet-300 transition-colors"
            @click="toggle"
          >
            {{ mode === 'login' ? 'Register ' : 'Return to Login' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
