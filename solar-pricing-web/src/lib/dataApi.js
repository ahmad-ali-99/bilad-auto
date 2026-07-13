// طبقة البيانات السحابية — تعطي نفس شكل window.api القديم لكن فوق Supabase
// كل الدوال async؛ الصفحات المشتركة تناديها بنفس الطريقة بدون تعديل يُذكر.
import { supabase } from './supabase.js';
import * as quoteService from './quoteService.js';
import * as excelImport from './excelImport.js';
import { exportInvoicePdf } from './pdfExport.js';

function throwIf(error) {
  if (error) throw new Error(error.message || 'خطأ بالاتصال بقاعدة البيانات');
}

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
    input.click();
  });
}

const readArrayBuffer = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });

const readDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

function materialPayload(data) {
  return {
    category: data.category,
    brand: data.brand || null,
    model: data.model || null,
    full_description: data.full_description,
    unit: data.unit,
    watt_or_capacity: data.watt_or_capacity ?? null,
    price: Number(data.price) || 0,
    warranty_months: data.warranty_months ?? null,
    warranty_note: data.warranty_note || null,
    qty_per_panel: data.qty_per_panel ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function allMaterials() {
  const { data, error } = await supabase.from('materials').select('*').order('category').order('id');
  throwIf(error);
  return data || [];
}

async function nextQuoteNumber() {
  const [{ data: settings }, { data: maxRows }] = await Promise.all([
    supabase.from('settings').select('quote_number_start').eq('id', 1).single(),
    supabase.from('quotes').select('quote_number').order('quote_number', { ascending: false }).limit(1),
  ]);
  const start = settings?.quote_number_start ?? 7400;
  const maxNum = maxRows && maxRows.length ? maxRows[0].quote_number : 0;
  return Math.max((maxNum || 0) + 1, start);
}

export const api = {
  materials: {
    async list(category) {
      let q = supabase.from('materials').select('*').order('id');
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      throwIf(error);
      return data || [];
    },
    async create(data) {
      const { data: row, error } = await supabase.from('materials').insert(materialPayload(data)).select().single();
      throwIf(error);
      return row;
    },
    async update(id, data) {
      const { data: row, error } = await supabase.from('materials').update(materialPayload(data)).eq('id', id).select().single();
      throwIf(error);
      return row;
    },
    async remove(id) {
      const { error } = await supabase.from('materials').delete().eq('id', id);
      throwIf(error);
      return { ok: true };
    },
    async parseExcel() {
      const file = await pickFile('.xlsx,.xls,.csv');
      if (!file) return { canceled: true };
      const buffer = await readArrayBuffer(file);
      const parsed = excelImport.parseInventoryWorkbook(new Uint8Array(buffer));
      const existing = await allMaterials();
      return {
        canceled: false,
        fileName: file.name,
        rows: excelImport.annotateMatches(existing, parsed.rows),
        labor: parsed.labor,
        warnings: parsed.warnings,
      };
    },
    async importRows({ materials = [], labor = [] }) {
      const existing = await allMaterials();
      let added = 0;
      let updated = 0;
      for (const raw of materials) {
        const m = excelImport.normalizeImportedMaterial(raw);
        const match = excelImport.findExistingMaterial(existing, m);
        if (match) {
          const { error } = await supabase.from('materials').update({ ...m, updated_at: new Date().toISOString() }).eq('id', match.id);
          throwIf(error);
          updated++;
        } else {
          const { error } = await supabase.from('materials').insert(m);
          throwIf(error);
          added++;
        }
      }
      let laborAdded = 0;
      let laborUpdated = 0;
      if (labor.length) {
        const { data: existingLabor } = await supabase.from('labor_tiers').select('*');
        for (const l of labor) {
          const match = (existingLabor || []).find((x) => x.system_amps === l.system_amps);
          if (match) {
            const { error } = await supabase.from('labor_tiers').update({ price: l.price, note: l.note || null }).eq('id', match.id);
            throwIf(error);
            laborUpdated++;
          } else {
            const { error } = await supabase.from('labor_tiers').insert({ system_amps: l.system_amps, price: l.price, note: l.note || null });
            throwIf(error);
            laborAdded++;
          }
        }
      }
      return { added, updated, laborAdded, laborUpdated };
    },
    async downloadTemplate() {
      const XLSX = await import('xlsx');
      const wb = excelImport.buildTemplateWorkbook();
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'قالب_المخزون.xlsx';
      a.click();
      URL.revokeObjectURL(a.href);
      return { canceled: false };
    },
  },

  laborTiers: {
    async list() {
      const { data, error } = await supabase.from('labor_tiers').select('*').order('system_amps');
      throwIf(error);
      return data || [];
    },
    async create(data) {
      const { data: row, error } = await supabase.from('labor_tiers').insert({ system_amps: data.system_amps, price: data.price, note: data.note || null }).select().single();
      throwIf(error);
      return row;
    },
    async update(id, data) {
      const { data: row, error } = await supabase.from('labor_tiers').update({ system_amps: data.system_amps, price: data.price, note: data.note || null }).eq('id', id).select().single();
      throwIf(error);
      return row;
    },
    async remove(id) {
      const { error } = await supabase.from('labor_tiers').delete().eq('id', id);
      throwIf(error);
      return { ok: true };
    },
  },

  quotes: {
    // إعدادات التقسيط المصرفي المشتركة (نسبة الفائدة كمعامل ضرب + عدد الأشهر) —
    // تتعدل من صفحة الإعدادات وتنسحب تلقائياً على كل عرض مؤشر عليه التقسيط
    async _installment(input) {
      if (!input.installment) return null;
      const cfg = await api.config.get('installment');
      return {
        enabled: true,
        rate: Number(cfg?.rate) > 0 ? Number(cfg.rate) : 1.35,
        months: Number(cfg?.months) > 0 ? Number(cfg.months) : 60,
      };
    },
    async _adjustments(input) {
      return { ...(input.adjustments || {}), installment: await this._installment(input) };
    },
    async _options(input) {
      const [materials, { data: laborTiers }, { data: settingsRow }, batteryFactors] = await Promise.all([
        allMaterials(),
        supabase.from('labor_tiers').select('*'),
        supabase.from('settings').select('*').eq('id', 1).single(),
        // معاملات أمان البطاريات لكل مستوى — من الإعدادات المشتركة (وإلا الافتراضي بالمحرك)
        api.config.get('battery_factors'),
      ]);
      return quoteService.buildOptions({
        materials,
        laborTiers: laborTiers || [],
        settingsRow,
        roofAreaM2: input.roofAreaM2,
        ampDay: input.ampDay,
        ampNight: input.ampNight,
        nightSupplyHours: input.nightSupplyHours,
        batteryFactors: batteryFactors || null,
      });
    },
    async preview(input) {
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
        secondarySelections: input.secondarySelections || null,
        adjustments: await this._adjustments(input),
        extraUnits: input.extraUnits || null,
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
    // كشف تكرار العرض: هل يوجد عرض محفوظ بنفس اسم العميل ورقم الموبايل؟
    // فحص حي أثناء الكتابة: هل اكو عرض سابق لنفس الاسم أو نفس رقم الهاتف؟
    // المطابقة محلية ومرنة: الأرقام تقارن كأرقام فقط (نتجاهل المسافات والرموز ونحول
    // الأرقام العربية)، وتنطبق حتى لو المكتوب جزء من بداية الرقم المخزن أو العكس؛
    // والأسماء تتطابق مع تجاهل فروقات الهمزة والمسافات. نستثني المحذوفة.
    async findClientMatch({ clientName, clientPhone }) {
      const toDigits = (s) =>
        String(s || '')
          .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
          .replace(/\D/g, '');
      const normName = (s) => String(s || '').trim().replace(/\s+/g, ' ').replace(/[أإآ]/g, 'ا');
      const digits = toDigits(clientPhone);
      const name = normName(clientName);
      if (name.length < 3 && digits.length < 8) return null;

      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, client_name, client_phone, created_at, total_price, deleted_at')
        .order('id', { ascending: false })
        .limit(1000);
      throwIf(error);
      return (
        (data || []).find((q) => {
          if (q.deleted_at) return false;
          const qDigits = toDigits(q.client_phone);
          const phoneHit =
            digits.length >= 8 &&
            qDigits.length >= 8 &&
            (qDigits === digits || qDigits.startsWith(digits) || digits.startsWith(qDigits));
          const nameHit = name.length >= 3 && normName(q.client_name) === name;
          return phoneHit || nameHit;
        }) || null
      );
    },
    async findDuplicate({ clientName, clientPhone }) {
      if (!clientName && !clientPhone) return null;
      let q = supabase.from('quotes').select('id, quote_number, created_at, total_price').order('id', { ascending: false }).limit(1);
      if (clientName) q = q.eq('client_name', clientName);
      if (clientPhone) q = q.eq('client_phone', clientPhone);
      const { data, error } = await q;
      throwIf(error);
      return data && data.length ? data[0] : null;
    },
    // نسبة الزيادة/الخصم تنحفظ لكل عرض بجدول app_config (مفتاح quote_adj_<id>)
    // حتى ترجع بوضع التعديل حتى لو كانت الزيادة موزعة (مخفية) بدون سطر ظاهر
    async _saveAdjustments(quoteId, adjustments, extraUnits) {
      const a = adjustments || {};
      const x = extraUnits || {};
      const hasExtra = ['panel', 'battery', 'inverter'].some((k) => (Number(x[k]) || 0) !== 0);
      const active =
        (Number(a.markupPercent) || 0) > 0 || (Number(a.discountPercent) || 0) > 0 || a.installment?.enabled || hasExtra;
      try {
        await api.config.set(`quote_adj_${quoteId}`, active ? {
          markupPercent: Number(a.markupPercent) || 0,
          markupMode: a.markupMode === 'distributed' ? 'distributed' : 'visible',
          discountPercent: Number(a.discountPercent) || 0,
          // لقطة نسبة الفائدة والأشهر وقت الحفظ — تغيير الإعدادات لاحقاً لا يغير العروض المحفوظة
          installment: a.installment?.enabled
            ? { enabled: true, rate: Number(a.installment.rate) || 1.35, months: Number(a.installment.months) || 60 }
            : null,
          // الزيادة/النقصان اليدوي بالوحدات — يرجع بوضع التعديل
          extraUnits: hasExtra
            ? { panel: Number(x.panel) || 0, battery: Number(x.battery) || 0, inverter: Number(x.inverter) || 0 }
            : null,
        } : null);
      } catch {
        /* جدول app_config اختياري — فشله لا يمنع حفظ العرض نفسه */
      }
    },
    async save(input) {
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
        secondarySelections: input.secondarySelections || null,
        adjustments: await this._adjustments(input),
        extraUnits: input.extraUnits || null,
      });
      const { data: profile } = await supabase.from('company_profile').select('notes_default').eq('id', 1).single();
      const defaultNotes = Array.isArray(profile?.notes_default) ? profile.notes_default : JSON.parse(profile?.notes_default || '[]');
      const notes = [...(input.notes || defaultNotes), ...draft.warrantyNotes];
      const quote_number = await nextQuoteNumber();
      const { data: { user } } = await supabase.auth.getUser();

      const { data: quote, error } = await supabase.from('quotes').insert({
        quote_number,
        client_name: input.clientName || null,
        client_phone: input.clientPhone || null,
        location: input.location || null,
        roof_area_m2: input.roofAreaM2,
        required_amp_day: input.ampDay,
        required_amp_night: input.ampNight,
        night_supply_hours: options.nightSupplyHours,
        selected_tier: input.tier,
        total_price: draft.total,
        created_by: user?.user_metadata?.username || user?.email || null,
      }).select().single();
      throwIf(error);

      const itemsPayload = draft.items.map((item, idx) => ({
        quote_id: quote.id,
        material_id: item.material_id,
        description_snapshot: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        sort_order: idx,
      }));
      throwIf((await supabase.from('quote_items').insert(itemsPayload)).error);

      const notesPayload = notes.map((note_text, idx) => ({ quote_id: quote.id, note_text, sort_order: idx }));
      if (notesPayload.length) throwIf((await supabase.from('quote_notes').insert(notesPayload)).error);

      await this._saveAdjustments(quote.id, await this._adjustments(input), input.extraUnits);
      return quote;
    },
    // تحديث عرض محفوظ بمدخلات جديدة: نفس الرقم وتاريخ الإنشاء والمرفق، وبنود وملاحظات جديدة
    async update(id, input) {
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
        secondarySelections: input.secondarySelections || null,
        adjustments: await this._adjustments(input),
        extraUnits: input.extraUnits || null,
      });
      const notes = [...(input.notes || []), ...draft.warrantyNotes];

      const { data: quote, error } = await supabase
        .from('quotes')
        .update({
          client_name: input.clientName || null,
          client_phone: input.clientPhone || null,
          location: input.location || null,
          roof_area_m2: input.roofAreaM2,
          required_amp_day: input.ampDay,
          required_amp_night: input.ampNight,
          night_supply_hours: options.nightSupplyHours,
          selected_tier: input.tier,
          total_price: draft.total,
        })
        .eq('id', id)
        .select()
        .single();
      throwIf(error);

      throwIf((await supabase.from('quote_items').delete().eq('quote_id', id)).error);
      throwIf((await supabase.from('quote_notes').delete().eq('quote_id', id)).error);

      const itemsPayload = draft.items.map((item, idx) => ({
        quote_id: id,
        material_id: item.material_id,
        description_snapshot: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        sort_order: idx,
      }));
      throwIf((await supabase.from('quote_items').insert(itemsPayload)).error);
      const notesPayload = notes.map((note_text, idx) => ({ quote_id: id, note_text, sort_order: idx }));
      if (notesPayload.length) throwIf((await supabase.from('quote_notes').insert(notesPayload)).error);

      await this._saveAdjustments(id, await this._adjustments(input), input.extraUnits);
      return quote;
    },
    async list() {
      const { data, error } = await supabase.from('quotes').select('*').order('id', { ascending: false });
      throwIf(error);
      // نستثني المحذوفة (سلة المهملات) — الفلترة محلية حتى تشتغل حتى قبل إضافة العمود
      return (data || []).filter((q) => !q.deleted_at);
    },
    // سلة المحذوفات: آخر أسبوع فقط، مع تنظيف نهائي تلقائي للأقدم من 7 أيام
    async listDeleted() {
      const { data, error } = await supabase.from('quotes').select('*').order('id', { ascending: false });
      throwIf(error);
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const deleted = (data || []).filter((q) => q.deleted_at);
      const expired = deleted.filter((q) => new Date(q.deleted_at).getTime() < weekAgo);
      if (expired.length) {
        // البنود والملاحظات تنحذف تلقائياً معها (on delete cascade)
        supabase.from('quotes').delete().in('id', expired.map((q) => q.id)).then(() => {});
      }
      return deleted.filter((q) => new Date(q.deleted_at).getTime() >= weekAgo);
    },
    async restore(id) {
      const { error } = await supabase.from('quotes').update({ deleted_at: null, deleted_by: null }).eq('id', id);
      throwIf(error);
      return { ok: true };
    },
    // إرفاق ملف تصميم (صورة أو PDF) بالعرض — يخزن base64 ويتصدر مع ملف العرض
    async setAttachment(id, { name, data }) {
      const { error } = await supabase.from('quotes').update({ attachment_name: name, attachment_data: data }).eq('id', id);
      throwIf(error);
      return { ok: true };
    },
    async removeAttachment(id) {
      const { error } = await supabase.from('quotes').update({ attachment_name: null, attachment_data: null }).eq('id', id);
      throwIf(error);
      return { ok: true };
    },
    async get(id) {
      const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
      if (!quote) return null;
      const [{ data: items }, { data: notes }] = await Promise.all([
        supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('quote_notes').select('*').eq('quote_id', id).order('sort_order'),
      ]);
      return { quote, items: items || [], notes: notes || [] };
    },
    async remove(id) {
      // حذف ناعم: يروح لسلة المحذوفات مع تسجيل منو حذفه، ويمكن استرداده خلال أسبوع
      const { data: { user } } = await supabase.auth.getUser();
      const username = user?.user_metadata?.username || user?.email || 'غير معروف';
      const { error } = await supabase
        .from('quotes')
        .update({ deleted_at: new Date().toISOString(), deleted_by: username })
        .eq('id', id);
      throwIf(error);
      return { ok: true };
    },
    async exportPdf(id) {
      const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
      if (!quote) throw new Error('العرض غير موجود');
      const [{ data: items }, { data: notes }, { data: company }, savedAdj] = await Promise.all([
        supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('quote_notes').select('*').eq('quote_id', id).order('sort_order'),
        supabase.from('company_profile').select('*').eq('id', 1).single(),
        api.config.get(`quote_adj_${id}`).catch(() => null),
      ]);
      // التقسيط انحفظ مع العرض بنسبته وأشهره وقت الحفظ — نعيد حسابه من مجموع العرض
      let installment = null;
      const inst = savedAdj?.installment;
      if (inst?.enabled && Number(inst.rate) > 0) {
        const months = Math.max(1, Math.round(Number(inst.months) || 60));
        const totalWithInterest = Math.round(quote.total_price * Number(inst.rate));
        installment = { rate: Number(inst.rate), months, totalWithInterest, monthly: Math.round(totalWithInterest / months) };
      }
      return exportInvoicePdf({
        installment,
        quote,
        items: (items || []).map((i) => ({ ...i, description: i.description_snapshot })),
        notes: (notes || []).map((n) => n.note_text),
        company,
        fileName: `عرض_سعر_${quote.quote_number}.pdf`,
        attachment: quote.attachment_data ? { name: quote.attachment_name, data: quote.attachment_data } : null,
      });
    },
    async exportDraftPdf(input) {
      const options = await this._options(input);
      const draft = quoteService.buildQuoteDraft(options, {
        tier: input.tier,
        overrides: input.overrides || {},
        cableMeters: input.cableMeters || {},
        secondarySelections: input.secondarySelections || null,
        adjustments: await this._adjustments(input),
        extraUnits: input.extraUnits || null,
      });
      const { data: company } = await supabase.from('company_profile').select('*').eq('id', 1).single();
      const defaultNotes = Array.isArray(company?.notes_default) ? company.notes_default : JSON.parse(company?.notes_default || '[]');
      const notes = [...(input.notes || defaultNotes), ...draft.warrantyNotes];
      const pseudoQuote = {
        quote_number: await nextQuoteNumber(),
        client_name: input.clientName,
        client_phone: input.clientPhone,
        location: input.location,
        created_at: new Date().toISOString(),
        total_price: draft.total,
        required_amp_day: input.ampDay,
        required_amp_night: input.ampNight,
      };
      return exportInvoicePdf({ quote: pseudoQuote, items: draft.items, notes, company, fileName: 'عرض_سعر_معاينة.pdf', installment: draft.installment });
    },
  },

  // إعدادات مشتركة خفيفة (key/value بجدول app_config) — مثل الثانوية الافتراضية الدائمة
  config: {
    async get(key) {
      try {
        const { data } = await supabase.from('app_config').select('value').eq('key', key).maybeSingle();
        return data && data.value != null ? JSON.parse(data.value) : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      const { error } = await supabase.from('app_config').upsert({ key, value: JSON.stringify(value) });
      throwIf(error);
      return { ok: true };
    },
  },

  settings: {
    async get() {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      throwIf(error);
      return data;
    },
    async update(data) {
      const payload = { ...data };
      delete payload.id;
      const { data: row, error } = await supabase.from('settings').update(payload).eq('id', 1).select().single();
      throwIf(error);
      return row;
    },
  },

  company: {
    async get() {
      const { data, error } = await supabase.from('company_profile').select('*').eq('id', 1).single();
      throwIf(error);
      const notes = Array.isArray(data.notes_default) ? data.notes_default : JSON.parse(data.notes_default || '[]');
      return { ...data, notes_default: notes, logo_data: data.logo_path && data.logo_path.startsWith('data:') ? data.logo_path : null };
    },
    async update(data) {
      const { data: row, error } = await supabase.from('company_profile').update({
        company_name: data.company_name,
        company_name_en: data.company_name_en,
        email: data.email,
        phone1: data.phone1,
        phone2: data.phone2,
        manager_name: data.manager_name,
        logo_path: data.logo_path,
        notes_default: data.notes_default || [],
      }).eq('id', 1).select().single();
      throwIf(error);
      return { ...row, notes_default: Array.isArray(row.notes_default) ? row.notes_default : JSON.parse(row.notes_default || '[]') };
    },
    async pickLogo() {
      const file = await pickFile('image/png,image/jpeg');
      if (!file) return null;
      return readDataUrl(file);
    },
  },
};
