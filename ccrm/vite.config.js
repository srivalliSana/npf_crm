import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Auto-derive an app version from git so EVERY push/build bumps it,
// with no manual version edits. Format: v1.<commitCount> (<shortHash>)
function gitVersion() {
  try {
    const count = execSync('git rev-list --count HEAD').toString().trim()
    const hash  = execSync('git rev-parse --short HEAD').toString().trim()
    return `v1.${count} (${hash})`
  } catch {
    return 'v1.0'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion()),
  },
  // Production domain: https://crm.cutmap.ac.in
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  }
})
