/**
 * Testes — foto/avatar do corretor (Etapa E).
 * npx tsx scripts/mandatory-broker-avatar-tests.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BROKER_AVATAR_BUCKET,
  BROKER_AVATAR_MAX_BYTES,
  buildBrokerAvatarObjectPath,
  brokerAvatarFolder,
  brokerInitial,
  extractCompanyAssetsObjectPath,
  pathBelongsToBrokerAvatar,
  validateBrokerAvatarFile,
  withAvatarCacheBust,
} from '../lib/brokerAvatar';
import { canManageBrokerInTenant } from '../lib/brokerDelete';
import { assertCanManageBrokerAvatar } from '../lib/brokerAvatarStorage';

function ok(cond: boolean, msg: string) {
  assert.equal(cond, true, msg);
}

function testInitialWithoutPhoto() {
  assert.equal(brokerInitial('Marcos Antonio Ferreira de Sousa'), 'M');
  assert.equal(brokerInitial(' cassio'), 'C');
  assert.equal(brokerInitial(''), '?');
  console.log('OK testInitialWithoutPhoto');
}

function testAcceptsJpegPngWebp() {
  ok(validateBrokerAvatarFile({ name: 'a.jpg', type: 'image/jpeg', size: 12 }).ok, 'jpg');
  ok(validateBrokerAvatarFile({ name: 'a.jpeg', type: 'image/jpeg', size: 12 }).ok, 'jpeg');
  ok(validateBrokerAvatarFile({ name: 'a.png', type: 'image/png', size: 12 }).ok, 'png');
  ok(validateBrokerAvatarFile({ name: 'a.webp', type: 'image/webp', size: 12 }).ok, 'webp');
  console.log('OK testAcceptsJpegPngWebp');
}

function testRejectsOver2Mb() {
  const r = validateBrokerAvatarFile({
    name: 'big.jpg',
    type: 'image/jpeg',
    size: BROKER_AVATAR_MAX_BYTES + 1,
  });
  ok(!r.ok && r.error.includes('2 MB'), 'rejeita > 2MB');
  console.log('OK testRejectsOver2Mb');
}

function testRejectsInvalidFormat() {
  const gif = validateBrokerAvatarFile({ name: 'x.gif', type: 'image/gif', size: 10 });
  const pdf = validateBrokerAvatarFile({ name: 'x.pdf', type: 'application/pdf', size: 10 });
  ok(!gif.ok, 'rejeita gif');
  ok(!pdf.ok, 'rejeita pdf');
  console.log('OK testRejectsInvalidFormat');
}

function testPathIsolationAndCacheBust() {
  const tenantA = '11111111-1111-1111-1111-111111111111';
  const tenantB = '22222222-2222-2222-2222-222222222222';
  const brokerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const objectPath = buildBrokerAvatarObjectPath(tenantA, brokerId, 'jpg', 1700000000000);
  assert.equal(objectPath, `${tenantA}/brokers/${brokerId}/avatar-1700000000000.jpg`);
  ok(pathBelongsToBrokerAvatar(objectPath, tenantA, brokerId), 'path do tenant A');
  ok(!pathBelongsToBrokerAvatar(objectPath, tenantB, brokerId), 'tenant B não reivindica path A');
  assert.equal(BROKER_AVATAR_BUCKET, 'company-assets');
  assert.equal(brokerAvatarFolder(tenantA, brokerId).startsWith(`${tenantA}/`), true);
  const url = withAvatarCacheBust(
    `https://hoynysmynxncdlptuzub.supabase.co/storage/v1/object/public/company-assets/${objectPath}`,
    99,
  );
  ok(url.includes('?v=99'), 'cache bust');
  const extracted = extractCompanyAssetsObjectPath(url);
  assert.equal(extracted, objectPath);
  console.log('OK testPathIsolationAndCacheBust');
}

function testTenantACannotManageTenantB() {
  const allowed = canManageBrokerInTenant({
    userRole: 'ADMIN',
    userTenantId: 'tenant-a',
    brokerTenantId: 'tenant-b',
    isSuperAdmin: false,
  });
  ok(!allowed, 'ADMIN A não gerencia corretor B');
  try {
    assertCanManageBrokerAvatar(
      { role: 'ADMIN', tenantId: 'tenant-a' },
      { id: 'b1', tenant_id: 'tenant-b', company_id: 'tenant-b' },
    );
    throw new Error('deveria bloquear');
  } catch (e) {
    ok(String((e as Error).message).includes('administrador'), 'mensagem de permissão');
  }
  ok(
    !canManageBrokerInTenant({
      userRole: 'BROKER',
      userTenantId: 'tenant-a',
      brokerTenantId: 'tenant-a',
      isSuperAdmin: false,
    }),
    'BROKER não gerencia foto',
  );
  ok(
    canManageBrokerInTenant({
      userRole: 'ADMIN',
      userTenantId: 'tenant-a',
      brokerTenantId: 'tenant-a',
      isSuperAdmin: false,
    }),
    'ADMIN da própria empresa gerencia',
  );
  ok(
    canManageBrokerInTenant({
      userRole: 'SUPER_ADMIN',
      userTenantId: null,
      brokerTenantId: 'tenant-a',
      isSuperAdmin: true,
    }),
    'SUPER_ADMIN preservado',
  );
  console.log('OK testTenantACannotManageTenantB');
}

function testNoBase64AndNoLayoutRework() {
  const page = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/brokers/page.tsx'), 'utf8');
  const storage = fs.readFileSync(path.join(process.cwd(), 'lib/brokerAvatarStorage.ts'), 'utf8');
  ok(page.includes('BrokerAvatarModal'), 'modal de foto na lista');
  ok(page.includes('object-cover'), 'foto com cover');
  ok(!storage.includes('readAsDataURL'), 'não grava base64');
  ok(storage.includes("update({ avatar_url: publicUrl })"), 'persiste URL pública');
  ok(storage.includes("update({ avatar_url: null })"), 'limpa URL ao remover');
  ok(page.includes('Desempenho da Equipe'), 'D.2 desempenho intacto');
  ok(page.includes('Lista de Corretores'), 'D.2 lista intacta');
  ok(page.includes('xl:col-span-2'), 'D.2 destaque no topo intacto');
  ok(page.includes('Ver lotes'), 'lotes compactos via atalho');
  ok(!page.includes("lotesDoMes.join(', ')"), 'não lista todos QD/LT na célula');
  ok(page.includes('lotesDoMes: lotesAtivos'), 'dados de lotes preservados para PDF/Excel');
  console.log('OK testNoBase64AndNoLayoutRework');
}

function testOfficialAvatarUrlMigration() {
  const migPath = path.join(
    process.cwd(),
    'supabase/migrations/20260909134500_brokers_avatar_url.sql',
  );
  ok(fs.existsSync(migPath), 'migration oficial avatar_url');
  const sql = fs.readFileSync(migPath, 'utf8');
  ok(sql.includes('ALTER TABLE public.brokers'), 'alter brokers');
  ok(sql.includes('ADD COLUMN IF NOT EXISTS avatar_url text'), 'coluna text idempotente');
  ok(!/\bDROP\b/i.test(sql), 'sem DROP');
  ok(!sql.includes('commission'), 'não mexe em comissão');
  const historical = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260520_upgrade_brokers_table.sql'),
    'utf8',
  );
  ok(historical.includes('ADD COLUMN IF NOT EXISTS avatar_url text'), 'histórico 20260520 intacto');
  console.log('OK testOfficialAvatarUrlMigration');
}

testInitialWithoutPhoto();
testAcceptsJpegPngWebp();
testRejectsOver2Mb();
testRejectsInvalidFormat();
testPathIsolationAndCacheBust();
testTenantACannotManageTenantB();
testNoBase64AndNoLayoutRework();
testOfficialAvatarUrlMigration();
console.log('mandatory-broker-avatar-tests: all passed');
