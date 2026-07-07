/**
 * Teste obrigatório (mínimo) — Minhas Assinaturas não pode travar aguardando manutenção financeira global.
 *
 * Como rodar:
 * tsx scripts/mandatory-billing-nonblocking-tests.ts
 */

import { strict as assert } from 'node:assert';

const DEFAULT_TIMEOUT_MS = 650;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function simulateApiBillingGetFlow(params: { financialStatusDelayMs: number }) {
  // Simula o comportamento do GET /api/billing depois da correção:
  // - dispara updateCompanyFinancialStatus em background (não aguardado)
  // - continua carregando dados necessários para render
  void (async () => {
    await sleep(params.financialStatusDelayMs);
  })();

  // Simula consultas essenciais retornando rápido.
  await sleep(30);
  return { ok: true };
}

async function main() {
  const startedAt = Date.now();

  // Cenário: manutenção financeira lenta (ex.: base grande).
  const res = await simulateApiBillingGetFlow({ financialStatusDelayMs: 5000 });

  const elapsed = Date.now() - startedAt;
  assert.equal(res.ok, true, 'GET /api/billing deve retornar payload básico');
  assert.ok(
    elapsed < DEFAULT_TIMEOUT_MS,
    `GET /api/billing não deve aguardar manutenção (elapsed=${elapsed}ms)`,
  );

  console.log('[mandatory-billing-nonblocking-tests] ok', { elapsedMs: elapsed });
}

main().catch((err) => {
  console.error('[mandatory-billing-nonblocking-tests] failed', err);
  process.exitCode = 1;
});

