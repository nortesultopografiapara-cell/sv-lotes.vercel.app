/**
 * Troca de versão do contrato. Não grava no banco.
 * A função SQL replace_current_contract_version executa a mesma ordem em uma transação.
 */

export type ContractVersionSnapshot = {
  id: string;
  version: number;
  isCurrent: boolean;
  status: string;
  html: string;
  signatureStatus?: string | null;
  pdfSignedUrl?: string | null;
};

export function contractReplacementBlocked(contract: {
  status?: string | null;
  signature_status?: string | null;
  signatureStatus?: string | null;
  pdf_signed_url?: string | null;
  pdfSignedUrl?: string | null;
} | null | undefined): boolean {
  const status = String(contract?.status || '').trim().toLowerCase();
  const signature = String(
    contract?.signature_status || contract?.signatureStatus || '',
  ).trim().toUpperCase();
  const pdf = String(contract?.pdf_signed_url || contract?.pdfSignedUrl || '').trim();
  return status === 'assinado' || status === 'signed' || signature === 'SIGNED' || pdf.length > 0;
}

export function planContractVersionSwap(input: {
  sourceId: string;
  versions: ContractVersionSnapshot[];
  nextHtml: string;
  failAt?: 'insert' | null;
}): {
  ok: boolean;
  code: 'ok' | 'signed' | 'missing' | 'rolled_back';
  steps: string[];
  versions: ContractVersionSnapshot[];
} {
  const source = input.versions.find((row) => row.id === input.sourceId);
  if (!source) {
    return { ok: false, code: 'missing', steps: [], versions: input.versions };
  }
  if (contractReplacementBlocked(source)) {
    return { ok: false, code: 'signed', steps: ['lock'], versions: input.versions };
  }
  if (input.failAt === 'insert') {
    return { ok: false, code: 'rolled_back', steps: ['lock', 'clear-current', 'insert-current'], versions: input.versions };
  }
  const nextVersion = input.versions.reduce((max, row) => Math.max(max, Number(row.version) || 0), 0) + 1;
  const newId = `${input.sourceId}-v${nextVersion}`;
  const versions = input.versions.map((row) => {
    if (row.id !== source.id) {
      return row.isCurrent ? { ...row, isCurrent: false } : row;
    }
    return {
      ...row,
      isCurrent: false,
      status: 'superseded',
    };
  });
  versions.push({
    id: newId,
    version: nextVersion,
    isCurrent: true,
    status: 'ativo',
    html: input.nextHtml,
    signatureStatus: null,
    pdfSignedUrl: null,
  });
  return {
    ok: true,
    code: 'ok',
    steps: ['lock', 'clear-current', 'insert-current', 'supersede-source'],
    versions,
  };
}
