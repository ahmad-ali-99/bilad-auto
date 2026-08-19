import { describe, it, expect } from 'vitest';
import {
  canEditInventory, canAddMaterial, canEditMaterial, isInventoryContributor,
  canImportInventory, canImportUpdates, canEditLabor, isRestrictedUser,
} from '../src/lib/permissions.js';

// حساب «بكر»: يضيف مواد جديدة ويملك اللي يضيفه، والمخزون القديم للقراءة عنده.
describe('حساب الإضافة (بكر)', () => {
  it('يقدر يضيف مادة جديدة', () => {
    expect(canAddMaterial('بكر')).toBe(true);
    expect(isInventoryContributor('بكر')).toBe(true);
  });

  it('يعدّل ويحذف اللي أضافه هو فقط', () => {
    expect(canEditMaterial('بكر', 'بكر')).toBe(true);
    expect(canEditMaterial('بكر', 'أحمد')).toBe(false);
  });

  it('المخزون القديم (بلا مالك) ممنوع عليه — وهذا هو المطلوب بالضبط', () => {
    expect(canEditMaterial('بكر', null)).toBe(false);
    expect(canEditMaterial('بكر', '')).toBe(false);
    expect(canEditMaterial('بكر', undefined)).toBe(false);
  });

  it('باقي صلاحياته كما هي — يبقى حساباً مقيّداً', () => {
    expect(isRestrictedUser('بكر')).toBe(true);
    expect(canEditInventory('بكر')).toBe(false);
  });

  it('يستورد من إكسل — بس الجديد فقط', () => {
    expect(canImportInventory('بكر')).toBe(true);
    // التحديث ممنوع: الاستيراد يطابق المواد الموجودة، ولو انفتح صار باباً
    // خلفياً يعدّل بيه المخزون القديم
    expect(canImportUpdates('بكر')).toBe(false);
  });

  it('أجور العمل تبقى ممنوعة — أسعار مشتركة تمس عروض الفريق', () => {
    expect(canEditLabor('بكر')).toBe(false);
  });

  it('فروقات الهمزة والمسافات ما تفتح الحساب بالغلط', () => {
    expect(canAddMaterial(' بكر ')).toBe(true);
    expect(canEditMaterial('بكر', ' بكر ')).toBe(true);
  });
});

describe('المشرف أحمد', () => {
  it('يعدّل كل شي بضمنه اللي أضافه بكر', () => {
    expect(canEditMaterial('أحمد', 'بكر')).toBe(true);
    expect(canEditMaterial('أحمد', null)).toBe(true);
    expect(canEditInventory('أحمد')).toBe(true);
    expect(canImportInventory('أحمد')).toBe(true);
    expect(canImportUpdates('أحمد'), 'المشرف يحدّث بالاستيراد').toBe(true);
  });
  it('الهمزة بالاسم ما تكسر المطابقة', () => {
    expect(canEditMaterial('احمد', 'بكر')).toBe(true);
  });
});

describe('بقية الحسابات المقيّدة ما تتأثر', () => {
  it('علي سبتي وليث كرادة: ما يضيفون ولا يعدّلون', () => {
    for (const u of ['علي سبتي', 'ليث كرادة']) {
      expect(canAddMaterial(u), `${u} ما يضيف`).toBe(false);
      expect(canImportInventory(u), `${u} ما يستورد`).toBe(false);
      expect(canEditMaterial(u, u), `${u} ما يعدّل حتى لو مالك`).toBe(false);
      expect(isInventoryContributor(u)).toBe(false);
    }
  });
});

describe('الحسابات الكاملة', () => {
  it('حوراء وحيدر يعدّلون كل شي', () => {
    for (const u of ['حوراء', 'حيدر']) {
      expect(canAddMaterial(u)).toBe(true);
      expect(canEditMaterial(u, null)).toBe(true);
    }
  });
});

// ── الحارس بطبقة البيانات مو بالواجهة بس ──
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(HERE, '..', p), 'utf8');
const dataApi = read('src/lib/dataApi.js');
const inventory = read('src/pages/Inventory.jsx');

describe('المنع بطبقة البيانات', () => {
  it('المالك ينسجّل عند الإضافة', () => {
    expect(dataApi).toContain('const ownerKey = (id) => `material_owner_${id}`');
    expect(dataApi).toContain('await assertCanAddMaterial()');
    expect(dataApi).toContain('upsert({ key: ownerKey(row.id)');
  });

  it('التعديل والحذف والإخفاء والصورة كلها تمر بفحص الملكية', () => {
    const guarded = (dataApi.match(/await assertCanEditMaterial\(id/g) || []).length;
    expect(guarded, 'update + remove + setActive + setImage').toBe(4);
  });

  it('الاستيراد يرفض تحديث الموجود لحساب الإضافة، ويسجّل مالك الجديد', () => {
    expect(dataApi).toContain('const mayUpdate = canImportUpdates(me)');
    expect(dataApi).toContain('حسابك يضيف مواد جديدة بس');
    // المادة المستوردة تنسجّل باسم مستورِدها فيقدر يعدّلها بعدين
    expect(dataApi).toContain("insert(m).select('id').single()");
    expect((dataApi.match(/upsert\(\{ key: ownerKey\(/g) || []).length).toBe(2);
    // أجور العمل بالاستيراد للحسابات الكاملة بس
    expect(dataApi).toContain('if (labor.length && mayLabor)');
  });

  it('نافذة المعاينة تشيل تأشير صفوف التحديث من البداية', () => {
    const modal = read('src/components/ImportPreviewModal.jsx');
    expect(modal).toContain('if (!up) setRows');
    expect(modal).toContain("if (field === 'include' && value && !mayUpdate && rows[idx]?.matchTarget) return;");
    expect(modal).toContain('موجودة — تنتخطى');
  });

  it('رسالة المنع تشرح السبب بدل خطأ غامض', () => {
    expect(dataApi).toContain('من المخزون القديم');
    expect(dataApi).toMatch(/أضافها حساب/);
  });
});

describe('واجهة المخزون', () => {
  it('زر الإضافة يتبع canAddMaterial لا canEditInventory', () => {
    expect(inventory).toContain('const canAdd = canAddMaterial(me)');
    expect(inventory).toContain('{canAdd && (');
  });

  it('كل مادة تنفحص على حدة', () => {
    expect(inventory).toContain('const mayEdit = (m) => canEditMaterial(me, owners[m.id])');
    expect(inventory).toContain('mayEdit(m)');
  });

  it('المُلّاك ينجلبون ويتحدثون بعد الإضافة', () => {
    expect((inventory.match(/materials\.owners\(\)/g) || []).length).toBe(2);
  });

  it('الأجور والاستيراد يتبعون صلاحيتهم الخاصة', () => {
    expect(inventory).toContain('canEditLabor(me)');
    expect(inventory).toContain('canImportInventory(me)');
  });

  it('بكر يشوف زر الاستيراد وقالب الإكسل', () => {
    expect(canImportInventory('بكر')).toBe(true);
  });
});
