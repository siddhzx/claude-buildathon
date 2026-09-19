import { realpathSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { engineerApi } from './server/engineer';

export default defineConfig(({ mode }) => {
  // Make .env values (ANTHROPIC_API_KEY) visible to the server-side SDK only.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  }
  // Resolve the project through its real path so dev and build agree when the folder is
  // reached through a redirected location (seen with packaged Windows apps).
  const root = realpathSync.native(process.cwd());
  return {
    root,
    plugins: [react(), engineerApi()],
    // Some Windows setups expose the project under two paths (a redirected AppData folder);
    // allow both so Vite's file-serving guard does not reject the real one.
    server: { port: 5173, strictPort: false, fs: { allow: [process.cwd(), root] } },
  };
});
