import { createApp } from './app.js';
import { DB_PATH } from './db.js';

const PORT = Number(process.env.PORT) || 3000;

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`game server listening on http://localhost:${PORT}`);
  console.log(`database: ${DB_PATH}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
