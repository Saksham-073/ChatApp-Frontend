import './assets/main.css'
import './lib/theme'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { vGlow } from './lib/glow'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.directive('glow', vGlow)

app.mount('#app')
