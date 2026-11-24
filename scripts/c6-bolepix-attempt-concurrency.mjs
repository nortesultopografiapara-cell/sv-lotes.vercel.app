/**
 * PostgreSQL isolado. Não conecta em Production.
 * node scripts/c6-bolepix-attempt-concurrency.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.env.TEMP, 'c6-pg-isolated', 'package.json'));
const EmbeddedPostgres = require('embedded-postgres').default;
const { Client } = require('pg');

const root = process.cwd();
const dataDir = path.join(process.env.TEMP, 'c6-pg-isolated', 'data');
const port = 55432;
const company = 'f26f2331-1885-4ac6-8d0e-4131cc8a8014';
const integration = 'b5cc1de3-172b-4926-a528-36cebc14db51';
const account = '7b8663bb-8520-42d5-aa62-f2a30ec84464';
const receipt = '693281b1-4d61-4209-adcc-0b378968aed3';
const otherReceipt = '25c9d7c7-fd95-43b1-97ba-8a1953469e0e';
const admin = '11111111-1111-4111-8111-111111111111';
const prior = '979ED9478CCAFCE5B66C4B3FAD';
const fresh = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const second = 'ZYXWVUTSRQPONMLKJIHGFEDCBA';
const fingerprint = 'ab'.repeat(32);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function query(client, text, values) {
  return client.query(text, values);
}

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: false,
  autoRehydrateSymlinks: true,
});

await postgres.initialise();
await postgres.start();
await postgres.createDatabase('c6_attempt');

const client = new Client({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password: 'postgres',
  database: 'c6_attempt',
});
await client.connect();

try {
  await query(client, `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE companies (id uuid PRIMARY KEY);
    CREATE TABLE bank_integrations (
      id uuid PRIMARY KEY,
      company_id uuid NOT NULL REFERENCES companies(id),
      provider text NOT NULL,
      environment text NOT NULL
    );
    CREATE TABLE finance_receipts (
      id uuid PRIMARY KEY,
      company_id uuid NOT NULL REFERENCES companies(id)
    );
    CREATE TABLE company_financial_accounts (
      id uuid PRIMARY KEY,
      company_id uuid NOT NULL REFERENCES companies(id),
      bank_integration_id uuid REFERENCES bank_integrations(id)
    );
    CREATE TABLE bank_charges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      finance_receipt_id uuid,
      provider text,
      external_id text,
      status text
    );
    CREATE TABLE c6_boleto_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid,
      integration_id uuid,
      external_reference_id text,
      status text,
      c6_bank_slip_id text,
      retry_allowed boolean
    );
    CREATE TABLE c6_bolepix_reservations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL,
      integration_id uuid NOT NULL,
      finance_receipt_id uuid NOT NULL,
      external_reference_id text NOT NULL,
      environment text NOT NULL,
      status text NOT NULL,
      attempt_count integer NOT NULL DEFAULT 1,
      request_fingerprint text NOT NULL,
      last_http_status integer,
      c6_charge_id text,
      retry_allowed boolean NOT NULL DEFAULT false,
      reserved_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (company_id, integration_id, finance_receipt_id),
      UNIQUE (company_id, integration_id, external_reference_id)
    );
  `);
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261124190000_c6_bolepix_attempt_history.sql'),
    'utf8',
  );
  await query(client, migration);
  await query(client, `INSERT INTO companies (id) VALUES ($1)`, [company]);
  await query(
    client,
    `INSERT INTO bank_integrations (id, company_id, provider, environment) VALUES ($1, $2, 'C6', 'PRODUCTION')`,
    [integration, company],
  );
  await query(
    client,
    `INSERT INTO company_financial_accounts (id, company_id, bank_integration_id) VALUES ($1, $2, $3)`,
    [account, company, integration],
  );
  await query(client, `INSERT INTO finance_receipts (id, company_id) VALUES ($1, $2), ($3, $2)`, [
    receipt,
    company,
    otherReceipt,
  ]);
  await query(
    client,
    `INSERT INTO c6_bolepix_reservations (
       company_id, integration_id, finance_receipt_id, external_reference_id, environment,
       status, request_fingerprint, last_http_status, retry_allowed, attempt_count
     ) VALUES ($1, $2, $3, $4, 'PRODUCTION', 'FAILED', $5, 400, true, 1)`,
    [company, integration, receipt, prior, fingerprint],
  );

  const reopened = await query(
    client,
    `SELECT public.reserve_c6_bolepix($1, $2, $3, $4, $5) AS result`,
    [company, integration, receipt, prior, fingerprint],
  );
  assert(reopened.rows[0].result.accepted === false, 'FAILED não é reaberto');
  const preserved = await query(
    client,
    `SELECT status, external_reference_id, attempt_count, retry_allowed, last_http_status
     FROM c6_bolepix_reservations WHERE finance_receipt_id = $1`,
    [receipt],
  );
  assert(
    preserved.rows[0].status === 'FAILED' &&
      preserved.rows[0].external_reference_id === prior &&
      preserved.rows[0].attempt_count === 1 &&
      preserved.rows[0].last_http_status === 400,
    'a reserva anterior permanece intacta',
  );

  const notReconciled = await query(
    client,
    `SELECT public.prepare_c6_bolepix_attempt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS result`,
    [company, integration, account, receipt, fresh, fingerprint, 400, null, null, admin],
  );
  assert(notReconciled.rows[0].result.reason === 'not_reconciled', 'HTTP diferente de 404 não prepara');

  const prepared = await query(
    client,
    `SELECT public.prepare_c6_bolepix_attempt($1,$2,$3,$4,$5,$6,404,$7,$8,$9) AS result`,
    [company, integration, account, receipt, fresh, fingerprint, 'baf03bcf-0bdd-4a4a-bf46-5baa3f5a6501', '{"httpStatus":404}', admin],
  );
  assert(prepared.rows[0].result.accepted === true && prepared.rows[0].result.attempt_number === 2, 'a tentativa 2 é criada');
  const history = await query(
    client,
    `SELECT count(*)::int AS total FROM c6_bolepix_reservations WHERE external_reference_id = $1`,
    [prior],
  );
  assert(history.rows[0].total === 1, 'a referência anterior continua no histórico');

  const reused = await query(
    client,
    `SELECT public.prepare_c6_bolepix_attempt($1,$2,$3,$4,$5,$6,404,NULL,NULL,$7) AS result`,
    [company, integration, account, receipt, prior, fingerprint, admin],
  );
  assert(reused.rows[0].result.reason === 'reference_reused', 'a referência enviada não pode ser repetida');

  await query(client, `DELETE FROM c6_bolepix_attempts`);
  const first = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'c6_attempt' });
  const secondClient = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'c6_attempt' });
  await first.connect();
  await secondClient.connect();
  const race = await Promise.all([
    first.query(`SELECT public.prepare_c6_bolepix_attempt($1,$2,$3,$4,$5,$6,404,NULL,NULL,$7) AS result`, [
      company, integration, account, receipt, fresh, fingerprint, admin,
    ]),
    secondClient.query(`SELECT public.prepare_c6_bolepix_attempt($1,$2,$3,$4,$5,$6,404,NULL,NULL,$7) AS result`, [
      company, integration, account, receipt, second, fingerprint, admin,
    ]),
  ]);
  const accepted = race.filter((item) => item.rows[0].result.accepted === true);
  assert(accepted.length === 1, 'duas preparações simultâneas geram uma tentativa');
  const openCount = await query(
    client,
    `SELECT count(*)::int AS total FROM c6_bolepix_attempts WHERE status = 'RESERVED'`,
  );
  assert(openCount.rows[0].total === 1, 'fica uma única tentativa aberta');
  await first.end();
  await secondClient.end();

  const claimA = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'c6_attempt' });
  const claimB = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'c6_attempt' });
  await claimA.connect();
  await claimB.connect();
  const claims = await Promise.all([
    claimA.query(`SELECT public.claim_c6_bolepix_attempt($1,$2,$3) AS result`, [company, integration, receipt]),
    claimB.query(`SELECT public.claim_c6_bolepix_attempt($1,$2,$3) AS result`, [company, integration, receipt]),
  ]);
  assert(claims.filter((item) => item.rows[0].result.accepted === true).length === 1, 'dois claims simultâneos emitem uma vez');
  await claimA.end();
  await claimB.end();

  const firstEmission = await query(
    client,
    `SELECT public.reserve_c6_bolepix($1,$2,$3,$4,$5) AS result`,
    [company, integration, otherReceipt, '0123456789ABCDEFGHIJKLMNOP', fingerprint],
  );
  assert(firstEmission.rows[0].result.accepted === true, 'a primeira reserva de outra parcela continua possível');
  const closed = await query(
    client,
    `SELECT public.complete_c6_bolepix($1,$2,$3,'FAILED',400,NULL,true) AS result`,
    [company, integration, '0123456789ABCDEFGHIJKLMNOP'],
  );
  assert(closed.rows[0].result.retry_allowed === false, 'HTTP 400 não fica reabrível');

  console.log('C6_BOLEPIX_ATTEMPT_CONCURRENCY_OK');
} finally {
  await client.end().catch(() => undefined);
  await postgres.stop().catch(() => undefined);
}
