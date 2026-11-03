'use client';

import { useMemo, useState } from 'react';
import {
  ASSOCIATION_ALREADY_EXISTS,
  confirmDetachAssociationMessage,
} from '@/lib/contractModelCentralOps';

export type ManageProjectOpt = { id: string; name: string };

export type ManageProjectLink = {
  id: string;
  projectId: string;
  projectName: string;
  isProjectDefault: boolean;
};

export default function ManageContractModelProjectsPanel({
  links,
  projects,
  saving,
  onAssociate,
  onSetDefault,
  onDetach,
}: {
  links: ManageProjectLink[];
  projects: ManageProjectOpt[];
  saving?: boolean;
  onAssociate: (projectId: string, asDefault: boolean) => Promise<boolean | void>;
  onSetDefault: (link: ManageProjectLink) => Promise<boolean | void>;
  onDetach: (link: ManageProjectLink) => Promise<boolean | void>;
}) {
  const [associateProjectId, setAssociateProjectId] = useState('');
  const [associateAsDefault, setAssociateAsDefault] = useState(false);
  const [showAssociate, setShowAssociate] = useState(false);
  const [pending, setPending] = useState<ManageProjectLink | null>(null);

  const linkedIds = useMemo(() => new Set(links.map((l) => l.projectId)), [links]);
  const available = projects.filter((p) => !linkedIds.has(p.id));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-2">
          Associados
        </p>
        {links.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">Nenhum empreendimento associado.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
              >
                <div className="font-medium text-white">{link.projectName}</div>
                <div className="mt-1 text-[11px] text-[var(--text-secondary)]">
                  Associado · Padrão deste empreendimento:{' '}
                  <strong className={link.isProjectDefault ? 'text-[var(--color-success)]' : ''}>
                    {link.isProjectDefault ? 'Sim' : 'Não'}
                  </strong>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {link.isProjectDefault ? (
                    <span className="h-8 inline-flex items-center px-2 rounded-md bg-emerald-950/40 border border-emerald-800 text-[11px] text-emerald-200">
                      Padrão
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      className="h-8 px-2 rounded-md border border-[var(--color-border)] text-[11px]"
                      onClick={() => void onSetDefault(link)}
                    >
                      Definir como padrão
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={saving}
                    className="h-8 px-2 rounded-md border border-amber-800 text-[11px] text-amber-200"
                    onClick={() => setPending(link)}
                  >
                    Desassociar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAssociate ? (
        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
          <p className="text-xs font-semibold text-white">Associar empreendimento</p>
          {available.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              Todos os empreendimentos desta empresa já estão associados a este modelo.
            </p>
          ) : (
            <>
              <select
                value={associateProjectId}
                onChange={(e) => setAssociateProjectId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white"
              >
                <option value="">Selecione</option>
                {available.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={associateAsDefault}
                  onChange={(e) => setAssociateAsDefault(e.target.checked)}
                />
                Definir como padrão deste empreendimento
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-8 px-3 rounded-md border border-[var(--color-border)] text-xs"
                  onClick={() => {
                    setShowAssociate(false);
                    setAssociateProjectId('');
                    setAssociateAsDefault(false);
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving || !associateProjectId}
                  className="h-8 px-3 rounded-md bg-[var(--color-primary)] text-white text-xs font-semibold"
              onClick={() =>
                void (async () => {
                  const ok = await onAssociate(associateProjectId, associateAsDefault);
                  if (ok === false) return;
                  setShowAssociate(false);
                  setAssociateProjectId('');
                  setAssociateAsDefault(false);
                })()
              }
                >
                  Associar
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={saving}
          className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs font-semibold"
          onClick={() => setShowAssociate(true)}
        >
          + Associar empreendimento
        </button>
      )}

      {pending && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-3 py-3 space-y-3">
          <p className="text-sm text-amber-100">
            {confirmDetachAssociationMessage(pending.projectName, pending.isProjectDefault)}
          </p>
          {pending.isProjectDefault ? (
            <p className="text-[11px] text-amber-200">
              A emissão GIS ainda não usa a Central. O empreendimento ficará sem padrão na Central.
              O cadastro GIS do empreendimento não será alterado.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="h-8 px-3 rounded-md border border-[var(--color-border)] text-xs"
              onClick={() => setPending(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              className="h-8 px-3 rounded-md bg-amber-700 text-white text-xs font-semibold"
              onClick={() =>
                void (async () => {
                  const ok = await onDetach(pending);
                  if (ok === false) return;
                  setPending(null);
                })()
              }
            >
              Desassociar
            </button>
          </div>
        </div>
      )}
      <p className="hidden">{ASSOCIATION_ALREADY_EXISTS}</p>
    </div>
  );
}
