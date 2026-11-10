import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue2'
import localCompetitorApi from './scripts/localCompetitorApi.cjs'

export default defineConfig({
  base: process.env.NETLIFY === 'true' ? '/' : '/competitor-seo-monitor/',
  plugins: [vue(), localCompetitorApi()],
  publicDir: 'static',
  build: {
    outDir: 'dist'
  }
})