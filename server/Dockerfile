# Game server image. No native modules (node:sqlite is built in), so a plain
# Alpine Node image is enough.
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/game.db

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY survey-template.json ./

# COPY keeps the host's file modes, so a checkout made with a strict umask
# (e.g. files 600, owned by root) is unreadable to the node user. Make the app
# readable for everyone; it stays owned by root, so node still can't modify it.
# The SQLite file lives in /app/data; mount a volume on it to keep data across restarts.
RUN chmod -R a+rX /app && mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run node directly (not via npm) so SIGTERM reaches the process and the
# server's graceful shutdown handler runs on `docker stop`.
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]