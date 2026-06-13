'use client';

import type { OwnerProjectAccessInput } from '@/lib/ownerProjectAccess';

export type ProjectOption = {
  id: string;
  name: string;
};

export type AccessEntry = OwnerProjectAccessInput & {
  project_id: string;
};

type Props = {
  projects: ProjectOption[];
  entries: AccessEntry[];
  onChange: (entries: AccessEntry[]) => void;
  disabled?: boolean;
};

function emptyEntry(projectId: string): AccessEntry {
  return {
    project_id: projectId,
    can_view_dashboard: true,
    can_view_map: true,
    can_view_finance: true,
    can_view_contracts: true,
  };
}

export function OwnerProjectAccessEditor({ projects, entries, onChange, disabled }: Props) {
  const selectedProjects = new Set(entries.map((entry) => entry.project_id));

  const toggleProject = (projectId: string, enabled: boolean) => {
    if (disabled) return;
    if (!enabled) {
      onChange(entries.filter((entry) => entry.project_id !== projectId));
      return;
    }
    if (selectedProjects.has(projectId)) return;
    onChange([...entries, emptyEntry(projectId)]);
  };

  const updateEntry = (projectId: string, patch: Partial<AccessEntry>) => {
    if (disabled) return;
    onChange(
      entries.map((entry) =>
        entry.project_id === projectId ? { ...entry, ...patch } : entry,
      ),
    );
  };

  if (!projects.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Nenhum empreendimento cadastrado nesta empresa.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        const enabled = selectedProjects.has(project.id);
        const entry = entries.find((item) => item.project_id === project.id);
        return (
          <div
            key={project.id}
            className="rounded-lg border border-[var(--color-border)] p-3"
          >
            <label className="flex items-center gap-2 font-medium">
              <input
                type="checkbox"
                checked={enabled}
                disabled={disabled}
                onChange={(event) => toggleProject(project.id, event.target.checked)}
              />
              {project.name}
            </label>
            {enabled && entry ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                {(
                  [
                    ['can_view_dashboard', 'Dashboard'],
                    ['can_view_map', 'Mapa GIS'],
                    ['can_view_finance', 'Financeiro'],
                    ['can_view_contracts', 'Contratos'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={entry[key] !== false}
                      disabled={disabled}
                      onChange={(event) =>
                        updateEntry(project.id, { [key]: event.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
