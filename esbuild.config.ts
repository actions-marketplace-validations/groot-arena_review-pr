import * as esbuild from 'esbuild';
import * as path from 'node:path';
import * as fs from 'node:fs';

const outdir = path.resolve('dist');

if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

async function build(): Promise<void> {
  const commonOptions: esbuild.BuildOptions = {
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    sourcemap: false,
    minify: false,
    treeShaking: true,
  };

  await Promise.all([
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/entrypoints/post-inline-review.ts'],
      outfile: 'dist/post-inline-review.js',
    }),
    esbuild.build({
      ...commonOptions,
      entryPoints: ['src/entrypoints/pr-summary.ts'],
      outfile: 'dist/pr-summary.js',
    }),
  ]);

  console.log('✓ Build completed successfully.');
}

build().catch((err: unknown) => {
  console.error('Build failed:', err);
  process.exit(1);
});
