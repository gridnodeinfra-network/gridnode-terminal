// Phase 1: Vite is the dev server and dist/ preview server.
// `npm run dev`     -> hot-reload serving of the working tree
// `npm run preview` -> serves dist/ after `npm run build`
// dist/ assembly itself is scripts/build.mjs (see its header for why
// `vite build` is not the pipeline in this phase).
import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist' },
});
