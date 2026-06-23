import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VERCEL ? '/' : '/20260623-flycheck/',
  plugins: [react()],
});
