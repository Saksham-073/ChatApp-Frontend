<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { CallRecord } from '../../stores/call'

const props = defineProps<{ call: CallRecord }>()

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(startedAt: string, endedAt: string) {
  const secs = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

const isMissed = computed(() => props.call.status === 'missed')

const icon = computed(() => {
  if (isMissed.value) return 'mdi:phone-missed'
  return props.call.type === 'video' ? 'mdi:video' : 'mdi:phone'
})

const label = computed(() => {
  const c = props.call
  const kind = c.type === 'video' ? 'Video call' : 'Voice call'
  if (c.status === 'missed') return 'Missed call'
  if (c.status === 'declined') return 'Declined call'
  if (c.answered_at && c.ended_at) return `${kind} · ${fmtDuration(c.answered_at, c.ended_at)}`
  return kind
})
</script>

<template>
  <div class="flex justify-center my-2">
    <span
      class="glass text-[11px] font-semibold rounded-full px-3.5 py-1.5 flex items-center gap-2"
      :class="isMissed ? 'text-rose-500 dark:text-rose-400' : 'text-ink-3'"
    >
      <Icon :icon="icon" class="w-3.5 h-3.5" />
      {{ label }}
      <span class="text-ink-4 font-normal">· {{ fmtTime(call.started_at) }}</span>
    </span>
  </div>
</template>
