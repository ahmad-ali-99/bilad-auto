// طبقة توافق: تعطي sql.js نفس واجهة better-sqlite3 المستخدمة بملفات المنطق المشتركة
// (prepare().get/all/run مع بارامترات مسماة @name، وtransaction، وpragma)
// حتى نعيد استخدام schema.js/seed.js/quoteService.js حرفياً بدون تغيير.

function prefixParams(params) {
  if (params == null) return undefined;
  if (Array.isArray(params)) return params;
  if (typeof params !== 'object') return [params];
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[k.startsWith('@') || k.startsWith(':') || k.startsWith('$') ? k : '@' + k] = v === undefined ? null : v;
  }
  return out;
}

export function wrapSqlJsDb(sqlDb, onWrite) {
  let inTransaction = false;

  function notifyWrite() {
    if (!inTransaction && onWrite) onWrite();
  }

  const wrapper = {
    raw: sqlDb,

    pragma(text) {
      try {
        const res = sqlDb.exec(`PRAGMA ${text}`);
        if (res.length === 0) return [];
        const { columns, values } = res[0];
        return values.map((row) => Object.fromEntries(row.map((v, i) => [columns[i], v])));
      } catch {
        return [];
      }
    },

    exec(sql) {
      sqlDb.exec(sql);
      notifyWrite();
      return wrapper;
    },

    prepare(sql) {
      return {
        get(...args) {
          const stmt = sqlDb.prepare(sql);
          try {
            const params = args.length === 1 ? prefixParams(args[0]) : args.length > 1 ? args : undefined;
            if (params !== undefined) stmt.bind(params);
            if (!stmt.step()) return undefined;
            return stmt.getAsObject();
          } finally {
            stmt.free();
          }
        },
        all(...args) {
          const stmt = sqlDb.prepare(sql);
          try {
            const params = args.length === 1 ? prefixParams(args[0]) : args.length > 1 ? args : undefined;
            if (params !== undefined) stmt.bind(params);
            const rows = [];
            while (stmt.step()) rows.push(stmt.getAsObject());
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...args) {
          const stmt = sqlDb.prepare(sql);
          try {
            const params = args.length === 1 ? prefixParams(args[0]) : args.length > 1 ? args : undefined;
            if (params !== undefined) stmt.bind(params);
            stmt.step();
          } finally {
            stmt.free();
          }
          const changes = sqlDb.getRowsModified();
          let lastInsertRowid = null;
          const res = sqlDb.exec('SELECT last_insert_rowid() AS id');
          if (res.length > 0) lastInsertRowid = res[0].values[0][0];
          notifyWrite();
          return { changes, lastInsertRowid };
        },
      };
    },

    transaction(fn) {
      return (...args) => {
        sqlDb.exec('BEGIN');
        inTransaction = true;
        try {
          const result = fn(...args);
          sqlDb.exec('COMMIT');
          inTransaction = false;
          if (onWrite) onWrite();
          return result;
        } catch (err) {
          inTransaction = false;
          try {
            sqlDb.exec('ROLLBACK');
          } catch {}
          throw err;
        }
      };
    },
  };

  return wrapper;
}
