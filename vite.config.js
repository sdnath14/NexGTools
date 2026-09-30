import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const ANDROID_API_BASE_URL = 'https://tools.nexgpetrolube.com'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBaseUrl = (env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

  if (mode === 'android' && apiBaseUrl !== ANDROID_API_BASE_URL) {
    throw new Error(`Android builds require VITE_API_BASE_URL=${ANDROID_API_BASE_URL}`)
  }

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': 'http://localhost:8000',
      },
    },
  }
})
