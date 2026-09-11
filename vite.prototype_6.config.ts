import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
    root: 'prototype_6',
    base: '/endprojectSandbox/prototype_6/',
    // the sound effects and webaudiofont instrument files live in the repo-root
    // /public folder, shared with the other prototypes
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    build: {
        outDir: 'dist/prototype_6',
        emptyOutDir: false
    }
})
