/**
 * Nomes amigáveis para pastas do pacote F2.
 */

export function shortId(id: string, len = 8): string {
  return String(id || '')
    .replace(/-/g, '')
    .slice(0, len);
}

export function sanitizeFolderName(raw: string, max = 60): string {
  const base = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, max);
  return base || 'item';
}

export function folderContract(contractNumber: string | null | undefined, id: string): string {
  const num = String(contractNumber || '').trim();
  const yearMatch = num.match(/(20\d{2})/);
  const year = yearMatch ? yearMatch[1] : new Date().getUTCFullYear().toString();
  const safeNum = sanitizeFolderName(num || `Contract_${shortId(id)}`, 40);
  if (num) return `Contrato_${safeNum}_${year}`;
  return `Contract_${shortId(id)}`;
}

export function folderCustomer(name: string | null | undefined, id: string): string {
  return `${sanitizeFolderName(name || 'cliente')}_${shortId(id)}`;
}

export function folderProject(name: string | null | undefined, id: string): string {
  return `${sanitizeFolderName(name || 'empreendimento')}_${shortId(id)}`;
}

export function folderSale(params: {
  projectName?: string | null;
  quadra?: string | null;
  lote?: string | null;
  saleId: string;
}): string {
  const emp = sanitizeFolderName(params.projectName || 'venda', 30);
  const qd = sanitizeFolderName(params.quadra || 'QD', 12);
  const lt = sanitizeFolderName(params.lote || 'LT', 12);
  return `${emp}_QD_${qd}_LT_${lt}_${shortId(params.saleId)}`;
}
