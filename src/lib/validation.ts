/**
 * Validation Utility
 *
 * Centralized validation functions for form inputs
 */

/**
 * Validate that a value is not empty
 */
export const validateRequired = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  const isEmpty = value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');

  if (isEmpty) {
    return {
      valid: false,
      error: fieldName ? `${fieldName} is required` : 'This field is required',
    };
  }

  return { valid: true };
};

/**
 * Validate numeric value with optional min/max
 */
export const validateNumeric = (
  value: any,
  options?: {
    min?: number;
    max?: number;
    allowZero?: boolean;
    allowNegative?: boolean;
    fieldName?: string;
  }
): { valid: boolean; error?: string } => {
  const num = typeof value === 'string' ? parseFloat(value) : value;

  if (isNaN(num) || typeof num !== 'number') {
    return {
      valid: false,
      error: `${options?.fieldName || 'Value'} must be a valid number`,
    };
  }

  if (!options?.allowNegative && num < 0) {
    return {
      valid: false,
      error: `${options?.fieldName || 'Value'} cannot be negative`,
    };
  }

  if (!options?.allowZero && num === 0) {
    return {
      valid: false,
      error: `${options?.fieldName || 'Value'} cannot be zero`,
    };
  }

  if (options?.min !== undefined && num < options.min) {
    return {
      valid: false,
      error: `${options?.fieldName || 'Value'} must be at least ${options.min}`,
    };
  }

  if (options?.max !== undefined && num > options.max) {
    return {
      valid: false,
      error: `${options?.fieldName || 'Value'} cannot exceed ${options.max}`,
    };
  }

  return { valid: true };
};

/**
 * Validate percentage (0-100)
 */
export const validatePercentage = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  return validateNumeric(value, {
    min: 0,
    max: 100,
    allowZero: true,
    allowNegative: false,
    fieldName: fieldName || 'Percentage',
  });
};

/**
 * Validate date
 */
export const validateDate = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  if (!value) {
    return {
      valid: false,
      error: `${fieldName || 'Date'} is required`,
    };
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return {
      valid: false,
      error: `${fieldName || 'Date'} is not valid`,
    };
  }

  return { valid: true };
};

/**
 * Validate future date
 */
export const validateFutureDate = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  const dateValidation = validateDate(value, fieldName);
  if (!dateValidation.valid) return dateValidation;

  const date = new Date(value);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (date < now) {
    return {
      valid: false,
      error: `${fieldName || 'Date'} must be in the future`,
    };
  }

  return { valid: true };
};

/**
 * Validate past date
 */
export const validatePastDate = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  const dateValidation = validateDate(value, fieldName);
  if (!dateValidation.valid) return dateValidation;

  const date = new Date(value);
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (date > now) {
    return {
      valid: false,
      error: `${fieldName || 'Date'} cannot be in the future`,
    };
  }

  return { valid: true };
};

/**
 * Validate email format
 */
export const validateEmail = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  const requiredCheck = validateRequired(value, fieldName);
  if (!requiredCheck.valid) return requiredCheck;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) {
    return {
      valid: false,
      error: `${fieldName || 'Email'} is not valid`,
    };
  }

  return { valid: true };
};

/**
 * Validate phone number (basic)
 */
export const validatePhone = (value: any, fieldName?: string): { valid: boolean; error?: string } => {
  const requiredCheck = validateRequired(value, fieldName);
  if (!requiredCheck.valid) return requiredCheck;

  // Allow numbers, spaces, +, -, (, )
  const phoneRegex = /^[\d\s+\-()]+$/;
  if (!phoneRegex.test(value)) {
    return {
      valid: false,
      error: `${fieldName || 'Phone'} contains invalid characters`,
    };
  }

  // Check minimum length (at least 7 digits)
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) {
    return {
      valid: false,
      error: `${fieldName || 'Phone'} is too short`,
    };
  }

  return { valid: true };
};

/**
 * Validate string length
 */
export const validateLength = (
  value: any,
  options: {
    min?: number;
    max?: number;
    fieldName?: string;
  }
): { valid: boolean; error?: string } => {
  const str = String(value || '');

  if (options.min !== undefined && str.length < options.min) {
    return {
      valid: false,
      error: `${options.fieldName || 'Value'} must be at least ${options.min} characters`,
    };
  }

  if (options.max !== undefined && str.length > options.max) {
    return {
      valid: false,
      error: `${options.fieldName || 'Value'} cannot exceed ${options.max} characters`,
    };
  }

  return { valid: true };
};

/**
 * Validate form data with multiple fields
 */
export const validateForm = (
  data: Record<string, any>,
  rules: Record<string, ((value: any) => { valid: boolean; error?: string })[]>
): { valid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};

  for (const field in rules) {
    const value = data[field];
    const fieldRules = rules[field];

    for (const rule of fieldRules) {
      const result = rule(value);
      if (!result.valid) {
        errors[field] = result.error || 'Validation failed';
        break; // Stop at first error for this field
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
};
