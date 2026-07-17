<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div
    v-if="label"
    class="msg-rise px-3 pb-1.5 text-xs text-ink-3 flex items-center gap-1.5"
  >
    <span class="flex gap-0.5">
      <span class="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style="animation-delay: 0ms" />
      <span class="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style="animation-delay: 120ms" />
      <span class="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style="animation-delay: 240ms" />
    </span>
    {{ label }}
  </div>
</template>
