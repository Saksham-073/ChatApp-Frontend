import type { Directive } from 'vue'

export const vGlow: Directive<HTMLElement> = {
  mounted(el) {
    const handler = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
    }
    el.addEventListener('pointermove', handler)
    ;(el as unknown as { _glow: (e: PointerEvent) => void })._glow = handler
  },
  unmounted(el) {
    el.removeEventListener('pointermove', (el as unknown as { _glow: (e: PointerEvent) => void })._glow)
  },
}
