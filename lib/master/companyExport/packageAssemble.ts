/**
 * Montagem do pacote ZIP F2 — único ou dividido por domínio (~450MB).
 */

import { createHash } from 'crypto';
import { buildStoredZip, type ZipStoreEntry } from '@/lib/master/companyExport/zipStore';
import { COMPANY_EXPORT_PACKAGE_SPLIT_BYTES } from '@/lib/master/companyExport/storageRegistry';

export type PackagePartMeta = {
  name: string;
  bytes: number;
  checksum: string;
  entryCount: number;
};

function domainOf(path: string): string {
  const p = path.replace(/^\/+/, '');
  if (p.startsWith('01_empresa/') || p === 'LEIA-ME.html' || p === 'manifest.json') {
    return 'dados_tabulares';
  }
  if (p.startsWith('02_clientes/') || p.startsWith('05_vendas/')) return 'documentos_clientes';
  if (p.startsWith('06_contratos/') || p.startsWith('08_arquivos_originais/')) return 'contratos';
  if (p.startsWith('04_empreendimentos/')) return 'empreendimentos';
  if (p.startsWith('07_financeiro/') || p.startsWith('03_corretores/') || p.startsWith('09_auditoria/')) {
    return 'financeiro_index';
  }
  if (p.startsWith('99_RESTAURACAO/') || p.startsWith('_meta/') || p === 'checksums.sha256') {
    return 'dados_tabulares';
  }
  return 'dados_tabulares';
}

const DOMAIN_ORDER = [
  'dados_tabulares',
  'documentos_clientes',
  'contratos',
  'empreendimentos',
  'financeiro_index',
] as const;

export function shouldSplitPackage(totalBytes: number): boolean {
  return totalBytes > COMPANY_EXPORT_PACKAGE_SPLIT_BYTES;
}

export function assembleExportPackage(entries: ZipStoreEntry[]): {
  packageZip: Buffer;
  parts: PackagePartMeta[];
  split: boolean;
  checksumLines: string[];
} {
  const withBuffers = entries.map((e) => ({
    path: e.path.replace(/^\/+/, '').replace(/\\/g, '/'),
    data: Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8'),
  }));

  const checksumLines = withBuffers.map((e) => {
    const hash = createHash('sha256').update(e.data).digest('hex');
    return `${hash}  ${e.path}`;
  });

  const totalBytes = withBuffers.reduce((s, e) => s + e.data.length, 0);
  if (!shouldSplitPackage(totalBytes)) {
    const packageZip = buildStoredZip(withBuffers);
    return {
      packageZip,
      parts: [
        {
          name: 'package.zip',
          bytes: packageZip.length,
          checksum: createHash('sha256').update(packageZip).digest('hex'),
          entryCount: withBuffers.length,
        },
      ],
      split: false,
      checksumLines,
    };
  }

  const buckets = new Map<string, { path: string; data: Buffer }[]>();
  for (const e of withBuffers) {
    const d = domainOf(e.path);
    const list = buckets.get(d) || [];
    list.push(e);
    buckets.set(d, list);
  }

  const partEntries: ZipStoreEntry[] = [];
  const parts: PackagePartMeta[] = [];

  for (const name of DOMAIN_ORDER) {
    const list = buckets.get(name);
    if (!list?.length) continue;
    const zip = buildStoredZip(list);
    const partName = `${name}.zip`;
    partEntries.push({ path: partName, data: zip });
    parts.push({
      name: partName,
      bytes: zip.length,
      checksum: createHash('sha256').update(zip).digest('hex'),
      entryCount: list.length,
    });
  }

  // leftover domains
  for (const [name, list] of buckets) {
    if ((DOMAIN_ORDER as readonly string[]).includes(name)) continue;
    if (!list.length) continue;
    const zip = buildStoredZip(list);
    const partName = `${name}.zip`;
    partEntries.push({ path: partName, data: zip });
    parts.push({
      name: partName,
      bytes: zip.length,
      checksum: createHash('sha256').update(zip).digest('hex'),
      entryCount: list.length,
    });
  }

  const indexBody = JSON.stringify(
    {
      split: true,
      threshold_bytes: COMPANY_EXPORT_PACKAGE_SPLIT_BYTES,
      parts,
      note: 'Descompacte cada ZIP interno para obter a árvore de pastas do domínio.',
    },
    null,
    2,
  );
  partEntries.unshift({ path: 'package_index.json', data: Buffer.from(indexBody, 'utf8') });

  const packageZip = buildStoredZip(partEntries);
  parts.unshift({
    name: 'package.zip',
    bytes: packageZip.length,
    checksum: createHash('sha256').update(packageZip).digest('hex'),
    entryCount: partEntries.length,
  });

  return { packageZip, parts, split: true, checksumLines };
}
