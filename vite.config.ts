import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3411',
        changeOrigin: false,
        // src/client/api/*.ts module requests share the /api prefix — keep those local
        bypass: (req) => {
          const pathname = (req.url ?? '').split('?')[0]!;
          return pathname.endsWith('.ts') || pathname.endsWith('.tsx') ? req.url : undefined;
        },
      },
    },
  },
});
