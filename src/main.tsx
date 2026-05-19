import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { seedIfEmpty } from './db'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      reg.unregister().catch(() => {})
    }
  }).catch(() => {})
  if ('caches' in window) {
    caches.keys().then((keys) => {
      for (const key of keys) caches.delete(key).catch(() => {})
    }).catch(() => {})
  }
}

window.addEventListener('error', (e) => {
  console.error('[global error]', e.error || e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason)
})

seedIfEmpty().catch((e) => console.error('Seed failed:', e))

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <App />
  </HashRouter>,
)
