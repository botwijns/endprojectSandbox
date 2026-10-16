import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
    root: 'combined',
    base: '/endprojectSandbox/combined/',
    // favicon lives in the repo-root /public folder, shared with the prototypes
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    server: {
        // combined/src imports the shared fullscreen helper, P6's brief list and
        // the server's telemetry client, all outside this config's root
        fs: { allow: [repoRoot] },
    },
    build: {
        outDir: 'dist/combined',
        emptyOutDir: false,
    },
})
