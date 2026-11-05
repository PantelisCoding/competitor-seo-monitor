import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'

export default defineConfig({
  base: '/competitor-seo-monitor/',
  plugins: [vue()],
  publicDir: 'static',
  build: {
    outDir: 'dist'
  }
})