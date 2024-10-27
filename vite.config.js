import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    nodePolyfills(),
    dts({
      insertTypesEntry: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs', 'umd'],
      name: 'SwarmStreamJs',
      fileName: (format) => {
        if (format === 'es') return `index.esm.js`;
        if (format === 'cjs') return `index.js`;
        return `swarm-stream-${format}.js`;
      },
    },
    rollupOptions: {
      external: ['@ethersphere/bee-js'],
      output: {
        globals: {
          '@ethersphere/bee-js': 'BeeJs',
        },
      },
    },
  },
});
