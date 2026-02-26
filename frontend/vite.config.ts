import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    build: {
        target: 'esnext',
        outDir: 'dist',
    },
    server: {
        port: 3000,
        open: true,
        proxy: {
            '/polymarket-api': {
                target: 'https://gamma-api.polymarket.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/polymarket-api/, ''),
            },
        },
    },
});
