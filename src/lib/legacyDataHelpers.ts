/**
 * Legacy Data Helpers
 * مساعدات للتعامل مع البيانات القديمة
 *
 * هذه الدوال تساعد في التعامل الآمن مع البيانات التي قد تفتقد لحقول جديدة
 * These functions help safely handle data that may be missing new fields
 */

/**
 * الحصول على قيمة آمنة مع قيمة افتراضية للبيانات القديمة
 * Get safe value with default for legacy data
 */
export const getLegacySafeValue = <T,>(
  value: T | null | undefined,
  defaultValue: T,
  options?: {
    isLegacy?: boolean;
    legacyLabel?: string;
  }
): T => {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return value;
};

/**
 * التحقق من أن السجل قديم (قبل تاريخ معين)
 * Check if record is legacy (before certain date)
 */
export const isLegacyRecord = (
  createdAt: string | Date,
  cutoffDate?: string | Date
): boolean => {
  const recordDate = new Date(createdAt);
  const cutoff = cutoffDate ? new Date(cutoffDate) : new Date('2026-01-01');
  return recordDate < cutoff;
};

/**
 * الحصول على قيمة الفرع مع معالجة السجلات القديمة
 * Get branch value with legacy handling
 */
export interface Branch {
  id: string;
  name: string;
  name_ar: string;
  isLegacy?: boolean;
}

export const getLegacyBranch = (
  branchId: string | null | undefined,
  branches: Branch[],
  language: 'ar' | 'en' = 'ar'
): Branch => {
  if (!branchId) {
    return {
      id: 'legacy',
      name: 'Main Branch',
      name_ar: 'الفرع الرئيسي',
      isLegacy: true
    };
  }

  const branch = branches.find(b => b.id === branchId);
  return branch || {
    id: 'unknown',
    name: 'Unknown Branch',
    name_ar: 'فرع غير معروف',
    isLegacy: true
  };
};

/**
 * تنسيق قيمة اختيارية مع رسالة للقيم الفارغة
 * Format optional value with message for empty values
 */
export const formatOptionalValue = (
  value: string | null | undefined,
  emptyLabel: string = 'N/A',
  isRTL: boolean = true
): string => {
  if (!value || value.trim() === '') {
    return emptyLabel;
  }
  return value;
};

/**
 * التحقق من وجود مرفق مع معالجة السجلات القديمة
 * Check attachment existence with legacy handling
 */
export const hasAttachment = (
  attachmentUrl: string | null | undefined
): boolean => {
  return !!attachmentUrl && attachmentUrl.trim() !== '';
};

/**
 * الحصول على رسالة وصفية للمرفق
 * Get descriptive message for attachment
 */
export const getAttachmentMessage = (
  attachmentUrl: string | null | undefined,
  isRTL: boolean = true
): { hasAttachment: boolean; message: string; icon: string } => {
  if (hasAttachment(attachmentUrl)) {
    return {
      hasAttachment: true,
      message: isRTL ? 'يوجد مرفق' : 'Attachment available',
      icon: '📎'
    };
  }
  return {
    hasAttachment: false,
    message: isRTL ? 'لا يوجد مرفق (سجل قديم)' : 'No attachment (legacy record)',
    icon: '📄'
  };
};

/**
 * تحويل قيمة NULL إلى قيمة افتراضية بناءً على النوع
 * Convert NULL to default value based on type
 */
export const coalesceByType = <T,>(
  value: T | null | undefined,
  type: 'string' | 'number' | 'boolean' | 'date'
): T | string | number | boolean | Date => {
  if (value !== null && value !== undefined) {
    return value;
  }

  switch (type) {
    case 'string':
      return '' as any;
    case 'number':
      return 0 as any;
    case 'boolean':
      return false as any;
    case 'date':
      return new Date() as any;
    default:
      return value as any;
  }
};

/**
 * دالة مساعدة لعرض تاريخ مع معالجة القيم الفارغة
 * Helper to display date with null handling
 */
export const formatLegacyDate = (
  date: string | Date | null | undefined,
  options: {
    locale?: string;
    emptyLabel?: string;
    format?: Intl.DateTimeFormatOptions;
  } = {}
): string => {
  const {
    locale = 'ar-SA',
    emptyLabel = 'تاريخ غير محدد',
    format = { year: 'numeric', month: 'short', day: 'numeric' }
  } = options;

  if (!date) {
    return emptyLabel;
  }

  try {
    return new Date(date).toLocaleDateString(locale, format);
  } catch {
    return emptyLabel;
  }
};

/**
 * معالجة قائمة بيانات مع إزالة السجلات التالفة وتسجيل تحذيرات
 * Process data list with removing corrupted records and logging warnings
 */
export const sanitizeLegacyData = <T extends { id: string }>(
  data: (T | null | undefined)[],
  options?: {
    logWarnings?: boolean;
    filterNull?: boolean;
  }
): T[] => {
  const { logWarnings = true, filterNull = true } = options || {};

  const sanitized = data.filter((item): item is T => {
    if (!item) {
      if (logWarnings) {
        console.warn('[Legacy Data] Found null/undefined record');
      }
      return !filterNull;
    }

    if (!item.id) {
      if (logWarnings) {
        console.warn('[Legacy Data] Found record without ID:', item);
      }
      return false;
    }

    return true;
  });

  if (logWarnings && sanitized.length < data.length) {
    console.warn(
      `[Legacy Data] Filtered ${data.length - sanitized.length} invalid records`
    );
  }

  return sanitized;
};

/**
 * دالة لدمج البيانات القديمة مع الافتراضية
 * Merge legacy data with defaults
 */
export const mergeLegacyDefaults = <T extends Record<string, any>>(
  data: Partial<T>,
  defaults: T
): T => {
  const merged = { ...defaults };

  Object.keys(data).forEach((key) => {
    if (data[key] !== null && data[key] !== undefined) {
      merged[key] = data[key];
    }
  });

  return merged;
};

/**
 * التحقق من اكتمال البيانات
 * Check data completeness
 */
export interface CompletenessCheck {
  isComplete: boolean;
  missingFields: string[];
  completenessPercentage: number;
}

export const checkDataCompleteness = <T extends Record<string, any>>(
  data: T,
  requiredFields: (keyof T)[],
  optionalFields: (keyof T)[] = []
): CompletenessCheck => {
  const allFields = [...requiredFields, ...optionalFields];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  requiredFields.forEach((field) => {
    if (data[field] === null || data[field] === undefined || data[field] === '') {
      missingRequired.push(String(field));
    }
  });

  optionalFields.forEach((field) => {
    if (data[field] === null || data[field] === undefined || data[field] === '') {
      missingOptional.push(String(field));
    }
  });

  const totalFields = allFields.length;
  const filledFields = totalFields - missingRequired.length - missingOptional.length;
  const completenessPercentage = (filledFields / totalFields) * 100;

  return {
    isComplete: missingRequired.length === 0,
    missingFields: [...missingRequired, ...missingOptional],
    completenessPercentage: Math.round(completenessPercentage)
  };
};

/**
 * Component Props للعرض الآمن للقيم الاختيارية
 * Component Props for safe optional value display
 */
export interface OptionalFieldProps {
  value: any;
  emptyLabel?: string;
  isLegacy?: boolean;
  showLegacyBadge?: boolean;
}

/**
 * دالة للحصول على نص مناسب للحقل الاختياري
 * Get appropriate text for optional field
 */
export const getOptionalFieldText = ({
  value,
  emptyLabel = 'غير متوفر',
  isLegacy = false,
  showLegacyBadge = true
}: OptionalFieldProps): { text: string; isEmpty: boolean; badge?: string } => {
  const isEmpty = value === null || value === undefined || value === '';

  if (isEmpty) {
    return {
      text: emptyLabel,
      isEmpty: true,
      badge: isLegacy && showLegacyBadge ? '📜 سجل قديم' : undefined
    };
  }

  return {
    text: String(value),
    isEmpty: false,
    badge: isLegacy && showLegacyBadge ? '📜 سجل قديم' : undefined
  };
};

/**
 * معالجة أخطاء البيانات القديمة
 * Handle legacy data errors
 */
export const handleLegacyDataError = (
  error: any,
  context: string,
  options?: {
    fallbackValue?: any;
    logError?: boolean;
  }
): any => {
  const { fallbackValue = null, logError = true } = options || {};

  if (logError) {
    console.error(`[Legacy Data Error] ${context}:`, error);
  }

  return fallbackValue;
};

/**
 * إنشاء قيمة افتراضية بناءً على نوع البيانات
 * Create default value based on data type
 */
export const createDefaultValue = (
  fieldName: string,
  dataType: 'uuid' | 'text' | 'numeric' | 'boolean' | 'date' | 'timestamp'
): any => {
  switch (dataType) {
    case 'uuid':
      return '00000000-0000-0000-0000-000000000000'; // Legacy UUID
    case 'text':
      return `legacy_${fieldName}`;
    case 'numeric':
      return 0;
    case 'boolean':
      return false;
    case 'date':
    case 'timestamp':
      return new Date('2020-01-01').toISOString();
    default:
      return null;
  }
};

/**
 * تحويل البيانات القديمة إلى تنسيق جديد
 * Transform legacy data to new format
 */
export const transformLegacyData = <TOld, TNew>(
  oldData: TOld,
  transformer: (old: TOld) => Partial<TNew>,
  defaults: TNew
): TNew => {
  try {
    const transformed = transformer(oldData);
    return mergeLegacyDefaults(transformed, defaults);
  } catch (error) {
    console.error('[Legacy Data Transform Error]:', error);
    return defaults;
  }
};

/**
 * التحقق من صحة البيانات القديمة
 * Validate legacy data
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export const validateLegacyData = <T extends Record<string, any>>(
  data: T,
  rules: {
    required?: (keyof T)[];
    type?: Partial<Record<keyof T, string>>;
    custom?: Array<{
      field: keyof T;
      validate: (value: any) => boolean;
      message: string;
    }>;
  }
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  rules.required?.forEach((field) => {
    if (data[field] === null || data[field] === undefined || data[field] === '') {
      errors.push(`Field ${String(field)} is required but missing`);
    }
  });

  // Check types
  if (rules.type) {
    Object.keys(rules.type).forEach((field) => {
      const expectedType = rules.type![field as keyof T];
      const actualType = typeof data[field as keyof T];

      if (actualType !== expectedType && data[field as keyof T] !== null) {
        warnings.push(
          `Field ${field} has type ${actualType} but expected ${expectedType}`
        );
      }
    });
  }

  // Custom validations
  rules.custom?.forEach(({ field, validate, message }) => {
    if (!validate(data[field])) {
      warnings.push(message);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Export all helpers
 */
export default {
  getLegacySafeValue,
  isLegacyRecord,
  getLegacyBranch,
  formatOptionalValue,
  hasAttachment,
  getAttachmentMessage,
  coalesceByType,
  formatLegacyDate,
  sanitizeLegacyData,
  mergeLegacyDefaults,
  checkDataCompleteness,
  getOptionalFieldText,
  handleLegacyDataError,
  createDefaultValue,
  transformLegacyData,
  validateLegacyData
};
