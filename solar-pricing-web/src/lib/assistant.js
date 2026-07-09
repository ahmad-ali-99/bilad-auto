// المساعد الذكي — محلل نقي لطلبات البياع بالعربي (بدون خدمة خارجية، يشتغل فوري وأوفلاين)
// يفهم: «زبون احمد 07701234567 يريد منظومة 20 امبير نهاري و10 ليلي 6 ساعات بمساحة 40 متر ممتاز»
// ونية ثانية: «عدل سعر بطارية ديه» / «سعر الهيكل» → توجيه للمخزون مع تعبئة البحث

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toEnglishDigits(s) {
  return String(s || '')
    .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
    .replace(/[۰-۹]/g, (d) => FA_DIGITS.indexOf(d));
}

// أسماء المواد الشائعة لتحسين بحث المخزون
const PRICE_STOPWORDS = /^(عدل|غير|حدث|تعديل|اريد|أريد|ريد|سعر|اسعار|أسعار|ال|لل|مال|من|الى|إلى|على|بال)\s*/;

function parseRequest(rawText) {
  const text = toEnglishDigits(rawText).trim();
  if (!text) return { intent: 'empty' };

  // ===== نية تعديل الأسعار / فتح المخزون =====
  const priceMatch = text.match(/(?:عدل|غير|حدث|تعديل|شوف)\s+(?:ال)?سعر\s+(.+)|^سعر\s+(.+)|^(?:المخزون|مخزون)\s+(.+)/);
  if (priceMatch) {
    let term = (priceMatch[1] || priceMatch[2] || priceMatch[3] || '').trim();
    term = term.replace(PRICE_STOPWORDS, '').trim();
    return { intent: 'inventory', search: term, summary: `افتحلك المخزون وادورلك على: ${term}` };
  }

  // ===== نية إنشاء عرض =====
  const fields = {};
  const missing = [];
  const understood = [];

  // رقم الموبايل: 11 خانة تبدأ بـ07
  const phone = text.match(/\b(07\d{9})\b/);
  if (phone) {
    fields.clientPhone = phone[1];
    understood.push(`موبايل ${phone[1]}`);
  }
  // نشيل الرقم حتى ما يتلخبط مع الأرقام الباقية
  let t = phone ? text.replace(phone[1], ' ') : text;

  // أمبير نهاري وليلي: «20 امبير نهاري» / «نهاري 20» / «و10 ليلي»
  const dayM = t.match(/(\d+(?:\.\d+)?)\s*(?:امبير|أمبير|امب|أ)?\s*(?:بال)?نهار(?:ي|ا|اً)?/) || t.match(/نهار(?:ي|ا|اً)?\s*(\d+(?:\.\d+)?)/);
  const nightM = t.match(/(\d+(?:\.\d+)?)\s*(?:امبير|أمبير|امب|أ)?\s*(?:بال)?ليل(?:ي|ا|اً)?/) || t.match(/ليل(?:ي|ا|اً)?\s*(\d+(?:\.\d+)?)/);
  if (dayM) fields.ampDay = Number(dayM[1]);
  if (nightM) fields.ampNight = Number(nightM[1]);

  // «منظومة 20 امبير» بدون نهاري/ليلي = للاثنين
  if (fields.ampDay == null && fields.ampNight == null) {
    const bare = t.match(/(\d+(?:\.\d+)?)\s*(?:امبير|أمبير)/);
    if (bare) {
      fields.ampDay = Number(bare[1]);
      fields.ampNight = Number(bare[1]);
      understood.push(`منظومة ${bare[1]} أمبير (نهاري وليلي)`);
    }
  } else {
    if (fields.ampDay != null) understood.push(`${fields.ampDay} أمبير نهاري`);
    if (fields.ampNight != null) understood.push(`${fields.ampNight} أمبير ليلي`);
  }

  // ساعات التجهيز الليلي
  const hoursM = t.match(/(\d+(?:\.\d+)?)\s*ساع/);
  if (hoursM) {
    fields.nightSupplyHours = Number(hoursM[1]);
    understood.push(`${hoursM[1]} ساعات تجهيز`);
  }

  // المساحة: «مساحة 40» / «40 متر» / «40م»
  const areaM = t.match(/مساح(?:ة|ته|تها)\s*(\d+(?:\.\d+)?)/) || t.match(/(\d+(?:\.\d+)?)\s*(?:متر|م2|م²|م\b)/);
  if (areaM) {
    fields.roofAreaM2 = Number(areaM[1]);
    understood.push(`مساحة ${areaM[1]} م²`);
  }

  // المستوى
  if (/ممتاز/.test(t)) fields.tier = 'premium';
  else if (/متوسط/.test(t)) fields.tier = 'standard';
  else if (/اقتصادي/.test(t)) fields.tier = 'economy';
  if (fields.tier) understood.push({ premium: 'مستوى ممتاز', standard: 'مستوى متوسط', economy: 'مستوى اقتصادي' }[fields.tier]);

  // اسم الزبون: بعد «زبون/للزبون/اسم/السيد» لحد أول رقم أو كلمة مفتاحية
  const nameM = t.match(/(?:زبون|الزبون|للزبون|اسم|باسم|السيد|السيدة)\s+([^\d]+?)(?=\s*(?:\d|يريد|يحتاج|منظومة|امبير|أمبير|نهار|ليل|ساع|مساح|متر|اقتصادي|متوسط|ممتاز|$))/);
  if (nameM) {
    const name = nameM[1].trim().replace(/\s+/g, ' ');
    if (name && name.length <= 40) {
      fields.clientName = name;
      understood.unshift(`الزبون: ${name}`);
    }
  }

  const hasQuoteData = ['ampDay', 'ampNight', 'roofAreaM2', 'nightSupplyHours', 'clientName', 'clientPhone'].some((k) => fields[k] != null);
  if (!hasQuoteData) return { intent: 'unknown' };

  // الناقص الضروري للحساب
  if (fields.roofAreaM2 == null) missing.push('مساحة السطح');
  if (fields.ampDay == null && fields.ampNight == null) missing.push('الأمبير المطلوب');
  if ((fields.ampNight ?? 0) > 0 && fields.nightSupplyHours == null) missing.push('ساعات التجهيز الليلي');

  return {
    intent: 'quote',
    fields,
    missing,
    summary: understood.length ? `فهمت: ${understood.join('، ')}` : '',
  };
}

export { parseRequest, toEnglishDigits };
