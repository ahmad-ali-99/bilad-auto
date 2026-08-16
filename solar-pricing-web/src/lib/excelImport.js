// استيراد المخزون من ملفات Excel جاهزة (بأي تنسيق) — وحدة منطقية قابلة للاختبار
// الفكرة: نفهم الأعمدة من مسمياتها المتنوعة، ونستنتج فئة كل صف من نصوصه إذا ما كان فيه عمود فئة،
// ونرجّع صفوف "مقترحة" تُعرض للمستخدم بشاشة معاينة يعدّل عليها قبل الحفظ الفعلي.
//
// قاعدة التحديث/الإضافة (مهمة): المادة تعتبر "نفسها" فقط إذا تطابقت الفئة + الموديل + السعة/القدرة —
// بطارية COSPOWER 16kWh وبطارية COSPOWER 6kWh مادتان مختلفتان حتى لو نفس الموديل.
import * as XLSX from 'xlsx';

const COLUMN_ALIASES = {
  category: ['الفئة', 'الفئه', 'النوع', 'التصنيف', 'الصنف', 'category', 'type'],
  brand: ['الماركة', 'الماركه', 'العلامة', 'المنشأ', 'brand'],
  model: ['الموديل', 'اسم المادة', 'اسم الماده', 'المادة', 'الماده', 'الاسم', 'البيان', 'model', 'name', 'item'],
  full_description: ['الوصف التفصيلي', 'الوصف الكامل', 'الوصف', 'التفاصيل', 'المواصفات', 'description'],
  unit: ['الوحدة', 'الوحده', 'وحدة القياس', 'unit'],
  watt_or_capacity: ['القدرة او السعة', 'القدرة أو السعة', 'القدرة', 'القدره', 'السعة', 'السعه', 'الواطية', 'الواطيه', 'واط', 'capacity', 'watt', 'kwh', 'power'],
  price: ['سعر الوحدة', 'سعر المفرد', 'السعر', 'سعر البيع', 'سعر', 'price', 'cost'],
  warranty_months: ['الضمان (شهر)', 'الضمان بالشهور', 'الضمان', 'ضمان', 'warranty'],
  warranty_note: ['ملاحظة الضمان', 'ملاحظه الضمان', 'نص الضمان'],
  qty_per_panel: ['الكمية لكل لوح', 'الكميه لكل لوح', 'لكل لوح'],
  quantity_stock: ['الكمية بالمخزون', 'الكمية المتوفرة', 'الكمية المتوفره', 'المخزون', 'الكمية', 'الكميه', 'العدد المتوفر', 'stock', 'qty', 'quantity'],
};

const CATEGORY_ALIASES = {
  panel: ['لوح', 'ألواح', 'الواح', 'لوحة', 'بانل', 'panel'],
  battery: ['بطارية', 'بطاريه', 'بطاريات', 'battery'],
  inverter: ['انفيرتر', 'انفرتر', 'إنفيرتر', 'عاكس', 'inverter'],
  secondary: ['ثانوية', 'ثانوي', 'مواد ثانوية', 'ملحقات', 'اخرى', 'أخرى', 'secondary'],
};

function normalizeCell(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normText(value) {
  return normalizeCell(value).toLowerCase().replace(/\s+/g, ' ');
}

function matchCategoryLabel(value) {
  const v = normText(value);
  if (!v) return null;
  for (const [key, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((a) => v === a || v.includes(a))) return key;
  }
  return null;
}

// استنتاج الفئة من نصوص الصف — الترتيب مهم: المواد الثانوية أولاً لأن أوصافها
// كثيراً تذكر "الألواح" و"الانفيرتر" (هيكل الألواح، كيبل من الألواح للانفيرتر...)
function inferCategoryFromText(text) {
  const t = normText(text);
  if (!t) return null;
  if (/هيكل|صبات|صبة|كيبل|كابل|كيبلات|بورد|حماية|قواعد|مثبت|براكيت|استاند|ستاند|cable|structure|mount/.test(t)) return 'secondary';
  if (/انفيرتر|انفرتر|إنفيرتر|عاكس|inverter/.test(t)) return 'inverter';
  if (/بطاري|ليثيوم|lithium|battery|kwh|امبير ساعة/.test(t)) return 'battery';
  if (/لوح|ألواح|الواح|بانل|panel|solar|شمسي/.test(t)) return 'panel';
  return null;
}

// استخراج القدرة/السعة من النص: "650W"، "650 واط"، "6 كيلو واط"، "16kwh"
function extractCapacityFromText(text, category) {
  const t = normText(text);
  if (!t) return null;
  const kwhMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:kwh|كيلو ?واط ?ساع|ك\.?و\.?س)/);
  if (kwhMatch) return Number(kwhMatch[1]);
  const kwMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:kw|كيلو ?واط|كيلو)/);
  if (kwMatch) {
    const n = Number(kwMatch[1]);
    if (category === 'battery') return n; // بطارية "16 كيلو" يقصد بها kWh عادة
    return n * 1000; // انفيرتر 6kW = 6000 واط
  }
  const wMatch = t.match(/(\d{3,4})\s*(?:w\b|واط)/);
  if (wMatch) return Number(wMatch[1]);
  return null;
}

function mapColumns(headerRow) {
  const mapping = {};
  headerRow.forEach((header, idx) => {
    const h = normText(header);
    if (!h) return;
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (mapping[field] != null) continue;
      if (aliases.some((a) => h === a.toLowerCase() || h.includes(a.toLowerCase()))) {
        mapping[field] = idx;
        break;
      }
    }
  });
  return mapping;
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[,،\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// هل الصف صف عناوين؟ (أغلبه نصوص لا أرقام)
function looksLikeHeader(row) {
  const cells = row.map(normalizeCell).filter(Boolean);
  if (cells.length === 0) return false;
  const numericCount = cells.filter((c) => parseNumber(c) != null).length;
  return numericCount < cells.length / 2;
}

// السعر بدون عمود واضح: أكبر رقم بالصف (الأسعار العراقية بالآلاف — أكبر من الواطية والكميات)
function guessPriceFromRow(row) {
  let best = null;
  for (const cell of row) {
    const n = parseNumber(cell);
    if (n != null && n >= 1000 && (best == null || n > best)) best = n;
  }
  return best;
}

// يحلل ملف Excel (Buffer) ويرجع صفوف مقترحة للمعاينة
function parseInventoryWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const warnings = [];
  const rows = [];
  const laborRows = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (data.length === 0) continue;

    // ورقة أجور عمل؟
    if (/أجور|اجور|عمل|labor/i.test(sheetName)) {
      const start = looksLikeHeader(data[0]) ? 1 : 0;
      data.slice(start).forEach((row, i) => {
        if (row.every((c) => normalizeCell(c) === '')) return;
        const amps = parseNumber(row[0]);
        const price = parseNumber(row[1]);
        if (amps == null || price == null) {
          warnings.push(`ورقة "${sheetName}" سطر ${i + start + 1}: تجاهلت الصف — الحجم أو السعر غير مفهوم`);
          return;
        }
        laborRows.push({ system_amps: amps, price, note: normalizeCell(row[2]) || null });
      });
      continue;
    }

    const hasHeader = looksLikeHeader(data[0]);
    const mapping = hasHeader ? mapColumns(data[0]) : {};
    const startIdx = hasHeader ? 1 : 0;

    data.slice(startIdx).forEach((row, i) => {
      const rowNum = i + startIdx + 1;
      if (row.every((c) => normalizeCell(c) === '')) return;

      const get = (field) => (mapping[field] != null ? row[mapping[field]] : '');
      const issues = [];

      // الموديل والوصف — إذا ما فيه أعمدة معروفة ناخذ أطول خلية نصية كوصف
      let model = normalizeCell(get('model'));
      let description = normalizeCell(get('full_description'));
      if (!model && !description) {
        const textCells = row.map(normalizeCell).filter((c) => c && parseNumber(c) == null);
        if (textCells.length === 0) return; // صف أرقام فقط — نتجاهله
        description = [...textCells].sort((a, b) => b.length - a.length)[0];
        model = description.slice(0, 40);
      }
      if (!model) model = description.slice(0, 40);
      if (!description) description = model;

      // الفئة: من عمود الفئة إن وجد، وإلا من النص
      const combinedText = `${normalizeCell(get('brand'))} ${model} ${description}`;
      let category = matchCategoryLabel(get('category')) || inferCategoryFromText(combinedText);
      if (!category) {
        category = 'secondary';
        issues.push('ما تحددت الفئة تلقائياً — افترضتها "ثانوية"، صححها إذا غلط');
      }

      // السعر
      let price = parseNumber(get('price'));
      if (price == null) {
        price = guessPriceFromRow(row);
        if (price != null) issues.push('السعر مخمّن من أكبر رقم بالصف — تأكد منه');
      }
      if (price == null) {
        issues.push('ما انلكه سعر — أدخله يدوياً');
        price = 0;
      }

      // القدرة/السعة
      let capacity = parseNumber(get('watt_or_capacity'));
      if (capacity == null) capacity = extractCapacityFromText(combinedText, category);
      if ((category === 'panel' || category === 'inverter' || category === 'battery') && (capacity == null || capacity <= 0)) {
        issues.push('القدرة/السعة ناقصة — مطلوبة لهذه الفئة');
      }

      // الوحدة
      let unit = 'عدد';
      const unitText = normText(get('unit'));
      if (unitText.includes('متر') || unitText === 'م' || unitText === 'm') unit = 'متر';
      else if (unitText.includes('قطعي')) unit = 'قطعي';
      else if (category === 'secondary' && /كيبل|كابل|cable/.test(normText(combinedText))) unit = 'متر';
      if (category !== 'secondary') unit = 'عدد';

      rows.push({
        category,
        brand: normalizeCell(get('brand')) || null,
        model,
        full_description: description,
        unit,
        watt_or_capacity: capacity,
        price,
        warranty_months: parseNumber(get('warranty_months')),
        warranty_note: normalizeCell(get('warranty_note')) || null,
        qty_per_panel: parseNumber(get('qty_per_panel')),
        sourceRow: `${sheetName} - سطر ${rowNum}`,
        issues,
      });
    });
  }

  if (rows.length === 0 && laborRows.length === 0) {
    warnings.push('ما انلكه أي صف بيانات مفهوم بالملف');
  }

  return { rows, labor: laborRows, warnings };
}

// المادة المطابقة بمصفوفة المواد الحالية: الفئة + الموديل + السعة (للرئيسية) أو الفئة + الموديل + الوحدة (للثانوية)
function findExistingMaterial(existingMaterials, material) {
  if (material.category === 'secondary') {
    return existingMaterials.find(
      (m) => m.category === 'secondary' && m.model === material.model && (m.unit || 'عدد') === (material.unit || 'عدد')
    );
  }
  return existingMaterials.find(
    (m) => m.category === material.category && m.model === material.model && (m.watt_or_capacity ?? null) === (material.watt_or_capacity ?? null)
  );
}

// مرشحات «نفس المادة باسم ثاني»: نفس الفئة ونفس السعة/القدرة والموديل مختلف.
//
// المطابقة تمشي على (الفئة + الموديل + السعة). فإذا البياع بدّل اسم الموديل
// بالمخزون بيده — مثل ما صار: `HZ6000-ES-C10` صار `HZ-ES-C10 6K` — وبعدين رفع
// نفس الإكسل بالاسم القديم، ما ينلكه تطابق فينضاف **نسخة ثانية من نفس المادة**.
// هنا ننبّهه قبل الحفظ بدل ما يكتشفها بعدين بالمخزون.
function findRenamedCandidates(existingMaterials, material) {
  // الثانوية بلا سعة — مقارنتها بالسعة تعطي مرشحين غلط
  if (material.category === 'secondary') return [];
  const cap = material.watt_or_capacity ?? null;
  if (cap == null) return [];
  return existingMaterials.filter(
    (m) => m.category === material.category
      && (m.watt_or_capacity ?? null) === cap
      && m.model !== material.model
  );
}

// يضيف حالة المطابقة لكل صف معاينة: 'new' أو 'update' (مع اسم المادة اللي راح تتحدث)
function annotateMatches(existingMaterials, rows) {
  return rows.map((row) => {
    const existing = findExistingMaterial(existingMaterials, row);
    if (existing) {
      return {
        ...row,
        matchStatus: 'update',
        matchTarget: `${existing.model}${existing.watt_or_capacity ? ` (${existing.watt_or_capacity})` : ''}`,
        existingId: existing.id,
        nearMatches: [],
      };
    }
    // ماكو تطابق تام — نشوف إذا نفس المادة موجودة باسم ثاني
    const near = findRenamedCandidates(existingMaterials, row);
    const issues = [...row.issues];
    if (near.length === 1) {
      issues.push(
        `اكو مادة بنفس الفئة والسعة بالمخزون اسمها «${near[0].model}» — إذا هي نفسها بدّل الموديل هنا لنفس الاسم `
        + 'حتى تنحدّث بدل ما تنضاف نسخة ثانية'
      );
    } else if (near.length > 1) {
      issues.push(
        `اكو ${near.length} مواد بنفس الفئة والسعة بالمخزون بأسماء مختلفة — تأكد إن هذي مادة جديدة فعلاً `
        + 'مو نسخة ثانية من وحدة موجودة'
      );
    }
    return {
      ...row,
      matchStatus: 'new',
      matchTarget: null,
      existingId: null,
      nearMatches: near.map((m) => ({ id: m.id, model: m.model })),
      issues,
    };
  });
}

// يبني ملف قالب Excel جاهز بأمثلة (لمن يفضل البدء من ملف مرتب)
function buildTemplateWorkbook() {
  const materialsHeader = [
    'الفئة', 'الماركة', 'الموديل', 'الوصف التفصيلي', 'الوحدة',
    'القدرة او السعة', 'السعر', 'الضمان (شهر)', 'الكمية لكل لوح',
  ];
  const exampleRows = [
    ['لوح', 'JINKO', 'JINKO 650W', 'تجهيز وتركيب ألواح شمسية 650 واط ... (الوصف الكامل كما يطبع بالفاتورة مع الضمان)', 'عدد', 650, 185000, 120, ''],
    ['بطارية', 'COSPOWER', 'COSPOWER 16kWh', 'بطارية ليثيوم 16kWh ... ضمان 5 سنوات', 'عدد', 16, 2750000, 60, ''],
    ['انفيرتر', 'COSPOWER', 'COSPOWER 6kW', 'انفيرتر هجين 6 كيلو واط ... ضمان 5 سنوات', 'عدد', 6000, 650000, 60, ''],
    ['ثانوية', '', 'هيكل مغلون', 'هيكل الألواح مغلون مقاوم للرياح', 'عدد', '', 65000, '', 1],
    ['ثانوية', '', 'كيبل 6مم', 'كيبلات ناقلة من الألواح إلى الانفيرتر 6 ملم', 'متر', '', 2000, '', ''],
  ];
  const laborHeader = ['الحجم بالأمبير', 'السعر', 'ملاحظة'];
  const laborRows = [
    [10, 400000, ''],
    [15, 550000, ''],
    [20, 700000, ''],
  ];

  const wb = XLSX.utils.book_new();
  const wsMaterials = XLSX.utils.aoa_to_sheet([materialsHeader, ...exampleRows]);
  wsMaterials['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 60 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsMaterials, 'المواد');
  const wsLabor = XLSX.utils.aoa_to_sheet([laborHeader, ...laborRows]);
  wsLabor['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsLabor, 'أجور العمل');
  return wb;
}
// تطبيع مادة قبل الحفظ بـSupabase (بدون كمية مخزون)
function normalizeImportedMaterial(m) {
  return {
    category: m.category,
    brand: m.brand || null,
    model: m.model,
    full_description: m.full_description,
    unit: m.unit || 'عدد',
    watt_or_capacity: m.watt_or_capacity ?? null,
    price: Number(m.price) || 0,
    warranty_months: m.warranty_months ?? null,
    warranty_note: m.warranty_note || null,
    qty_per_panel: m.qty_per_panel ?? null,
  };
}

export {
  parseInventoryWorkbook,
  buildTemplateWorkbook,
  annotateMatches,
  findExistingMaterial,
  normalizeImportedMaterial,
  inferCategoryFromText,
  extractCapacityFromText,
};
