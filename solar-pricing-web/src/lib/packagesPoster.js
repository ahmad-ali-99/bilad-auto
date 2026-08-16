// منشور «الباقات» — يبني HTML بمقاس ثابت 1300×1080 يُصوَّر بـhtml2canvas.
//
// نفس هوية فورمات الشركة (كحلي/ذهبي + خط Cairo)، وكل رقم بيه يجي من محرك التسعير
// الحقيقي مو من إدخال يدوي — فما ينطبع منشور بسعر غير اللي بالبرنامج.
const NAVY = '#1a3a5c';
const NAVY_DARK = '#122943';
const GOLD = '#f5a623';
export const POSTER_W = 1300;
export const POSTER_H = 1080;

// لون مميز لكل باقة مثل منشورات الباقات المعتادة
const ROW_COLORS = ['#1a3a5c', '#1f7a4d', '#c9761a', '#6b3fa0', '#a3253f'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function fmt(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

// خلية مكوّن: صورة المنتج (إن وُجدت) + العدد + الاسم + الموديل
function componentCell({ image, count, label, title, code, tall = false }) {
  const shot = image
    ? `<img class="shot${tall ? ' tall' : ''}" src="${image}" alt="">`
    : `<div class="noshot">${tall ? '🔋' : '⚡'}</div>`;
  return `<td class="comp">
      <div class="comp-in">
        ${shot}
        <div class="comp-txt">
          <div class="cnt">${esc(count)} ${esc(label)}</div>
          <div class="ttl">${esc(title)}</div>
          ${code ? `<div class="sub code">${esc(code)}</div>` : ''}
        </div>
      </div>
    </td>`;
}

// العنوان مكتوب مرة وحدة بترويسة العمود — تكراره بكل خلية يملأ اللوحة بحچي مكرر.
// الخانة الفارغة تبقى منقّطة (البياع يكتب سعره بالإيد)، والمملوءة تصير صندوقاً مصمتاً.
function moneyCell(value) {
  return `<td class="money">
      <div class="m-b${value ? '' : ' empty'}">${value ? `<span>${fmt(value)}</span>` : ''}</div>
    </td>`;
}

/**
 * @param {object} p
 * @param {Array} p.packages صفوف الباقات — مخرج buildPackageRow لكل باقة
 * @param {object} p.company ملف الشركة (الاسم والهاتفان والإيميل والشعار)
 * @param {object} p.warranty نصوص الضمان: { panel, inverter, battery }
 * @param {string} p.title العنوان الرئيسي
 */
export function buildPackagesPosterHtml({ packages, company = {}, warranty = {}, title = 'باقات الطاقة الشمسية', subtitle = 'طاقة مستمرة .. راحة دائمة', logo = null }) {
  const showMonthly = packages.some((p) => p.monthly > 0);
  const rows = packages.map((p, i) => `<tr>
      <td class="pk" style="background:${ROW_COLORS[i % ROW_COLORS.length]}">
        <div class="pk-l">الباقة</div>
        <div class="pk-n">${String(i + 1).padStart(2, '0')}</div>
        <div class="pk-a">${esc(p.ampLabel)}</div>
      </td>
      ${componentCell(p.panel)}
      ${componentCell(p.inverter)}
      ${componentCell({ ...p.battery, tall: true })}
      ${showMonthly ? moneyCell(p.monthly) : ''}
      ${moneyCell(p.total)}
    </tr>`).join('');

  const wars = [
    ['🔆', 'ضمان الألواح', warranty.panel],
    ['⚡', 'ضمان الانفيرتر', warranty.inverter],
    ['🔋', 'ضمان البطاريات', warranty.battery],
    ['🛠', 'تجهيز وتركيب وتوصيل', 'كفالة حقيقية'],
  ].filter(([, , v]) => v).map(([i, t, v]) =>
    `<div class="w"><span class="w-i">${i}</span><span class="w-t">${esc(t)}</span><span class="w-v">${esc(v)}</span></div>`
  ).join('');

  const phones = [company.phone1, company.phone2].filter(Boolean).join(' — ');

  return `<div class="pk-canvas">
  <style>
  .pk-canvas *{margin:0;padding:0;box-sizing:border-box}
  .pk-canvas{width:${POSTER_W}px;height:${POSTER_H}px;overflow:hidden;display:flex;flex-direction:column;
    font-family:'Cairo',sans-serif;background:linear-gradient(180deg,#f4f7fb 0%,#eaf0f7 100%);direction:rtl}
  .pk-canvas .head{background:linear-gradient(135deg,${NAVY_DARK} 0%,${NAVY} 60%,#24507c 100%);
    color:#fff;padding:20px 34px 18px;display:flex;align-items:center;gap:26px;border-bottom:5px solid ${GOLD}}
  .pk-canvas .logo{width:92px;height:92px;background:#fff;border-radius:18px;padding:7px;flex-shrink:0;
    display:flex;align-items:center;justify-content:center}
  .pk-canvas .logo img{max-width:100%;max-height:100%;object-fit:contain}
  .pk-canvas .brand b{font-size:1.55rem;font-weight:800;display:block;line-height:1.25}
  .pk-canvas .brand small{font-size:.86rem;font-weight:600;opacity:.85}
  .pk-canvas .title{margin-inline-start:auto;text-align:left}
  .pk-canvas .t1{font-size:2.5rem;font-weight:800;line-height:1.1}
  .pk-canvas .t2{font-size:1.02rem;font-weight:700;color:${GOLD};margin-top:4px}
  .pk-canvas .wrap{flex:1;padding:16px 24px 10px;display:flex;flex-direction:column}
  .pk-canvas table{width:100%;border-collapse:separate;border-spacing:0 9px;table-layout:fixed}
  .pk-canvas th{background:${NAVY};color:#fff;font-size:1rem;font-weight:800;padding:11px 6px;text-align:center}
  .pk-canvas th:first-child{border-radius:0 12px 12px 0}
  .pk-canvas th:last-child{border-radius:12px 0 0 12px}
  .pk-canvas td{background:#fff;vertical-align:middle;height:244px;border-block:2px solid #e3eaf2}
  .pk-canvas td:first-child{border-radius:0 14px 14px 0;border-inline-start:2px solid #e3eaf2}
  .pk-canvas td:last-child{border-radius:14px 0 0 14px;border-inline-end:2px solid #e3eaf2}
  .pk-canvas .pk{color:#fff;text-align:center;border:none !important}
  .pk-canvas .pk-l{font-size:.92rem;font-weight:700;opacity:.9}
  .pk-canvas .pk-n{font-size:3.1rem;font-weight:800;line-height:1}
  .pk-canvas .pk-a{font-size:1.02rem;font-weight:800;background:rgba(255,255,255,.18);
    border-radius:20px;padding:3px 10px;display:inline-block;margin-top:5px}
  .pk-canvas .comp-in{display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 4px}
  .pk-canvas .shot{height:118px;width:auto;max-width:150px;object-fit:contain}
  .pk-canvas .shot.tall{height:140px}
  .pk-canvas .noshot{font-size:3.2rem;line-height:1.2;opacity:.5}
  .pk-canvas .cnt{font-size:1.16rem;font-weight:800;color:${NAVY}}
  .pk-canvas .ttl{font-size:.9rem;font-weight:700;color:#33506e}
  .pk-canvas .sub{font-size:.78rem;font-weight:600;color:#7c8ea3}
  .pk-canvas .sub.code{direction:ltr;font-weight:700}
  .pk-canvas .comp-txt{text-align:center;line-height:1.45}
  .pk-canvas .money{padding:14px 12px;text-align:center}
  .pk-canvas .m-b{height:150px;border:3px solid ${GOLD};border-radius:12px;background:#fdf3e0;
    display:flex;align-items:center;justify-content:center}
  .pk-canvas .m-b.empty{border-style:dashed;border-color:#ccd7e4;background:#fcfdff}
  .pk-canvas .m-b span{font-size:1.62rem;font-weight:800;color:${NAVY};direction:ltr}
  .pk-canvas .foot{background:${NAVY_DARK};color:#fff;padding:14px 30px;display:flex;align-items:center;
    gap:14px;border-top:5px solid ${GOLD}}
  .pk-canvas .wars{display:flex;gap:10px;flex:1;flex-wrap:nowrap}
  .pk-canvas .w{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.16);border-radius:12px;
    padding:8px 12px;display:flex;align-items:center;gap:8px;white-space:nowrap}
  .pk-canvas .w-i{font-size:1.15rem}
  .pk-canvas .w-t{font-size:.82rem;font-weight:600;opacity:.9}
  .pk-canvas .w-v{font-size:.95rem;font-weight:800;color:${GOLD}}
  .pk-canvas .contact{text-align:left;line-height:1.5;white-space:nowrap}
  .pk-canvas .contact .p{font-size:1.12rem;font-weight:800;direction:ltr}
  .pk-canvas .contact .e{font-size:.82rem;font-weight:600;opacity:.85;direction:ltr}
  </style>
  <header class="head">
    ${logo ? `<span class="logo"><img src="${logo}" alt=""></span>` : ''}
    <span class="brand">
      <b>${esc(company.company_name || 'شركة بلاد اوتو')}</b>
      <small>${esc(company.company_name_en || 'للطاقة المتجددة والمقاولات العامة')}</small>
    </span>
    <span class="title"><div class="t1">${esc(title)}</div><div class="t2">${esc(subtitle)}</div></span>
  </header>
  <div class="wrap">
    <table>
      <thead><tr>
        <th style="width:132px">الباقة</th>
        <th>الألواح</th><th>الانفيرتر</th><th>البطاريات</th>
        ${showMonthly ? '<th style="width:215px">القسط الشهري</th>' : ''}
        <th style="width:${showMonthly ? 215 : 260}px">${showMonthly ? 'المبلغ الكلي بالتقسيط' : 'المبلغ الكلي'}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <footer class="foot">
    <div class="wars">${wars}</div>
    <div class="contact">
      ${phones ? `<div class="p">${esc(phones)}</div>` : ''}
      ${company.email ? `<div class="e">${esc(company.email)}</div>` : ''}
    </div>
  </footer>
</div>`;
}

/**
 * يحوّل مسودة عرض (مخرج buildQuoteDraft) لصف باقة جاهز للمنشور.
 * الأعداد والموديلات والأسعار كلها من المسودة — ماكو رقم مكتوب بالإيد.
 */
export function buildPackageRow({ draft, materials, images = {}, ampDay, ampNight }) {
  const byId = new Map((materials || []).map((m) => [m.id, m]));
  const pick = (category) => {
    const item = (draft.items || []).find((i) => i.material_id != null && byId.get(i.material_id)?.category === category);
    if (!item) return null;
    const m = byId.get(item.material_id);
    return { m, qty: item.quantity };
  };

  const p = pick('panel');
  const inv = pick('inverter');
  const bat = pick('battery');
  const integrated = pick('integrated');

  const watt = (m) => (m?.watt_or_capacity ? `${m.watt_or_capacity} واط` : '');
  const kw = (m) => (m?.watt_or_capacity ? `${+(m.watt_or_capacity / 1000).toFixed(1)} كيلوواط` : '');
  const kwh = (m) => (m?.watt_or_capacity ? `${m.watt_or_capacity} كيلوواط·ساعة` : '');

  return {
    ampLabel: ampDay === ampNight ? `${ampDay} أمبير` : `${ampDay} نهاراً / ${ampNight} ليلاً`,
    panel: p
      // «واط» عربية داخل خانة الموديل (direction:ltr) تنقلب — تنكتب بالعنوان الـRTL
      ? { image: images[p.m.id], count: p.qty, label: 'لوح', title: `ألواح شمسية ${watt(p.m)}`.trim(), code: p.m.model }
      : { image: null, count: 0, label: 'لوح', title: '—' },
    inverter: (inv || integrated)
      ? (() => { const x = inv || integrated; return { image: images[x.m.id], count: x.qty, label: 'انفيرتر', title: [x.m.brand, kw(x.m)].filter(Boolean).join(' '), code: x.m.model }; })()
      : { image: null, count: 0, label: 'انفيرتر', title: '—' },
    battery: bat
      ? { image: images[bat.m.id], count: bat.qty, label: 'بطارية', title: `ليثيوم ${kwh(bat.m)}`, code: bat.m.model }
      : { image: null, count: 0, label: 'بطارية', title: '—' },
    total: draft.total,
    monthly: draft.installment?.monthly || 0,
  };
}
