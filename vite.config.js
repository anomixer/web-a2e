import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: 'public',
    publicDir: '../public',

    server: {
        port: 3000,
        open: true,
        headers: {
            // Required for SharedArrayBuffer (if needed for AudioWorklet)
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        }
    },

    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'public/index.html')
            }
        }
    },

    resolve: {
        alias: {
            '/src': resolve(__dirname, 'src')
        }
    },

    // Handle WASM files
    assetsInclude: ['**/*.wasm'],

    optimizeDeps: {
        exclude: ['a2e.js']
    }
});
