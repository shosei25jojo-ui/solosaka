// 単体で開ける確認用 HTML を生成する（PixiJS は CDN から読み込む）
//   node tools/build-standalone.mjs  →  standalone/solosaka-gait.html（dist/ にもコピー）
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'node_modules/pixi.js/package.json'), 'utf8'));
const PIXI_CDN = `https://cdn.jsdelivr.net/npm/pixi.js@${pkg.version}/dist/pixi.min.mjs`;

const out = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    target: 'es2020',
    minify: true,
    lib: { entry: resolve(root, 'src/main.js'), formats: ['es'], fileName: 'app' },
    rollupOptions: { external: ['pixi.js'], output: { inlineDynamicImports: true } },
  },
});
const chunk = (Array.isArray(out) ? out[0] : out).output.find((o) => o.type === 'chunk');
const js = chunk.code.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(root, 'src/style.css'), 'utf8');
let html = readFileSync(resolve(root, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="stylesheet" href="\.\/src\/style\.css" \/>/, `\n  <style>\n${css}\n  </style>\n  <script type="importmap">{"imports":{"pixi.js":"${PIXI_CDN}"}}</script>`)
  .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>/, () => `<script type="module">\n${js}\n</script>`)
  .replace('<title>SOLOSAKA</title>', '<title>SOLOSAKA ストライド×ピッチ確認</title>');

mkdirSync(resolve(root, 'standalone'), { recursive: true });
const dest = resolve(root, 'standalone/solosaka-gait.html');
writeFileSync(dest, html);
if (existsSync(resolve(root, 'dist'))) copyFileSync(dest, resolve(root, 'dist/solosaka-gait.html'));
console.log(`wrote ${dest} (${(html.length / 1024).toFixed(0)} KB), pixi: ${PIXI_CDN}`);
