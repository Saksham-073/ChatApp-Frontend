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

  <div class="relative z-10 min-h-dvh flex items-center justify-center px-6 py-10">
    <!-- Theme toggle -->
    <button
      class="fixed top-5 right-5 w-10 h-10 rounded-xl glass flex items-center justify-center text-ink-3 hover:text-ink transition-all active:scale-90 ease-(--ease-spring) cursor-pointer"
      :title="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Icon :icon="theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-[18px] h-[18px]" />
    </button>

    <div class="w-full max-w-sm">
      <!-- Logo -->
      <div class="flex flex-col items-center gap-4 mb-8">
        <div
          class="w-14 h-14 rounded-2xl bg-linear-to-br from-cyan-400 to-violet-600 flex items-center justify-center shadow-[0_0_60px_rgba(124,58,237,0.5)] stagger-rise"
          :style="{ '--i': 0 }"
        >
          <Icon icon="raphael:chat" class="w-7 h-7 text-white" />
        </div>
        <div class="text-center stagger-rise" :style="{ '--i': 1 }">
          <h1 class="text-ink text-3xl font-bold tracking-tight">
            {{ mode === 'login' ? 'Welcome back' : 'Create account' }}
          </h1>
          <p class="text-ink-3 text-sm mt-1.5">
            {{
              mode === 'login'
                ? 'Sign in to continue chatting'
                : 'Join and start chatting in seconds'
            }}
          </p>
        </div>
      </div>

      <!-- Glass card -->
      <div
        v-glow
        class="glass rounded-3xl p-8 shadow-[0_24px_80px_rgba(124,58,237,0.14)] dark:shadow-[0_24px_80px_rgba(124,58,237,0.38)] stagger-rise glow-border"
        :style="{ '--i': 2 }"
      >
        <form class="flex flex-col gap-4" @submit.prevent="submit">
          <div v-if="mode === 'register'" class="flex flex-col gap-1.5">
            <label for="login-name" class="text-ink-3 text-xs font-medium">Name</label>
            <input
              id="login-name"
              v-model="name"
              type="text"
              placeholder="Your full name"
              required
              autofocus
              class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm outline-none placeholder-ink-4 focus:border-cyan-400/60 transition-all"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="login-email" class="text-ink-3 text-xs font-medium">Email</label>
            <input
              id="login-email"
              v-model="email"
              type="email"
              placeholder="you@example.com"
              required
              :autofocus="mode === 'login'"
              class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm outline-none placeholder-ink-4 focus:border-cyan-400/60 transition-all"
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
              class="bg-field border border-edge rounded-xl px-4 py-2.5 text-ink text-sm outline-none placeholder-ink-4 focus:border-cyan-400/60 transition-all"
            />
          </div>

          <p v-if="error" class="text-rose-600 dark:text-rose-400 text-sm">{{ error }}</p>

          <button
            type="submit"
            :disabled="loading"
            class="mt-1 bg-linear-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 text-sm flex items-center justify-center gap-2 transition-all active:scale-97 ease-(--ease-spring) shadow-[0_8px_30px_rgba(124,58,237,0.35)] hover:shadow-[0_8px_40px_rgba(124,58,237,0.5)] cursor-pointer"
          >
            <span
              v-if="loading"
              class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"
            />
            {{ loading ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (mode === 'login' ? 'Sign in' : 'Create account') }}
          </button>
        </form>
      </div>

      <!-- Toggle -->
      <p class="text-ink-3 text-sm text-center mt-6 stagger-rise" :style="{ '--i': 3 }">
        {{ mode === 'login' ? "Don't have an account?" : 'Already have an account?' }}
        <button
          class="text-transparent bg-clip-text bg-linear-to-r from-cyan-600 to-violet-600 dark:from-cyan-400 dark:to-violet-400 font-semibold ml-1 cursor-pointer"
          @click="toggle"
        >
          {{ mode === 'login' ? 'Register' : 'Sign in' }}
        </button>
      </p>
    </div>
  </div>
</template>
