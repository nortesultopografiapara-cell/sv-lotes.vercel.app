/**
 * READ-ONLY: lista empresas e candidatos a Administrador Principal.
 * Não grava. Não faz backfill.
 *
 * npx tsx scripts/read-only-primary-admin-candidates.ts
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertDevelopWriteAllowed,
  loadDevelopEnv,
} from './develop/guard';
import { PRODUCTION_PROJECT_REF } from '../lib/homolog/env';
import { suggestPrimaryAdminCandidate } from '../lib/companyPrimaryAdmin';
import { isCompanyAdminUserRole } from '../lib/companyAdminUsers';

type CompanyRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  primary_admin_user_id: string | null;
};

type UserRow = {
  id: string;
  tenant_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  created_at: string | null;
  created_by: string | null;
};

async function main() {
  const target = assertDevelopWriteAllowed();
  const env = loadDevelopEnv();
  if (env.ref === PRODUCTION_PROJECT_REF) {
    throw new Error('ABORT: recusa Production.');
  }
  if (!env.url || !env.service) {
    throw new Error('ABORT: env DEVELOP incompleto (URL/service).');
  }

  const admin = createClient(env.url, env.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let companies: CompanyRow[] | null = null;
  const withColumn = await admin
    .from('companies')
    .select('id, name, created_at, primary_admin_user_id')
    .order('created_at', { ascending: true });

  let columnPresent = true;
  if (withColumn.error && /primary_admin_user_id/i.test(withColumn.error.message)) {
    columnPresent = false;
    const fallback = await admin
      .from('companies')
      .select('id, name, created_at')
      .order('created_at', { ascending: true });
    if (fallback.error) throw new Error(fallback.error.message);
    companies = ((fallback.data || []) as Array<Omit<CompanyRow, 'primary_admin_user_id'>>).map((row) => ({
      ...row,
      primary_admin_user_id: null,
    }));
  } else if (withColumn.error) {
    throw new Error(withColumn.error.message);
  } else {
    companies = (withColumn.data || []) as CompanyRow[];
  }

  const { data: users, error: userError } = await admin
    .from('users')
    .select('id, tenant_id, full_name, email, role, status, created_at, created_by')
    .order('created_at', { ascending: true });

  if (userError) {
    throw new Error(userError.message);
  }

  const usersByTenant = new Map<string, UserRow[]>();
  for (const user of (users || []) as UserRow[]) {
    if (!user.tenant_id) continue;
    const list = usersByTenant.get(user.tenant_id) || [];
    list.push(user);
    usersByTenant.set(user.tenant_id, list);
  }

  const rows = ((companies || []) as CompanyRow[]).map((company) => {
    const admins = (usersByTenant.get(company.id) || []).filter((user) =>
      isCompanyAdminUserRole(user.role),
    );
    const suggestion = suggestPrimaryAdminCandidate({
      companyId: company.id,
      primaryAdminUserId: company.primary_admin_user_id,
      admins: admins.map((adminUser) => ({
        id: adminUser.id,
        email: String(adminUser.email || ''),
        full_name: adminUser.full_name,
        role: String(adminUser.role || ''),
        status: String(adminUser.status || 'ACTIVE'),
        created_at: String(adminUser.created_at || ''),
      })),
    });

    return {
      companyId: company.id,
      companyName: company.name,
      companyCreatedAt: company.created_at,
      currentPrimaryAdminUserId: company.primary_admin_user_id,
      suggestedUserId: suggestion.suggestedUserId,
      suggestedName: suggestion.suggestedName,
      suggestedEmail: suggestion.suggestedEmail,
      reason: suggestion.reason,
      confidence: suggestion.confidence,
      admins: admins.map((adminUser) => ({
        id: adminUser.id,
        name: adminUser.full_name,
        email: adminUser.email,
        role: adminUser.role,
        status: adminUser.status,
        createdAt: adminUser.created_at,
        createdBy: adminUser.created_by,
      })),
    };
  });

  const assigned = rows.filter((row) => row.currentPrimaryAdminUserId).length;
  const summary = {
    readOnly: true,
    backfill: false,
    productionTouched: false,
    ref: target.ref,
    source: env.source,
    companies: rows.length,
    alreadyAssigned: assigned,
    pendingHumanReview: rows.length - assigned,
    columnPresent,
    migrationNeeded: !columnPresent,
    generatedAt: new Date().toISOString(),
    rows,
  };

  const outDir = join(process.cwd(), 'scripts/_fixtures/primary-admin');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'develop-primary-admin-candidates.json');
  writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        readOnly: true,
        ref: target.ref,
        companies: summary.companies,
        alreadyAssigned: summary.alreadyAssigned,
        pendingHumanReview: summary.pendingHumanReview,
        columnPresent,
        outFile,
      },
      null,
      2,
    ),
  );

  for (const row of rows) {
    console.log(
      [
        row.companyName || row.companyId,
        `primary=${row.currentPrimaryAdminUserId || 'NULL'}`,
        `sugerido=${row.suggestedName || row.suggestedEmail || '—'}`,
        row.confidence,
        row.reason,
      ].join(' | '),
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
