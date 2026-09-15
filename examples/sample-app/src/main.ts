import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

// Integration guide step 4: import the editor styles once, then the app's theme overrides.
import '@local/rich-editor/styles.css'
import './styles/app.css'
import './styles/editor-theme.css'

createApp(App).use(router).mount('#app')
