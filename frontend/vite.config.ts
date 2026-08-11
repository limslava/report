import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Рабочая копия Report-hh-hr: свой бэкенд на 3101, чтобы не ходить
// в основной проект на 3001, где модуля подбора нет.
const apiUrl = process.env.VITE_API_URL || 'http://localhost:3101/api';
const apiProxyTarget = new URL(apiUrl).origin;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Порт фиксирован: он прописан в CORS бэкенда (FRONTEND_URL=http://localhost:5174).
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
