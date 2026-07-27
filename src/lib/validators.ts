export function validatePatchString(
  value: any,
  fieldName: string,
  maxLength: number,
): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${fieldName} must be a non-empty string`;
  }
  if (value.length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters`;
  }
  return null;
}

export function parseRouteId(id: string | string[] | undefined): number | null {
  if (typeof id !== "string") {
    return null;
  }
  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}
