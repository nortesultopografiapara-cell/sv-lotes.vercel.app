/**
 * Utilitários de upload — rotas de migração.
 */

export function extractUploadedFile(
  formValue: FormDataEntryValue | null,
  fallbackName = 'upload.dat',
): File | null {
  if (formValue instanceof File) {
    return formValue;
  }

  if (formValue instanceof Blob) {
    const name =
      'name' in formValue && typeof formValue.name === 'string'
        ? formValue.name
        : fallbackName;
    return new File([formValue], name, {
      type: formValue.type || 'application/octet-stream',
    });
  }

  return null;
}
