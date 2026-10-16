import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'

// Dev server for the combined shell (`npm run dev:combined`). The shell iframes
// the real prototype pages, so every prototype has to be served by this one dev
// server: serve from the repo root and send each prototype's relative fonts/ and
// sounds/ requests to the shared /public folder — the same place they end up in
// each prototype's build. The build itself uses vite.combined.config.ts.
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

export default defineConfig({
    // → http://localhost:5173/endprojectSandbox/combined/
    base: '/endprojectSandbox/',
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    plugins: [sharedAssets],
    server: { open: '/endprojectSandbox/combined/' },
})
