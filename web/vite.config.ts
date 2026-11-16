import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // O pacote shared fica fora desta pasta (monorepo).
  server: { fs: { allow: ['..'] } },
})
