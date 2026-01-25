import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Local dev: Frontend on 5173, Backend on 3001
// Docker:    Frontend on 3000, Backend on 3001
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Default Vite port - avoids conflict with Docker's port 3000
    strictPort: false, // Falls back to next available port if 5173 is taken
  },
})
