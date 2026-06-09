import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Serve parent directory as static assets so /assets/ and /css/ are accessible
  publicDir: path.resolve(__dirname, '../'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
