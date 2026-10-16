import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

const publicDir = fileURLToPath(new URL('./public', import.meta.url))

// In dev the combined shell iframes the real prototype pages, so every
// prototype has to be served by this one dev server. Serve from the repo root
// and send each prototype's relative fonts/ and sounds/ requests to the shared
// /public folder — the same place they end up in each prototype's build.
const sharedAssets: Plugin = {
    name: 'combined-shared-assets',
    configureServer(server) {
        server.middlewares.use((req, _res, next) => {
            if (req.url) {
                req.url = req.url.replace(
                    /^\/endprojectSandbox\/prototype_\d+\/(fonts|sounds)\//,
                    '/endprojectSandbox/$1/',
                )
            }
            next()
        })
    },
}

export default defineConfig(({ command }) => command === 'serve'
    ? {
        // `npm run dev:combined` → http://localhost:5173/endprojectSandbox/combined/
        base: '/endprojectSandbox/',
        publicDir,
        plugins: [sharedAssets],
        server: { open: '/endprojectSandbox/combined/' },
    }
    : {
        root: 'combined',
        base: '/endprojectSandbox/combined/',
        publicDir,
        build: {
            // same pattern as the vite.prototype_N configs, which land in dist/<name> on CI
            outDir: 'dist/combined',
            emptyOutDir: false,
        },
    })
