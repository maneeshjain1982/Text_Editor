import { ref, watch } from 'vue'

const STORAGE_KEY = 'docs-hub-theme'

function read(): 'light' | 'dark' {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// App-wide theme state; the editor follows it through its `theme` prop (integration guide §7.3).
const theme = ref<'light' | 'dark'>(read())

watch(
  theme,
  (value) => {
    document.documentElement.dataset.theme = value
    try {
      localStorage.setItem(STORAGE_KEY, value)
    } catch {
      // storage unavailable: theme just won't persist
    }
  },
  { immediate: true },
)

export function useTheme() {
  return {
    theme,
    toggle: () => (theme.value = theme.value === 'dark' ? 'light' : 'dark'),
  }
}
