import { createApp } from './app.js';
import { defaultDbPath, getDb } from './db/index.js';

const port = Number(process.env.PORT ?? 4000);

try {
  const db = await getDb();
  const app = createApp(db);
  app.listen(port, () => {
    console.log(`MenuSnap API listening on http://localhost:${port} (database: ${defaultDbPath})`);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
