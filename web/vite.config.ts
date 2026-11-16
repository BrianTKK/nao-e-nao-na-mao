import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Em desenvolvimento, /api e /socket.io vão para o servidor local (npm run server).
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  // O pacote shared fica fora desta pasta (monorepo).
  server: {
    fs: { allow: ['..'] },
    proxy: {
      '/api': { target },
      '/socket.io': { target, ws: true },
    },
  },
})
