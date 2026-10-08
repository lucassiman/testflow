import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// nome, cor e ícone do app: edite branding.json e public/icons/ (veja o README)
const brand = JSON.parse(readFileSync(new URL('./branding.json', import.meta.url), 'utf8'));
const iconSvg = readFileSync(new URL('./public/icons/icon.svg', import.meta.url), 'utf8');

/** Troca %APP_NAME% / %APP_COLOR% / %APP_FAVICON% no index.html (vale para todos os builds). */
const brandingHtml = {
  name: 'branding-html',
  transformIndexHtml(html) {
    return html
      .replaceAll('%APP_NAME%', brand.name)
      .replaceAll('%APP_COLOR%', brand.color)
      .replaceAll('%APP_FAVICON%', `data:image/svg+xml,${encodeURIComponent(iconSvg)}`);
  },
};
const buildDate = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

// `npm run dev`          → desenvolvimento (sem service worker)
// `npm run build`        → dist/  (app instalável: manifest + service worker offline)
// `npm run app`          → build + serve em http://localhost:4173 para instalar/atualizar o app
// `npm run build:single` → dist-single/index.html (um único arquivo, abre com duplo clique)

const pwa = VitePWA({
  registerType: 'autoUpdate',
  injectRegister: false, // registrado em main.js só quando servido por http(s)
  filename: 'sw.js',
  includeAssets: ['icons/icon.svg'],
  manifest: {
    id: './',
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    lang: 'pt-BR',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand.color,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // "Abrir com" / duplo clique em .md abre no app instalado
    file_handlers: [
      { action: './', accept: { 'text/markdown': ['.md', '.markdown'] } },
    ],
    // um arquivo aberto pelo sistema vai para a janela que já está aberta
    launch_handler: { client_mode: 'focus-existing' },
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
    maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
    // versão nova assume na hora (sem esperar fechar todas as janelas do app)
    skipWaiting: true,
    clientsClaim: true,
  },
});

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(buildDate),
    __APP_NAME__: JSON.stringify(brand.name),
    __JIRA_BASE__: JSON.stringify(brand.jiraBaseUrl || ''),
  },
  plugins: mode === 'single' ? [brandingHtml, viteSingleFile()] : [brandingHtml, pwa],
  publicDir: mode === 'single' ? false : 'public', // o arquivo portátil não usa os ícones do app
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
    target: 'es2022',
  },
  preview: { port: 4173, strictPort: true },
}));
