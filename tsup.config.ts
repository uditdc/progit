import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/server/cli.ts' },
  outDir: 'dist/server',
  format: 'esm',
  target: 'node18',
  clean: true,
  sourcemap: true,
});
