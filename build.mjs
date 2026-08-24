/**
 * 把 src/main.js 打包并内联进 src/shell.html，产出单文件 dist/index.html
 * 单文件的好处：老师拿到一个 .html 双击就能用，不联网、不装环境。
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');

async function build() {
  const r = await esbuild.build({
    entryPoints: ['src/main.js'],
    bundle: true, minify: !watch, format: 'iife', target: 'es2020',
    write: false, logLevel: 'error',
  });
  const js = r.outputFiles[0].text.replace(/<\/script>/gi, '<\\/script>');
  const html = readFileSync('src/shell.html', 'utf8').replace('__BUNDLE__', () => js);
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.html', html);
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`✓ dist/index.html  ${kb} KB`);
}

if (watch) {
  const ctx = await esbuild.context({entryPoints:['src/main.js'], bundle:true, write:false});
  await build();
  console.log('watching…');
  setInterval(build, 1500);
} else {
  await build();
}
