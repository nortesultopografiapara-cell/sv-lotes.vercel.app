/**
 * SHA do deployment Preview/Vercel — para confirmar qual commit está rodando.
 */
export function getDeployGitSha(): string {
  return String(
    process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT_SHA ||
      '',
  ).trim() || 'unknown';
}

export function getDeployGitShaShort(): string {
  return getDeployGitSha().slice(0, 7);
}

export function classifySignedPdfGenerationError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err || 'erro desconhecido');
  const stack = err instanceof Error ? err.stack : '';
  const blob = `${message}\n${stack || ''}`;
  const invalidBase = message.match(
    /Base física LF ESTRELA inválida: esperado \d+ páginas, encontrado \d+\. Gere\/congele novamente o PDF físico homologado\./,
  );
  if (invalidBase) {
    return invalidBase[0];
  }
  if (/pdf-lib|PDFDocument|overlay/i.test(blob)) {
    return `Falha de pdf-lib no PDF assinado LF ESTRELA: ${message}`;
  }
  if (/certificad/i.test(blob)) {
    return `Falha ao anexar certificado LF ESTRELA: ${message}`;
  }
  if (/storage|bucket|upload failed|objeto n[aã]o encontrado/i.test(blob)) {
    return `Falha de Storage no PDF assinado LF ESTRELA: ${message}`;
  }
  if (/congel|pdf f[ií]sic|physical-pdf|Falha ao congelar/i.test(blob)) {
    return `Falha ao congelar PDF físico LF ESTRELA: ${message}`;
  }
  return `Falha ao gerar PDF assinado LF ESTRELA: ${message}`;
}
