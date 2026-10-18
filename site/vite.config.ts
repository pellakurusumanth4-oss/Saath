import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The root .env uses EXPO_PUBLIC_ names; expose the same values to the site as VITE_ vars.
  const env = loadEnv(mode, '..', '');
  const url = env.EXPO_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '';
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey),
    },
    server: {
      fs: { allow: ['..'] },
    },
    build: { outDir: '../dist', emptyOutDir: true },
    optimizeDeps: {
      exclude: ['kokoro-js', '@huggingface/transformers', 'onnxruntime-web', 'phonemizer'],
    },
  };
});
