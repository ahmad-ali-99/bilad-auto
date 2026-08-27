import React, { useEffect, useState, useCallback } from 'react';
import MaterialFormModal from '../components/MaterialFormModal.jsx';
import LaborTable from '../components/LaborTable.jsx';
import ImportPreviewModal from '../components/ImportPreviewModal.jsx';
import { getCurrentUsername } from '../lib/agent.js';
import { canEditInventory, canAddMaterial, canEditMaterial, canImportInventory, canEditLabor } from '../lib/permissions.js';
import { formatIp, hasIp, parseIp, IP_RANGE_ERROR } from '../lib/materialSpecs.js';

const TABS = [
  { key: 'panel', label: 'الألواح' },
  { key: 'battery', label: 'البطاريات' },
  { key: 'inverter', label: 'الانفيرترات' },
  { key: 'integrated', label: 'سستم متكامل' },
  { key: 'secondary', label: 'مواد ثانوية' },
  { key: 'labor', label: 'أجور العمل' },
];

// عدّ المواد بالعربي الصحيح: «مادة وحدة» · «مادتين» · «3 مواد» · «11 مادة».
// بلا هذا تطلع «اكو 3 مادة» و«اكو 1 مادة» — ركيكة بوجه المستخدم.
function countMaterials(n) {
  if (n === 1) return 'مادة وحدة';
  if (n === 2) return 'مادتين';
  if (n <= 10) return `${n} مواد`;
  return `${n} مادة`;
}

// ترتيب الفئات بلوحة الإكمال: الفئات اللي تدخل بالمستويات أولاً (الـIP هو اللي
// يقرر اقتصادي/متوسط/ممتاز)، والثانوية آخر شي لأن الـIP إلها أقل معنى.
const IP_GROUPS = [
  { key: 'inverter', label: 'الانفيرترات' },
  { key: 'battery', label: 'البطاريات' },
  { key: 'panel', label: 'الألواح' },
  { key: 'integrated', label: 'سستم متكامل' },
  { key: 'secondary', label: 'مواد ثانوية (اختيارية)' },
];

/**
 * إكمال درجات الحماية — طلب صريح من المستخدم: «ابدي واطلب مني ايبي بالمخزون للكل».
 *
 * الشارة بكل سطر تبيّن المادة الناقصة، بس ما تطلب شي: لازم يفتّش صف صف. هذي
 * اللوحة تجمع **كل** الناقصات بمكان واحد ويملأهن سطراً سطراً بحفظة وحدة.
 *
 * ليش يهم: الـIP هو مقياس المواصفات اللي ينبني عليه مستوى المنظومة — والمادة
 * بلا IP تطيح بأدنى درجة، فتطلع «اقتصادية» وهي مو كذلك.
 */
function IpFillPanel({ materials, canEditOne, onSaved }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const missing = materials.filter((m) => !hasIp(m) && canEditOne(m));
  if (!missing.length) return null;

  const filled = Object.entries(values).filter(([, v]) => String(v).trim() !== '');
  const bad = filled.filter(([, v]) => parseIp(v) == null);

  async function saveAll() {
    if (bad.length) { setMsg(IP_RANGE_ERROR); return; }
    setSaving(true);
    setMsg('');
    let done = 0;
    const failed = [];
    for (const [id, v] of filled) {
      try {
        await window.api.materials.setIp(Number(id), v);
        done++;
      } catch (e) {
        failed.push(e.message);
      }
    }
    setSaving(false);
    setValues({});
    setMsg(failed.length
      ? `انحفظت ${countMaterials(done)}، وتعذّر حفظ ${failed.length}: ${failed[0]}`
      : `تم حفظ درجة الحماية لـ${countMaterials(done)} ✔`);
    onSaved();
  }

  return (
    <div className="ip-fill">
      <div className="ip-fill-head">
        <span className="ip-fill-warn">⚠</span>
        <span>
          اكو <b>{countMaterials(missing.length)}</b> بلا درجة حماية (IP) — تنحسب بأدنى درجة
          بالمستويات، فتطلع «اقتصادية» وهي مو كذلك.
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'إخفاء' : 'املأها الآن'}
        </button>
      </div>

      {open && (
        <div className="ip-fill-body">
          {IP_GROUPS.map(({ key, label }) => {
            const rows = missing.filter((m) => m.category === key);
            if (!rows.length) return null;
            return (
              <div key={key} className="ip-fill-group">
                <h4>{label} <span className="muted">({rows.length})</span></h4>
                {rows.map((m) => (
                  <label key={m.id} className="ip-fill-row">
                    <span className="ip-fill-name">
                      <b>{m.brand}</b> {m.model}
                      {m.watt_or_capacity != null && <span className="muted"> · {m.watt_or_capacity}</span>}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="مثل 65"
                      value={values[m.id] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            );
          })}
          {msg && <div className="ip-fill-msg">{msg}</div>}
          <div className="ip-fill-actions">
            <button className="btn btn-primary" disabled={saving || !filled.length} onClick={saveAll}>
              {saving ? 'يحفظ...' : filled.length ? `احفظ ${countMaterials(filled.length)}` : 'احفظ'}
            </button>
            <span className="muted">اتركها فارغة إذا ما تعرفها — تكدر تكملها بأي وقت.</span>
          </div>
        </div>
      )}
      {!open && msg && <div className="ip-fill-msg">{msg}</div>}
    </div>
  );
}

function capacityLabel(category) {
  if (category === 'battery' || category === 'integrated') return 'السعة (kWh)';
  if (category === 'panel' || category === 'inverter') return 'القدرة (واط)';
  return 'القدرة/السعة';
}

// بطاقة مادة — شكل الموبايل. الجدول بثمانية أعمدة عرضه الأدنى ٦٤٠ بكسل والتلفون
// ٤٣٠، فالسعر وأزرار التعديل كانوا يطلعون برّا الشاشة ويحتاجون تمريراً أفقياً
// داخل صندوق. بالبطاقة كل شي بمتناول الإصبع بلا أي تمرير أفقي.
function MaterialCard({ m, capacityLabel, canEdit, owner, onToggle, onEdit, onDelete }) {
  const hidden = m.active === false;
  return (
    <div className={`inv-card${hidden ? ' inv-card-off' : ''}`}>
      <div className="inv-card-head">
        <label
          className="inv-card-check"
          title={hidden ? 'مخفية من العروض — أشّر عليها لتستعملها' : 'مفعّلة — شيل التأشير لتخفيها من العروض'}
        >
          <input type="checkbox" checked={!hidden} disabled={!canEdit} onChange={() => onToggle(m)} />
        </label>
        <div className="inv-card-title">
          <b>{m.brand}</b> {m.model}
          {hidden && <span className="inv-card-badge">مخفية</span>}
          {owner && <span className="inv-card-owner">أضافها {owner}</span>}
        </div>
      </div>
      {/* بلا نقطتين بعد القوس اللاتيني — بالعربي تنطّ النقطتان لمحل غلط */}
      <div className="inv-card-meta">
        <span>#{m.id}</span>
        <span>{m.unit}</span>
        <span>{capacityLabel} <b>{m.watt_or_capacity ?? '-'}</b></span>
        <span>ضمان <b>{m.warranty_months ?? '-'}</b> شهر</span>
        <span>{formatIp(m.ip_rating) || <span className="ip-missing">حماية ناقصة</span>}</span>
      </div>
      <div className="inv-card-actions">
        <div className="inv-card-price">
          {Number(m.price).toLocaleString('en-US')} <small>دينار</small>
        </div>
        {canEdit && (
          <span className="inv-card-btns">
            <button className="btn btn-secondary btn-sm" onClick={() => onEdit(m)}>تعديل</button>
            <button className="btn btn-danger btn-sm" onClick={() => onDelete(m.id)}>حذف</button>
          </span>
        )}
      </div>
    </div>
  );
}

export default function Inventory({ initialSearch }) {
  const [tab, setTab] = useState('panel');
  // حسابات مقيّدة: تشوف المخزون والأسعار كاملة بس بلا أي تعديل
  const [canEdit, setCanEdit] = useState(true);
  // اسم الحساب ومُلّاك المواد — عليهم تعتمد صلاحية التعديل لكل مادة على حدة.
  // حساب «الإضافة» (بكر) يضيف مواداً جديدة ويعدّل اللي أضافه هو بس.
  const [me, setMe] = useState('');
  const [owners, setOwners] = useState({});
  useEffect(() => {
    getCurrentUsername().then((n) => {
      setMe(n);
      setCanEdit(canEditInventory(n));
    }).catch(() => {});
    window.api.materials.owners().then(setOwners).catch(() => {});
  }, []);
  const canAdd = canAddMaterial(me);
  const mayEdit = (m) => canEditMaterial(me, owners[m.id]);
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');

  // توجيه من المساعد: يعبي البحث وينتقل للتبويب المناسب حسب كلمة المادة
  useEffect(() => {
    if (!initialSearch || !initialSearch.term) return;
    const term = initialSearch.term;
    if (/بطاري|نضائد|ليثيوم/.test(term)) setTab('battery');
    else if (/سستم متكامل|متكامل|كابينة|كابينه/.test(term)) setTab('integrated');
    else if (/انفيرتر|انفرتر|عاكس/.test(term)) setTab('inverter');
    else if (/لوح|الواح|ألواح|طاقة/.test(term)) setTab('panel');
    else if (/اجور|أجور|عمل/.test(term)) setTab('labor');
    else setTab('secondary');
    setSearch(term.replace(/^(بطارية|بطاريات|انفيرتر|انفرتر|لوح|الواح|ألواح)\s*/, '').trim() || term);
  }, [initialSearch]);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [importParsed, setImportParsed] = useState(null);
  const [importMessage, setImportMessage] = useState('');

  // لوحة إكمال الـIP تشتغل على **كل** المخزون مو على التبويب الحالي — الطلب كان
  // «للكل»، وبلا هذا يبقى الناقص بتبويب ثاني مخفياً عن العين.
  const [allMaterials, setAllMaterials] = useState([]);

  const reloadAll = useCallback(() => {
    window.api.materials.list().then(setAllMaterials).catch(() => {});
  }, []);

  const reload = useCallback(() => {
    reloadAll();
    if (tab === 'labor') return;
    window.api.materials.list(tab).then(setMaterials);
  }, [tab, reloadAll]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = materials.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      String(m.id) === q ||
      String(m.id).includes(q) ||
      (m.model || '').toLowerCase().includes(q) ||
      (m.brand || '').toLowerCase().includes(q) ||
      (m.full_description || '').toLowerCase().includes(q) ||
      String(m.watt_or_capacity ?? '').includes(q)
    );
  });

  // الجيك بوكس: المادة المؤشرة تنعرض وتنستعمل بالعروض، وغير المؤشرة تبقى بالمخزون
  // بس تختفي من كل مسارات الاستخدام. التغيير يظهر فوراً ثم ينحفظ (وينسجل بالحركات).
  async function toggleActive(m) {
    const next = m.active === false;
    setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, active: next } : x)));
    try {
      await window.api.materials.setActive(m.id, next);
    } catch (e) {
      setMaterials((prev) => prev.map((x) => (x.id === m.id ? { ...x, active: !next } : x)));
      alert('تعذر الحفظ: ' + e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('هل أنت متأكد من حذف هذه المادة؟')) return;
    await window.api.materials.remove(id);
    reload();
  }

  function openAddForm() {
    setEditingMaterial(null);
    setShowForm(true);
  }

  function openEditForm(material) {
    setEditingMaterial(material);
    setShowForm(true);
  }

  async function handleSaveForm(data) {
    // صورة المنتج مو عمود بجدول المواد — تنفصل وتنحفظ بـapp_config.
    // بدون الفصل يفشل الحفظ كله بـ«column product_image does not exist».
    const { product_image: image, ...fields } = data;
    const saved = editingMaterial
      ? await window.api.materials.update(editingMaterial.id, fields)
      : await window.api.materials.create(fields);
    const id = editingMaterial ? editingMaterial.id : saved?.id;
    if (image !== undefined && id != null) {
      await window.api.materials.setImage(id, image);
    }
    setShowForm(false);
    // المالك انسجّل توّه — بلا تحديثه تبقى المادة الجديدة بلا أزرار تعديل
    window.api.materials.owners().then(setOwners).catch(() => {});
    reload();
  }

  async function handleImportExcel() {
    setImportMessage('');
    const parsed = await window.api.materials.parseExcel();
    if (parsed.canceled) return;
    setImportParsed(parsed);
  }

  async function handleDownloadTemplate() {
    const result = await window.api.materials.downloadTemplate();
    if (!result.canceled) setImportMessage('تم حفظ القالب — املأه بموادك ثم ارفعه بزر الاستيراد ✔');
  }

  return (
    <div>
      <div className="toolbar">
        <h2 className="page-title" style={{ margin: 0 }}>المخزون</h2>
        {canImportInventory(me) && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
              تحميل قالب Excel
            </button>
            <button className="btn btn-primary" onClick={handleImportExcel}>
              ⬆ استيراد من Excel
            </button>
          </div>
        )}
      </div>
      {importMessage && <div className="alert alert-info">{importMessage}</div>}

      <IpFillPanel materials={allMaterials} canEditOne={mayEdit} onSaved={reload} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'labor' ? (
        <LaborTable canEdit={canEditLabor(me)} />
      ) : (
        <>
          <div className="toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="بحث..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {canAdd && (
              <button className="btn btn-primary" onClick={openAddForm}>
                + إضافة مادة
              </button>
            )}
          </div>

          {/* بطاقات بكل المقاسات — بالجوال عمود واحد وبالحاسوب شبكة تتوسّع
              حسب العرض. الجدول انشال: بثمانية أعمدة كان يحتاج تمريراً أفقياً
              بالجوال، وبالحاسوب كان يصفّ الأسعار والأزرار بصفوف متلاصقة
              تصعّب تمييز مادة عن اللي بعدها. */}
          {/* بطاقات بكل المقاسات — بالجوال عمود واحد وبالحاسوب شبكة تتوسّع
              حسب العرض. الجدول انشال: بثمانية أعمدة كان يحتاج تمريراً أفقياً
              بالجوال، وبالحاسوب كان يصفّ الأسعار والأزرار بصفوف متلاصقة
              تصعّب تمييز مادة عن اللي بعدها. */}
            <div className="inv-cards">
              {filtered.map((m) => (
                <MaterialCard
                  key={m.id}
                  m={m}
                  capacityLabel={capacityLabel(tab)}
                  canEdit={mayEdit(m)}
                  owner={owners[m.id]}
                  onToggle={toggleActive}
                  onEdit={openEditForm}
                  onDelete={handleDelete}
                />
              ))}
              {filtered.length === 0 && (
                <div className="card muted" style={{ textAlign: 'center', padding: 20 }}>
                  لا توجد مواد بهذه الفئة بعد
                </div>
              )}
            </div>
        </>
      )}

      {showForm && (
        <MaterialFormModal
          category={tab}
          initial={editingMaterial}
          onClose={() => setShowForm(false)}
          onSave={handleSaveForm}
        />
      )}

      {importParsed && (
        <ImportPreviewModal
          parsed={importParsed}
          onClose={() => setImportParsed(null)}
          onDone={() => {
            setImportParsed(null);
            setImportMessage('تم الاستيراد بنجاح ✔');
            reload();
          }}
        />
      )}
    </div>
  );
}
