import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://yairbear-ship-it.github.io/recipe-book/ in production.
  // Use '/recipe-book/' for absolute asset paths under GitHub Pages, and '/' locally.
  base: process.env.GITHUB_PAGES === 'true' ? '/recipe-book/' : './',
  plugins: [react()],
})
