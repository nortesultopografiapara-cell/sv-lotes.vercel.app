/**
 * Seed fictício exclusivo do DEVELOP.
 * Aborta em Production / main / project ref errado.
 * npx tsx scripts/develop/seed-homolog.ts
 */
import { createClient } from '@supabase/supabase-js';
import { assertDevelopWriteAllowed, loadDevelopEnv } from './guard';
import { DEVELOP_PROJECT_REF } from '../../lib/homolog/env';

const HOMOLOG_PASSWORD = 'Homologacao!2026';

const IDS = {
  companyA: 'a1000000-0000-4000-8000-000000000001',
  companyB: 'a1000000-0000-4000-8000-000000000002',
  projectA: 'a2000000-0000-4000-8000-000000000001',
  blockA: 'a3000000-0000-4000-8000-000000000001',
  lot01: 'a4000000-0000-4000-8000-000000000001',
  lot02: 'a4000000-0000-4000-8000-000000000002',
  lot03: 'a4000000-0000-4000-8000-000000000003',
  lot04: 'a4000000-0000-4000-8000-000000000004',
  lot05: 'a4000000-0000-4000-8000-000000000005',
  customerA: 'a5000000-0000-4000-8000-000000000001',
  customerB: 'a5000000-0000-4000-8000-000000000002',
  customerC: 'a5000000-0000-4000-8000-000000000003',
  customerD: 'a5000000-0000-4000-8000-000000000004',
};

const USERS = [
  {
    email: 'super.admin.homolog@svlotes.test',
    name: 'SUPER ADMIN Homologação',
    role: 'SUPER_ADMIN',
    tenantId: null as string | null,
  },
  {
    email: 'admin.empresa-a.homolog@svlotes.test',
    name: 'ADMIN Homologação A',
    role: 'ADMIN',
    tenantId: IDS.companyA,
  },
  {
    email: 'owner.empresa-a.homolog@svlotes.test',
    name: 'OWNER Homologação A',
    role: 'OWNER',
    tenantId: IDS.companyA,
  },
  {
    email: 'admin.empresa-b.homolog@svlotes.test',
    name: 'ADMIN Homologação B',
    role: 'ADMIN',
    tenantId: IDS.companyB,
  },
];

const square: [number, number][] = [
  [-49.91, -6.08],
  [-49.9095, -6.08],
  [-49.9095, -6.0804],
  [-49.91, -6.0804],
  [-49.91, -6.08],
];

function lotGeom(dx: number) {
  const coords = square.map(([lng, lat]) => [lng + dx, lat]);
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [coords] },
  };
}

async function upsert(
  admin: ReturnType<typeof createClient>,
  table: string,
  row: Record<string, unknown>,
) {
  const { error } = await admin.from(table).upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function main() {
  const target = assertDevelopWriteAllowed();
  if (target.ref !== DEVELOP_PROJECT_REF) {
    throw new Error(`ABORT: seed somente em ${DEVELOP_PROJECT_REF}`);
  }
  const env = loadDevelopEnv();
  if (!env.service || /SENSITIVE/i.test(env.service)) {
    console.log(
      JSON.stringify({
        ok: false,
        abort: 'MISSING_DEVELOP_SERVICE_ROLE',
        hint: 'Coloque a service role do DEVELOP em .env.develop.apply',
        target,
      }),
    );
    process.exit(2);
  }

  const admin = createClient(env.url, env.service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await upsert(admin, 'companies', {
    id: IDS.companyA,
    name: 'SV LOTES HOMOLOGAÇÃO A',
    slug: 'sv-lotes-homologacao-a',
    cnpj: '00000000000191',
    plan: 'PROFESSIONAL',
    active: true,
  });
  await upsert(admin, 'companies', {
    id: IDS.companyB,
    name: 'SV LOTES HOMOLOGAÇÃO B',
    slug: 'sv-lotes-homologacao-b',
    cnpj: '00000000000272',
    plan: 'PROFESSIONAL',
    active: true,
  });

  const createdUsers: Array<{ email: string; role: string; id: string }> = [];
  for (const u of USERS) {
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let authId = existing?.users?.find((x) => x.email === u.email)?.id;
    if (!authId) {
      const created = await admin.auth.admin.createUser({
        email: u.email,
        password: HOMOLOG_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name, role: u.role, homolog: true },
      });
      if (created.error || !created.data.user) {
        throw new Error(`auth ${u.email}: ${created.error?.message || 'create failed'}`);
      }
      authId = created.data.user.id;
    }
    await upsert(admin, 'users', {
      id: authId,
      tenant_id: u.tenantId,
      full_name: u.name,
      email: u.email,
      role: u.role,
      status: 'ACTIVE',
    });
    createdUsers.push({ email: u.email, role: u.role, id: authId });
  }

  const adminA = createdUsers.find((u) => u.role === 'ADMIN' && u.email.includes('empresa-a'));
  await upsert(admin, 'projects', {
    id: IDS.projectA,
    tenant_id: IDS.companyA,
    name: 'LOTEAMENTO HOMOLOGAÇÃO',
    status: 'ACTIVE',
    location: 'Parauapebas / PA (fictício)',
  });
  await upsert(admin, 'blocks', {
    id: IDS.blockA,
    tenant_id: IDS.companyA,
    project_id: IDS.projectA,
    name: '01',
  });

  const lots = [
    { id: IDS.lot01, number: '01', status: 'AVAILABLE', dx: 0 },
    { id: IDS.lot02, number: '02', status: 'RESERVED', dx: 0.0006 },
    { id: IDS.lot03, number: '03', status: 'SOLD', dx: 0.0012 },
    { id: IDS.lot04, number: '04', status: 'SOLD', dx: 0.0018 },
    { id: IDS.lot05, number: '05', status: 'SOLD', dx: 0.0024 },
  ];
  for (const lot of lots) {
    await upsert(admin, 'lots', {
      id: lot.id,
      tenant_id: IDS.companyA,
      block_id: IDS.blockA,
      number: lot.number,
      area: 360,
      price: 45000,
      status: lot.status,
      geom: lotGeom(lot.dx),
    });
  }

  const customers = [
    { id: IDS.customerA, name: 'CLIENTE A', cpf: '00000000191', email: 'cliente.a.homolog@svlotes.test' },
    { id: IDS.customerB, name: 'CLIENTE B', cpf: '00000000272', email: 'cliente.b.homolog@svlotes.test' },
    { id: IDS.customerC, name: 'CLIENTE C', cpf: '00000000353', email: 'cliente.c.homolog@svlotes.test' },
    { id: IDS.customerD, name: 'CLIENTE D', cpf: '00000000434', email: 'cliente.d.homolog@svlotes.test' },
  ];
  for (const c of customers) {
    await upsert(admin, 'customers', {
      id: c.id,
      tenant_id: IDS.companyA,
      company_id: IDS.companyA,
      name: c.name,
      cpf_cnpj: c.cpf,
      email: c.email,
      phone: '94900000000',
      city: 'Parauapebas',
      state: 'PA',
    });
  }

  const saleId = 'a6000000-0000-4000-8000-000000000001';
  const contractId = 'a7000000-0000-4000-8000-000000000001';
  await upsert(admin, 'sales', {
    id: saleId,
    tenant_id: IDS.companyA,
    company_id: IDS.companyA,
    project_id: IDS.projectA,
    block_id: IDS.blockA,
    lot_id: IDS.lot03,
    customer_id: IDS.customerA,
    client_id: IDS.customerA,
    user_id: adminA?.id || createdUsers[1].id,
    agreed_price: 45000,
    lot_price: 45000,
    discount: 0,
    total_value: 45000,
    down_payment: 5000,
    installments_count: 10,
    payment_type: 'installments',
    status: 'ACTIVE',
    sale_date: new Date().toISOString().slice(0, 10),
  });

  const receipts = [
    { n: 0, kind: 'entrada', amount: 5000, paid: true, days: -20 },
    { n: 1, kind: 'parcela', amount: 4000, paid: true, days: -10 },
    { n: 2, kind: 'parcela', amount: 4000, paid: false, days: 20 },
    { n: 3, kind: 'parcela', amount: 4000, paid: false, days: 50 },
  ];
  for (const r of receipts) {
    const due = new Date();
    due.setDate(due.getDate() + r.days);
    const id = `a8000000-0000-4000-8000-00000000000${r.n}`;
    await upsert(admin, 'finance_receipts', {
      id,
      tenant_id: IDS.companyA,
      company_id: IDS.companyA,
      sale_id: saleId,
      customer_id: IDS.customerA,
      installment_number: r.n,
      amount: r.amount,
      due_date: due.toISOString().slice(0, 10),
      status: r.paid ? 'PAID' : 'PENDING',
      paid_at: r.paid ? due.toISOString() : null,
      origin: 'LOCAL',
    });
  }

  await upsert(admin, 'contracts', {
    id: contractId,
    tenant_id: IDS.companyA,
    company_id: IDS.companyA,
    sale_id: saleId,
    customer_id: IDS.customerA,
    status: 'ativo',
    generated_html: '<p>Contrato fictício de homologação — CLIENTE A — lote 03.</p>',
    is_current: true,
    version: 1,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectRef: target.ref,
        branch: target.branch,
        companies: ['SV LOTES HOMOLOGAÇÃO A', 'SV LOTES HOMOLOGAÇÃO B'],
        users: createdUsers.map((u) => ({ email: u.email, role: u.role })),
        project: 'LOTEAMENTO HOMOLOGAÇÃO',
        lots: lots.map((l) => ({ number: l.number, status: l.status })),
        customers: customers.map((c) => c.name),
        sale: { lot: '03', customer: 'CLIENTE A', receipts: receipts.length },
        passwordHint: 'ver docs/DEVELOP.md',
        noExternalCharges: true,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
