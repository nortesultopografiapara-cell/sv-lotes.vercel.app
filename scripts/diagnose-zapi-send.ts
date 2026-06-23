/**
 * Diagnóstico Z-API — não commitar .env.zapi-diagnose
 * npx tsx scripts/diagnose-zapi-send.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildZapiRequestDiagnostics,
  maskZapiSecret,
  sendText,
} from '../lib/whatsapp/zapiProvider';

function loadEnvFile(relPath: string): void {
  const full = path.join(process.cwd(), relPath);
  if (!fs.existsSync(full)) return;
  const content = fs.readFileSync(full, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  loadEnvFile('.env.zapi-diagnose');
  loadEnvFile('.env.production.local');

  const diagnostics = buildZapiRequestDiagnostics();
  if (!diagnostics) {
    console.log(
      'Z-API não configurada (ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN ou ZAPI_CLIENT_TOKEN ausentes).',
    );
    process.exit(1);
  }

  console.log('=== Z-API DIAGNÓSTICO (mascarado) ===');
  console.log(JSON.stringify(diagnostics, null, 2));

  const result = await sendText({
    phone: '5594991955918',
    message: '✅ Teste de integração WhatsApp do SV LOTES',
  });

  console.log('\n=== RESULTADO ENVIO ===');
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        error: result.error ?? null,
        messageId: result.messageId ?? null,
        debug: result.debug ?? null,
      },
      null,
      2,
    ),
  );

  if (!result.ok) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
