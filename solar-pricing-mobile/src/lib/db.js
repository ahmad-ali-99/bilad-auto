// فتح قاعدة البيانات (sql.js WASM) مع حفظ دائم عبر Capacitor Filesystem
// نفس المخطط والبيانات التجريبية تبع نسخة سطح المكتب — الملفات مشتركة حرفياً
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { wrapSqlJsDb } from './sqljsAdapter.js';
import { initSchema } from './schema.js';
import { seedIfEmpty } from './seed.js';

const DB_FILE = 'solar-pricing.db';

let dbPromise = null;

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadPersisted() {
  try {
    const result = await Filesystem.readFile({ path: DB_FILE, directory: Directory.Data });
    return base64ToBytes(result.data);
  } catch {
    return null;
  }
}

let persistScheduled = false;
async function persist(sqlDb) {
  // تجميع الكتابات المتتالية بحفظة واحدة (debounce بسيط)
  if (persistScheduled) return;
  persistScheduled = true;
  setTimeout(async () => {
    persistScheduled = false;
    try {
      const bytes = sqlDb.export();
      await Filesystem.writeFile({
        path: DB_FILE,
        directory: Directory.Data,
        data: bytesToBase64(bytes),
      });
    } catch (err) {
      console.error('DB persist failed', err);
    }
  }, 300);
}

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      const persisted = await loadPersisted();
      const sqlDb = persisted ? new SQL.Database(persisted) : new SQL.Database();
      const db = wrapSqlJsDb(sqlDb, () => persist(sqlDb));
      initSchema(db);
      seedIfEmpty(db);
      await persist(sqlDb);
      return db;
    })();
  }
  return dbPromise;
}
