// أسماء خطط التقسيط بمكان واحد — تنطبق على الشاشة وعلى ملف العرض سوية،
// وتُشتق من نوع الخطة لا من نص محفوظ، حتى تغيير الاسم ينسحب على العروض القديمة أيضاً.
export const INSTALLMENT_PLANS = {
  company: 'مصرف النهرين',
  cbi: 'مبادرة البنك المركزي',
};

export function installmentPlanLabel(plan) {
  return INSTALLMENT_PLANS[plan === 'cbi' ? 'cbi' : 'company'];
}
