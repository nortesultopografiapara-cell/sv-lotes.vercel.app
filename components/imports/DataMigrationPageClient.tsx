'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DatabaseBackup, History, Wand2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { canAccessDataMigrationModule } from '@/lib/imports/permissions';
import { DataMigrationWizard } from '@/components/imports/DataMigrationWizard';
import { MigrationHistoryTable } from '@/components/imports/MigrationHistoryTable';

type DataMigrationTab = 'wizard' | 'history';

export function DataMigrationPageClient() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<DataMigrationTab>('wizard');
  const canAccess = canAccessDataMigrationModule(user?.role);

  useEffect(() => {
    if (loading) return;
    if (!user || !canAccess) {
      router.push('/dashboard');
    }
  }, [loading, user, canAccess, router]);

  if (loading || !user || !canAccess) {
    return (
      <div className="sv-page sv-page--scroll-y p-6 text-[var(--text-muted)]">
        Carregando…
      </div>
    );
  }

  return (
    <div
      className="sv-page sv-page--scroll-y p-4 md:p-6 lg:p-8 flex flex-col min-h-0 flex-1 bg-[var(--bg-main)] text-[var(--text-primary)]"
      data-testid="data-migration-page"
    >
      <header className="mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <DatabaseBackup className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Migração de Dados</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
              Importe dados provenientes de planilhas ou sistemas anteriores para o SV LOTES de
              forma segura.
            </p>
          </div>
        </div>
      </header>

      <div className="flex gap-2 mb-6 border-b border-[var(--border-color)]">
        <button
          type="button"
          data-testid="migration-tab-wizard"
          onClick={() => setTab('wizard')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'wizard'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Wand2 className="w-4 h-4" />
          Assistente
        </button>
        <button
          type="button"
          data-testid="migration-tab-history"
          onClick={() => setTab('history')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'history'
              ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <History className="w-4 h-4" />
          Histórico de Migrações
        </button>
      </div>

      {tab === 'wizard' ? <DataMigrationWizard /> : <MigrationHistoryTable />}
    </div>
  );
}
