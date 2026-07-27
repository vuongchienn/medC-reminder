import { initDatabase, getDb, closeDb } from './adapter.js';

await initDatabase();

export { getDb, closeDb };
