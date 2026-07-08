// نفس واجهة window.api تبع نسخة سطح المكتب، لكن منفذة محلياً فوق sql.js —
// حتى صفحات React المشتركة تشتغل بدون أي تعديل على استدعاءاتها
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { getDb, exportDbBytes, importDbBytes } from './db.js';
import * as quoteService from './quoteService.js';
import * as excelImport from './excelImport.js';
import { exportInvoicePdf } from './pdfExport.js';

function normalizeMaterialInput(data) {
  return {
    category: data.category,
    brand: data.brand || null,
    model: data.model || null,
    full_description: data.full_description,
    unit: data.unit,
    watt_or_capacity: data.watt_or_capacity ?? null,
    price: data.price,
    warranty_months: data.warranty_months ?? null,
    warranty_note: data.warranty_note || null,
    qty_per_panel: data.qty_per_panel ?? null,
    quantity_stock: data.quantity_stock ?? 0,
  };
}

// فتح منتقي ملفات المتصفح/الويب فيو وقراءة الملف كـ ArrayBuffer
function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files && input.files[0];
      document.body.removeChild(input);
      resolve(file || null);
    };
    // إذا المستخدم سكّر المنتقي بدون اختيار
    window.addEventListener(
      'focus',
      () => setTimeout(() => {
        if (document.body.contains(input)) {
          document.body.removeChild(input);
          resolve(null);
        }
      }, 800),
      { once: true }
    );
    input.click();
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export const api = {
  materials: {
    async list(category) {
      const db = await getDb();
      if (category) return db.prepare('SELECT * FROM materials WHERE category = ? ORDER BY id').all(category);
      return db.prepare('SELECT * FROM materials ORDER BY category, id').all();
    },
    async create(data) {
      const db = await getDb();
      const r = db
        .prepare(`
          INSERT INTO materials (category, brand, model, full_description, unit, watt_or_capacity, price, warranty_months, warranty_note, qty_per_panel, quantity_stock, updated_at)
          VALUES (@category, @brand, @model, @full_description, @unit, @watt_or_capacity, @price, @warranty_months, @warranty_note, @qty_per_panel, @quantity_stock, datetime('now'))
        `)
        .run(normalizeMaterialInput(data));
      return db.prepare('SELECT * FROM materials WHERE id = ?').get(r.lastInsertRowid);
    },
    async update(id, data) {
      const db = await getDb();
      db.prepare(`
        UPDATE materials SET
          category=@category, brand=@brand, model=@model, full_description=@full_description,
          unit=@unit, watt_or_capacity=@watt_or_capacity, price=@price, warranty_months=@warranty_months,
          warranty_note=@warranty_note, qty_per_panel=@qty_per_panel, quantity_stock=@quantity_stock,
          updated_at=datetime('now')
        WHERE id=@id
      `).run({ ...normalizeMaterialInput(data), id });
      return db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
    },
    async remove(id) {
      const db = await getDb();
      db.prepare('DELETE FROM materials WHERE id = ?').run(id);
      return { ok: true };
    },
    async parseExcel() {
      const file = await pickFile('.xlsx,.xls,.csv');
      if (!file) return { canceled: true };
      const buffer = await readFileAsArrayBuffer(file);
      const parsed = excelImport.parseInventoryWorkbook(new Uint8Array(buffer));
      const db = await getDb();
      return {
        canceled: false,
        fileName: file.name,
        rows: excelImport.annotateMatches(db, parsed.rows),
        labor: parsed.labor,
        warnings: parsed.warnings,
      };
    },
    async importRows(payload) {
      const db = await getDb();
      return excelImport.importIntoDb(db, payload);
    },
    async downloadTemplate() {
      const wb = excelImport.buildTemplateWorkbook();
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const fileName = 'قالب_المخزون.xlsx';
      if (Capacitor.isNativePlatform()) {
        const write = await Filesystem.writeFile({
          path: fileName,
          directory: Directory.Cache,
          data: arrayBufferToBase64(buffer),
        });
        await Share.share({ title: fileName, files: [write.uri] });
        return { canceled: false };
      }
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      return { canceled: false };
    },
  },

  laborTiers: {
    async list() {
      const db = await getDb();
      return db.prepare('SELECT * FROM labor_tiers ORDER BY system_amps').all();
    },
    async create(data) {
      const db = await getDb();
      const r = db.prepare('INSERT INTO labor_tiers (system_amps, price, note) VALUES (?,?,?)').run(data.system_amps, data.price, data.note || null);
      return db.prepare('SELECT * FROM labor_tiers WHERE id = ?').get(r.lastInsertRowid);
    },
    async update(id, data) {
      const db = await getDb();
      db.prepare('UPDATE labor_tiers SET system_amps=?, price=?, note=? WHERE id=?').run(data.system_amps, data.price, data.note || null, id);
      return db.prepare('SELECT * FROM labor_tiers WHERE id = ?').get(id);
    },
    async remove(id) {
      const db = await getDb();
      db.prepare('DELETE FROM labor_tiers WHERE id = ?').run(id);
      return { ok: true };
    },
  },

  quotes: {
    async preview(input) {
      const db = await getDb();
      const options = quoteService.computeOptions(db, {
        roofAreaM2: input.roofAreaM2,
        ampDay: input.ampDay,
        ampNight: input.ampNight,
        nightSupplyHours: input.nightSupplyHours,
      });
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
      });
      return {
        options: {
          systemAmps: options.systemAmps,
          nightSupplyHours: options.nightSupplyHours,
          labor: options.labor,
          secondary: options.secondary,
          batteryTiers: options.batteryTiers,
          inverterTiers: options.inverterTiers,
        },
        draft,
      };
    },
    async save(input) {
      const db = await getDb();
      const options = quoteService.computeOptions(db, {
        roofAreaM2: input.roofAreaM2,
        ampDay: input.ampDay,
        ampNight: input.ampNight,
        nightSupplyHours: input.nightSupplyHours,
      });
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
      });
      const profile = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
      const defaultNotes = JSON.parse(profile.notes_default || '[]');
      const notes = [...(input.notes || defaultNotes), ...draft.warrantyNotes];
      return quoteService.saveQuote(db, {
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        location: input.location,
        roofAreaM2: input.roofAreaM2,
        ampDay: input.ampDay,
        ampNight: input.ampNight,
        tier: input.tier,
        draft,
        notes,
      });
    },
    async list() {
      const db = await getDb();
      return db.prepare('SELECT * FROM quotes ORDER BY id DESC').all();
    },
    async get(id) {
      const db = await getDb();
      const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      if (!quote) return null;
      const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order').all(id);
      const notes = db.prepare('SELECT * FROM quote_notes WHERE quote_id = ? ORDER BY sort_order').all(id);
      return { quote, items, notes };
    },
    async remove(id) {
      const db = await getDb();
      db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
      return { ok: true };
    },
    async exportPdf(id) {
      const db = await getDb();
      const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
      if (!quote) throw new Error('العرض غير موجود');
      const items = db
        .prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order')
        .all(id)
        .map((i) => ({ ...i, description: i.description_snapshot }));
      const notes = db.prepare('SELECT * FROM quote_notes WHERE quote_id = ? ORDER BY sort_order').all(id).map((n) => n.note_text);
      const company = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
      return exportInvoicePdf({ quote, items, notes, company, fileName: `عرض_سعر_${quote.quote_number}.pdf` });
    },
    async exportDraftPdf(input) {
      const db = await getDb();
      const options = quoteService.computeOptions(db, {
        roofAreaM2: input.roofAreaM2,
        ampDay: input.ampDay,
        ampNight: input.ampNight,
        nightSupplyHours: input.nightSupplyHours,
      });
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
      });
      const company = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
      const defaultNotes = JSON.parse(company.notes_default || '[]');
      const notes = [...(input.notes || defaultNotes), ...draft.warrantyNotes];
      const pseudoQuote = {
        quote_number: quoteService.nextQuoteNumber(db),
        client_name: input.clientName,
        client_phone: input.clientPhone,
        location: input.location,
        created_at: new Date().toISOString(),
        total_price: draft.total,
        required_amp_day: input.ampDay,
        required_amp_night: input.ampNight,
      };
      return exportInvoicePdf({ quote: pseudoQuote, items: draft.items, notes, company, fileName: 'عرض_سعر_معاينة.pdf' });
    },
  },

  settings: {
    async get() {
      const db = await getDb();
      return db.prepare('SELECT * FROM settings WHERE id = 1').get();
    },
    async update(data) {
      const db = await getDb();
      db.prepare(`
        UPDATE settings SET
          system_voltage=@system_voltage, peak_sun_hours=@peak_sun_hours, system_efficiency=@system_efficiency,
          inverter_safety_factor=@inverter_safety_factor, dod=@dod, night_coverage_hours=@night_coverage_hours,
          panel_area_m2=@panel_area_m2, currency=@currency, quote_number_start=@quote_number_start,
          panel_ref_amps=@panel_ref_amps, panel_ref_watt=@panel_ref_watt,
          charge_panels_per_battery=@charge_panels_per_battery, battery_charge_hours=@battery_charge_hours
        WHERE id = 1
      `).run(data);
      return db.prepare('SELECT * FROM settings WHERE id = 1').get();
    },
  },

  backup: {
    // تنزيل/مشاركة ملف النسخة الاحتياطية الكامل (المخزون + العروض + الإعدادات)
    async export() {
      const bytes = await exportDbBytes();
      const fileName = `نسخة_احتياطية_تسعير_${new Date().toISOString().slice(0, 10)}.db`;
      if (Capacitor.isNativePlatform()) {
        const write = await Filesystem.writeFile({
          path: fileName,
          directory: Directory.Cache,
          data: arrayBufferToBase64(bytes.buffer),
        });
        await Share.share({ title: fileName, files: [write.uri] });
        return { ok: true };
      }
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
      return { ok: true };
    },
    // استرجاع نسخة احتياطية من ملف .db (يستبدل كل البيانات الحالية)
    async import() {
      const file = await pickFile('.db,application/octet-stream');
      if (!file) return { canceled: true };
      const buffer = await readFileAsArrayBuffer(file);
      await importDbBytes(new Uint8Array(buffer));
      return { ok: true };
    },
  },

  company: {
    async get() {
      const db = await getDb();
      const row = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
      return {
        ...row,
        notes_default: JSON.parse(row.notes_default || '[]'),
        logo_data: row.logo_path && row.logo_path.startsWith('data:') ? row.logo_path : null,
      };
    },
    async update(data) {
      const db = await getDb();
      db.prepare(`
        UPDATE company_profile SET
          company_name=@company_name, company_name_en=@company_name_en, email=@email,
          phone1=@phone1, phone2=@phone2, manager_name=@manager_name, logo_path=@logo_path, notes_default=@notes_default
        WHERE id = 1
      `).run({
        company_name: data.company_name,
        company_name_en: data.company_name_en,
        email: data.email,
        phone1: data.phone1,
        phone2: data.phone2,
        manager_name: data.manager_name,
        logo_path: data.logo_path,
        notes_default: JSON.stringify(data.notes_default || []),
      });
      return api.company.get();
    },
    async pickLogo() {
      // على الموبايل نخزن الشعار كـ data URI داخل نفس عمود logo_path
      const file = await pickFile('image/png,image/jpeg');
      if (!file) return null;
      return readFileAsDataUrl(file);
    },
  },
};
