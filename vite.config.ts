import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    define: {
      'import.meta.env.VITE_AMAP_JS_KEY': JSON.stringify(env.VITE_AMAP_JS_KEY || ''),
    },
    server: {
      proxy: {
        '/api': 'http://localhost:8787',
      },
    },
  }
})
