/**
 * Build script: host half (ESM, node) + browser half (lazy-CJS factory bundle
 * for window.__ModuleLoader__). Run with `node scripts/build.mjs`.
 */
import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const pkgName = 'dsh-intent-recognition'

await mkdir('lib', { recursive: true })

// ---- host half ----
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  // Shared with the host (peer deps); pg-native is pg's optional native binding.
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/schemastery',
    '@deepseek-ai/dsh-tools',
    'pg-native',
    'mock-aws-s3', 'aws-sdk', 'nock', 'gcs-resumable-upload', // exceljs optional deps
  ],
  // Bundled CJS deps (pg, exceljs) keep dynamic require() calls; bridge them.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: 'info',
})

// ---- browser half: closure-factory format for the client module system ----
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  sourcemap: true,
  jsx: 'automatic',
  // Resolved through the injected module-table require at runtime.
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-ui-slots',
    'zod',
  ],
  banner: {
    js: `window.__ModuleLoader__.load({id:${JSON.stringify(pkgName)},factory:(require)=>{var module={exports:{}};var exports=module.exports;`,
  },
  footer: { js: 'return module.exports;}});' },
  logLevel: 'info',
})

console.log('build done: lib/index.js, lib/client.js')
