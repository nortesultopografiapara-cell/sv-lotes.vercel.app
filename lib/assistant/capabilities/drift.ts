import fs from 'node:fs';
import path from 'node:path';
import { listAssistantCapabilities, countAssistantCapabilities } from './registry';
import { listAssistantProcedures } from '../knowledgeBase';

export type AssistantCapabilityDrift = {
  missingSources: string[];
  missingRoutes: string[];
  proceduresWithoutCapability: string[];
  capabilitiesWithoutSource: string[];
  uncoveredNav: string[];
  summary: string;
};

const TENANT_PAGES = [
  '/dashboard',
  '/dashboard/brokers',
  '/map',
  '/customers',
  '/finance',
  '/charges',
  '/contracts',
  '/settings',
  '/owners',
  '/billing',
  '/offline-sync',
  '/data-migration',
  '/my-sales',
];

export function auditAssistantCapabilityDrift(root = process.cwd()): AssistantCapabilityDrift {
  const capabilities = listAssistantCapabilities();
  const procedures = listAssistantProcedures();
  const missingSources: string[] = [];
  const missingRoutes: string[] = [];
  const capabilitiesWithoutSource: string[] = [];

  for (const capability of capabilities) {
    const sources = capability.sourceOfTruth || [];
    if (sources.length === 0) capabilitiesWithoutSource.push(capability.id);
    for (const rel of sources) {
      if (!fs.existsSync(path.join(root, rel))) missingSources.push(`${capability.id}:${rel}`);
    }
    for (const route of capability.routes) {
      const appPath =
        route === '/dashboard/brokers' ? 'app/dashboard/brokers/page.tsx' : `app${route}/page.tsx`;
      if (!fs.existsSync(path.join(root, appPath))) missingRoutes.push(`${capability.id}:${route}`);
    }
  }

  const claimed = new Set(
    capabilities.flatMap((item) => [item.id, ...(item.knowledgeIds || [])]),
  );
  const proceduresWithoutCapability = procedures
    .filter((item) => !claimed.has(item.id) && !item.tags.some((tag) => claimed.has(tag)))
    .map((item) => item.id);

  const counts = countAssistantCapabilities();
  const uncoveredNav = TENANT_PAGES.filter((route) => !capabilities.some((item) => item.routes.includes(route)));
  const issues =
    missingSources.length +
    missingRoutes.length +
    proceduresWithoutCapability.length +
    capabilitiesWithoutSource.length +
    uncoveredNav.length;
  const summary = `${counts.total} capabilities (${counts.explicit} explícitas, ${counts.derived} derivadas). Drift: ${issues} aviso(s). Rotas de menu sem capability: ${uncoveredNav.join(', ') || 'nenhuma'}.`;

  return {
    missingSources,
    missingRoutes,
    proceduresWithoutCapability,
    capabilitiesWithoutSource,
    uncoveredNav,
    summary,
  };
}
