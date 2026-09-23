import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// A separate, local-only entry. Production uses index.html and the authenticated App.
export default defineConfig({ plugins: [react()], publicDir: false, server: { host: '127.0.0.1', port: 8773, strictPort: true } });
