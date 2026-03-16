// frontend/vite.config.js
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
    // Base URL for all assets
    base: '/',

    // Dev server config
    server: {
        port: 5173,
        host: true,          
        strictPort: true,
    },

    // Multi-page app — two HTML entry points
    build: {
        rollupOptions: {
            input: {
                scanner: resolve(__dirname, 'qr-scanner/index.html'),
                arview:  resolve(__dirname, 'ar-view/index.html'),
            }
        }
    }
})