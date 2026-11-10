import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import localCompetitorApi from './scripts/localCompetitorApi.cjs'

export default defineConfig({
  base: '/competitor-seo-monitor/',
  plugins: [vue(), localCompetitorApi()],
  publicDir: 'static',
  build: {
    outDir: 'dist'
  }
})