// أسماء خطط التقسيط بمكان واحد — تنطبق على الشاشة وعلى ملف العرض سوية،
// وتُشتق من نوع الخطة لا من نص محفوظ، حتى تغيير الاسم ينسحب على العروض القديمة أيضاً.
export const INSTALLMENT_PLANS = {
  company: 'مصرف النهرين',
  cbi: 'مبادرة البنك المركزي',
};

export function installmentPlanLabel(plan) {
  return INSTALLMENT_PLANS[plan === 'cbi' ? 'cbi' : 'company'];
}

// المصارف اللي تنعنون لها النسخة الرسمية بالتصدير — الاسم بمكان واحد حتى
// يتغيّر بسطر ويلحق كل العروض القديمة والجديدة سوية
export const ADDRESS_BANKS = {
  nahrain: 'مصرف النهرين',
  ahli: 'المصرف الأهلي العراقي',
};

export function addressBankLabel(bank) {
  return ADDRESS_BANKS[bank] || ADDRESS_BANKS.nahrain;
}
