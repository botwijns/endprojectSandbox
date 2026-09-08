import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
    root: 'survey',
    base: '/endprojectSandbox/survey/',
    // favicon lives in the repo-root /public folder, shared with the prototypes
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    server: {
        // survey/main.ts imports survey-template.json and the shared client
        // library from ../server, which sits outside this config's root
        fs: { allow: [repoRoot] },
    },
    build: {
        outDir: 'dist/survey',
        emptyOutDir: false,
    },
})
