import { defineConfig } from 'vite';
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
});
