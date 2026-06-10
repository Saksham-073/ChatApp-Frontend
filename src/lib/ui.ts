import { computed } from 'vue'
import { connectionState } from './echo'

/** First two letters of a name, for avatar badges. */
export function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

/** Stable per-user hue so every avatar gets its own gradient tint. */
export function hue(id: number) {
  return `hue-rotate(${(id * 53) % 360}deg)`
}

/** Compact relative time for sidebar rows: now / 5m / 3h / 2d / May 4 */
export function rel(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/** Websocket connection state mapped to label + theme-aware classes. */
export const connStatus = computed(() => {
  if (connectionState.value === 'connected')
    return {
      label: 'Online',
      dot: 'bg-emerald-400',
      text: 'text-emerald-600 dark:text-emerald-400',
      glow: 'shadow-[0_0_8px_rgba(52,211,153,0.8)]',
    }
  if (connectionState.value === 'connecting' || connectionState.value === 'initialized')
    return {
      label: 'Connecting...',
      dot: 'bg-amber-400',
      text: 'text-amber-600 dark:text-amber-400',
      glow: '',
    }
  return {
    label: 'Offline',
    dot: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    glow: '',
  }
})
