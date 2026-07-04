const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { initSchema } = require('./schema');
const { seedIfEmpty } = require('./seed');

let dbInstance = null;

function getDbPath(userDataDir) {
  return path.join(userDataDir, 'solar-pricing.db');
}

function openDb(userDataDir) {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = getDbPath(userDataDir);
  dbInstance = new Database(dbPath);
  initSchema(dbInstance);
  seedIfEmpty(dbInstance);
  return dbInstance;
}

function getDb() {
  if (!dbInstance) throw new Error('Database not initialized - call openDb first');
  return dbInstance;
}

module.exports = { openDb, getDb, getDbPath };
