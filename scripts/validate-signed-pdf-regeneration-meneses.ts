/**
 * Valida regeneração visual do PDF assinado para contrato legado Meneses.
 * npx tsx scripts/validate-signed-pdf-regeneration-meneses.ts [contractNumber]
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  getLatestSignedSaleSignature,
  loadSaleContractHtmlForSign,
  loadSaleContractPdfForSign,
  loadSaleSignPageContext,
} from '../lib/saleContractSignatureService';
import {
  replaceContractSignaturesBlock,
} from '../lib/saleContractSignatureCertificateHtml';

const CONTRACT_NUMBER = process.argv[2]?.trim() || '000000026/2026';
const MENESES_TENANT = '59d38b25-61bb-4114-a8c1-8e34d9c78c2c';

async function loadProductionEnv(): Promise<void> {
  const authPath =
    process.env.VERCEL_AUTH_PATH ||
    'C:/Users/User/AppData/Roaming/xdg.data/com.vercel.cli/auth.json';
  if (!fs.existsSync(authPath)) return;

  const auth = JSON.parse(fs.readFileSync(authPath, 'utf8')) as { token?: string };
  if (!auth.token) return;

  const projectId = 'prj_qpba9orEU4kJNRHqMLVM1Khp3GIP';
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/env?decrypt=true&target=production`,
    { headers: { Authorization: `Bearer ${auth.token}` } },
  );
  if (!res.ok) return;

  const data = (await res.json()) as { envs?: Array<{ key: string; value?: string }> };
  for (const item of data.envs || []) {
    if (item.key && item.value) process.env[item.key] = item.value;
  }
}

function loadEnvFiles() {
  for (const f of [
    '.env.vercel.pull.production',
    '.env.production.local',
    '.env.vercel.production',
    '.env.local',
    '.env',
  ]) {
    if (!fs.existsSync(f)) continue;
    const env = fs.readFileSync(f, 'utf8');
    for (const line of env.split(/\r?\n/)) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
  }
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function pdfContainsText(pdf: Uint8Array, text: string): boolean {
  return Buffer.from(pdf).toString('latin1').includes(text);
}

async function main() {
  loadEnvFiles();
  await loadProductionEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase não configurado (.env.production.local)');

  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: contract, error } = await sb
    .from('contracts')
    .select('id, contract_number, tenant_id, pdf_signed_url, status')
    .eq('contract_number', CONTRACT_NUMBER)
    .maybeSingle();

  if (error || !contract) {
    throw new Error(`Contrato ${CONTRACT_NUMBER} não encontrado: ${error?.message || '—'}`);
  }

  assert(
    String(contract.tenant_id || '') === MENESES_TENANT,
    `Contrato não pertence à Meneses (${contract.tenant_id})`,
  );
  assert(Boolean(String(contract.pdf_signed_url || '').trim()), 'Contrato legado deve ter pdf_signed_url');

  const signature = await getLatestSignedSaleSignature(sb, contract.id);
  assert(Boolean(signature?.signature_status === 'SIGNED'), 'Assinatura SIGNED ausente');

  const signContext = await loadSaleSignPageContext(sb, signature!);
  const htmlBefore = await loadSaleContractHtmlForSign(sb, contract.id);
  assert(htmlBefore.includes('contract-signatures'), 'HTML base contém bloco de assinaturas legado');

  const htmlPatched = replaceContractSignaturesBlock(htmlBefore, '');
  assert(!htmlPatched.includes('signature-slot'), 'Bloco legado de linhas removido');

  console.log('Regenerando PDF (mesmo caminho da API Baixar PDF Assinado)...');
  const { pdf, contractNumber } = await loadSaleContractPdfForSign(sb, contract.id, {
    signature: signature!,
    signContext,
  });

  assert(pdf.byteLength > 5000, `PDF gerado (${pdf.byteLength} bytes)`);
  assert(
    pdfContainsText(pdf, 'ASSINADO ELETRONICAMENTE') ||
      pdfContainsText(pdf, 'ASSINADO ELETR'),
    'PDF contém selo ASSINADO ELETRONICAMENTE',
  );
  assert(
    pdfContainsText(pdf, 'PROMITENTE') || pdfContainsText(pdf, 'Promitente'),
    'PDF contém vendedor',
  );
  assert(
    pdfContainsText(pdf, 'COMPRADOR') || pdfContainsText(pdf, 'Comprador') || pdfContainsText(pdf, 'Comprador'),
    'PDF contém comprador',
  );
  assert(
    pdfContainsText(pdf, 'Certificado') || pdfContainsText(pdf, 'CERTIFICADO'),
    'PDF contém certificado',
  );

  const outDir = 'tmp';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/meneses-${CONTRACT_NUMBER.replace(/\//g, '-')}-signed-regenerated.pdf`;
  fs.writeFileSync(outPath, pdf);

  console.log('OK validate-signed-pdf-regeneration-meneses');
  console.log({
    contractNumber,
    contractId: contract.id,
    hadStoredPdf: Boolean(contract.pdf_signed_url),
    pdfBytes: pdf.byteLength,
    output: outPath,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
