<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorContext } from '../../context'
import Modal from '../ui/Modal.vue'

const open = defineModel<boolean>('open', { default: false })
const ctx = useEditorContext()
const { t } = ctx

const CATEGORIES = {
  symbols: '© ® ™ § ¶ † ‡ • · … ‰ ′ ″ ° ¹ ² ³ ¼ ½ ¾ ¡ ¿ « » ‹ › “ ” ‘ ’ „ – — ✓ ✗ ★ ☆ ♠ ♣ ♥ ♦ ☐ ☑',
  arrows: '← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔ ↩ ↪ ↺ ↻ ➜ ➔ ⟵ ⟶ ▲ ▼ ◀ ▶',
  math: '± × ÷ = ≠ ≈ ≡ < > ≤ ≥ ∞ √ ∑ ∏ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ⊃ ∀ ∃ ¬ ∧ ∨ π α β γ δ θ λ μ σ φ ω Ω',
  currency: '$ € £ ¥ ₹ ₩ ₽ ₺ ₫ ₱ ₦ ₿ ¢ ₪ ฿',
  emoji: '😀 😂 😊 😍 🤔 😎 😢 😡 👍 👎 👏 🙏 💪 🎉 🔥 ⭐ ✅ ❌ ⚠️ 💡 📌 📎 📅 📈 📉 🚀 ❤️ 💯',
} as const
type Category = keyof typeof CATEGORIES

const category = ref<Category>('symbols')
const chars = computed(() => CATEGORIES[category.value].split(' '))

function insert(char: string) {
  ctx.editor.value?.chain().focus().insertContent(char).run()
}
</script>

<template>
  <Modal v-model:open="open" :title="t('specialChars')" :width="420">
    <div class="re-tabs" role="tablist">
      <button
        v-for="key in (Object.keys(CATEGORIES) as Category[])"
        :key="key"
        type="button"
        role="tab"
        class="re-tab"
        :aria-selected="category === key"
        @click="category = key"
      >
        {{ t(key) }}
      </button>
    </div>
    <div class="re-char-grid" role="tabpanel">
      <button v-for="char in chars" :key="char" type="button" class="re-char" :title="char" @click="insert(char)">{{ char }}</button>
    </div>
  </Modal>
</template>
