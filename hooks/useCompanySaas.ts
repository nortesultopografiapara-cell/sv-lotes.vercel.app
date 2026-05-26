'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import {
  CompanySaasPlanResolved,
  CompanySaasSource,
  fetchCompanySaasByTenantId,
  getCompanySaasPlan,
  logSaasCompanyContext,
} from '@/lib/saasPlans';
import { supabase } from '@/lib/supabase';

export function useCompanySaas() {
  const { user, loading: authLoading } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanySaasSource | null>(null);
  const [saas, setSaas] = useState<CompanySaasPlanResolved | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) {
      setTenantId(null);
      setCompany(null);
      setSaas(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const activeTenantId = await resolveActiveTenantId(user);
      setTenantId(activeTenantId);

      if (!activeTenantId) {
        setCompany(null);
        setSaas(getCompanySaasPlan(null));
        return;
      }

      const row = await fetchCompanySaasByTenantId(supabase, activeTenantId);
      setCompany(row);
      const resolved = getCompanySaasPlan(row);
      setSaas(resolved);
      logSaasCompanyContext(activeTenantId, row);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      reload();
    }
  }, [authLoading, reload]);

  return {
    tenantId,
    company,
    saas,
    loading: authLoading || loading,
    reload,
    maxProjects: saas?.maxProjects ?? null,
    maxBrokers: saas?.maxBrokers ?? null,
    displayName: saas?.displayName ?? '',
    planKey: saas?.planKey ?? 'basico',
    availabilityMessage: saas
      ? `Plano ${saas.displayName}: ${saas.maxProjects} loteamentos disponíveis`
      : '',
  };
}
