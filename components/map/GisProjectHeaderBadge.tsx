'use client';

import { Map as MapIcon } from 'lucide-react';
import { useGisSelectedProject } from '@/contexts/GisSelectedProjectContext';

/**
 * Badge do empreendimento ativo no header (mapa GIS / dashboard).
 * Posicionado à esquerda do sino de notificações.
 */
export function GisProjectHeaderBadge() {
  const { project } = useGisSelectedProject();

  if (!project?.name) return null;

  return (
    <div
      className="inline-flex items-center gap-1.5 h-10 max-w-[88px] sm:max-w-[200px] md:max-w-[280px] lg:max-w-[360px] px-3 rounded-lg border font-semibold text-white text-sm shrink-0"
      style={{
        background: 'rgba(255,255,255,0.08)',
        borderColor: 'rgba(255,255,255,0.15)',
      }}
      title={project.name}
    >
      <MapIcon className="w-4 h-4 shrink-0 sm:hidden" aria-hidden />
      <span className="truncate sm:hidden">{project.name}</span>
      <span className="truncate hidden sm:inline md:max-w-[200px] lg:max-w-none">
        {project.name}
      </span>
    </div>
  );
}
