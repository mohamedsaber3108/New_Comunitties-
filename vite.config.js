import { defineConfig } from 'vite';

// VITE_SITE_PREVIEW selects the browser-local "hosted preview" build
// (localStorage emulation in src/preview-api.js). It is enabled either by
// an explicit env var (works on any OS/CI) or by building with `--mode preview`,
// which keeps `npm run build` cross-platform (the previous inline
// `VITE_SITE_PREVIEW=true vite build` only worked in POSIX shells).
export default defineConfig(({ mode }) => {
  const sitePreview =
    process.env.VITE_SITE_PREVIEW === 'true' || mode === 'preview';
  return {
    define: {
      'import.meta.env.VITE_SITE_PREVIEW': JSON.stringify(
        sitePreview ? 'true' : 'false',
      ),
    },
    server: { host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:3001' } },
    preview: { allowedHosts: ['terminal.local'] },
    build: {
      outDir: 'dist',
      // Libraries change far less often than app code: shipping them as
      // separate long-cached chunks means a deploy only invalidates the
      // (smaller) app chunk for returning visitors.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('lucide-react')) return 'icons';
            if (/[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/.test(id)) return 'react';
            return undefined;
          },
        },
      },
    },
  };
});
