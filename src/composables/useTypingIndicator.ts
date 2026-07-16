import { reactive, computed, type ComputedRef } from 'vue'

const EXPIRY_MS = 4000

export function formatTypingLabel(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is typing...`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`
  return `${names.length} people are typing...`
}

export interface TypingIndicator {
  users: Map<number, string>
  handleEvent: (userId: number, name: string) => void
  clear: () => void
  label: ComputedRef<string>
}

export function createTypingIndicator(): TypingIndicator {
  const users = reactive(new Map<number, string>())
  const timers = new Map<number, ReturnType<typeof setTimeout>>()

  function handleEvent(userId: number, name: string) {
    users.set(userId, name)
    clearTimeout(timers.get(userId))
    timers.set(
      userId,
      setTimeout(() => {
        users.delete(userId)
        timers.delete(userId)
      }, EXPIRY_MS),
    )
  }

  function clear() {
    timers.forEach((t) => clearTimeout(t))
    timers.clear()
    users.clear()
  }

  const label = computed(() => formatTypingLabel([...users.values()]))

  return { users, handleEvent, clear, label }
}
