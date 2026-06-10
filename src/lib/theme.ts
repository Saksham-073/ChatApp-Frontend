import { ref } from 'vue'

export type Theme = 'dark' | 'light'

const stored = localStorage.getItem('theme') as Theme | null

/** Current theme. Defaults to the OS preference when nothing is saved. */
export const theme = ref<Theme>(
  stored ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
)

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  localStorage.setItem('theme', theme.value)
  apply(theme.value)
}

// Apply immediately on module load — before the app mounts — to avoid a flash
apply(theme.value)
