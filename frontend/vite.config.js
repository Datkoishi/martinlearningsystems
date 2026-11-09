import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendTarget = process.env.EDUASSESS_DEV_BACKEND || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true
      },
      '/socket.io': {
        target: backendTarget.replace(/^http/, 'ws'),
        ws: true
      }
    }
  }
});
