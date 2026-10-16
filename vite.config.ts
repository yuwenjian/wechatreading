import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiDevPlugin } from './dev/api-dev-plugin'

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  server: {
    port: 8891,
    host: true,
  },
})
