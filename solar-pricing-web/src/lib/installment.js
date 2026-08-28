// أسماء خطط التقسيط بمكان واحد — تنطبق على الشاشة وعلى ملف العرض سوية،
// وتُشتق من نوع الخطة لا من نص محفوظ، حتى تغيير الاسم ينسحب على العروض القديمة أيضاً.
export const INSTALLMENT_PLANS = {
  company: 'مصرف النهرين',
  ahli: 'المصرف الأهلي العراقي',
  cbi: 'مبادرة البنك المركزي',
};

export function installmentPlanLabel(plan) {
  return INSTALLMENT_PLANS[plan] || INSTALLMENT_PLANS.company;
}

// **المصرف اللي تنعنون له النسخة الرسمية مو دائماً اسم الخطة.**
// «مبادرة البنك المركزي» خطة تمويل تُدار **عبر المصرف الأهلي العراقي** — مو
// مصرفاً بحد ذاته، فورقة معنونة «إلى / مبادرة البنك المركزي المحترم» تروح
// لجهة ما تستلم. الخطة تبقى باسمها للبياع، والعنونة تروح للمصرف الحقيقي.
const ADDRESS_BANKS = {
  company: 'مصرف النهرين',
  ahli: 'المصرف الأهلي العراقي',
  cbi: 'المصرف الأهلي العراقي',
};

export function addressBankLabel(plan) {
  return ADDRESS_BANKS[plan] || ADDRESS_BANKS.company;
}
