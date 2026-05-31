'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase, getClientConfigErrorMessage } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, FolderOpen, MoreVertical, Pencil, Trash2, Loader2, ArrowLeft, Upload, Navigation, Map as MapIcon, Ruler, X, ChevronDown, ChevronUp, Scan, Eye, EyeOff, PenTool, Printer, Layers, GitCompare, ScrollText } from 'lucide-react';
import { runAutomaticConfrontation } from '@/lib/automaticConfrontation';
import { LotSheetPrintModal } from '@/components/map/LotSheetPrintModal';
import { StreetGuideFormModal } from '@/components/map/StreetGuideFormModal';
import {
  buildStreetGuideInsertPayload,
  formatStreetDisplay,
  normalizeStreetGuideRow,
  type StreetGuideFormValues,
} from '@/lib/streetGuide';
import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import { calculateLotDimensions } from '@/utils/calculateLotDimensions';
import proj4 from 'proj4';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { logSaasCompanyContext } from '@/lib/saasPlans';
import {
  EMPTY_PROJECT_FORM,
  type ProjectFormInitialData,
  projectToFormInitialData,
} from '@/lib/project-form';
import { useCompanySaas } from '@/hooks/useCompanySaas';
import { applyTenantFilter, isPlatformAdmin, resolveRlsContext } from '@/lib/rls';
import { useGisSelectedProject } from '@/contexts/GisSelectedProjectContext';
import { isBrowserOnline } from '@/lib/offline/lotReservationOffline';
import {
  cacheProjectsForOffline,
  cacheSingleProjectForOffline,
  loadOfflineProjectsList,
} from '@/lib/offline/projectsOfflineCache';
import { clearProjectMapOfflineCache } from '@/lib/offline/store';
import {
  deleteProjectQuadra,
  fetchProjectQuadraNames,
  formatQuadraLabel,
  normalizeQuadraBlockName,
} from '@/lib/projectQuadras';
import { ProjectQuadrasPanel } from '@/components/map/ProjectQuadrasPanel';
import {
  clearGisMapProjectPersistence,
  GIS_MAP_PROJECT_ID_KEY,
  gisMapUrlWithProject,
  persistGisMapProject,
  readGisMapProjectIdFromUrl,
} from '@/lib/gisMapProjectPersistence';
import {
  civil3dLotToImportPayload,
  computeProjectUtmClusterCenterFromBlocks,
  formatQuadraImportLocationBlockedMessage,
  getQuadraImportMaxAllowedKm,
  parseCivil3dTxtLots,
  validateQuadraImportAgainstProject,
} from '@/lib/civil3dTxtParser';
import {
  getOfficialLotMeasurements,
  officialSegmentsToLotSegmentRows,
  parseOfficialSegmentsFromBlock,
} from '@/lib/officialLotMeasurements';
import {
  findFrontSegmentIndexTouchingStreet,
  pickStreetGuideForFrontSegment,
  scoreSegmentStreetProximity,
  type StreetGuideLineInput,
} from '@/lib/lotStreetFrontDetection';
import {
  blockHasTxtOfficialData,
  buildBlockMatchKey,
  parseShapefileZipFile,
} from '@/lib/shapefileImport';

/** v1.9: fluxo oficial de importação no mapa = TXT Civil 3D apenas. */
const SHOW_LEGACY_GIS_IMPORT = false;

const GISMap = dynamic(() => import('@/components/map/GISMap'), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
      <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
      <span className="font-mono text-sm uppercase tracking-wider text-[var(--color-text-muted)]">Carregando Motor GIS...</span>
    </div>
  )
});

// XML/KML Parser Utility
function parseKML(xmlString: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const geometries: any[] = [];

  const extractCoords = (text: string) => {
    return text.replace(/\r?\n|\r/g, " ").split(/\s+/).filter(Boolean).map(pair => {
       if (!pair || !pair.includes(',')) return [0, 0];
       const parts = pair.split(',');
       const lng = parseFloat(parts[0]);
       const lat = parseFloat(parts[1]);
       return [Number.isNaN(lng) ? 0 : lng, Number.isNaN(lat) ? 0 : lat];
    }).filter(c => c[0] !== 0 || c[1] !== 0);
  };

  const extractProperties = (node: Element) => {
    const props: any = {};
    const nameNode = node.getElementsByTagName("name")[0];
    if (nameNode && nameNode.textContent) props.name = nameNode.textContent.trim();
    
    const descNode = node.getElementsByTagName("description")[0];
    if (descNode && descNode.textContent) props.description = descNode.textContent.trim();
    
    const extendedData = node.getElementsByTagName("ExtendedData")[0];
    if (extendedData) {
      const dataNodes = extendedData.getElementsByTagName("Data");
      for (let i = 0; i < dataNodes.length; i++) {
        const nameAttr = dataNodes[i].getAttribute("name");
        const valNode = dataNodes[i].getElementsByTagName("value")[0];
        if (nameAttr && valNode && valNode.textContent) {
          props[nameAttr.toUpperCase()] = valNode.textContent.trim();
        }
      }
      const simpleDataNodes = extendedData.getElementsByTagName("SimpleData");
      for (let i = 0; i < simpleDataNodes.length; i++) {
        const nameAttr = simpleDataNodes[i].getAttribute("name");
        if (nameAttr && simpleDataNodes[i].textContent) {
          props[nameAttr.toUpperCase()] = simpleDataNodes[i].textContent.trim();
        }
      }
    }
    return props;
  };

  const placemarks = xmlDoc.getElementsByTagName("Placemark");
  if (placemarks.length > 0) {
    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];
      const properties = extractProperties(placemark);
      
      const polys = placemark.getElementsByTagName("Polygon");
      for (let j = 0; j < polys.length; j++) {
        const coordsNode = polys[j].getElementsByTagName("coordinates")[0];
        if (coordsNode && coordsNode.textContent) {
           const text = coordsNode.textContent.trim();
           if (text) {
              const coords = extractCoords(text);
              if (coords.length > 2) {
                 const first = coords[0];
                 const last = coords[coords.length - 1];
                 if (first[0] !== last[0] || first[1] !== last[1]) {
                    coords.push([...first]);
                 }
                 geometries.push({ type: "Polygon", coordinates: [coords], properties });
              }
           }
        }
      }
      
      const lines = placemark.getElementsByTagName("LineString");
      for (let j = 0; j < lines.length; j++) {
        const coordsNode = lines[j].getElementsByTagName("coordinates")[0];
        if (coordsNode && coordsNode.textContent) {
           const text = coordsNode.textContent.trim();
           if (text) {
              const coords = extractCoords(text);
              if (coords.length > 2) {
                 const first = coords[0];
                 const last = coords[coords.length - 1];
                 if (first[0] !== last[0] || first[1] !== last[1]) {
                    coords.push([...first]);
                 }
                 geometries.push({ type: "Polygon", coordinates: [coords], properties });
              }
           }
        }
      }
    }
  } else {
    // Fallback if no placemarks
    const polygons = xmlDoc.getElementsByTagName("Polygon");
    for (let i = 0; i < polygons.length; i++) {
      const coordsNode = polygons[i].getElementsByTagName("coordinates")[0];
      if (coordsNode && coordsNode.textContent) {
         const text = coordsNode.textContent.trim();
         if (text) {
            const coords = extractCoords(text);
            if (coords.length > 2) {
               const first = coords[0];
               const last = coords[coords.length - 1];
               if (first[0] !== last[0] || first[1] !== last[1]) {
                  coords.push([...first]);
               }
               geometries.push({ type: "Polygon", coordinates: [coords], properties: {} });
            }
         }
      }
    }
    const lineStrings = xmlDoc.getElementsByTagName("LineString");
    for (let i = 0; i < lineStrings.length; i++) {
      const coordsNode = lineStrings[i].getElementsByTagName("coordinates")[0];
      if (coordsNode && coordsNode.textContent) {
         const text = coordsNode.textContent.trim();
         if (text) {
            const coords = extractCoords(text);
            if (coords.length > 2) {
               const first = coords[0];
               const last = coords[coords.length - 1];
               if (first[0] !== last[0] || first[1] !== last[1]) {
                  coords.push([...first]);
               }
               geometries.push({ type: "Polygon", coordinates: [coords], properties: {} });
            }
         }
      }
    }
  }

  return geometries;
}

type AuthUser = {
  id: string;
  tenant_id: string | null;
  role: string;
  email?: string;
};

type ProjectFeedback = { type: 'success' | 'error'; message: string };

function applyTenantFilterToProjectsQuery(
  query: ReturnType<typeof supabase.from>,
  user: AuthUser,
  tenantId: string | null,
) {
  return applyTenantFilter(query, { tenantId, isSuperAdmin: isPlatformAdmin(user.role) }, 'projects');
}

/** Cria projeto via API Next.js (evita fetch direto ao Supabase com URL mock / CORS). */
async function createProjectThroughApi(payload: {
  name: string;
  city: string;
  uf: string;
  neighborhood?: string | null;
  address?: string | null;
  forum_city?: string | null;
  impersonatingTenantId?: string | null;
}): Promise<{ project: Record<string, unknown> }> {
  const configError = getClientConfigErrorMessage();
  if (configError) {
    console.error('[Criar Projeto] Supabase não configurado no cliente:', {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '(vazio)',
      hasAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      hint: 'Crie .env.local a partir de .env.example',
    });
    throw new Error(configError);
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const apiUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/projects`
      : '/api/projects';

  console.log('[Criar Projeto] POST', apiUrl, {
    name: payload.name,
    city: payload.city,
    uf: payload.uf,
    hasSession: Boolean(session?.access_token),
  });

  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr: unknown) {
    console.error('[Criar Projeto] TypeError / Failed to fetch', {
      networkErr,
      apiUrl,
      supabasePublicUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '(não definida no build)',
      causes: [
        'Servidor Next não está rodando (npm run dev)?',
        '.env.local ausente ou sem NEXT_PUBLIC_SUPABASE_*?',
        'Antes o cliente usava mock.supabase.co e gerava Failed to fetch',
      ],
    });
    const msg =
      networkErr instanceof Error ? networkErr.message : 'Failed to fetch';
    throw new Error(
      msg.includes('fetch')
        ? 'Falha de rede ao chamar /api/projects. Verifique se o servidor local está ativo (npm run dev) e se .env.local está configurado.'
        : msg,
    );
  }

  let json: {
    error?: string;
    code?: string;
    hint?: string;
    details?: unknown;
    project?: Record<string, unknown>;
  } = {};

  try {
    json = await response.json();
  } catch {
    json = { error: `Resposta inválida da API (HTTP ${response.status})` };
  }

  if (!response.ok) {
    console.error('[Criar Projeto] Erro da API', {
      status: response.status,
      code: json.code,
      error: json.error,
      hint: json.hint,
      details: json.details,
    });
    throw new Error(json.error || `Erro ao criar projeto (HTTP ${response.status})`);
  }

  console.log('[Criar Projeto] Sucesso', json.project?.id);
  return { project: json.project || {} };
}

export default function MapPage() {
  const router = useRouter();
  const restoredGisProjectRef = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const {
    saas,
    company: saasCompany,
    tenantId: saasTenantId,
    availabilityMessage: planAvailabilityMsg,
    loading: saasLoading,
    reload: reloadSaas,
  } = useCompanySaas();
  const projectLimit = saas?.maxProjects ?? null;
  const companyPlan = saas?.displayName ?? '';
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const { setGisSelectedProject, clearGisSelectedProject } = useGisSelectedProject();

  useEffect(() => {
    if (selectedProject?.id && selectedProject?.name) {
      setGisSelectedProject({
        id: selectedProject.id,
        name: selectedProject.name,
      });
    } else {
      clearGisSelectedProject();
    }
  }, [selectedProject, setGisSelectedProject, clearGisSelectedProject]);

  useEffect(() => {
    return () => clearGisSelectedProject();
  }, [clearGisSelectedProject]);

  // KML Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importQuadra, setImportQuadra] = useState('');
  const [importLoteInicial, setImportLoteInicial] = useState('1');
  const [importOrdem, setImportOrdem] = useState<'ASC'|'DESC'>('ASC');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // TXT Civil 3D Import States
  const [isImportTxtModalOpen, setIsImportTxtModalOpen] = useState(false);
  const [importTxtQuadra, setImportTxtQuadra] = useState('');
  const [importTxtFile, setImportTxtFile] = useState<File | null>(null);
  const [importingTxt, setImportingTxt] = useState(false);
  const [importTxtUtmZone, setImportTxtUtmZone] = useState('22S');

  const [isImportShpModalOpen, setIsImportShpModalOpen] = useState(false);
  const [importShpFile, setImportShpFile] = useState<File | null>(null);
  const [importShpDefaultQuadra, setImportShpDefaultQuadra] = useState('');
  const [importingShp, setImportingShp] = useState(false);

  // Map Tools States
  const [activeLayer, setActiveLayer] = useState<'streets'|'satellite'|'dark'>('satellite');
  const [gpsActive, setGpsActive] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // Formulário unificado: criar / editar projeto
  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projectFormMode, setProjectFormMode] = useState<'create' | 'edit'>('create');
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCity, setNewProjectCity] = useState('');
  const [newProjectUf, setNewProjectUf] = useState('');
  const [newProjectNbhd, setNewProjectNbhd] = useState('');
  const [newProjectAddr, setNewProjectAddr] = useState('');
  const [newProjectForum, setNewProjectForum] = useState('');
  const [projectFormSubmitting, setProjectFormSubmitting] = useState(false);
  const [projectFeedback, setProjectFeedback] = useState<ProjectFeedback | null>(null);

  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  const [quadrasPanelOpen, setQuadrasPanelOpen] = useState(false);
  const [projectQuadras, setProjectQuadras] = useState<string[]>([]);
  const [quadrasLoading, setQuadrasLoading] = useState(false);
  const [quadraActionLoading, setQuadraActionLoading] = useState<string | null>(
    null,
  );
  const [deleteQuadraConfirm, setDeleteQuadraConfirm] = useState<string | null>(
    null,
  );
  const [focusBlockName, setFocusBlockName] = useState<string | null>(null);
  const [focusBlockKey, setFocusBlockKey] = useState(0);
  const [lotSheetPickMode, setLotSheetPickMode] = useState(false);
  const [confrontationRunning, setConfrontationRunning] = useState(false);
  const [memorialModalOpen, setMemorialModalOpen] = useState(false);

  const [lotSheetTarget, setLotSheetTarget] = useState<{
    id: string;
    number?: string;
    block?: string;
  } | null>(null);

  // Street Guides States
  const [streetGuides, setStreetGuides] = useState<any[]>([]);
  const [drawStreetActive, setDrawStreetActive] = useState(false);
  const [streetGuidesVisible, setStreetGuidesVisible] = useState(true);
  const [streetGuideModal, setStreetGuideModal] = useState<{
    mode: 'create' | 'edit';
    coordinates?: number[][];
    guide?: Record<string, unknown>;
  } | null>(null);

  const loadStreetGuides = useCallback(async () => {
    if (!selectedProject) return;
    if (!isBrowserOnline()) return;
    try {
      const { data, error } = await supabase.from('street_guides').select('*').eq('project_id', selectedProject.id);
      if (error && error.code !== 'PGRST205') console.warn('Error loading street guides:', error);
      if (data) {
        setStreetGuides(
          data.map((g) =>
            normalizeStreetGuideRow({ ...g, visible: true } as Record<string, unknown>),
          ),
        );
      }
    } catch (e) {}
  }, [selectedProject]);

  const handleRunAutomaticConfrontation = useCallback(async () => {
    console.error('MAP PAGE CONFRONTATION CLICK', {
      projectId: selectedProject?.id ?? null,
    });
    if (!selectedProject?.id) {
      alert('Selecione um projeto para executar a confrontação automática.');
      return;
    }
    setConfrontationRunning(true);
    try {
      const tenantId = String(
        saasTenantId || user?.tenant_id || selectedProject.tenant_id || '',
      ).trim();
      const result = await runAutomaticConfrontation(selectedProject.id, {
        tenantId: tenantId || undefined,
        streetGuides,
      });
      const reasonLines = Object.entries(result.skipReasons || {})
        .sort((a, b) => b[1] - a[1])
        .map(([reason, count]) => `  • ${reason}: ${count}`)
        .join('\n');
      const errLines =
        result.errors.length > 0
          ? `\n\nAvisos (${result.errors.length}):\n${result.errors.slice(0, 6).join('\n')}`
          : '';
      const skipSummary =
        reasonLines.length > 0 ? `\n\nIgnorados por motivo:\n${reasonLines}` : '';
      alert(
        `Confrontação automática concluída.\n${result.processed} lote(s) processado(s).` +
          (result.skipped > 0 ? `\n${result.skipped} ignorado(s).` : '') +
          skipSummary +
          errLines,
      );
      setMapRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro na confrontação automática';
      alert(msg);
      console.error('[Confrontação automática]', err);
    } finally {
      setConfrontationRunning(false);
    }
  }, [
    selectedProject,
    saasTenantId,
    user?.tenant_id,
    streetGuides,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedProject) loadStreetGuides();
  }, [selectedProject, loadStreetGuides]);

  const loadProjectQuadras = useCallback(async () => {
    if (!selectedProject?.id) {
      setProjectQuadras([]);
      return;
    }
    setQuadrasLoading(true);
    try {
      const names = await fetchProjectQuadraNames(
        supabase,
        selectedProject.id,
        user,
      );
      setProjectQuadras(names);
    } catch (err) {
      console.error('[QUADRAS] falha ao listar', err);
      setProjectQuadras([]);
    } finally {
      setQuadrasLoading(false);
    }
  }, [selectedProject?.id, user]);

  useEffect(() => {
    if (selectedProject?.id) {
      loadProjectQuadras();
    } else {
      setProjectQuadras([]);
    }
  }, [selectedProject?.id, mapRefreshKey, loadProjectQuadras]);

  const handleViewQuadraOnMap = (blockName: string) => {
    setFocusBlockName(normalizeQuadraBlockName(blockName));
    setFocusBlockKey((k) => k + 1);
  };

  const handleReimportQuadraTxt = (blockName: string) => {
    setImportTxtQuadra(normalizeQuadraBlockName(blockName));
    setImportTxtFile(null);
    setIsImportTxtModalOpen(true);
  };

  const handleConfirmDeleteQuadra = async () => {
    if (!deleteQuadraConfirm || !selectedProject?.id) return;
    const quadraName = deleteQuadraConfirm;
    setQuadraActionLoading(quadraName);
    try {
      const { lotsRemoved } = await deleteProjectQuadra(
        supabase,
        selectedProject.id,
        quadraName,
        user,
      );
      setDeleteQuadraConfirm(null);
      if (
        focusBlockName &&
        normalizeQuadraBlockName(focusBlockName) ===
          normalizeQuadraBlockName(quadraName)
      ) {
        setFocusBlockName(null);
      }
      await loadProjectQuadras();
      setMapRefreshKey((k) => k + 1);
      alert(
        lotsRemoved > 0
          ? `${formatQuadraLabel(quadraName)} excluída (${lotsRemoved} lotes).`
          : `${formatQuadraLabel(quadraName)} excluída.`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      alert(`Erro ao excluir quadra: ${msg}`);
    } finally {
      setQuadraActionLoading(null);
    }
  };

  const handleIdentifyFronts = async () => {
    if (!selectedProject || streetGuides.length === 0) {
       alert("Desenhe ao menos uma linha de rua para identificar as frentes.");
       return;
    }
    const visibleGuides = streetGuides.filter(g => g.visible);
    if (visibleGuides.length === 0) {
       alert("Habilite a visibilidade das linhas de rua para utilizá-las.");
       return;
    }

    try {
       console.log('IDENTIFY_FRONTS_WITH_STREET_START', {
         guides: visibleGuides.length,
       });
       try { await supabase.rpc('reload_schema_cache'); } catch(e) {}
       
       // Only dynamically import turf logic to avoid SSR issues if necessary or just await import
       const turfHelpers = await import('@turf/helpers');
       const turfNearestOnLine = await import('@turf/nearest-point-on-line');
       const turfDistance = await import('@turf/distance');
       const { extractSegments, detectSides, normalizeDimensions } = await import('@/utils/calculateLotDimensions');

       // 1. Load all blocks from this project
       let blocksQuery = supabase.from('blocks').select('*').eq('project_id', selectedProject.id);
       if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
           blocksQuery = blocksQuery.or(`tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`);
       }
       const { data: blocks, error } = await blocksQuery;
       if (error) throw error;
       if (!blocks || blocks.length === 0) return;

       // 2. Prepare guide lines
       const streetGuideLines: StreetGuideLineInput[] = visibleGuides
         .map((g) => {
           const geo = g.geometry_geojson || g.geometry;
           const coordinates = geo?.coordinates;
           if (!coordinates || coordinates.length < 2) return null;
           return {
             id: g.id != null ? String(g.id) : undefined,
             coordinates,
           };
         })
         .filter(Boolean) as StreetGuideLineInput[];

       const updates: Array<Record<string, unknown>> = [];
       let streetApplied = 0;

       for (const block of blocks) {
          if (!block.geometry || block.geometry.type !== 'Polygon') continue;
          
          let coords = block.geometry.coordinates[0];
          if (!coords || coords.length < 4) continue;
          
          const segments = extractSegments(coords, []);
          const officialSegs = parseOfficialSegmentsFromBlock(block);

          let frontSegmentIndex: number | null = null;
          let bestGuide: (typeof visibleGuides)[number] | null = null;
          let bestTouchM = Infinity;

          if (
            officialSegs.length >= 3 &&
            block.source_import === 'TXT_CIVIL3D'
          ) {
            frontSegmentIndex = findFrontSegmentIndexTouchingStreet(
              officialSegs,
              coords,
              streetGuideLines,
              null,
              block.number,
            );
            const matchedGuide = pickStreetGuideForFrontSegment(
              coords,
              streetGuideLines,
              frontSegmentIndex,
              officialSegs.length,
            );
            if (matchedGuide?.id) {
              bestGuide =
                visibleGuides.find(
                  (g) => String(g.id) === String(matchedGuide.id),
                ) ?? null;
            }
            const ring = coords;
            const ri = Math.min(frontSegmentIndex, ring.length - 2);
            const p1 = ring[ri] as [number, number];
            const p2 = ring[ri + 1] as [number, number];
            for (const gl of streetGuideLines) {
              const sc = scoreSegmentStreetProximity(p1, p2, gl.coordinates);
              bestTouchM = Math.min(bestTouchM, sc.minDistM);
            }
          } else {
            let bestSegment: (typeof segments)[0] | null = null;
            for (const seg of segments) {
              const pA = turfHelpers.point(seg.p1);
              const pB = turfHelpers.point(seg.p2);
              const mid = turfHelpers.point([
                (seg.p1[0] + seg.p2[0]) / 2,
                (seg.p1[1] + seg.p2[1]) / 2,
              ]);
              for (let gi = 0; gi < streetGuideLines.length; gi++) {
                const guide = turfHelpers.lineString(
                  streetGuideLines[gi].coordinates,
                );
                const d1 = turfNearestOnLine.default(guide, pA).properties.dist || 0;
                const d2 = turfNearestOnLine.default(guide, pB).properties.dist || 0;
                const dMid =
                  turfNearestOnLine.default(guide, mid).properties.dist || 0;
                const minDist = Math.min(d1, d2, dMid);
                if (minDist < bestTouchM) {
                  bestTouchM = minDist;
                  bestSegment = seg;
                  bestGuide = visibleGuides[gi];
                }
              }
            }
            if (bestSegment) {
              frontSegmentIndex = bestSegment.originalIndex ?? 0;
            }
          }

          if (frontSegmentIndex != null && bestTouchM < 50) {
             const frenteLength =
               officialSegs.find((s) => s.segment_index === frontSegmentIndex)
                 ?.distance ??
               segments.find((s) => s.originalIndex === frontSegmentIndex)
                 ?.length ??
               0;

             let finalFrente: number;
             let finalFundo: number;
             let finalDir: number;
             let finalEsq: number;

             if (
               officialSegs.length >= 3 &&
               block.source_import === 'TXT_CIVIL3D'
             ) {
               const measures = getOfficialLotMeasurements({
                 ...block,
                 front_segment_index: frontSegmentIndex,
               });
               finalFrente = measures.frente ?? frenteLength;
               finalFundo = measures.fundo ?? finalFrente;
               finalDir = measures.ladoDireito ?? 0;
               finalEsq = measures.ladoEsquerdo ?? 0;
               console.log('LOT_FRONT_SEGMENT', block.number, frontSegmentIndex);
             } else {
               const bestSegment =
                 segments.find(
                   (s) => s.originalIndex === frontSegmentIndex,
                 ) ?? segments[0];
               const otherSegments = segments.filter((s) => s !== bestSegment);
               let backSegment = null;
               let maxDist = -1;
               const midFront = [
                 (bestSegment.p1[0] + bestSegment.p2[0]) / 2,
                 (bestSegment.p1[1] + bestSegment.p2[1]) / 2,
               ];
               for (const oSeg of otherSegments) {
                 const midO = [
                   (oSeg.p1[0] + oSeg.p2[0]) / 2,
                   (oSeg.p1[1] + oSeg.p2[1]) / 2,
                 ];
                 const d = turfDistance.default(
                   turfHelpers.point(midFront),
                   turfHelpers.point(midO),
                 );
                 if (d > maxDist) {
                   maxDist = d;
                   backSegment = oSeg;
                 }
               }
               const fundoLength = backSegment
                 ? backSegment.length
                 : frenteLength;
               const sides = detectSides(segments, bestSegment, backSegment);
               finalFrente = normalizeDimensions(frenteLength, 10);
               finalFundo = normalizeDimensions(fundoLength, finalFrente);
               finalDir = normalizeDimensions(sides.ladoDireito, finalFrente * 2);
               finalEsq = normalizeDimensions(sides.ladoEsquerdo, finalDir);
             }

             if (!block.id) continue;
             const row: Record<string, unknown> = {
                 id: block.id,
                 frente: finalFrente,
                 fundo: finalFundo,
                 lado_direito: finalDir,
                 lado_esquerdo: finalEsq,
                 front_segment_index: frontSegmentIndex,
             };
             if (bestGuide) {
               row.front_street_name = formatStreetDisplay(
                 bestGuide.type,
                 bestGuide.name,
               );
               row.front_street_type = String(bestGuide.type || 'Rua');
               row.front_street_width =
                 bestGuide.width != null && bestGuide.width !== ''
                   ? Number(bestGuide.width)
                   : null;
               if (
                 bestGuide.id &&
                 typeof bestGuide.id === 'string' &&
                 !bestGuide.id.startsWith('temp-')
               ) {
                 row.front_street_id = bestGuide.id;
               }
               streetApplied += 1;
               console.log('LOT_FRONT_STREET_UPDATED', {
                 blockId: block.id,
                 street: row.front_street_name,
               });
             }
             updates.push(row);
          }
       }

       console.log('IDENTIFY_FRONTS_STREET_APPLIED', {
         lots: updates.length,
         withStreet: streetApplied,
       });

       if (updates.length > 0) {
           const updatePromises = updates.map((updateObj) => {
              if (!updateObj.id) return Promise.resolve({ error: { message: "Mock error for no id" } });
              const patch: Record<string, unknown> = {
                  frente: updateObj.frente !== null ? Number(updateObj.frente) : null,
                  'Fundo': updateObj.fundo !== null ? String(updateObj.fundo).replace(/[^0-9.]/g, '') : null,
                  'Lado Dir.': updateObj.lado_direito !== null ? String(updateObj.lado_direito).replace(/[^0-9.]/g, '') : null,
                  'Lado Esq.': updateObj.lado_esquerdo !== null ? String(updateObj.lado_esquerdo).replace(/[^0-9.]/g, '') : null,
                  updated_at: new Date().toISOString(),
              };
              if (updateObj.front_segment_index != null) {
                patch.front_segment_index = updateObj.front_segment_index;
              }
              if (updateObj.front_street_name) {
                patch.front_street_name = updateObj.front_street_name;
                patch.front_street_type = updateObj.front_street_type ?? 'Rua';
                patch.front_street_width = updateObj.front_street_width ?? null;
                patch.front_street_id = updateObj.front_street_id ?? null;
              }
              return supabase.from('blocks').update(patch).eq('id', updateObj.id as string);
           });
           
           const results = await Promise.all(updatePromises);
           const errors = results.filter(r => r.error && r.error.message !== "Mock error for no id").map(r => r.error);
           if (errors.length > 0) {
               console.error("Updates errors:", errors);
               throw new Error("Falha ao atualizar alguns lotes. " + (errors[0]?.message || "Erro desconhecido."));
           }
       }

       alert(`Frentes identificadas e recalculadas para ${updates.length} lotes!`);
       setMapRefreshKey(prev => prev + 1);

    } catch (e: any) {
       console.error(e);
       alert("Erro ao identificar frentes: " + e.message);
    }
  };

  const loadProjects = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);

    if (!isBrowserOnline()) {
      try {
        const cached = await loadOfflineProjectsList();
        setProjects(cached);
      } catch (err) {
        console.error('[OFFLINE] erro ao carregar projetos', err);
        setProjects([]);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const rlsCtx = await resolveRlsContext(user);
      const activeTenantId =
        saasTenantId ?? rlsCtx.tenantId ?? (await resolveActiveTenantId(user));

      if (!rlsCtx.isSuperAdmin && !activeTenantId) {
        setProjects([]);
        return;
      }

      let query = supabase
        .from('projects')
        .select(
          '*, blocks(id, status, geometry, number, block_name, project_id, area, price)',
        )
        .order('created_at', { ascending: false });

      query = applyTenantFilterToProjectsQuery(query, user, activeTenantId);

      const { data, error } = await query;

      if (error) {
        console.warn('Error fetching projects:', error);
        setProjects([]);
        return;
      }

      const projectList = data || [];
      setProjects(projectList);
      logSaasCompanyContext(activeTenantId, saasCompany, projectList.length);
      try {
        await cacheProjectsForOffline(projectList);
      } catch (cacheErr) {
        console.error('[CACHE] falha após listar projetos', cacheErr);
      }
    } catch (err) {
      console.error(err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user, saasTenantId, saasCompany]);

  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.onLine) {
      console.log('[CACHE] página /map — carregamento online');
    }
    if (authLoading) return;
    const offline =
      typeof navigator !== 'undefined' && !navigator.onLine;
    if (offline) {
      void loadProjects();
      return;
    }
    if (!saasLoading) {
      void loadProjects();
    }
  }, [user, authLoading, saasLoading, loadProjects]);

  const openGisProject = useCallback(
    (project: { id: string; name?: string; [key: string]: unknown }) => {
      setSelectedProject(project);
      persistGisMapProject({ id: project.id, name: project.name });
      router.replace(gisMapUrlWithProject(project.id));
      if (isBrowserOnline() && project.id) {
        void cacheSingleProjectForOffline(project).catch((e) =>
          console.error('[CACHE] falha ao abrir projeto', e),
        );
      }
    },
    [router],
  );

  useEffect(() => {
    if (loading || projects.length === 0 || restoredGisProjectRef.current) {
      return;
    }

    const raw = sessionStorage.getItem('sv_gis_focus');
    if (raw) {
      try {
        const { projectId } = JSON.parse(raw) as {
          projectId?: string;
          blockId?: string;
        };
        sessionStorage.removeItem('sv_gis_focus');
        const proj = projects.find((p) => p.id === projectId);
        if (proj) {
          restoredGisProjectRef.current = true;
          openGisProject(proj);
          return;
        }
      } catch {
        sessionStorage.removeItem('sv_gis_focus');
      }
    }

    const urlId = readGisMapProjectIdFromUrl();
    const storageId =
      typeof window !== 'undefined'
        ? localStorage.getItem(GIS_MAP_PROJECT_ID_KEY)
        : null;
    const targetId = urlId || storageId;
    if (!targetId) return;

    const proj = projects.find((p) => p.id === targetId);
    restoredGisProjectRef.current = true;

    if (!proj) {
      clearGisMapProjectPersistence();
      if (urlId) router.replace('/map');
      return;
    }

    setSelectedProject(proj);
    persistGisMapProject(proj);
    if (!urlId) {
      router.replace(gisMapUrlWithProject(proj.id));
    }
    if (isBrowserOnline()) {
      void cacheSingleProjectForOffline(proj).catch((e) =>
        console.error('[CACHE] falha ao restaurar projeto', e),
      );
    }
  }, [loading, projects, router, openGisProject]);

  const filteredProjects = projects.filter(p => 
     p.name.toLowerCase().includes(search.toLowerCase()) || 
     (p.location && p.location.toLowerCase().includes(search.toLowerCase()))
  );

  const handleOpenProject = (project: any) => {
    openGisProject(project);
  };

  const handleBack = () => {
    setSelectedProject(null);
    clearGisMapProjectPersistence();
    router.replace('/map');
  };

  const applyProjectFormInitialData = (initialData: ProjectFormInitialData) => {
    setNewProjectName(initialData.name);
    setNewProjectCity(initialData.city);
    setNewProjectUf(initialData.state);
    setNewProjectNbhd(initialData.neighborhood);
    setNewProjectAddr(initialData.address);
    setNewProjectForum(initialData.contract_city);
  };

  const resetProjectForm = () => {
    applyProjectFormInitialData(EMPTY_PROJECT_FORM);
  };

  const closeProjectForm = () => {
    setIsProjectFormOpen(false);
    setProjectFormMode('create');
    setEditingProject(null);
    setProjectFeedback(null);
    resetProjectForm();
  };

  const applyProjectPatchToList = (projectId: string, patch: Record<string, unknown>) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, ...patch, blocks: p.blocks } : p)),
    );
    setSelectedProject((prev) =>
      prev?.id === projectId ? { ...prev, ...patch, blocks: prev.blocks } : prev,
    );
  };

  const openEditProject = (project: any) => {
    console.log('[PROJETOS] abrir editor', project);
    applyProjectFormInitialData(projectToFormInitialData(project));
    setEditingProject(project);
    setProjectFormMode('edit');
    setProjectFeedback(null);
    setIsProjectFormOpen(true);
  };

  const openCreateProject = () => {
    if (
      projectLimit != null &&
      projectLimit > 0 &&
      projects.length >= projectLimit &&
      user?.role !== 'SUPER_ADMIN'
    ) {
      setProjectFeedback({
        type: 'error',
        message: `Limite do plano ${companyPlan || ''} (${projectLimit} loteamentos) atingido. Contate o administrador.`,
      });
      return;
    }
    setEditingProject(null);
    setProjectFormMode('create');
    setProjectFeedback(null);
    resetProjectForm();
    setIsProjectFormOpen(true);
  };

  const validateProjectForm = (): boolean => {
    const projectNameStr = newProjectName.trim();
    const cityStr = newProjectCity.trim();
    const ufStr = newProjectUf.trim().toUpperCase();

    if (!projectNameStr) {
      setProjectFeedback({ type: 'error', message: 'Informe o nome do projeto.' });
      return false;
    }
    if (!cityStr) {
      setProjectFeedback({ type: 'error', message: 'Informe a cidade do loteamento.' });
      return false;
    }
    if (!ufStr || ufStr.length !== 2) {
      setProjectFeedback({ type: 'error', message: 'Informe a UF com 2 letras (ex: PA).' });
      return false;
    }
    return true;
  };

  const handleSaveProjectEdit = async () => {
    if (!editingProject?.id) return;

    const name = newProjectName.trim();
    const city = newProjectCity.trim();
    const state = newProjectUf.trim().toUpperCase();
    const neighborhood = newProjectNbhd.trim() || null;
    const address = newProjectAddr.trim() || null;
    const contract_city = newProjectForum.trim() || city;
    const location = [city, state].filter(Boolean).join(' - ');

    setProjectFormSubmitting(true);
    try {
      const payloads: Record<string, unknown>[] = [
        {
          name,
          city,
          state,
          uf: state,
          neighborhood,
          address,
          contract_city,
          forum_city: contract_city,
          location,
          updated_at: new Date().toISOString(),
        },
        {
          name,
          city,
          uf: state,
          neighborhood,
          address,
          forum_city: contract_city,
          location,
          updated_at: new Date().toISOString(),
        },
        { name, city, uf: state, location, updated_at: new Date().toISOString() },
      ];

      let saved: Record<string, unknown> | null = null;
      let lastError: { message: string } | null = null;

      for (const payload of payloads) {
        const cleaned = Object.fromEntries(
          Object.entries(payload).filter(([, v]) => v !== undefined && v !== ''),
        );
        const { data, error } = await supabase
          .from('projects')
          .update(cleaned)
          .eq('id', editingProject.id)
          .select('*')
          .single();

        if (!error && data) {
          saved = data as Record<string, unknown>;
          break;
        }
        lastError = error;
        const missingCol = error?.message?.match(/Could not find the '(\w+)' column/i)?.[1];
        if (!missingCol) break;
      }

      if (!saved) {
        throw new Error(lastError?.message || 'Não foi possível salvar o projeto.');
      }

      const updatedFields = {
        name,
        city,
        uf: state,
        state,
        neighborhood,
        address,
        forum_city: contract_city,
        contract_city,
        location,
      };

      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProject.id ? { ...p, ...updatedFields, blocks: p.blocks } : p,
        ),
      );
      setSelectedProject((prev) =>
        prev?.id === editingProject.id
          ? { ...prev, ...updatedFields, blocks: prev.blocks }
          : prev,
      );

      setProjectFeedback({ type: 'success', message: 'Projeto atualizado com sucesso.' });
      setTimeout(() => {
        closeProjectForm();
      }, 500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar alterações.';
      setProjectFeedback({ type: 'error', message });
    } finally {
      setProjectFormSubmitting(false);
    }
  };

  const handleCreateProject = async () => {
    const projectNameStr = newProjectName.trim();
    const cityStr = newProjectCity.trim();
    const ufStr = newProjectUf.trim().toUpperCase();

    if (!user) {
      setProjectFeedback({ type: 'error', message: 'Sessão não carregada. Aguarde ou faça login novamente.' });
      return;
    }

    if (
      projectLimit != null &&
      projectLimit > 0 &&
      projects.length >= projectLimit &&
      user.role !== 'SUPER_ADMIN'
    ) {
      setProjectFeedback({
        type: 'error',
        message: `O limite do seu plano (${projectLimit} loteamentos) foi atingido.`,
      });
      return;
    }

    setProjectFormSubmitting(true);

    try {
      let createTenantId = await resolveActiveTenantId(user);

      if (!createTenantId && user.role === 'SUPER_ADMIN') {
        setProjectFeedback({
          type: 'error',
          message:
            'Nenhuma empresa ativa. Use "Entrar como Empresa" em Empresas ou vincule um tenant ao seu usuário.',
        });
        return;
      }

      if (!createTenantId) {
        setProjectFeedback({
          type: 'error',
          message: 'Empresa (tenant) não identificada. Faça login novamente ou contate o suporte.',
        });
        return;
      }

      const impersonatingTenantId =
        typeof window !== 'undefined' ? localStorage.getItem('impersonating_tenant_id') : null;

      await createProjectThroughApi({
        name: projectNameStr,
        city: cityStr,
        uf: ufStr,
        neighborhood: newProjectNbhd.trim() || null,
        address: newProjectAddr.trim() || null,
        forum_city: newProjectForum.trim() || cityStr,
        impersonatingTenantId:
          user.role === 'SUPER_ADMIN' ? impersonatingTenantId : null,
      });

      await reloadSaas();
      await loadProjects();

      setProjectFeedback({ type: 'success', message: 'Projeto criado com sucesso!' });
      setTimeout(() => closeProjectForm(), 600);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[Criar Projeto] Falha completa:', err);
      const friendly =
        message.includes('Failed to fetch') || message.includes('Falha de rede')
          ? 'Não foi possível conectar ao servidor. Rode npm run dev e configure .env.local (veja .env.example).'
          : message.includes('Supabase não configurado')
            ? message
            : `Não foi possível criar o projeto: ${message}`;
      setProjectFeedback({
        type: 'error',
        message: friendly,
      });
    } finally {
      setProjectFormSubmitting(false);
    }
  };

  const handleProjectFormSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setProjectFeedback(null);
    if (!validateProjectForm()) return;

    if (projectFormMode === 'edit') {
      await handleSaveProjectEdit();
      return;
    }
    await handleCreateProject();
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Tem certeza que deseja excluir este projeto?")) return;
    try {
      let query = supabase.from('projects').delete().eq('id', projectId);
      
      if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
         query = query.or(`tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`);
      } else if (user?.role !== 'SUPER_ADMIN' && !user?.tenant_id) {
         throw new Error("Usuário não tem empresa associada.");
      }

      const { error } = await query;
      if (error) throw error;
      
      // Also verify if the project is actually deleted from local state
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (err: any) {
      console.error(err);
      alert("Erro ao excluir: " + err.message);
    }
  };

  const handleImportKML = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile || !selectedProject || !user) return;
    setImporting(true);
    
    try {
      let tenantId = user.tenant_id;
      if (!tenantId) {
        const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
        if (userData?.tenant_id) {
          tenantId = userData.tenant_id;
        }
      }

      const isMasterAdmin = user.email === 'severino@nortesultopografia.com.br' || user.email === 'nortesultopografiapara@gmail.com' || user.role === 'SUPER_ADMIN';

      // Fallback para o Super Admin
      if (!tenantId && isMasterAdmin) {
        tenantId = null; // MASTER-ADMIN invalid UUID for tenant_id column
      }

      // If tenantId is not null, ensure it's not a generic string.
      if (!selectedProject.id) {
         alert('Erro: Projeto não identificado. Atualize a página e tente novamente.');
         setImporting(false);
         return;
      }

      let finalTenantId = tenantId;
      if (finalTenantId === 'MASTER-ADMIN') finalTenantId = null;

      if (!finalTenantId && !isMasterAdmin) {
         alert('Erro: Empresa não identificada. Faça login novamente.');
         setImporting(false);
         return;
      }

      // Evitar quadra duplicada no frontend
      if (!importQuadra.trim()) {
         alert('Erro: Informe a Quadra para importação.');
         setImporting(false);
         return;
      }

      const text = await importFile.text();
      let geometries = parseKML(text);
      
      // Filtrar apenas geometrias válidas
      geometries = geometries.filter((g: any) => g.type === 'Polygon' && g.coordinates && g.coordinates[0]);

      if (geometries.length === 0) {
         alert('Erro: Nenhum lote válido (polígono fechado) encontrado no KML.');
         setImporting(false);
         return;
      }

      // Check duplicados no banco
      const { data: blockCheck } = await supabase
         .from('blocks')
         .select('id')
         .eq('project_id', selectedProject.id)
         .eq('block_name', importQuadra.toUpperCase().trim())
         .limit(1);

      if (blockCheck && blockCheck.length > 0) {
         alert(`Erro: A Quadra "${importQuadra.toUpperCase()}" já existe neste projeto. Para atualizar, exclua os lotes antigos primeiro.`);
         setImporting(false);
         return;
      }

      try { await supabase.rpc('reload_schema_cache'); } catch(e) {}
          
      // Utility to calculate distance between coords in meters
      const haversineDist = (p1: number[], p2: number[]) => {
        const r = 6371000;
        const p1lat = p1[1] * Math.PI/180;
        const p2lat = p2[1] * Math.PI/180;
        const dLat = (p2[1]-p1[1]) * Math.PI/180;
        const dLon = (p2[0]-p1[0]) * Math.PI/180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(p1lat) * Math.cos(p2lat) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return r * c;
      };

      // Extract all polygon coordinates for checking externals
      const allPolys = geometries.filter(g => g.type === 'Polygon' && g.coordinates).map(g => g.coordinates[0]);

      // Preparar inserção na tabela blocks
      const PRICE_PER_M2 = 0.0993035247984734;
      let currentNumber = parseInt(importLoteInicial, 10) || 1;
      const blocksToInsert = geometries.map((geom, index) => {
          const numberStr = (importOrdem === 'ASC' ? currentNumber + index : currentNumber - index).toString();
          
          let calcArea = 0;
          let dims = { frente: null as number|null, fundo: null as number|null, ladoD: null as number|null, ladoE: null as number|null };
          if (geom.type === 'Polygon' && geom.coordinates && geom.coordinates[0].length >= 4) {
             try {
                const poly = turfPolygon(geom.coordinates);
                const areaCalculada = turfArea(poly);
                const areaRealCorrigida = areaCalculada * 0.9952546259435014;
                calcArea = areaRealCorrigida;
                
                const calculatedDims = calculateLotDimensions(geom.coordinates[0], allPolys, geom.properties || {});
                dims = {
                    frente: calculatedDims.frente as unknown as number,
                    fundo: calculatedDims.fundo as unknown as number,
                    ladoD: calculatedDims.ladoDireito as unknown as number,
                    ladoE: calculatedDims.ladoEsquerdo as unknown as number
                };
             } catch (e) {
                console.error("Error calculating area:", e);
             }
          }
          
          if (calcArea <= 0) calcArea = 2500; // Fallback
          
          const finalArea = parseFloat(calcArea.toFixed(2));
          const finalPrice = parseFloat((finalArea * PRICE_PER_M2).toFixed(2));

          return {
             project_id: selectedProject.id,
             name: importQuadra.toUpperCase(),
             block_name: importQuadra.toUpperCase(),
             number: numberStr,
             lot_number: numberStr,
             status: 'Disponível',
             area: finalArea,
             price: finalPrice,
             geometry: geom,
             tenant_id: finalTenantId,
             company_id: finalTenantId,
             frente: dims.frente !== null ? Number(dims.frente) : null,
             'Fundo': dims.fundo !== null ? String(dims.fundo).replace(/[^0-9.]/g, '') : null,
             'Lado Dir.': dims.ladoD !== null ? String(dims.ladoD).replace(/[^0-9.]/g, '') : null,
             'Lado Esq.': dims.ladoE !== null ? String(dims.ladoE).replace(/[^0-9.]/g, '') : null
          };
      });
      
      if (blocksToInsert.length > 0) {
          const { error: insertError } = await supabase.from('blocks').insert(blocksToInsert);
          if (insertError) throw insertError;
      }
      
      alert(`Importados ${blocksToInsert.length} lotes com sucesso!`);
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportQuadra('');
      setImportLoteInicial('1');
      setMapRefreshKey(prev => prev + 1);
    } catch(err: any) {
       console.error("Erro no import: ", err);
       alert("Erro ao importar KML: " + err.message);
    } finally {
       setImporting(false);
    }
  };

  const handleImportTXT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importTxtFile || !selectedProject || !user) return;
    setImportingTxt(true);
    
    try {
      let tenantId = user.tenant_id;
      if (!tenantId) {
        const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user.id).single();
        if (userData?.tenant_id) {
          tenantId = userData.tenant_id;
        }
      }

      const isMasterAdmin = user.email === 'severino@nortesultopografia.com.br' || user.email === 'nortesultopografiapara@gmail.com' || user.role === 'SUPER_ADMIN';

      if (!tenantId && isMasterAdmin) {
        tenantId = null;
      }

      if (!selectedProject.id) {
         alert('Erro: Projeto não identificado. Atualize a página e tente novamente.');
         setImportingTxt(false);
         return;
      }

      let finalTenantId = tenantId;
      if (finalTenantId === 'MASTER-ADMIN') finalTenantId = null;

      if (!finalTenantId && !isMasterAdmin) {
         alert('Erro: Empresa não identificada. Faça login novamente.');
         setImportingTxt(false);
         return;
      }

      if (!importTxtQuadra.trim()) {
         alert('Erro: Informe a Quadra para importação TXT.');
         setImportingTxt(false);
         return;
      }

      const text = await importTxtFile.text();
      const zoneNum = parseInt(importTxtUtmZone.replace(/\D/g, ''));
      const proj4String = `+proj=utm +zone=${zoneNum} +south +datum=WGS84 +units=m +no_defs`;

      let centerQuery = supabase
        .from('blocks')
        .select('geometry, coordinates_utm_json, block_name, name')
        .eq('project_id', selectedProject.id);
      if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
        centerQuery = centerQuery.or(
          `tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`,
        );
      }
      const { data: existingBlocks } = await centerQuery;

      const quadraName = importTxtQuadra.toUpperCase().trim();
      const utmZoneLabel = importTxtUtmZone.trim() || `22S`;

      const clusterResult = computeProjectUtmClusterCenterFromBlocks(
        existingBlocks ?? [],
        proj4String,
        { excludeBlockName: quadraName },
      );
      const projectCenterUtm = clusterResult.center;

      const lotsParsed = parseCivil3dTxtLots(text);
      const blocksParsed = lotsParsed.map((lot) => {
        const payload = civil3dLotToImportPayload(
          lot,
          proj4String,
          null,
        );
        return {
          name: payload.name,
          area: payload.area,
          perimeter: payload.perimeter,
          officialSegs: payload.officialSegs,
          segmentsJson: payload.segmentsJson,
          coords: payload.coords,
          geometrySaved: payload.geometrySaved,
        };
      });

      if (blocksParsed.length === 0) {
         alert('Erro: Nenhum lote válido encontrado no arquivo TXT.');
         setImportingTxt(false);
         return;
      }

      const quadraLocation = validateQuadraImportAgainstProject(
        blocksParsed,
        null,
        quadraName,
        lotsParsed,
        proj4String,
        projectCenterUtm,
        {
          utmZone: utmZoneLabel,
          maxAllowedKm: getQuadraImportMaxAllowedKm(selectedProject),
          clusterMeta: clusterResult,
        },
      );
      if (quadraLocation.blocked) {
        const blockMsg = formatQuadraImportLocationBlockedMessage(quadraLocation);
        const canOverrideLocation =
          user.role === 'SUPER_ADMIN' ||
          user.role === 'ADMIN' ||
          user.email === 'severino@nortesultopografia.com.br' ||
          user.email === 'nortesultopografiapara@gmail.com';
        if (
          canOverrideLocation &&
          window.confirm(
            `${blockMsg}\n\nImportar mesmo assim? (somente administrador)`,
          )
        ) {
          console.log('QUADRA_IMPORT_LOCATION_OVERRIDE', {
            quadra: quadraName,
            projectId: selectedProject.id,
            distanceKm: quadraLocation.distanceKm,
            maxAllowedKm: quadraLocation.maxAllowedKm,
            utmZone: utmZoneLabel,
            user: user.email,
            role: user.role,
          });
        } else {
          alert(blockMsg);
          setImportingTxt(false);
          return;
        }
      }

      const lotsWithGeometryPreDelete = blocksParsed.filter(
        (b) => b.geometrySaved,
      ).length;
      if (lotsWithGeometryPreDelete === 0) {
        alert(
          "Quadra importada sem geometria válida. Verifique o TXT, o fechamento dos lotes e a zona UTM.",
        );
        setImportingTxt(false);
        return;
      }

      try {
        await clearProjectMapOfflineCache(selectedProject.id);
      } catch (cacheErr) {
        console.warn('[CACHE] falha ao limpar IndexedDB do mapa', cacheErr);
      }

      const { error: deleteQuadraError } = await supabase
        .from('blocks')
        .delete()
        .eq('project_id', selectedProject.id)
        .eq('block_name', quadraName);

      if (deleteQuadraError) {
        throw deleteQuadraError;
      }

      console.log('[TXT] geometrias antigas removidas da quadra', quadraName);

      try { await supabase.rpc('reload_schema_cache'); } catch(e) {}
          
      const PRICE_PER_M2 = 0.0993035247984734; // Placeholder
      
      const lotsWithGeometry = blocksParsed.filter((b) => b.geometrySaved);
      const lotsWithoutGeometry = blocksParsed.length - lotsWithGeometry.length;

      console.log("[TXT] resumo geometria quadra", {
        quadra: quadraName,
        total: blocksParsed.length,
        comGeometria: lotsWithGeometry.length,
        semGeometria: lotsWithoutGeometry,
      });

      const blocksToInsert = blocksParsed.map((b) => {
          const finalArea = b.area;
          const finalPrice = parseFloat((finalArea * 120.00).toFixed(2));
          const officialSegs = b.officialSegs;
          const segmentsJson = b.segmentsJson;
          const provisionalFrontIndex = 0;
          const measures = getOfficialLotMeasurements({
            segments_json: segmentsJson,
            front_segment_index: provisionalFrontIndex,
            area: finalArea,
            perimeter: b.perimeter,
            source_import: 'TXT_CIVIL3D',
            number: b.name,
          });

          let geom = null;
          if (b.geometrySaved && b.coords.length >= 4) {
             geom = {
                 type: "Polygon",
                 coordinates: [b.coords]
             };
          } else if (!b.geometrySaved) {
             console.log("LOT_INSERT_WITHOUT_GEOMETRY", {
               quadra: quadraName,
               lote: b.name,
               segmentCount: b.officialSegs.length,
             });
          }

          return {
             project_id: selectedProject.id,
             name: quadraName,
             block_name: quadraName,
             number: b.name,
             lot_number: b.name,
             status: 'Disponível',
             area: finalArea,
             perimeter: measures.perimeter ?? b.perimeter,
             price: finalPrice,
             geometry: geom,
             tenant_id: finalTenantId,
             company_id: finalTenantId,
             frente: measures.frente,
             'Fundo':
               measures.fundo != null
                 ? String(measures.fundo).replace(/[^0-9.]/g, '')
                 : null,
             'Lado Dir.':
               measures.ladoDireito != null
                 ? String(measures.ladoDireito).replace(/[^0-9.]/g, '')
                 : null,
             'Lado Esq.':
               measures.ladoEsquerdo != null
                 ? String(measures.ladoEsquerdo).replace(/[^0-9.]/g, '')
                 : null,
             front_segment_index: provisionalFrontIndex,
             segments_json: segmentsJson,
             coordinates_utm_json:
               officialSegs.length > 0
                 ? officialSegs.map((s) => [s.east, s.north])
                 : null,
             source_import: 'TXT_CIVIL3D',
             _officialSegs: officialSegs,
          };
      });
      
      if (blocksToInsert.length > 0) {
          const insertPayload = blocksToInsert.map(
            ({ _officialSegs: _s, ...row }) => row,
          );
          const { data: inserted, error: insertError } = await supabase
            .from('blocks')
            .insert(insertPayload)
            .select('id, number');
          if (insertError) throw insertError;

          if (inserted?.length) {
            for (let i = 0; i < inserted.length; i++) {
              const lotId = inserted[i]?.id;
              const officialSegs = blocksToInsert[i]?._officialSegs;
              if (!lotId || !officialSegs?.length) continue;
              try {
                await supabase
                  .from('lot_segments')
                  .delete()
                  .eq('lot_id', lotId);
                await supabase
                  .from('lot_segments')
                  .insert(officialSegmentsToLotSegmentRows(lotId, officialSegs));
              } catch (segErr) {
                console.warn('[TXT] lot_segments não persistido (tabela ausente?)', segErr);
              }
            }
          }
      }
      
      if (lotsWithGeometry.length === 0) {
        alert(
          "Quadra importada sem geometria válida. Verifique o TXT, o fechamento dos lotes e a zona UTM.",
        );
      } else if (lotsWithoutGeometry > 0) {
        alert(
          `Importados ${blocksToInsert.length} lotes. ${lotsWithoutGeometry} lote(s) sem geometria no mapa — veja o console (GEOMETRY_SAVED_FALSE / TXT_CHAIN_CLOSURE_ERROR).`,
        );
      } else {
        alert(
          `Importados ${blocksToInsert.length} lotes do TXT com sucesso!`,
        );
      }
      setIsImportTxtModalOpen(false);
      setImportTxtFile(null);
      setImportTxtQuadra('');
      setMapRefreshKey(prev => prev + 1);
    } catch(err: any) {
       console.error("Erro no import TXT: ", err);
       alert("Erro ao importar TXT: " + err.message);
    } finally {
       setImportingTxt(false);
    }
  };

  const handleImportShapefile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importShpFile || !selectedProject || !user) return;
    setImportingShp(true);

    try {
      let tenantId = user.tenant_id;
      if (!tenantId) {
        const { data: userData } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', user.id)
          .single();
        if (userData?.tenant_id) tenantId = userData.tenant_id;
      }

      const isMasterAdmin =
        user.email === 'severino@nortesultopografia.com.br' ||
        user.email === 'nortesultopografiapara@gmail.com' ||
        user.role === 'SUPER_ADMIN';

      if (!tenantId && isMasterAdmin) tenantId = null;

      if (!selectedProject.id) {
        alert('Erro: Projeto não identificado. Atualize a página e tente novamente.');
        return;
      }

      let finalTenantId = tenantId;
      if (finalTenantId === 'MASTER-ADMIN') finalTenantId = null;

      if (!finalTenantId && !isMasterAdmin) {
        alert('Erro: Empresa não identificada. Faça login novamente.');
        return;
      }

      const shapeLots = await parseShapefileZipFile(
        importShpFile,
        importShpDefaultQuadra,
      );

      let blocksQuery = supabase
        .from('blocks')
        .select('*')
        .eq('project_id', selectedProject.id);
      if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
        blocksQuery = blocksQuery.or(
          `tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`,
        );
      }
      const { data: existingBlocks, error: loadError } = await blocksQuery;
      if (loadError) throw loadError;

      const blockByKey = new Map<string, Record<string, unknown>>();
      for (const row of existingBlocks || []) {
        const b = row as Record<string, unknown>;
        const bn = String(b.block_name || b.name || '').trim();
        const num = String(b.number || b.lot_number || '').trim();
        if (!bn || !num) continue;
        blockByKey.set(buildBlockMatchKey(bn, num), b);
      }

      const allPolys = shapeLots.map((l) => l.geometry.coordinates[0]);
      const PRICE_PER_M2 = 0.0993035247984734;

      let updatedVisual = 0;
      let updatedFull = 0;
      let inserted = 0;

      const inserts: Record<string, unknown>[] = [];

      for (const lot of shapeLots) {
        const geom = {
          type: 'Polygon' as const,
          coordinates: lot.geometry.coordinates,
        };
        const key = buildBlockMatchKey(lot.quadra, lot.lote);
        const existing = blockByKey.get(key);

        if (existing?.id) {
          const patch: Record<string, unknown> = { geometry: geom };
          if (lot.matricula) patch.matricula = lot.matricula;

          if (blockHasTxtOfficialData(existing)) {
            const { error: upErr } = await supabase
              .from('blocks')
              .update(patch)
              .eq('id', String(existing.id));
            if (upErr) throw upErr;
            updatedVisual++;
          } else {
            let calcArea = lot.area ?? 0;
            let dims = {
              frente: null as number | null,
              fundo: null as number | null,
              ladoD: null as number | null,
              ladoE: null as number | null,
            };
            try {
              if (geom.coordinates[0].length >= 4) {
                const poly = turfPolygon(geom.coordinates);
                const areaCalculada = turfArea(poly);
                const areaCorrigida = areaCalculada * 0.9952546259435014;
                if (calcArea <= 0) calcArea = areaCorrigida;
                const calculatedDims = calculateLotDimensions(
                  geom.coordinates[0],
                  allPolys,
                  lot.properties,
                );
                dims = {
                  frente: calculatedDims.frente as unknown as number,
                  fundo: calculatedDims.fundo as unknown as number,
                  ladoD: calculatedDims.ladoDireito as unknown as number,
                  ladoE: calculatedDims.ladoEsquerdo as unknown as number,
                };
              }
            } catch (calcErr) {
              console.warn('[SHP] medidas provisórias', calcErr);
            }
            if (calcArea <= 0) calcArea = 2500;
            const finalArea = parseFloat(calcArea.toFixed(2));
            patch.area = finalArea;
            patch.frente = dims.frente !== null ? Number(dims.frente) : null;
            patch.Fundo =
              dims.fundo !== null
                ? String(dims.fundo).replace(/[^0-9.]/g, '')
                : null;
            patch['Lado Dir.'] =
              dims.ladoD !== null
                ? String(dims.ladoD).replace(/[^0-9.]/g, '')
                : null;
            patch['Lado Esq.'] =
              dims.ladoE !== null
                ? String(dims.ladoE).replace(/[^0-9.]/g, '')
                : null;
            if (!existing.source_import) {
              patch.source_import = 'SHAPEFILE';
            }

            const { error: upErr } = await supabase
              .from('blocks')
              .update(patch)
              .eq('id', String(existing.id));
            if (upErr) throw upErr;
            updatedFull++;
          }
          continue;
        }

        let calcArea = lot.area ?? 0;
        let dims = {
          frente: null as number | null,
          fundo: null as number | null,
          ladoD: null as number | null,
          ladoE: null as number | null,
        };
        try {
          if (geom.coordinates[0].length >= 4) {
            const poly = turfPolygon(geom.coordinates);
            const areaCalculada = turfArea(poly);
            const areaCorrigida = areaCalculada * 0.9952546259435014;
            if (calcArea <= 0) calcArea = areaCorrigida;
            const calculatedDims = calculateLotDimensions(
              geom.coordinates[0],
              allPolys,
              lot.properties,
            );
            dims = {
              frente: calculatedDims.frente as unknown as number,
              fundo: calculatedDims.fundo as unknown as number,
              ladoD: calculatedDims.ladoDireito as unknown as number,
              ladoE: calculatedDims.ladoEsquerdo as unknown as number,
            };
          }
        } catch (calcErr) {
          console.warn('[SHP] medidas provisórias (insert)', calcErr);
        }
        if (calcArea <= 0) calcArea = 2500;
        const finalArea = parseFloat(calcArea.toFixed(2));
        const finalPrice = parseFloat((finalArea * PRICE_PER_M2).toFixed(2));
        const lotNumber = String(lot.lote).trim();

        inserts.push({
          project_id: selectedProject.id,
          name: lot.quadra,
          block_name: lot.quadra,
          number: lotNumber,
          lot_number: lotNumber,
          status: 'Disponível',
          area: finalArea,
          price: finalPrice,
          geometry: geom,
          tenant_id: finalTenantId,
          company_id: finalTenantId,
          frente: dims.frente !== null ? Number(dims.frente) : null,
          Fundo:
            dims.fundo !== null
              ? String(dims.fundo).replace(/[^0-9.]/g, '')
              : null,
          'Lado Dir.':
            dims.ladoD !== null
              ? String(dims.ladoD).replace(/[^0-9.]/g, '')
              : null,
          'Lado Esq.':
            dims.ladoE !== null
              ? String(dims.ladoE).replace(/[^0-9.]/g, '')
              : null,
          source_import: 'SHAPEFILE',
          ...(lot.matricula ? { matricula: lot.matricula } : {}),
        });
      }

      if (inserts.length > 0) {
        const { error: insertError } = await supabase
          .from('blocks')
          .insert(inserts);
        if (insertError) throw insertError;
        inserted = inserts.length;
      }

      try {
        await clearProjectMapOfflineCache(selectedProject.id);
      } catch (cacheErr) {
        console.warn('[CACHE] falha ao limpar IndexedDB após shapefile', cacheErr);
      }

      const parts: string[] = [];
      if (updatedVisual > 0) {
        parts.push(
          `${updatedVisual} lote(s) com TXT: geometria visual atualizada (medidas oficiais mantidas)`,
        );
      }
      if (updatedFull > 0) {
        parts.push(`${updatedFull} lote(s) existente(s) atualizado(s) com geometria e medidas provisórias`);
      }
      if (inserted > 0) {
        parts.push(`${inserted} lote(s) novo(s) importado(s) do shapefile`);
      }
      alert(
        parts.length > 0
          ? `Shapefile processado.\n${parts.join('.\n')}.`
          : 'Nenhuma alteração aplicada.',
      );

      setIsImportShpModalOpen(false);
      setImportShpFile(null);
      setImportShpDefaultQuadra('');
      setMapRefreshKey((prev) => prev + 1);
    } catch (err: unknown) {
      console.error('Erro no import Shapefile: ', err);
      const msg = err instanceof Error ? err.message : String(err);
      alert('Erro ao importar Shapefile: ' + msg);
    } finally {
      setImportingShp(false);
    }
  };

  const resolveStreetTenantId = () => {
    let validTenantId = selectedProject?.tenant_id;
    if (!validTenantId || validTenantId === 'MASTER-ADMIN') {
      validTenantId = selectedProject?.company_id || user?.tenant_id || null;
    }
    return validTenantId;
  };

  const handleStreetLineDrawn = (latlngs: L.LatLng[]) => {
    if (!selectedProject || latlngs.length < 2) return;
    console.log('STREET_GUIDE_DRAW_START');
    setDrawStreetActive(false);
    setStreetGuideModal({
      mode: 'create',
      coordinates: latlngs.map((ll) => [ll.lng, ll.lat]),
    });
  };

  const handleSaveStreetGuideForm = async (form: StreetGuideFormValues) => {
    if (!selectedProject || !streetGuideModal) return;

    const validTenantId = resolveStreetTenantId();
    const coordinates =
      streetGuideModal.coordinates ||
      (
        (streetGuideModal.guide?.geometry_geojson ||
          streetGuideModal.guide?.geometry) as { coordinates?: number[][] }
      )?.coordinates;

    if (!coordinates?.length) {
      throw new Error('Geometria da linha inválida.');
    }

    const payload = buildStreetGuideInsertPayload({
      tenantId: validTenantId,
      projectId: selectedProject.id,
      form,
      coordinates,
    });

    console.log('STREET_GUIDE_SAVE_PAYLOAD', payload);

    if (streetGuideModal.mode === 'edit' && streetGuideModal.guide?.id) {
      const id = String(streetGuideModal.guide.id);
      if (id.startsWith('temp-')) {
        setStreetGuides((prev) =>
          prev.map((g) =>
            g.id === id ? normalizeStreetGuideRow({ ...g, ...payload, id }) : g,
          ),
        );
        return;
      }
      const { data, error } = await supabase
        .from('street_guides')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setStreetGuides((prev) =>
          prev.map((g) =>
            g.id === id ? normalizeStreetGuideRow(data as Record<string, unknown>) : g,
          ),
        );
      }
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const tempGuide = normalizeStreetGuideRow({
      id: tempId,
      ...payload,
      visible: true,
    });
    setStreetGuides((prev) => [...prev, tempGuide]);

    const { data, error } = await supabase
      .from('street_guides')
      .insert(payload)
      .select();

    if (error) {
      console.error('Save street guide error:', error);
      if (error.code === 'PGRST205') {
        alert(
          "Aviso: Tabela 'street_guides' não existe. Linha mantida localmente.",
        );
      } else {
        alert(
          'Erro ao salvar logradouro (RLS?). Linha mantida localmente. ' +
            error.message,
        );
      }
      return;
    }

    if (data?.length) {
      console.log('STREET_GUIDE_CREATED', { id: data[0].id });
      setStreetGuides((prev) =>
        prev.map((g) =>
          g.id === tempId
            ? normalizeStreetGuideRow(data[0] as Record<string, unknown>)
            : g,
        ),
      );
    }
  };

  const handleDeleteStreetGuide = async (id: string) => {
      try {
          if (typeof id === 'string' && id.startsWith('temp-')) {
              setStreetGuides(prev => prev.filter(g => g.id !== id));
              return;
          }
          const { error } = await supabase.from('street_guides').delete().eq('id', id);
          if (error) throw error;
          loadStreetGuides();
      } catch (e: any) {
          console.error(e);
          alert("Erro ao apagar linha-guia: " + e.message);
      }
  };

  const renderProjectFormModal = () => (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up max-h-[90vh] flex flex-col">
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
            <h3 className="font-bold text-white text-lg">
              {projectFormMode === 'edit' ? 'Editar Projeto' : 'Novo Projeto'}
            </h3>
            <button
              type="button"
              onClick={closeProjectForm}
              className="text-[var(--color-text-muted)] hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleProjectFormSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
            {projectFeedback && (
              <div
                role="alert"
                className={`rounded-lg border px-3 py-2 text-sm ${
                  projectFeedback.type === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-300'
                }`}
              >
                {projectFeedback.message}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Nome do Projeto *
              </label>
              <input
                type="text"
                required
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Ex: Loteamento Bosque das Árvores"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  Cidade *
                </label>
                <input
                  type="text"
                  required
                  value={newProjectCity}
                  onChange={(e) => setNewProjectCity(e.target.value)}
                  placeholder="Ex: Parauapebas"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  UF *
                </label>
                <input
                  type="text"
                  required
                  maxLength={2}
                  value={newProjectUf}
                  onChange={(e) => setNewProjectUf(e.target.value.toUpperCase())}
                  placeholder="Ex: PA"
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)] uppercase"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Bairro/Localidade
              </label>
              <input
                type="text"
                value={newProjectNbhd}
                onChange={(e) => setNewProjectNbhd(e.target.value)}
                placeholder="Ex: Centro"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Endereço/Referência
              </label>
              <input
                type="text"
                value={newProjectAddr}
                onChange={(e) => setNewProjectAddr(e.target.value)}
                placeholder="Endereço principal da área"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Município / Foro do Contrato
              </label>
              <input
                type="text"
                value={newProjectForum}
                onChange={(e) => setNewProjectForum(e.target.value)}
                placeholder="Ex: Parauapebas (Deixe vazio para usar a cidade)"
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={projectFormSubmitting}
              className="w-full shrink-0 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              {projectFormSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
                     ) : projectFormMode === 'edit' ? (
                       'Salvar Alterações'
                     ) : (
                       'Criar Projeto'
                     )}
            </button>
          </form>
        </div>
      </div>
  );

  const projectFormPortal =
    isProjectFormOpen && typeof document !== 'undefined'
      ? createPortal(renderProjectFormModal(), document.body)
      : null;

  // Se um projeto foi selecionado, exibe o Mapa
  if (selectedProject) {
    return (
      <>
      <div className="flex-1 w-full h-full flex flex-col pt-0 relative bg-[var(--color-background)]">
        {/* LEGENDA - BOTTOM LEFT */}
        <div className="absolute bottom-4 left-4 z-[400] pointer-events-auto">
           <div className="bg-[#11141a]/95 backdrop-blur-md border border-[#2d3340] rounded flex flex-col gap-1.5 p-2 shadow-lg max-w-[150px]">
              <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400">
                <div className="w-3 h-3 rounded-sm bg-[#22c55e] border border-[#16a34a]" /> Disponível
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400">
                <div className="w-3 h-3 rounded-sm bg-[#eab308] border border-[#ca8a04]" /> Reservado
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400">
                <div className="w-3 h-3 rounded-sm bg-[#ef4444] border border-[#dc2626]" /> Vendido
              </div>
           </div>
        </div>

        {/* Voltar — sem card de nome (nome no header global) */}
        <div className="absolute top-2 left-2 md:top-4 md:left-4 z-[400] pointer-events-auto">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center justify-center p-2.5 bg-[#11141a]/95 backdrop-blur-md border border-[#2d3340] shadow-lg rounded-lg text-gray-400 hover:text-white hover:bg-[#2d3340] transition-colors"
            title="Voltar aos projetos"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {/* GIS TOOLS VERTICAL BAR - RIGHT */}
        <div className="absolute top-16 right-2 md:top-4 md:right-4 z-[400] pointer-events-auto flex flex-col gap-1.5 items-end">
           {/* Botão toggle da barra para mobile (opcional, ou mantemos sempre visível pois é fino) */}
           <div className="bg-[#11141a]/95 backdrop-blur-md border border-[#2d3340] py-1.5 px-1.5 rounded-lg shadow-lg flex flex-col gap-1.5 w-10 md:w-12 items-center relative">
             
             {user?.role !== 'BROKER' && (
               <>
                 <ProjectQuadrasPanel
                   open={quadrasPanelOpen}
                   onToggleOpen={() => setQuadrasPanelOpen((o) => !o)}
                   quadras={projectQuadras}
                   loading={quadrasLoading}
                   actionLoading={quadraActionLoading}
                   onViewOnMap={handleViewQuadraOnMap}
                   onReimportTxt={handleReimportQuadraTxt}
                   onRequestDelete={setDeleteQuadraConfirm}
                 />

                 <hr className="w-2/3 border-[#2d3340]" />

                 {/* Import — oficial: TXT Civil 3D */}
                 {SHOW_LEGACY_GIS_IMPORT && (
                   <button
                     type="button"
                     onClick={() => setIsImportModalOpen(true)}
                     className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#4999e9] transition-colors group relative"
                   >
                     <Upload className="w-4 h-4 md:w-5 md:h-5" />
                     <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Importar Quadras (KML)</span>
                   </button>
                 )}

                 <button
                    type="button"
                    onClick={() => setIsImportTxtModalOpen(true)}
                    className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#4999e9] transition-colors group relative"
                 >
                    <FolderOpen className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">Importar TXT Civil 3D</span>
                 </button>

                 {SHOW_LEGACY_GIS_IMPORT && (
                   <button
                     type="button"
                     onClick={() => setIsImportShpModalOpen(true)}
                     className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#4999e9] transition-colors group relative"
                   >
                     <Layers className="w-4 h-4 md:w-5 md:h-5" />
                     <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[11rem] text-right leading-tight">Shapefile (.zip)</span>
                   </button>
                 )}

                 <button
                   type="button"
                   onClick={() => void handleRunAutomaticConfrontation()}
                   disabled={confrontationRunning}
                   className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#22c55e] transition-colors group relative disabled:opacity-40"
                 >
                   {confrontationRunning ? (
                     <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                   ) : (
                     <GitCompare className="w-4 h-4 md:w-5 md:h-5" />
                   )}
                   <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">Confrontação Automática</span>
                 </button>

                 <button
                   type="button"
                   onClick={() => setMemorialModalOpen(true)}
                   className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#f59e0b] transition-colors group relative"
                 >
                   <ScrollText className="w-4 h-4 md:w-5 md:h-5" />
                   <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">Memorial Descritivo</span>
                 </button>
                 
                 <hr className="w-2/3 border-[#2d3340]" />
               </>
             )}
             
             {/* GPS */}
             <button 
                onClick={() => setGpsActive(!gpsActive)} 
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${gpsActive ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#10b981]'}`}
             >
                <Navigation className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">GPS</span>
             </button>
             
             {/* Medição */}
             <button 
                onClick={() => setMeasureActive(!measureActive)} 
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${measureActive ? 'bg-[#4999e9]/20 text-[#4999e9]' : 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#4999e9]'}`}
             >
                <Ruler className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Medição</span>
             </button>

             {/* Prancha PDF */}
             <button
                type="button"
                onClick={() => {
                  console.log('LOT_SHEET_PRINT_CLICK');
                  setLotSheetTarget(null);
                  setLotSheetPickMode(true);
                  setMeasureActive(false);
                  setDrawStreetActive(false);
                  console.log('LOT_SHEET_PICK_MODE_ENABLED');
                }}
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${lotSheetPickMode || lotSheetTarget ? 'bg-[#a855f7]/20 text-[#c084fc]' : 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#c084fc]'}`}
             >
                <Printer className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Prancha do Lote</span>
             </button>
             
             {/* Map Style */}
             <button 
                onClick={() => {
                   if (activeLayer === 'satellite') setActiveLayer('streets');
                   else if (activeLayer === 'streets') setActiveLayer('dark');
                   else setActiveLayer('satellite');
                }} 
                className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#f59e0b] transition-colors group relative"
             >
                <MapIcon className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">
                   {activeLayer === 'satellite' ? 'Satélite' : activeLayer === 'streets' ? 'Vetor' : 'Dark Mode'}
                </span>
             </button>
             
             {user?.role !== 'BROKER' && (
               <>
                 <hr className="w-2/3 border-[#2d3340]" />
                 
                 {/* Linha de Rua */}
                 <button 
                    onClick={() => setDrawStreetActive(!drawStreetActive)} 
                    className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${drawStreetActive ? 'bg-[#10b981]/20 text-[#10b981]' : 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#10b981]'}`}
                 >
                    <PenTool className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Linha de Rua</span>
                 </button>
                 
                 {/* Identificar Frentes */}
                 <button 
                    onClick={handleIdentifyFronts} 
                    className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-[#4999e9]/20 text-gray-400 hover:text-[#4999e9] transition-colors group relative"
                 >
                    <Scan className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Identificar Frentes</span>
                 </button>
                 
                 {/* Visibility Toggle */}
                 <button 
                    onClick={() => setStreetGuidesVisible(!streetGuidesVisible)} 
                    className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${streetGuidesVisible ? 'bg-transparent hover:bg-gray-800 text-[#f59e0b]' : 'bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#f59e0b]'}`}
                 >
                    {streetGuidesVisible ? <Eye className="w-4 h-4 md:w-5 md:h-5" /> : <EyeOff className="w-4 h-4 md:w-5 md:h-5" />}
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">
                       {streetGuidesVisible ? "Ocultar Linhas" : "Mostrar Linhas"}
                    </span>
                 </button>
               </>
             )}
             
           </div>
        </div>
        
        {/* Map Container */}
        <div className="flex-1 w-full h-full z-0">
          <GISMap 
            projectId={selectedProject.id} 
            activeLayer={activeLayer} 
            gpsActive={gpsActive} 
            measureActive={measureActive} 
            refreshKey={mapRefreshKey}
            focusBlockName={focusBlockName}
            focusBlockKey={focusBlockKey}
            streetGuides={streetGuides}
            streetGuidesVisible={streetGuidesVisible}
            drawStreetActive={drawStreetActive}
            onStreetLineDrawn={handleStreetLineDrawn}
            onEditStreetGuide={(guide) =>
              setStreetGuideModal({ mode: 'edit', guide })
            }
            onDeleteStreetGuide={handleDeleteStreetGuide}
            lotSheetPickMode={lotSheetPickMode}
            onLotSheetLotPick={(lot) => {
              if (!lotSheetPickMode) return;
              console.log('LOT_SHEET_MAP_LOT_CLICK', { id: lot.id, number: lot.number });
              setLotSheetTarget(lot);
              setLotSheetPickMode(false);
              console.log('LOT_SHEET_MODAL_OPEN_WITH_LOT', { id: lot.id, number: lot.number });
            }}
          />
        </div>

        {lotSheetPickMode && !lotSheetTarget && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
            <p className="text-xs font-semibold text-amber-100 bg-[#11141a]/95 border border-amber-500/40 rounded-lg px-3 py-2 shadow-lg text-center">
              Selecione um lote no mapa para gerar a prancha
            </p>
          </div>
        )}

        {streetGuideModal && (
          <StreetGuideFormModal
            mode={streetGuideModal.mode}
            guide={streetGuideModal.guide}
            onClose={() => setStreetGuideModal(null)}
            onSave={handleSaveStreetGuideForm}
          />
        )}

        {memorialModalOpen && selectedProject && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[#11141a] border border-[#2d3340] rounded-xl shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#2d3340]">
                <h3 className="font-bold text-white text-lg">Memorial Descritivo</h3>
                <button
                  type="button"
                  onClick={() => setMemorialModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 text-sm text-gray-300 space-y-3">
                {lotSheetTarget ? (
                  <p>
                    Lote <strong className="text-white">{lotSheetTarget.number || lotSheetTarget.id}</strong> selecionado.
                    A geração completa do memorial descritivo está em preparação (sprint v1.9).
                  </p>
                ) : (
                  <p>
                    Projeto <strong className="text-white">{selectedProject.name}</strong>.
                    Selecione um lote no mapa para priorizar o memorial unitário, ou aguarde a geração em lote do projeto.
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  Os textos usarão segmentos oficiais TXT, confrontações automáticas e responsável técnico da empresa.
                </p>
              </div>
              <div className="px-5 pb-5">
                <button
                  type="button"
                  onClick={() => setMemorialModalOpen(false)}
                  className="w-full py-2.5 rounded-lg bg-[#4999e9] text-white font-semibold text-sm hover:bg-[#3d82c4]"
                >
                  Entendi
                </button>
              </div>
            </div>
          </div>
        )}

        {lotSheetTarget && (saasTenantId || user?.tenant_id || selectedProject.tenant_id) && (
          <LotSheetPrintModal
            projectId={selectedProject.id}
            tenantId={String(saasTenantId || user?.tenant_id || selectedProject.tenant_id)}
            lot={lotSheetTarget}
            onClose={() => {
              setLotSheetPickMode(false);
              setLotSheetTarget(null);
            }}
            onSelectAnotherLot={() => {
              console.log('LOT_SHEET_SELECT_ANOTHER_CLICK');
              setLotSheetTarget(null);
              setLotSheetPickMode(true);
              setMeasureActive(false);
              setDrawStreetActive(false);
              console.log('LOT_SHEET_PICK_MODE_ENABLED');
            }}
          />
        )}

        {/* Modal KML Import */}
        {isImportModalOpen && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up">
                 <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h3 className="font-bold text-white text-lg">Importar Lotes (KML)</h3>
                    <button onClick={() => setIsImportModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                       <X className="w-5 h-5" />
                    </button>
                 </div>
                 <form onSubmit={handleImportKML} className="p-6 flex flex-col gap-4">
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Identificação da Quadra</label>
                       <input 
                         type="text" required
                         value={importQuadra} onChange={e => setImportQuadra(e.target.value)}
                         placeholder="Ex: A, B, C, Quadra 1..."
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)] uppercase"
                       />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Lote Inicial</label>
                          <input 
                            type="number" required
                            value={importLoteInicial} onChange={e => setImportLoteInicial(e.target.value)}
                            placeholder="Ex: 1"
                            className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                          />
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Ordenação</label>
                          <select 
                             value={importOrdem} onChange={e => setImportOrdem(e.target.value as 'ASC'|'DESC')}
                             className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                          >
                             <option value="ASC">Crescente (1,2,3)</option>
                             <option value="DESC">Decrescente (3,2,1)</option>
                          </select>
                       </div>
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Arquivo KML</label>
                       <input 
                         type="file" accept=".kml" required
                         onChange={e => setImportFile(e.target.files?.[0] || null)}
                         className="w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20 file:transition-colors file:cursor-pointer cursor-pointer border border-[var(--color-border)] bg-[var(--color-background)] rounded-lg p-2"
                       />
                       <p className="text-[10px] text-[var(--color-text-muted)] mt-2">Dica: O zoom automático é aplicado após salvar.</p>
                    </div>

                    <button 
                       type="submit" disabled={importing}
                       className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                    >
                       {importing ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Upload className="w-5 h-5"/> Processar e Salvar</>}
                    </button>
                 </form>
              </div>
           </div>
        )}

        {deleteQuadraConfirm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h3 className="font-bold text-white text-lg">Excluir quadra</h3>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-300 leading-relaxed">
                  Deseja excluir somente a{' '}
                  <strong className="text-white">
                    {formatQuadraLabel(deleteQuadraConfirm)}
                  </strong>
                  ?
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-3">
                  Todos os lotes desta quadra serão removidos. Outras quadras e o
                  projeto permanecem intactos.
                </p>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    disabled={Boolean(quadraActionLoading)}
                    onClick={() => setDeleteQuadraConfirm(null)}
                    className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-gray-300 font-semibold hover:bg-[var(--color-background)] transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(quadraActionLoading)}
                    onClick={handleConfirmDeleteQuadra}
                    className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {quadraActionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Excluir'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal TXT Import */}
        {isImportTxtModalOpen && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up">
                 <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h3 className="font-bold text-white text-lg">Importar Lotes (TXT Civil 3D)</h3>
                    <button onClick={() => setIsImportTxtModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                       <X className="w-5 h-5" />
                    </button>
                 </div>
                 <form onSubmit={handleImportTXT} className="p-6 flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Zona UTM</label>
                        <select 
                          value={importTxtUtmZone} onChange={e => setImportTxtUtmZone(e.target.value)}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                        >
                           <option value="21S">Zona 21 Sul (21S)</option>
                           <option value="22S">Zona 22 Sul (22S)</option>
                           <option value="23S">Zona 23 Sul (23S)</option>
                           <option value="24S">Zona 24 Sul (24S)</option>
                        </select>
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Identificação da Quadra</label>
                       <input 
                         type="text" required
                         value={importTxtQuadra} onChange={e => setImportTxtQuadra(e.target.value)}
                         placeholder="Ex: A, B, C..."
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)] uppercase"
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Arquivo TXT</label>
                       <input 
                         type="file" accept=".txt" required
                         onChange={e => setImportTxtFile(e.target.files?.[0] || null)}
                         className="w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20 file:transition-colors file:cursor-pointer cursor-pointer border border-[var(--color-border)] bg-[var(--color-background)] rounded-lg p-2"
                       />
                    </div>

                    <button 
                       type="submit" disabled={importingTxt}
                       className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                    >
                       {importingTxt ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Upload className="w-5 h-5"/> Processar TXT e Salvar</>}
                    </button>

                    <div className="pt-2 border-t border-[var(--color-border)]">
                      <p className="text-[10px] text-[var(--color-text-muted)] mb-2">
                        Polígono visual mais limpo (medidas oficiais continuam pelo TXT):
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsImportTxtModalOpen(false);
                          setIsImportShpModalOpen(true);
                        }}
                        className="w-full py-2.5 rounded-lg border border-[var(--color-border)] text-gray-300 text-sm font-semibold hover:bg-[var(--color-background)] transition-colors flex items-center justify-center gap-2"
                      >
                        <Layers className="w-4 h-4" />
                        Importar Shapefile (.zip)
                      </button>
                    </div>
                 </form>
              </div>
           </div>
        )}

        {isImportShpModalOpen && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up">
                 <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h3 className="font-bold text-white text-lg">Importar Shapefile (.zip)</h3>
                    <button onClick={() => setIsImportShpModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                       <X className="w-5 h-5" />
                    </button>
                 </div>
                 <form onSubmit={handleImportShapefile} className="p-6 flex flex-col gap-4">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Envie um .zip com .shp, .shx, .dbf e .prj. O sistema associa cada polígono ao lote pela{' '}
                      <strong className="text-gray-200">quadra + lote</strong> (atributos DBF).
                      Se já houver TXT Civil 3D, apenas a geometria visual é substituída; medidas oficiais e{' '}
                      <code className="text-[10px]">segments_json</code> permanecem.
                    </p>
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Quadra padrão (opcional)</label>
                       <input
                         type="text"
                         value={importShpDefaultQuadra}
                         onChange={(e) => setImportShpDefaultQuadra(e.target.value)}
                         placeholder="Use se o DBF não tiver coluna quadra"
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)] uppercase"
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Arquivo .zip</label>
                       <input
                         type="file"
                         accept=".zip,application/zip"
                         required
                         onChange={(e) => setImportShpFile(e.target.files?.[0] || null)}
                         className="w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20 file:transition-colors file:cursor-pointer cursor-pointer border border-[var(--color-border)] bg-[var(--color-background)] rounded-lg p-2"
                       />
                       <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
                         Campos reconhecidos: lote, quadra, area, matrícula (nomes variados no DBF).
                       </p>
                    </div>

                    <button
                       type="submit"
                       disabled={importingShp}
                       className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                    >
                       {importingShp ? <Loader2 className="w-5 h-5 animate-spin"/> : <><Layers className="w-5 h-5"/> Importar Shapefile</>}
                    </button>
                 </form>
              </div>
           </div>
        )}
      </div>
      {projectFormPortal}
      </>
    );
  }

  // Lista de Projetos (quando map não está selecionado)
  return (
    <>
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full fade-in-up relative z-0">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mapa GIS & Projetos</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider flexitems-center gap-2">
            Gestão Unificada de Loteamentos
            {user?.role !== 'SUPER_ADMIN' && projectLimit !== null && (
               <span className="ml-3 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                 PROJETOS: {projects.length} / {projectLimit}
               </span>
            )}
          </p>
          {user?.role !== 'SUPER_ADMIN' && planAvailabilityMsg && (
            <p className="text-xs text-blue-400/90 mt-1">{planAvailabilityMsg}</p>
          )}
        </div>
        {user?.role !== 'BROKER' && (
          <button 
            onClick={openCreateProject}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Novo Projeto
          </button>
        )}
      </header>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm">
        {/* Toolbar */}
        <div className="p-4 border-b border-[var(--color-border)] flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Buscar loteamentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
             <div className="w-full h-full flex items-center justify-center">
                 <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
             </div>
          ) : filteredProjects.length > 0 ? (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-0">
               {filteredProjects.map((p) => {
                 const blocks = p.blocks || [];
                 const total = blocks.length;
                 const sold = blocks.filter((l: any) => l.status === 'Vendido').length;
                 const hasGis = blocks.some((l: any) => l.geometry != null);
                 const pct = total > 0 ? (sold / total) * 100 : 0;

                 return (
                   <div
                     key={p.id}
                     className="relative bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-primary)]/50 transition-colors flex flex-col"
                   >
                     <div className="flex justify-between items-start mb-4 gap-2">
                       <div className="flex items-center gap-3 min-w-0 flex-1">
                         <div className="w-12 h-12 shrink-0 rounded-lg bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-border)]">
                           <FolderOpen className="w-6 h-6" />
                         </div>
                         <div className="min-w-0">
                           <h3 className="font-bold text-white text-lg leading-tight truncate">{p.name}</h3>
                           <p className="text-xs font-mono text-[var(--color-text-muted)] uppercase mt-1 truncate">
                             {p.location || 'Sem localização'}
                           </p>
                         </div>
                       </div>
                       {user?.role !== 'BROKER' && (
                         <div className="relative z-[100] flex shrink-0 items-center gap-1">
                           <button
                             type="button"
                             title="Editar"
                             onClick={(e) => {
                               e.preventDefault();
                               e.stopPropagation();
                               openEditProject(p);
                             }}
                             className="relative z-[100] flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-white/10 hover:text-white cursor-pointer"
                           >
                             <Pencil className="w-4 h-4 shrink-0" />
                           </button>
                           <button
                             type="button"
                             title="Excluir"
                             onClick={(e) => {
                               e.preventDefault();
                               e.stopPropagation();
                               handleDeleteProject(p.id);
                             }}
                             className="relative z-[100] flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-[var(--color-danger)] cursor-pointer"
                           >
                             <Trash2 className="w-4 h-4 shrink-0" />
                           </button>
                         </div>
                       )}
                     </div>

                     <div className="mt-auto">
                       <div className="flex items-center justify-between mb-2">
                         <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                           Progresso de Vendas
                         </span>
                         <span className="text-xs font-mono text-white">
                           {sold} / {total}
                         </span>
                       </div>
                       <div className="w-full h-2 bg-[var(--color-surface)] rounded-full overflow-hidden mb-4 border border-[var(--color-border)]">
                         <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
                       </div>
                       <div className="flex items-center justify-between gap-2">
                         {hasGis ? (
                           <span className="inline-flex items-center px-2 py-1 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] text-[10px] font-mono font-bold uppercase tracking-wider border border-[var(--color-success)]/20">
                             Sincronizado
                           </span>
                         ) : (
                           <span className="inline-flex items-center px-2 py-1 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[10px] font-mono font-bold uppercase tracking-wider border border-[var(--color-warning)]/20">
                             Falta KML
                           </span>
                         )}
                         <button
                           type="button"
                           onClick={(e) => {
                             e.stopPropagation();
                             handleOpenProject(p);
                           }}
                           className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                         >
                           <MapIcon className="w-4 h-4" /> Abrir Mapa
                         </button>
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
          ) : !isBrowserOnline() ? (
             <div className="w-full h-full flex flex-col items-center justify-center text-center px-6 text-[var(--color-text-muted)] text-sm max-w-lg mx-auto">
                 Nenhum projeto disponível offline. Abra este projeto online pelo menos uma vez para armazená-lo neste dispositivo.
             </div>
          ) : (
             <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                 Nenhum projeto encontrado.
             </div>
          )}
        </div>
      </div>

      {projectFormPortal}
    </div>
    </>
  );
}
