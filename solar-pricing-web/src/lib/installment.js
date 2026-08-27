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

// الجهة اللي تنعنون لها النسخة الرسمية = **خطة التقسيط نفسها**.
// كان أكو مبدّل منفصل للعنونة، وهو تكرار: المصرف اللي يقسّط عليه الزبون هو
// المصرف اللي ينقدّم له العرض، فاختياران لشي واحد يفتحون باب التناقض.
export const addressBankLabel = installmentPlanLabel;
