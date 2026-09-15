<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { useTheme } from './composables/useTheme'

const { theme, toggle } = useTheme()
</script>

<template>
  <div class="app">
    <header class="app-header">
      <RouterLink to="/" class="brand">Docs Hub</RouterLink>
      <nav>
        <RouterLink to="/">Documents</RouterLink>
      </nav>
      <button class="btn btn-ghost" type="button" data-testid="theme-toggle" @click="toggle">
        {{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}
      </button>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
