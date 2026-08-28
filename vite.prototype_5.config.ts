import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    root: 'prototype_5',
    base: '/endprojectSandbox/prototype_5/',
    // the sound effects and webaudiofont instrument files live in the repo-root
    // /public folder, shared with the other prototypes
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    build: {
        outDir: 'dist/prototype_5',
        emptyOutDir: false
    }
})
