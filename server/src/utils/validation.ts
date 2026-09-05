export interface ValidationResult {
  isValid: boolean;
  fieldErrors: Record<string, string>;
}

export function validateSummary(summary: unknown): { isValid: boolean; error?: string; trimmed?: string } {
  if (typeof summary !== 'string') {
    return { isValid: false, error: 'Summary is required.' };
  }
  const trimmed = summary.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Summary is required.' };
  }
  if (trimmed.length < 5 || trimmed.length > 120) {
    return { isValid: false, error: 'Summary must be 5-120 characters.', trimmed };
  }
  return { isValid: true, trimmed };
}

export function validateDescription(description: unknown): { isValid: boolean; error?: string; trimmed?: string } {
  if (typeof description !== 'string') {
    return { isValid: false, error: 'Description is required.' };
  }
  const trimmed = description.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Description is required.' };
  }
  if (trimmed.length < 10 || trimmed.length > 2000) {
    return { isValid: false, error: 'Description must be 10-2000 characters.', trimmed };
  }
  return { isValid: true, trimmed };
}

export function validatePriority(priority: unknown): { isValid: boolean; error?: string } {
  if (typeof priority !== 'string' || !['LOW', 'MEDIUM', 'HIGH'].includes(priority)) {
    return { isValid: false, error: 'Requested Priority must be LOW, MEDIUM, or HIGH.' };
  }
  return { isValid: true };
}

export function validateRemovalReason(
  reason: unknown,
): { isValid: boolean; error?: string; trimmed?: string } {
  if (typeof reason !== 'string') {
    return { isValid: false, error: 'A removal reason is required.' };
  }
  const trimmed = reason.trim();
  if (!trimmed) {
    return { isValid: false, error: 'A removal reason is required.' };
  }
  if (trimmed.length < 3 || trimmed.length > 200) {
    return { isValid: false, error: 'Removal reason must be 3-200 characters.', trimmed };
  }
  return { isValid: true, trimmed };
}

export function validateTicketInputFields(body: any): ValidationResult & {
  trimmedSummary?: string;
  trimmedDescription?: string;
} {
  const fieldErrors: Record<string, string> = {};

  const summaryResult = validateSummary(body?.summary);
  if (!summaryResult.isValid && summaryResult.error) {
    fieldErrors.summary = summaryResult.error;
  }

  const descResult = validateDescription(body?.description);
  if (!descResult.isValid && descResult.error) {
    fieldErrors.description = descResult.error;
  }

  if (body?.categoryId === undefined || body?.categoryId === null || body?.categoryId === '') {
    fieldErrors.categoryId = 'Category is required.';
  } else {
    const catId = Number(body.categoryId);
    if (!Number.isInteger(catId) || catId <= 0) {
      fieldErrors.categoryId = 'Category is required.';
    }
  }

  if (body?.relatedSystemId === undefined || body?.relatedSystemId === null || body?.relatedSystemId === '') {
    fieldErrors.relatedSystemId = 'Related System is required.';
  } else {
    const relId = Number(body.relatedSystemId);
    if (!Number.isInteger(relId) || relId <= 0) {
      fieldErrors.relatedSystemId = 'Related System is required.';
    }
  }

  const priorityResult = validatePriority(body?.requestedPriority);
  if (!priorityResult.isValid && priorityResult.error) {
    fieldErrors.requestedPriority = priorityResult.error;
  }

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    trimmedSummary: summaryResult.trimmed,
    trimmedDescription: descResult.trimmed,
  };
}
