import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../lib/api'
import { resetEcho } from '../lib/echo'

interface User { id: number; name: string; email: string }
interface AuthResponse { token: string; user: User }

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('auth_token'))
  const user = ref<User | null>(null)
  const loading = ref(false)

  // Cached promise — ensures /me is called only once across router guards and components
  let initPromise: Promise<void> | null = null

  function init(): Promise<void> {
    if (!initPromise) initPromise = _init()
    return initPromise
  }

  async function _init() {
    if (!token.value) return
    loading.value = true
    try {
      user.value = await api.get<User>('/me')
    } catch {
      // Token is invalid or expired — clear everything
      _clearState()
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string) {
    const res = await api.post<AuthResponse>('/login', { email, password })
    _setToken(res.token)
    user.value = res.user
    initPromise = Promise.resolve() // mark as initialized
  }

  async function register(name: string, email: string, password: string) {
    const res = await api.post<AuthResponse>('/register', { name, email, password })
    _setToken(res.token)
    user.value = res.user
    initPromise = Promise.resolve() // mark as initialized
  }

  async function logout() {
    try {
      await api.post('/logout', {})
    } catch {
      // Ignore — token may already be expired; still clear local state
    }
    resetEcho()
    _clearState()
    initPromise = null // reset so next login can re-init
  }

  function _clearState() {
    _setToken(null)
    user.value = null
  }

  function _setToken(t: string | null) {
    token.value = t
    if (t) localStorage.setItem('auth_token', t)
    else localStorage.removeItem('auth_token')
  }

  const isLoggedIn = computed(() => !!token.value)

  return { token, user, loading, isLoggedIn, init, login, register, logout }
})
