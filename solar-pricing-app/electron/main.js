const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { openDb } = require('./db');
const quoteService = require('./lib/quoteService');
const { buildInvoiceHtml, logoDataUri } = require('./lib/invoiceTemplate');

const isDev = process.env.NODE_ENV === 'development';
let db;
let mainWindow;

function getAssetsDir() {
  return app.isPackaged ? path.join(process.resourcesPath, 'assets') : path.join(__dirname, '..', 'assets');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  db = openDb(app.getPath('userData'));
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function registerIpcHandlers() {
  // ---------- المواد ----------
  ipcMain.handle('materials:list', (_e, category) => {
    if (category) return db.prepare('SELECT * FROM materials WHERE category = ? ORDER BY id').all(category);
    return db.prepare('SELECT * FROM materials ORDER BY category, id').all();
  });

  ipcMain.handle('materials:create', (_e, data) => {
    const stmt = db.prepare(`
      INSERT INTO materials (category, brand, model, full_description, unit, watt_or_capacity, price, warranty_months, warranty_note, qty_per_panel, quantity_stock, updated_at)
      VALUES (@category, @brand, @model, @full_description, @unit, @watt_or_capacity, @price, @warranty_months, @warranty_note, @qty_per_panel, @quantity_stock, datetime('now'))
    `);
    const result = stmt.run(normalizeMaterialInput(data));
    return db.prepare('SELECT * FROM materials WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('materials:update', (_e, id, data) => {
    const stmt = db.prepare(`
      UPDATE materials SET
        category=@category, brand=@brand, model=@model, full_description=@full_description,
        unit=@unit, watt_or_capacity=@watt_or_capacity, price=@price, warranty_months=@warranty_months,
        warranty_note=@warranty_note, qty_per_panel=@qty_per_panel, quantity_stock=@quantity_stock,
        updated_at=datetime('now')
      WHERE id=@id
    `);
    stmt.run({ ...normalizeMaterialInput(data), id });
    return db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  });

  ipcMain.handle('materials:remove', (_e, id) => {
    db.prepare('DELETE FROM materials WHERE id = ?').run(id);
    return { ok: true };
  });

  // ---------- أجور العمل ----------
  ipcMain.handle('labor:list', () => db.prepare('SELECT * FROM labor_tiers ORDER BY system_amps').all());
  ipcMain.handle('labor:create', (_e, data) => {
    const r = db.prepare('INSERT INTO labor_tiers (system_amps, price, note) VALUES (?,?,?)').run(data.system_amps, data.price, data.note || null);
    return db.prepare('SELECT * FROM labor_tiers WHERE id = ?').get(r.lastInsertRowid);
  });
  ipcMain.handle('labor:update', (_e, id, data) => {
    db.prepare('UPDATE labor_tiers SET system_amps=?, price=?, note=? WHERE id=?').run(data.system_amps, data.price, data.note || null, id);
    return db.prepare('SELECT * FROM labor_tiers WHERE id = ?').get(id);
  });
  ipcMain.handle('labor:remove', (_e, id) => {
    db.prepare('DELETE FROM labor_tiers WHERE id = ?').run(id);
    return { ok: true };
  });

  // ---------- العروض ----------
  ipcMain.handle('quotes:preview', (_e, input) => {
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
    return { options: serializeOptions(options), draft };
  });

  ipcMain.handle('quotes:save', (_e, input) => {
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
    const savedQuote = quoteService.saveQuote(db, {
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
    return savedQuote;
  });

  ipcMain.handle('quotes:list', () => db.prepare('SELECT * FROM quotes ORDER BY id DESC').all());

  ipcMain.handle('quotes:get', (_e, id) => {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) return null;
    const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order').all(id);
    const notes = db.prepare('SELECT * FROM quote_notes WHERE quote_id = ? ORDER BY sort_order').all(id);
    return { quote, items, notes };
  });

  ipcMain.handle('quotes:remove', (_e, id) => {
    db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
    return { ok: true };
  });

  ipcMain.handle('quotes:exportPdf', async (_e, id) => {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) throw new Error('العرض غير موجود');
    const items = db
      .prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort_order')
      .all(id)
      .map((i) => ({ ...i, description: i.description_snapshot }));
    const notesRows = db.prepare('SELECT * FROM quote_notes WHERE quote_id = ? ORDER BY sort_order').all(id);
    const company = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();

    const html = buildInvoiceHtml({ quote, items, notes: notesRows.map((n) => n.note_text), company, assetsDir: getAssetsDir() });
    return renderPdfToFile(html, `عرض_سعر_${quote.quote_number}.pdf`);
  });

  // تصدير PDF مباشرة من المعاينة الحالية بدون حفظ العرض بقائمة العروض المحفوظة
  ipcMain.handle('quotes:exportDraftPdf', async (_e, input) => {
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
    const previewNumber = quoteService.nextQuoteNumber(db);

    const pseudoQuote = {
      quote_number: previewNumber,
      client_name: input.clientName,
      client_phone: input.clientPhone,
      location: input.location,
      created_at: new Date().toISOString(),
      total_price: draft.total,
      required_amp_day: input.ampDay,
      required_amp_night: input.ampNight,
    };

    const html = buildInvoiceHtml({ quote: pseudoQuote, items: draft.items, notes, company: profile, assetsDir: getAssetsDir() });
    return renderPdfToFile(html, `عرض_سعر_معاينة.pdf`);
  });

  async function renderPdfToFile(html, defaultFilename) {
    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ عرض السعر PDF',
      defaultPath: defaultFilename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { canceled: true };

    const pdfWindow = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await pdfWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      landscape: false,
      margins: { marginType: 'none' },
    });
    fs.writeFileSync(filePath, pdfBuffer);
    pdfWindow.destroy();
    return { canceled: false, filePath };
  }

  // ---------- الإعدادات ----------
  ipcMain.handle('settings:get', () => db.prepare('SELECT * FROM settings WHERE id = 1').get());
  ipcMain.handle('settings:update', (_e, data) => {
    db.prepare(
      `UPDATE settings SET
        system_voltage=@system_voltage, peak_sun_hours=@peak_sun_hours, system_efficiency=@system_efficiency,
        inverter_safety_factor=@inverter_safety_factor, dod=@dod, night_coverage_hours=@night_coverage_hours,
        panel_area_m2=@panel_area_m2, currency=@currency, quote_number_start=@quote_number_start,
        panel_ref_amps=@panel_ref_amps, panel_ref_watt=@panel_ref_watt,
        charge_panels_per_battery=@charge_panels_per_battery, battery_charge_hours=@battery_charge_hours
      WHERE id = 1`
    ).run(data);
    return db.prepare('SELECT * FROM settings WHERE id = 1').get();
  });

  // ---------- بيانات الشركة ----------
  ipcMain.handle('company:get', () => {
    const row = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
    return {
      ...row,
      notes_default: JSON.parse(row.notes_default || '[]'),
      logo_data: logoDataUri(row.logo_path), // CSP بالواجهة يمنع file:// فنرسل الشعار كـ data URI
    };
  });
  ipcMain.handle('company:update', (_e, data) => {
    db.prepare(
      `UPDATE company_profile SET
        company_name=@company_name, company_name_en=@company_name_en, email=@email,
        phone1=@phone1, phone2=@phone2, manager_name=@manager_name, logo_path=@logo_path, notes_default=@notes_default
      WHERE id = 1`
    ).run({ ...data, notes_default: JSON.stringify(data.notes_default || []) });
    const row = db.prepare('SELECT * FROM company_profile WHERE id = 1').get();
    return { ...row, notes_default: JSON.parse(row.notes_default || '[]') };
  });
  ipcMain.handle('company:pickLogo', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: 'اختر شعار الشركة',
      filters: [{ name: 'صور', extensions: ['png', 'jpg', 'jpeg'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });
}

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

function serializeOptions(options) {
  // نرسل فقط ما تحتاجه الواجهة (قوائم البدائل)، بدون كائنات دالة
  // ملاحظة: توليفات الألواح تعتمد على البطارية المختارة فتُرسل داخل draft.panelTiers وليس هنا
  return {
    systemAmps: options.systemAmps,
    nightSupplyHours: options.nightSupplyHours,
    labor: options.labor,
    secondary: options.secondary,
    batteryTiers: options.batteryTiers,
    inverterTiers: options.inverterTiers,
  };
}
