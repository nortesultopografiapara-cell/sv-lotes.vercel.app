/**
 * Upload/remoção da foto do corretor em company-assets.
 * Isolamento: primeiro segmento do path = tenant_id (policy existente).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BROKER_AVATAR_BUCKET,
  buildBrokerAvatarObjectPath,
  extractCompanyAssetsObjectPath,
  isBrokerAvatarObjectName,
  pathBelongsToBrokerAvatar,
  validateBrokerAvatarFile,
  withAvatarCacheBust,
  brokerAvatarFolder,
} from '@/lib/brokerAvatar';
import {
  canManageBrokerInTenant,
  readBrokerTenantId,
  resolveBrokerMutationColumn,
  type BrokerRow,
} from '@/lib/brokerDelete';
import { isPlatformAdmin } from '@/lib/rls';

export { canManageBrokerInTenant as canManageBrokerAvatar };

export type BrokerAvatarActor = {
  role?: string | null;
  tenantId?: string | null;
};

export function assertCanManageBrokerAvatar(
  actor: BrokerAvatarActor,
  broker: Pick<BrokerRow, 'tenant_id' | 'company_id'>,
): string {
  const brokerTenantId = readBrokerTenantId(broker);
  if (!brokerTenantId) {
    throw new Error('Corretor sem empresa vinculada.');
  }
  const allowed = canManageBrokerInTenant({
    userRole: String(actor.role || ''),
    userTenantId: actor.tenantId || null,
    brokerTenantId,
    isSuperAdmin: isPlatformAdmin(actor.role),
  });
  if (!allowed) {
    throw new Error('Somente o administrador da empresa pode gerenciar a foto do corretor.');
  }
  return brokerTenantId;
}

async function listBrokerAvatarObjectPaths(
  supabase: SupabaseClient,
  tenantId: string,
  brokerId: string,
): Promise<string[]> {
  const folder = brokerAvatarFolder(tenantId, brokerId);
  const { data, error } = await supabase.storage.from(BROKER_AVATAR_BUCKET).list(folder);
  if (error || !data) return [];
  return data
    .map((row) => String(row.name || ''))
    .filter(isBrokerAvatarObjectName)
    .map((name) => `${folder}/${name}`);
}

async function removeAvatarObjects(
  supabase: SupabaseClient,
  tenantId: string,
  brokerId: string,
  currentUrl?: string | null,
): Promise<void> {
  const fromList = await listBrokerAvatarObjectPaths(supabase, tenantId, brokerId);
  const fromUrl = extractCompanyAssetsObjectPath(currentUrl);
  const paths = new Set(fromList);
  if (fromUrl && pathBelongsToBrokerAvatar(fromUrl, tenantId, brokerId)) {
    paths.add(fromUrl);
  }
  if (paths.size === 0) return;
  await supabase.storage.from(BROKER_AVATAR_BUCKET).remove([...paths]);
}

export async function saveBrokerAvatarFile(params: {
  supabase: SupabaseClient;
  actor: BrokerAvatarActor;
  broker: BrokerRow & { avatar_url?: string | null };
  file: File;
}): Promise<string> {
  const { supabase, actor, broker, file } = params;
  const tenantId = assertCanManageBrokerAvatar(actor, broker);
  const brokerId = String(broker.id || '').trim();
  if (!brokerId) throw new Error('Corretor inválido.');

  const check = validateBrokerAvatarFile(file);
  if (!check.ok) throw new Error(check.error);

  const objectPath = buildBrokerAvatarObjectPath(tenantId, brokerId, check.ext);
  const { error: uploadError } = await supabase.storage
    .from(BROKER_AVATAR_BUCKET)
    .upload(objectPath, file, {
      upsert: true,
      cacheControl: '3600',
      contentType: check.mime,
    });
  if (uploadError) {
    throw new Error(uploadError.message || 'Falha ao enviar a foto.');
  }

  const previous = extractCompanyAssetsObjectPath(broker.avatar_url as string | undefined);
  if (previous && previous !== objectPath && pathBelongsToBrokerAvatar(previous, tenantId, brokerId)) {
    await supabase.storage.from(BROKER_AVATAR_BUCKET).remove([previous]);
  }
  const leftover = (await listBrokerAvatarObjectPaths(supabase, tenantId, brokerId)).filter(
    (p) => p !== objectPath,
  );
  if (leftover.length) {
    await supabase.storage.from(BROKER_AVATAR_BUCKET).remove(leftover);
  }

  const { data } = supabase.storage.from(BROKER_AVATAR_BUCKET).getPublicUrl(objectPath);
  const publicUrl = withAvatarCacheBust(data.publicUrl, Date.now());
  const column = resolveBrokerMutationColumn(broker);
  const { error: updateError } = await supabase
    .from('brokers')
    .update({ avatar_url: publicUrl })
    .eq('id', brokerId)
    .eq(column, tenantId);
  if (updateError) {
    throw new Error(updateError.message || 'Foto enviada, mas não foi possível salvar o cadastro.');
  }
  return publicUrl;
}

export async function removeBrokerAvatarFile(params: {
  supabase: SupabaseClient;
  actor: BrokerAvatarActor;
  broker: BrokerRow & { avatar_url?: string | null };
}): Promise<void> {
  const { supabase, actor, broker } = params;
  const tenantId = assertCanManageBrokerAvatar(actor, broker);
  const brokerId = String(broker.id || '').trim();
  if (!brokerId) throw new Error('Corretor inválido.');

  await removeAvatarObjects(supabase, tenantId, brokerId, broker.avatar_url as string | undefined);

  const column = resolveBrokerMutationColumn(broker);
  const { error } = await supabase
    .from('brokers')
    .update({ avatar_url: null })
    .eq('id', brokerId)
    .eq(column, tenantId);
  if (error) {
    throw new Error(error.message || 'Não foi possível remover a foto.');
  }
}
