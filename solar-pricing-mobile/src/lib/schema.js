const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN ('panel','battery','inverter','secondary')),
  brand TEXT,
  model TEXT,
  full_description TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('عدد','متر','قطعي')),
  watt_or_capacity REAL,
  price REAL NOT NULL DEFAULT 0,
  warranty_months INTEGER,
  warranty_note TEXT,
  qty_per_panel REAL,
  quantity_stock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS labor_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_amps REAL NOT NULL,
  price REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  company_name TEXT,
  company_name_en TEXT,
  email TEXT,
  phone1 TEXT,
  phone2 TEXT,
  manager_name TEXT,
  logo_path TEXT,
  notes_default TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  system_voltage REAL NOT NULL DEFAULT 220,
  peak_sun_hours REAL NOT NULL DEFAULT 7,
  system_efficiency REAL NOT NULL DEFAULT 0.80,
  inverter_safety_factor REAL NOT NULL DEFAULT 1.25,
  dod REAL NOT NULL DEFAULT 0.90,
  night_coverage_hours REAL NOT NULL DEFAULT 8,
  panel_area_m2 REAL NOT NULL DEFAULT 2.7,
  currency TEXT NOT NULL DEFAULT 'دينار عراقي',
  quote_number_start INTEGER NOT NULL DEFAULT 7400,
  panel_ref_amps REAL NOT NULL DEFAULT 2.18,
  panel_ref_watt REAL NOT NULL DEFAULT 650,
  charge_panels_per_battery REAL NOT NULL DEFAULT 1.5,
  battery_charge_hours REAL NOT NULL DEFAULT 2
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_number INTEGER NOT NULL UNIQUE,
  client_name TEXT,
  client_phone TEXT,
  location TEXT,
  roof_area_m2 REAL,
  required_amp_day REAL,
  required_amp_night REAL,
  selected_tier TEXT CHECK (selected_tier IN ('economy','standard','premium')),
  total_price REAL NOT NULL DEFAULT 0,
  roof_limited_warning INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES materials(id),
  description_snapshot TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quote_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
`;

function initSchema(db) {
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  migrateSettingsColumns(db);
  const settingsRow = db.prepare('SELECT COUNT(*) AS c FROM settings').get();
  if (settingsRow.c === 0) {
    db.prepare('INSERT INTO settings (id) VALUES (1)').run();
  }
  const profileRow = db.prepare('SELECT COUNT(*) AS c FROM company_profile').get();
  if (profileRow.c === 0) {
    db.prepare(
      `INSERT INTO company_profile (id, company_name, company_name_en, email, phone1, phone2, manager_name, notes_default)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'شركة بلاد اوتو للطاقة الشمسية والمقاولات العامة',
      'Bilad Utu for Energy Services',
      'Info@biladutu.com',
      '07770530070',
      '07809332469',
      'أ.حيدر كاظم عبادي',
      JSON.stringify([
        'مدة التجهيز تتراوح بين 1 يوم إلى 2 يوم من تاريخ دفع العربون',
        'الدفعات تكون حسب اتفاق الطرفين',
        'مدة التنفيذ تتراوح من 1 إلى 3 أيام مع تشغيل والبرمجة',
        'ذرعة الكيبلات من المحتمل تغيرها لأنه لم يتم الكشف الموقعي',
        'أي تغيير بالأسعار يتم نقاشه من قبل الطرفين',
      ])
    );
  }
}

// قواعد بيانات منشأة بنسخ أقدم لا تملك الأعمدة الجديدة — SQLite لا يدعم IF NOT EXISTS للأعمدة
function migrateSettingsColumns(db) {
  const newColumns = [
    'panel_ref_amps REAL NOT NULL DEFAULT 2.18',
    'panel_ref_watt REAL NOT NULL DEFAULT 650',
    'charge_panels_per_battery REAL NOT NULL DEFAULT 1.5',
    'battery_charge_hours REAL NOT NULL DEFAULT 2',
  ];
  const existing = db.prepare("PRAGMA table_info(settings)").all().map((c) => c.name);
  for (const colDef of newColumns) {
    const name = colDef.split(' ')[0];
    if (!existing.includes(name)) {
      db.exec(`ALTER TABLE settings ADD COLUMN ${colDef}`);
    }
  }
}

export { initSchema, SCHEMA_SQL };
