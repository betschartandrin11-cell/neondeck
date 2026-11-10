import { defineConfig } from 'vite';

// base: './' ist PFLICHT für GitHub Pages (https://USER.github.io/REPO/):
// Alle Asset-Pfade werden relativ ausgeliefert.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0, // keine riesigen Base64-Assets im Quellcode/Bündel
  },
});
