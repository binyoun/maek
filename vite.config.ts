import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  base: '/maek/', // for GitHub Pages under the repo name
  plugins: [basicSsl()],
  server: {
    https: true, // camera needs a secure context
    host: true,
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)), // landing / version menu
        hand: fileURLToPath(new URL('./hand.html', import.meta.url)), // the meridian hand
        body: fileURLToPath(new URL('./body.html', import.meta.url)), // Tier 3 body mode
      },
    },
  },
});
