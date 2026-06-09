/**
 * Mescla campos de autofill sem sobrescrever valores já digitados.
 */

export function isEmptyFormField(value: unknown): boolean {
  if (value == null) return true;
  const text = String(value).trim();
  return text.length === 0;
}

export function mergeAutofillOnlyEmpty<T extends Record<string, unknown>>(
  current: T,
  incoming: Partial<T>,
  keys?: (keyof T)[],
): T {
  const out = { ...current };
  const entries = keys
    ? keys.map((k) => [k, incoming[k]] as const)
    : (Object.entries(incoming) as [keyof T, T[keyof T]][]);

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (isEmptyFormField(out[key])) {
      out[key] = value as T[keyof T];
    }
  }
  return out;
}
