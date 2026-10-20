import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { SHOPS_LIST_QUERY } from './src/shopQuery';

// The phone's AR camera page (web/ar) and its talk client (web/talk) ride along at /ar/ and /talk/, so the app can
// open them over HTTPS without the laptop. The hosted page alone gets a <meta name="saath-api"> pointing talk.js at
// the Supabase `ar` function (key: the public anon key); the copies exist only in dist/, never in the repo.
function arPage(url: string, anonKey: string): Plugin {
  const web = fileURLToPath(new URL('../web/', import.meta.url));
  return {
    name: 'saath-ar-page',
    apply: 'build',
    generateBundle() {
      const meta = url ? `<head>\n<meta name="saath-api" content="${url}/functions/v1/ar" data-key="${anonKey}">` : '<head>';
      this.emitFile({ type: 'asset', fileName: 'ar/index.html', source: fs.readFileSync(`${web}ar/index.html`, 'utf8').replace('<head>', meta) });
      for (const rig of fs.readdirSync(`${web}ar/rigs`).filter((f) => f.endsWith('.html'))) {
        this.emitFile({ type: 'asset', fileName: `ar/rigs/${rig}`, source: fs.readFileSync(`${web}ar/rigs/${rig}`) });
      }
      for (const file of ['talk.js', 'mouth.mjs', 'cloud.js']) {
        this.emitFile({ type: 'asset', fileName: `talk/${file}`, source: fs.readFileSync(`${web}talk/${file}`) });
      }
    },
  };
}

// The map page's HTML starts the shop list's query itself (useShops takes that answer first): it no longer waits for the
// app's script to download and run. The key is the public anon key the bundle already carries; empty without a project.
function earlyShops(url: string, anonKey: string): Plugin {
  const query = url && anonKey ? `${url}/rest/v1/shops?${SHOPS_LIST_QUERY}&apikey=${anonKey}` : '';
  return { name: 'saath-early-shops', transformIndexHtml: (html) => html.replace(/%SAATH_SHOPS%/g, () => query) };
}

export default defineConfig(({ mode }) => {
  // The root .env uses EXPO_PUBLIC_ names; expose the same values to the site as VITE_ vars.
  const env = loadEnv(mode, '..', '');
  const url = env.EXPO_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '';
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
  return {
    plugins: [react(), arPage(url, anonKey), earlyShops(url, anonKey)],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(anonKey),
    },
    server: {
      fs: { allow: ['..'] },
    },
    // Three pages: the home page (/, plain HTML), the visitors' map (/visit/) and the owner page (/owner/), each with its own bundle.
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), visit: fileURLToPath(new URL('./visit/index.html', import.meta.url)), owner: fileURLToPath(new URL('./owner/index.html', import.meta.url)) } },
    },
    optimizeDeps: {
      exclude: ['kokoro-js', '@huggingface/transformers', 'onnxruntime-web', 'phonemizer'],
    },
  };
});
