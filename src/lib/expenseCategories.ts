export const expenseCategories = [
  { value: 'operational', labelEn: 'Operational', labelAr: 'تشغيلي' },
  { value: 'government', labelEn: 'Government', labelAr: 'حكومي' },
  { value: 'assets', labelEn: 'Assets', labelAr: 'أصول' },
  { value: 'residence', labelEn: 'Residence Permits', labelAr: 'تجديد إقامات' },
  { value: 'sponsorship', labelEn: 'Sponsorship Transfer', labelAr: 'نقل كفالات' },
  { value: 'electricity', labelEn: 'Electricity Bills', labelAr: 'فواتير كهرباء' },
  { value: 'water', labelEn: 'Water Bills', labelAr: 'فواتير مياه' },
  { value: 'violations', labelEn: 'Violations & Fines', labelAr: 'مخالفات' },
  { value: 'rent', labelEn: 'Rent', labelAr: 'إيجار' },
  { value: 'maintenance', labelEn: 'Maintenance', labelAr: 'صيانة' },
  { value: 'salaries', labelEn: 'Salaries', labelAr: 'رواتب' },
  { value: 'transportation', labelEn: 'Transportation', labelAr: 'نقل ومواصلات' },
  { value: 'communication', labelEn: 'Communication', labelAr: 'اتصالات' },
  { value: 'office', labelEn: 'Office Supplies', labelAr: 'مستلزمات مكتبية' },
  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

export const getCategoryLabel = (value: string, isRTL: boolean): string => {
  const category = expenseCategories.find(cat => cat.value === value);
  return category ? (isRTL ? category.labelAr : category.labelEn) : value;
};
