import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // A production build must never point at the local emulators. firebase.ts
  // already ignores the flag outside the dev server; this makes the mistake
  // loud instead of silent.
  if (command === 'build' && loadEnv(mode, __dirname, 'VITE_').VITE_USE_EMULATORS === 'true') {
    throw new Error(
      `VITE_USE_EMULATORS=true is set for a "${mode}" build. Move it to web/.env.development.local, ` +
        'which only the dev server (npm run dev) reads.'
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
