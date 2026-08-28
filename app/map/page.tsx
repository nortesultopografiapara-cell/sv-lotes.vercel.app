'use client';

import { useState, useEffect, useCallback, useRef, useMemo, startTransition } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  gisPerfStreetSaveBegin,
  gisPerfStreetSaveEnd,
  gisPerfStreetSaveMark,
  gisPerfIdentifyFrontsBegin,
  gisPerfIdentifyFrontsEnd,
  gisPerfIdentifyFrontsMark,
  gisPerfConfrontationBegin,
  gisPerfConfrontationEnd,
  gisPerfConfrontationMark,
  isGisPerfDiagnosticsEnabled,
} from '@/lib/gis/performance';
import {
  createProjectThroughApi,
  updateProjectThroughApi,
} from '@/lib/projects-api-client';
import { formatFinancialAccountLabel } from '@/lib/finance/companyFinancialAccountTypes';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, FolderOpen, MoreVertical, Pencil, Trash2, Loader2, ArrowLeft, Upload, Map as MapIcon, Ruler, LandPlot, X, ChevronDown, ChevronUp, Scan, Eye, EyeOff, Layers, GitBranch, ScrollText, MapPinned, FileUp, LocateFixed, FileText, Route, ClipboardList } from 'lucide-react';
import { runAutomaticConfrontation } from '@/lib/automaticConfrontation';
import { logLotAuditEvent, lotAuditContextFromBlock } from '@/lib/lotAudit';
import { LotSheetPrintModal } from '@/components/map/LotSheetPrintModal';
import { MemorialGenerateModal } from '@/components/map/MemorialGenerateModal';
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
import { formatProjectLimitMessage } from '@/lib/saasPlanEnforcementMessages';
import {
  canImportLots,
  getTenantUsage,
} from '@/lib/saasPlanEnforcement';
import {
  EMPTY_PROJECT_FORM,
  type ProjectFormInitialData,
  projectToFormInitialData,
} from '@/lib/project-form';
import {
  SALE_CONTRACT_MODEL_LABELS,
  SALE_CONTRACT_MODEL_OPTIONS,
  normalizeSaleContractModel,
  type SaleContractModel,
} from '@/lib/contractModel';
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
import {
  fetchAllBlocksForProject,
  fetchProjectLotStatsMap,
  insertBlocksInBatches,
  type ProjectLotStats,
} from '@/lib/blocksFetchAll';
import { ProjectQuadrasPanel } from '@/components/map/ProjectQuadrasPanel';
import { UpdateIndividualLotModal } from '@/components/map/UpdateIndividualLotModal';
import { DeleteIndividualLotModal } from '@/components/map/DeleteIndividualLotModal';
import { formatIndividualLotDeleteLabel } from '@/lib/gis/deleteIndividualLot';
import {
  EnterpriseOverviewModal,
  DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS,
} from '@/components/map/EnterpriseOverviewModal';
import { StreetGuidesReportModal } from '@/components/map/StreetGuidesReportModal';
import {
  downloadEnterpriseOverviewPdf,
  generateEnterpriseOverviewFromInput,
} from '@/lib/enterpriseOverviewPdf';
import type { EnterpriseOverviewOptions } from '@/lib/enterpriseOverviewLayout';
import {
  buildStreetGuidesReportData,
  downloadStreetGuidesReportExcel,
  downloadStreetGuidesReportPdf,
} from '@/lib/streetGuidesReport';
import {
  clearGisMapProjectPersistence,
  GIS_MAP_PROJECT_ID_KEY,
  gisMapUrlWithProject,
  persistGisMapProject,
  readGisMapProjectIdFromUrl,
} from '@/lib/gisMapProjectPersistence';
import {
  findBlockInQuadra,
  parseTxtLotsForIndividualUpdate,
  txtLotMatchesRequested,
  upsertIndividualLotFromTxt,
  type IndividualLotUpdateMode,
} from '@/lib/civil3dIndividualLotUpdate';
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
  closedRingLngLat,
  identifyLotFrontFromStreetGuides,
  TOUCH_STREET_MAX_M,
  type StreetGuideLineInput,
} from '@/lib/lotStreetFrontDetection';
import { flattenLineStringCoordinates } from '@/lib/streetGuideConfrontation';
import { persistBlockPatch } from '@/lib/blockFrontPersist';
import { normalizeFrontSegmentIndexForPersist } from '@/lib/resolveFrontStreetGuide';
import {
  blockHasTxtOfficialData,
  buildBlockMatchKey,
  parseShapefileZipFile,
} from '@/lib/shapefileImport';
import {
  DEFAULT_GIS_BASE_LAYER,
  GIS_BASE_LAYER_LABELS,
  GIS_BASE_LAYER_ORDER,
  type GisBaseLayerId,
} from '@/lib/gisBaseLayers';
import { EnterpriseValueOverlay } from '@/components/enterprise/EnterpriseValueOverlay';
import { canViewEnterpriseValues, canManageGisProject, isOwnerRole } from '@/lib/rolePermissions';
import {
  filterProjectsForUser,
  getOwnerAllowedProjectIdsForModule,
  loadOwnerAccessContext,
} from '@/lib/ownerProjectAccess';
import {
  buildTxtImportAuditDescription,
  lotNumberKey,
  parsePricePerM2Input,
  resolveImportedLotPrice,
} from '@/lib/txtImportLotPricing';
import {
  computeGisMapPageOverlayOpen,
  GIS_TOOLBAR_HIDE_CLASS,
  GIS_TOOLBAR_SHOW_CLASS,
} from '@/lib/gisToolbarOverlay';
import '@/components/enterprise/enterprise-value.css';
import './gis-map-mobile.css';

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

/** Painel só no client — evita hydration mismatch com ?gisPerf=1. */
const GisPerfDiagPanel = dynamic(
  () =>
    import('@/components/map/GisPerfDiagPanel').then((m) => m.GisPerfDiagPanel),
  { ssr: false },
);

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

export default function MapPage() {
  const router = useRouter();
  const restoredGisProjectRef = useRef(false);
  const { user, loading: authLoading } = useAuth();
  const ownerReadOnly = isOwnerRole(user?.role);
  const {
    saas,
    company: saasCompany,
    tenantId: saasTenantId,
    availabilityMessage: planAvailabilityMsg,
    loading: saasLoading,
    reload: reloadSaas,
  } = useCompanySaas();
  const projectLimit = saas?.maxProjects ?? null;
  const lotLimit = saas?.maxLots ?? null;
  const companyPlan = saas?.displayName ?? '';
  const [tenantLotCount, setTenantLotCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const { setGisSelectedProject, clearGisSelectedProject } = useGisSelectedProject();

  const ensureLotImportAllowed = useCallback(
    async (
      tenantId: string | null,
      quantityToAdd: number,
      isSuperAdmin: boolean,
    ): Promise<boolean> => {
      if (!tenantId || isSuperAdmin || quantityToAdd <= 0) return true;
      const check = await canImportLots(supabase, tenantId, quantityToAdd, {
        isPlatformAdmin: false,
      });
      if (!check.allowed) {
        alert(check.message || 'Limite de lotes atingido.');
        return false;
      }
      return true;
    },
    [],
  );

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

  /** Diagnóstico client-side: só em development ou ?gisPerf=1 (não-prod). */
  useEffect(() => {
    const diagnosticsOn =
      process.env.NODE_ENV === 'development' || isGisPerfDiagnosticsEnabled();
    if (!diagnosticsOn || typeof window === 'undefined') return;

    const seen = new Set<string>();
    const remember = (key: string): boolean => {
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > 40) {
        const first = seen.values().next().value;
        if (first != null) seen.delete(first);
      }
      return true;
    };

    const sanitizeId = (id: unknown): string | null => {
      const s = String(id ?? '').trim();
      if (!s) return null;
      return s.length > 12 ? `${s.slice(0, 8)}…` : s;
    };

    const onError = (event: ErrorEvent) => {
      const key = `e:${event.message}:${event.filename}:${event.lineno}`;
      if (!remember(key)) return;
      console.error('[MAP_WINDOW_ONERROR]', {
        action: 'window.onerror',
        component: 'MapPage',
        message: String(event.message ?? '').slice(0, 200),
        projectId: sanitizeId(selectedProject?.id),
        stack:
          event.error instanceof Error
            ? String(event.error.stack ?? '').slice(0, 800)
            : null,
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'string'
            ? reason
            : 'unhandledrejection';
      const key = `r:${message}`;
      if (!remember(key)) return;
      console.error('[MAP_UNHANDLED_REJECTION]', {
        action: 'unhandledrejection',
        component: 'MapPage',
        message: String(message).slice(0, 200),
        projectId: sanitizeId(selectedProject?.id),
        stack:
          reason instanceof Error
            ? String(reason.stack ?? '').slice(0, 800)
            : null,
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [selectedProject?.id]);

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
  const [importTxtPricePerM2, setImportTxtPricePerM2] = useState('');
  const [importTxtOverwritePrices, setImportTxtOverwritePrices] = useState(false);
  const [importTxtIsReimport, setImportTxtIsReimport] = useState(false);

  const [isUpdateLotModalOpen, setIsUpdateLotModalOpen] = useState(false);
  const [updateLotQuadra, setUpdateLotQuadra] = useState('');
  const [updateLotNumber, setUpdateLotNumber] = useState('');
  const [updateLotFile, setUpdateLotFile] = useState<File | null>(null);
  const [updateLotUtmZone, setUpdateLotUtmZone] = useState('22S');
  const [updateLotMode, setUpdateLotMode] =
    useState<IndividualLotUpdateMode>('geometry_technical');
  const [updatingIndividualLot, setUpdatingIndividualLot] = useState(false);

  const [isDeleteLotModalOpen, setIsDeleteLotModalOpen] = useState(false);
  const [deleteLotQuadra, setDeleteLotQuadra] = useState('');
  const [deleteLotNumber, setDeleteLotNumber] = useState('');
  const [deleteLotConfirmStep, setDeleteLotConfirmStep] = useState(false);
  const [deletingIndividualLot, setDeletingIndividualLot] = useState(false);

  const [isEnterpriseOverviewModalOpen, setIsEnterpriseOverviewModalOpen] =
    useState(false);
  const [enterpriseOverviewOptions, setEnterpriseOverviewOptions] =
    useState<EnterpriseOverviewOptions>(DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS);
  const [enterpriseOverviewGenerating, setEnterpriseOverviewGenerating] =
    useState(false);
  const [isStreetGuidesReportModalOpen, setIsStreetGuidesReportModalOpen] =
    useState(false);
  const [streetGuidesReportPdfLoading, setStreetGuidesReportPdfLoading] =
    useState(false);
  const [streetGuidesReportExcelLoading, setStreetGuidesReportExcelLoading] =
    useState(false);

  const [isImportShpModalOpen, setIsImportShpModalOpen] = useState(false);
  const [importShpFile, setImportShpFile] = useState<File | null>(null);
  const [importShpDefaultQuadra, setImportShpDefaultQuadra] = useState('');
  const [importingShp, setImportingShp] = useState(false);

  // Map Tools States
  const [activeLayer, setActiveLayer] = useState<GisBaseLayerId>(
    DEFAULT_GIS_BASE_LAYER,
  );
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);

  /**
   * Preview/localhost: API key do Google costuma bloquear referrer *.vercel.app
   * → fundo escuro sem tiles. Preferir Esri no primeiro paint; Google continua
   * selecionável no menu e com fallback automático se falhar.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname.toLowerCase();
    const isPreviewHost =
      host.includes('vercel.app') ||
      host === 'localhost' ||
      host === '127.0.0.1';
    if (!isPreviewHost) return;
    setActiveLayer((prev) =>
      prev === 'google_satellite' || prev === 'google_hybrid'
        ? 'esri_satellite'
        : prev,
    );
  }, []);

  const [gpsActive, setGpsActive] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [areaMeasureActive, setAreaMeasureActive] = useState(false);
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
  const [newProjectFinancialAccountId, setNewProjectFinancialAccountId] = useState('');
  const [newProjectContractModel, setNewProjectContractModel] = useState('');
  const [mundoNovoSellerContacts, setMundoNovoSellerContacts] = useState<
    Array<{ order: number; name: string; email: string; phone: string }>
  >([]);
  const [companyDefaultContractModel, setCompanyDefaultContractModel] =
    useState<SaleContractModel>('PADRAO');
  const [projectFinancialAccounts, setProjectFinancialAccounts] = useState<
    Array<{
      id: string;
      name: string;
      accountType: string;
      beneficiaryName: string | null;
      isDefault: boolean;
      provider?: string | null;
    }>
  >([]);
  const [projectFormSubmitting, setProjectFormSubmitting] = useState(false);
  const [projectFeedback, setProjectFeedback] = useState<ProjectFeedback | null>(null);

  useEffect(() => {
    if (!isProjectFormOpen || !saasTenantId) return;
    let cancelled = false;
    void fetch('/api/finance/financial-accounts', { credentials: 'include' })
      .then((res) => res.json().catch(() => ({})))
      .then((json) => {
        if (cancelled) return;
        setProjectFinancialAccounts((json.accounts as typeof projectFinancialAccounts) || []);
      })
      .catch(() => {
        if (!cancelled) setProjectFinancialAccounts([]);
      });
    void supabase
      .from('companies')
      .select('contract_model')
      .eq('id', saasTenantId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setCompanyDefaultContractModel(
          normalizeSaleContractModel(data?.contract_model),
        );
      })
      .catch(() => {
        if (!cancelled) setCompanyDefaultContractModel('PADRAO');
      });
    return () => {
      cancelled = true;
    };
  }, [isProjectFormOpen, saasTenantId]);

  const [mapRefreshKey, setMapRefreshKey] = useState(0);
  /** Patch in-place no GISMap após Identificar Frentes (sem refreshKey/fitBounds). */
  const [frontPatchBatch, setFrontPatchBatch] = useState<{
    rev: number;
    patches: Array<{
      id: string;
      frente?: number | null;
      Fundo?: number | string | null;
      'Lado Dir.'?: number | string | null;
      'Lado Esq.'?: number | string | null;
      front_segment_index?: number | null;
      frontStreetName?: string | null;
      frontStreetType?: string | null;
      frontStreetWidth?: number | null;
      frontStreetId?: string | null;
      frontStreetDisplay?: string | null;
    }>;
  } | null>(null);
  /** Fase A — mutações pontuais no mapa sem loadLots/fitBounds. */
  const [lotsMutation, setLotsMutation] = useState<{
    rev: number;
    kind: 'remove' | 'removeBlock' | 'upsert';
    ids?: string[];
    blockName?: string;
    blocks?: Record<string, unknown>[];
  } | null>(null);

  useEffect(() => {
    if (!saasTenantId || user?.role === 'SUPER_ADMIN') {
      setTenantLotCount(null);
      return;
    }
    let cancelled = false;
    getTenantUsage(supabase, saasTenantId)
      .then((usage) => {
        if (!cancelled) setTenantLotCount(usage.lots);
      })
      .catch(() => {
        if (!cancelled) setTenantLotCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [saasTenantId, user?.role, mapRefreshKey]);

  const [enterpriseRefreshKey, setEnterpriseRefreshKey] = useState(0);
  const [quadrasPanelOpen, setQuadrasPanelOpen] = useState(false);
  const [projectQuadras, setProjectQuadras] = useState<string[]>([]);
  const [projectLotStats, setProjectLotStats] = useState<
    Record<string, ProjectLotStats>
  >({});
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
  const [assistedConfrontationMode, setAssistedConfrontationMode] =
    useState(false);
  const [memorialPickMode, setMemorialPickMode] = useState(false);
  const [memorialTarget, setMemorialTarget] = useState<{
    id: string;
    number?: string;
    block?: string;
  } | null>(null);

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

  const [gisMapOverlayOpen, setGisMapOverlayOpen] = useState(false);

  const isAnyModalOpen = useMemo(
    () =>
      computeGisMapPageOverlayOpen({
        streetGuideModal: Boolean(streetGuideModal),
        memorialTarget: Boolean(memorialTarget),
        lotSheetTarget: Boolean(lotSheetTarget),
        isImportModalOpen,
        isImportTxtModalOpen,
        isImportShpModalOpen,
        isUpdateLotModalOpen,
        isDeleteLotModalOpen,
        isEnterpriseOverviewModalOpen,
        isStreetGuidesReportModalOpen,
        deleteQuadraConfirm: Boolean(deleteQuadraConfirm),
        gisMapOverlayOpen,
      }),
    [
      streetGuideModal,
      memorialTarget,
      lotSheetTarget,
      isImportModalOpen,
      isImportTxtModalOpen,
      isImportShpModalOpen,
      isUpdateLotModalOpen,
      isDeleteLotModalOpen,
      isEnterpriseOverviewModalOpen,
      isStreetGuidesReportModalOpen,
      deleteQuadraConfirm,
      gisMapOverlayOpen,
    ],
  );

  useEffect(() => {
    if (!isAnyModalOpen) return;
    setLayerMenuOpen(false);
    setQuadrasPanelOpen(false);
  }, [isAnyModalOpen]);

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
    gisPerfConfrontationBegin({
      operation: 'automatic',
      projectId: String(selectedProject.id).slice(0, 8),
    });
    try {
      const tenantId = String(
        saasTenantId || user?.tenant_id || selectedProject.tenant_id || '',
      ).trim();
      gisPerfConfrontationMark('compute_start');
      const result = await runAutomaticConfrontation(selectedProject.id, {
        tenantId: tenantId || undefined,
        userId: user?.id ?? null,
        project: selectedProject as Record<string, unknown>,
        streetGuides,
      });
      gisPerfConfrontationMark('compute_end');
      const totalLots = result.processed + result.skipped;
      const src = result.sourceCounts || {};
      const sourceLines = [
        `  • segments_json: ${src.segments_json ?? 0}`,
        `  • coordinates_utm_json: ${src.coordinates_utm_json ?? 0}`,
        `  • geometry: ${src.geometry ?? 0}`,
      ].join('\n');
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
        `Confrontação automática concluída.\n` +
          `Total de lotes: ${totalLots}\n` +
          `Processados: ${result.processed}\n` +
          `Ignorados: ${result.skipped}\n\n` +
          `Fonte do perímetro:\n${sourceLines}` +
          skipSummary +
          errLines,
      );
      // Ativa revisão assistida sem loadLots/fitBounds (sem setMapRefreshKey).
      gisPerfConfrontationMark('patch_start');
      startTransition(() => {
        setAssistedConfrontationMode(true);
      });
      gisPerfConfrontationMark('patch_end');
      gisPerfConfrontationEnd({
        operation: 'automatic',
        processed: result.processed,
        skipped: result.skipped,
        refreshKeyBumped: false,
        loadLotsDelta: 0,
        fitBoundsDelta: 0,
        fallbackFullReload: false,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro na confrontação automática';
      gisPerfConfrontationEnd({
        operation: 'automatic',
        error: true,
        fallbackFullReload: false,
      });
      alert(msg);
      console.error('[Confrontação automática]', err);
    } finally {
      setConfrontationRunning(false);
    }
  }, [
    selectedProject,
    saasTenantId,
    user?.tenant_id,
    user?.id,
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

  useEffect(() => {
    if (!isImportTxtModalOpen || !selectedProject?.id || !importTxtQuadra.trim()) {
      setImportTxtIsReimport(false);
      return;
    }
    let cancelled = false;
    const quadra = importTxtQuadra.toUpperCase().trim();
    (async () => {
      const { count, error } = await supabase
        .from('blocks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', selectedProject.id)
        .eq('block_name', quadra);
      if (cancelled) return;
      if (error) {
        setImportTxtIsReimport(false);
        return;
      }
      setImportTxtIsReimport((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [isImportTxtModalOpen, importTxtQuadra, selectedProject?.id]);

  const handleViewQuadraOnMap = (blockName: string) => {
    setFocusBlockName(normalizeQuadraBlockName(blockName));
    setFocusBlockKey((k) => k + 1);
  };

  const handleReimportQuadraTxt = (blockName: string) => {
    setImportTxtQuadra(normalizeQuadraBlockName(blockName));
    setImportTxtFile(null);
    setImportTxtPricePerM2('');
    setImportTxtOverwritePrices(false);
    setImportTxtIsReimport(true);
    setIsImportTxtModalOpen(true);
  };

  const handleUpdateIndividualLotQuadra = (blockName: string) => {
    setUpdateLotQuadra(normalizeQuadraBlockName(blockName));
    setUpdateLotNumber('');
    setUpdateLotFile(null);
    setUpdateLotMode('geometry_technical');
    setUpdateLotUtmZone(importTxtUtmZone || '22S');
    setIsUpdateLotModalOpen(true);
  };

  const handleDeleteIndividualLotQuadra = (blockName: string) => {
    setDeleteLotQuadra(normalizeQuadraBlockName(blockName));
    setDeleteLotNumber('');
    setDeleteLotConfirmStep(false);
    setIsDeleteLotModalOpen(true);
  };

  const closeDeleteLotModal = () => {
    if (deletingIndividualLot) return;
    setIsDeleteLotModalOpen(false);
    setDeleteLotConfirmStep(false);
    setDeleteLotNumber('');
  };

  const handleRequestDeleteLotConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteLotQuadra.trim() || !deleteLotNumber.trim()) {
      alert('Informe a quadra e o número do lote.');
      return;
    }
    setDeleteLotConfirmStep(true);
  };

  const handleConfirmDeleteIndividualLot = async () => {
    if (!selectedProject?.id || !user) return;
    const quadraName = normalizeQuadraBlockName(deleteLotQuadra);
    const lotRequested = deleteLotNumber.trim();
    if (!quadraName || !lotRequested) {
      alert('Informe a quadra e o número do lote.');
      return;
    }

    setDeletingIndividualLot(true);
    try {
      let blocksQuery = supabase
        .from('blocks')
        .select('id, block_name, number, status')
        .eq('project_id', selectedProject.id)
        .eq('block_name', quadraName);
      if (user.role !== 'SUPER_ADMIN' && user.tenant_id) {
        blocksQuery = blocksQuery.or(
          `tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`,
        );
      }
      const { data: quadraBlocks, error: loadErr } = await blocksQuery;
      if (loadErr) throw loadErr;

      const existing = findBlockInQuadra(
        (quadraBlocks || []) as Record<string, unknown>[],
        quadraName,
        lotRequested,
      );
      if (!existing?.id) {
        alert(
          `Lote ${formatIndividualLotDeleteLabel(quadraName, lotRequested)} não encontrado.`,
        );
        setDeleteLotConfirmStep(false);
        return;
      }

      const res = await fetch(
        `/api/projects/${selectedProject.id}/lots/${String(existing.id)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json?.error || `Erro ao excluir lote (${res.status})`);
      }

      setIsDeleteLotModalOpen(false);
      setDeleteLotConfirmStep(false);
      setDeleteLotNumber('');
      await loadProjectQuadras();
      setLotsMutation((prev) => ({
        rev: (prev?.rev ?? 0) + 1,
        kind: 'remove',
        ids: [String(existing.id)],
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir lote.';
      alert(msg);
    } finally {
      setDeletingIndividualLot(false);
    }
  };

  const handleGenerateEnterpriseOverview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !user) return;
    setEnterpriseOverviewGenerating(true);
    try {
      const tenantForBlocks =
        !isPlatformAdmin(user.role) && user.tenant_id ? user.tenant_id : null;
      const blocksFetch = await fetchAllBlocksForProject(
        supabase,
        selectedProject.id,
        {
          select: '*',
          applyTenant: Boolean(tenantForBlocks),
          tenantId: tenantForBlocks,
        },
      );
      const blocks = blocksFetch.rows as Record<string, unknown>[];
      if (!blocks?.length) {
        alert('Nenhum lote encontrado neste empreendimento.');
        return;
      }

      const doc = await generateEnterpriseOverviewFromInput({
        project: selectedProject,
        blocks: blocks as Record<string, unknown>[],
        streetGuides: streetGuides as Record<string, unknown>[],
        company: (saasCompany ?? null) as Record<string, unknown> | null,
        options: enterpriseOverviewOptions,
      });

      const safeName = String(selectedProject.name || 'empreendimento')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '_');
      downloadEnterpriseOverviewPdf(doc, `mapa_geral_${safeName}.pdf`);
      setIsEnterpriseOverviewModalOpen(false);
      console.log('ENTERPRISE_OVERVIEW_PDF_GENERATED', {
        projectId: selectedProject.id,
        lots: blocks.length,
        format: enterpriseOverviewOptions.format,
      });
    } catch (err: unknown) {
      console.error('ENTERPRISE_OVERVIEW_PDF_ERROR', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao gerar prancha geral do empreendimento.',
      );
    } finally {
      setEnterpriseOverviewGenerating(false);
    }
  };

  const streetGuidesReportSummary = useMemo(() => {
    if (!selectedProject) {
      return { streetCount: 0, totalLengthM: 0 };
    }
    const data = buildStreetGuidesReportData({
      guides: streetGuides as Record<string, unknown>[],
      project: selectedProject as Record<string, unknown>,
    });
    return {
      streetCount: data.streetCount,
      totalLengthM: data.totalLengthM,
    };
  }, [selectedProject, streetGuides]);

  const buildStreetReportExportPayload = useCallback(() => {
    if (!selectedProject || !user) return null;
    const data = buildStreetGuidesReportData({
      guides: streetGuides as Record<string, unknown>[],
      project: selectedProject as Record<string, unknown>,
    });
    const companyName =
      String(
        (saasCompany as { fantasy_name?: string; name?: string } | null)
          ?.fantasy_name ||
          (saasCompany as { name?: string } | null)?.name ||
          '',
      ).trim() || '—';
    const userName =
      String(
        (user as { name?: string; full_name?: string; email?: string }).name ||
          (user as { full_name?: string }).full_name ||
          user.email ||
          '',
      ).trim() || '—';
    return {
      data,
      meta: {
        projectName: String(selectedProject.name || ''),
        companyName,
        companyLogoUrl:
          (saasCompany as { logo_url?: string | null } | null)?.logo_url ?? null,
        userName,
        emittedAt: new Date().toLocaleDateString('pt-BR'),
        emittedAtIso: new Date().toISOString(),
      },
    };
  }, [selectedProject, streetGuides, saasCompany, user]);

  const handleExportStreetGuidesPdf = async () => {
    const payload = buildStreetReportExportPayload();
    if (!payload) return;
    setStreetGuidesReportPdfLoading(true);
    try {
      await downloadStreetGuidesReportPdf(payload);
    } catch (err: unknown) {
      console.error('STREET_GUIDES_REPORT_PDF_ERROR', err);
      alert(
        err instanceof Error ? err.message : 'Erro ao exportar PDF de vias.',
      );
    } finally {
      setStreetGuidesReportPdfLoading(false);
    }
  };

  const handleExportStreetGuidesExcel = async () => {
    const payload = buildStreetReportExportPayload();
    if (!payload) return;
    setStreetGuidesReportExcelLoading(true);
    try {
      await downloadStreetGuidesReportExcel(payload);
    } catch (err: unknown) {
      console.error('STREET_GUIDES_REPORT_EXCEL_ERROR', err);
      alert(
        err instanceof Error ? err.message : 'Erro ao exportar Excel de vias.',
      );
    } finally {
      setStreetGuidesReportExcelLoading(false);
    }
  };

  const handleSubmitIndividualLotUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateLotFile || !selectedProject || !user) return;
    if (!updateLotQuadra.trim() || !updateLotNumber.trim()) {
      alert('Informe a quadra e o número do lote.');
      return;
    }

    if (updateLotMode === 'full_replacement') {
      const ok = window.confirm(
        'Tenho certeza que desejo substituir completamente o lote e posso perder vínculos comerciais.\n\n' +
          'Os dados de venda, contrato e financeiro no banco NÃO serão apagados automaticamente, mas frente e confrontações técnicas serão redefinidas.\n\nContinuar?',
      );
      if (!ok) return;
    }

    setUpdatingIndividualLot(true);
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
      let finalTenantId = tenantId;
      if (finalTenantId === 'MASTER-ADMIN') finalTenantId = null;
      if (!finalTenantId && !isMasterAdmin) {
        alert('Erro: Empresa não identificada. Faça login novamente.');
        return;
      }

      const text = await updateLotFile.text();
      const zoneNum = parseInt(updateLotUtmZone.replace(/\D/g, ''));
      const proj4String = `+proj=utm +zone=${zoneNum} +south +datum=WGS84 +units=m +no_defs`;
      const quadraName = updateLotQuadra.toUpperCase().trim();
      const lotRequested = updateLotNumber.trim();

      const parsed = parseTxtLotsForIndividualUpdate(text, proj4String);
      if (parsed.empty) {
        alert('Nenhum lote válido encontrado no TXT.');
        return;
      }
      if (parsed.multipleLots) {
        alert(
          'Este arquivo contém mais de um lote. Para atualizar lote individual, envie um TXT contendo apenas um lote.',
        );
        return;
      }

      const payload = parsed.lots[0]!;
      const txtLotName = String(payload.name).trim();
      if (!txtLotMatchesRequested(txtLotName, lotRequested)) {
        const proceed = window.confirm(
          `O lote informado é ${lotRequested}, mas o TXT parece conter o lote ${txtLotName}. Deseja continuar?`,
        );
        if (!proceed) return;
      }

      if (!payload.geometrySaved) {
        alert(
          'Geometria inválida no TXT. Verifique fechamento do perímetro e zona UTM.',
        );
        return;
      }

      let blocksQuery = supabase
        .from('blocks')
        .select('*')
        .eq('project_id', selectedProject.id)
        .eq('block_name', quadraName);
      if (user?.role !== 'SUPER_ADMIN' && user?.tenant_id) {
        blocksQuery = blocksQuery.or(
          `tenant_id.eq.${user.tenant_id},company_id.eq.${user.tenant_id}`,
        );
      }
      const { data: quadraBlocks, error: loadErr } = await blocksQuery;
      if (loadErr) throw loadErr;

      const allInQuadra = (quadraBlocks || []) as Record<string, unknown>[];
      let existing = findBlockInQuadra(allInQuadra, quadraName, lotRequested);

      let allowCreate = false;
      if (!existing) {
        const createOk = window.confirm(
          `Lote ${lotRequested} não encontrado na ${formatQuadraLabel(quadraName)}. Deseja criar novo lote nesta quadra?`,
        );
        if (!createOk) return;
        const allowedCreate = await ensureLotImportAllowed(finalTenantId, 1, isMasterAdmin);
        if (!allowedCreate) return;
        allowCreate = true;
      }

      try {
        await clearProjectMapOfflineCache(selectedProject.id);
      } catch (cacheErr) {
        console.warn('[CACHE] falha ao limpar IndexedDB do mapa', cacheErr);
      }

      const result = await upsertIndividualLotFromTxt(supabase, {
        projectId: selectedProject.id,
        quadra: quadraName,
        lotNumber: lotRequested,
        tenantId: finalTenantId,
        companyId: finalTenantId,
        payload,
        existingBlock: existing,
        mode: updateLotMode,
        allowCreate,
      });

      console.log('INDIVIDUAL_LOT_UPDATE', {
        ...result,
        mode: updateLotMode,
        txtLot: txtLotName,
      });

      alert(
        result.action === 'updated'
          ? `Lote ${result.lotNumber} da ${formatQuadraLabel(result.quadra)} atualizado com sucesso. Dados comerciais preservados.`
          : `Lote ${result.lotNumber} criado na ${formatQuadraLabel(result.quadra)}.`,
      );

      setIsUpdateLotModalOpen(false);
      setUpdateLotFile(null);
      setUpdateLotNumber('');
      const { data: patchedBlock } = await supabase
        .from('blocks')
        .select('*, projects(name), customers(name)')
        .eq('id', result.blockId)
        .maybeSingle();
      if (patchedBlock) {
        setLotsMutation((prev) => ({
          rev: (prev?.rev ?? 0) + 1,
          kind: 'upsert',
          blocks: [patchedBlock as Record<string, unknown>],
        }));
      } else {
        // Fallback excepcional — payload incompleto
        setMapRefreshKey((k) => k + 1);
      }
      await loadProjectQuadras();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('INDIVIDUAL_LOT_UPDATE_ERROR', err);
      alert(`Erro ao atualizar lote: ${msg}`);
    } finally {
      setUpdatingIndividualLot(false);
    }
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
      setLotsMutation((prev) => ({
        rev: (prev?.rev ?? 0) + 1,
        kind: 'removeBlock',
        blockName: quadraName,
      }));
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

    const perfOn = isGisPerfDiagnosticsEnabled();
    if (perfOn) {
      gisPerfIdentifyFrontsBegin({
        streetGuideCount: visibleGuides.length,
      });
    }

    try {
       console.log('IDENTIFY_FRONTS_WITH_STREET_START', {
         guides: visibleGuides.length,
       });
       try { await supabase.rpc('reload_schema_cache'); } catch(e) {}
       
       const turfHelpers = await import('@turf/helpers');
       const turfDistance = await import('@turf/distance');
       const { extractSegments, detectSides, normalizeDimensions } = await import('@/utils/calculateLotDimensions');

       if (perfOn) gisPerfIdentifyFrontsMark('calc_start');

       let blocksQueryTenant =
         user?.role !== 'SUPER_ADMIN' && user?.tenant_id
           ? user.tenant_id
           : null;
       const blocksFetch = await fetchAllBlocksForProject(
         supabase,
         selectedProject.id,
         {
           select: '*',
           applyTenant: Boolean(blocksQueryTenant),
           tenantId: blocksQueryTenant,
         },
       );
       const blocks = blocksFetch.rows as any[];
       if (!blocks || blocks.length === 0) {
         if (perfOn) gisPerfIdentifyFrontsEnd({ path: 'empty' });
         return;
       }

       const streetGuideLines: StreetGuideLineInput[] = visibleGuides
         .map((g) => {
           const geo = g.geometry_geojson || g.geometry;
           const coordinates = flattenLineStringCoordinates(geo?.coordinates);
           if (!coordinates || coordinates.length < 2) return null;
           return {
             id: g.id != null ? String(g.id) : undefined,
             coordinates,
           };
         })
         .filter(Boolean) as StreetGuideLineInput[];

       // Pré-cálculo dos anéis vizinhos (1×) — evita filter O(N) por lote no parse.
       const allNeighborRings = blocks
         .filter(
           (b) =>
             b.id &&
             b.geometry?.type === 'Polygon' &&
             b.geometry?.coordinates?.[0]?.length >= 4,
         )
         .map((b) => ({
           id: String(b.id),
           ring: closedRingLngLat(b.geometry.coordinates[0]),
         }));

       const updates: Array<Record<string, unknown>> = [];
       let streetApplied = 0;
       let skippedUnchanged = 0;

       for (const block of blocks) {
          if (!block.geometry || block.geometry.type !== 'Polygon') continue;
          
          let coords = block.geometry.coordinates[0];
          if (!coords || coords.length < 4) continue;
          
          const segments = extractSegments(coords, []);
          const officialSegs = parseOfficialSegmentsFromBlock(block);

          const neighborRingsLngLat = allNeighborRings
            .filter((r) => r.id !== String(block.id))
            .map((r) => r.ring);

          const frontMatch = identifyLotFrontFromStreetGuides(
            coords,
            streetGuideLines,
            {
              segments: officialSegs,
              neighborRingsLngLat,
              block,
              lotLabel: block.number,
            },
          );

          if (!frontMatch) continue;

          const frontSegmentIndex = frontMatch.segmentIndex;
          const bestTouchM = frontMatch.minDistM;
          const bestGuide =
            frontMatch.guide?.id != null
              ? visibleGuides.find(
                  (g) => String(g.id) === String(frontMatch.guide!.id),
                ) ?? null
              : null;

          if (frontSegmentIndex != null && bestTouchM < TOUCH_STREET_MAX_M) {
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
             const persistedFrontIdx = normalizeFrontSegmentIndexForPersist(
               block,
               frontMatch.ringEdgeIndex,
             );
             const nextFrontIdx =
               persistedFrontIdx >= 0 ? persistedFrontIdx : frontSegmentIndex;
             const nextStreetName = bestGuide
               ? formatStreetDisplay(bestGuide.type, bestGuide.name)
               : null;
             const nextStreetId =
               bestGuide?.id &&
               typeof bestGuide.id === 'string' &&
               !bestGuide.id.startsWith('temp-')
                 ? bestGuide.id
                 : null;

             // Pula lotes cuja frente/rua já estão corretas.
             const prevIdx = block.front_segment_index;
             const prevStreet = block.front_street_name ?? null;
             if (
               Number(prevIdx) === Number(nextFrontIdx) &&
               String(prevStreet || '') === String(nextStreetName || '')
             ) {
               skippedUnchanged += 1;
               continue;
             }

             const row: Record<string, unknown> = {
                 id: block.id,
                 frente: finalFrente,
                 fundo: finalFundo,
                 lado_direito: finalDir,
                 lado_esquerdo: finalEsq,
                 front_segment_index: nextFrontIdx,
                 front_source: bestGuide ? 'street_guide' : 'auto',
             };
             if (bestGuide) {
               row.front_street_name = nextStreetName;
               row.front_street_type = String(bestGuide.type || 'Rua');
               row.front_street_width =
                 bestGuide.width != null && bestGuide.width !== ''
                   ? Number(bestGuide.width)
                   : null;
               if (nextStreetId) row.front_street_id = nextStreetId;
               streetApplied += 1;
             }
             updates.push(row);
          }
       }

       if (perfOn) gisPerfIdentifyFrontsMark('calc_end');

       console.log('IDENTIFY_FRONTS_STREET_APPLIED', {
         lots: updates.length,
         withStreet: streetApplied,
         skippedUnchanged,
       });

       if (updates.length > 0) {
           if (perfOn) gisPerfIdentifyFrontsMark('db_start');
           const CHUNK = 40;
           for (let i = 0; i < updates.length; i += CHUNK) {
             const chunk = updates.slice(i, i + CHUNK);
             await Promise.all(
               chunk.map(async (updateObj) => {
              if (!updateObj.id) return;
              const patch: Record<string, unknown> = {
                  frente: updateObj.frente !== null ? Number(updateObj.frente) : null,
                  'Fundo': updateObj.fundo !== null ? String(updateObj.fundo).replace(/[^0-9.]/g, '') : null,
                  'Lado Dir.': updateObj.lado_direito !== null ? String(updateObj.lado_direito).replace(/[^0-9.]/g, '') : null,
                  'Lado Esq.': updateObj.lado_esquerdo !== null ? String(updateObj.lado_esquerdo).replace(/[^0-9.]/g, '') : null,
              };
              if (updateObj.front_segment_index != null) {
                patch.front_segment_index = updateObj.front_segment_index;
              }
              if (updateObj.front_source) {
                patch.front_source = updateObj.front_source;
              }
              if (updateObj.front_street_name) {
                patch.front_street_name = updateObj.front_street_name;
                patch.front_street_type = updateObj.front_street_type ?? 'Rua';
                patch.front_street_width = updateObj.front_street_width ?? null;
                patch.front_street_id = updateObj.front_street_id ?? null;
              } else if (updateObj.front_source === 'auto') {
                patch.front_street_name = null;
                patch.front_street_type = null;
                patch.front_street_width = null;
                patch.front_street_id = null;
              }
              await persistBlockPatch(supabase, updateObj.id as string, patch);
              void logLotAuditEvent(supabase, {
                ...lotAuditContextFromBlock(
                  {
                    id: updateObj.id,
                    project_id: selectedProject.id,
                    tenant_id: user?.tenant_id,
                    company_id: user?.tenant_id,
                  },
                  { projectId: selectedProject.id },
                ),
                userId: user?.id ?? null,
                action: 'front_identified',
                title: 'Frente identificada',
                description: updateObj.front_street_name
                  ? `Frente para ${String(updateObj.front_street_name)}`
                  : 'Frente recalculada automaticamente',
                newData: {
                  frente: updateObj.frente,
                  fundo: updateObj.fundo,
                  front_segment_index: updateObj.front_segment_index,
                  front_street_name: updateObj.front_street_name ?? null,
                },
                source: 'gis_map',
              });
               }),
             );
           }
           if (perfOn) gisPerfIdentifyFrontsMark('db_end');

           // Um único setLots no mapa — sem setMapRefreshKey (evita loadLots + fitBounds).
           if (perfOn) gisPerfIdentifyFrontsMark('state_start');
           const patches = updates.map((u) => ({
             id: String(u.id),
             frente: u.frente as number | null,
             Fundo: u.fundo as number | string | null,
             'Lado Dir.': u.lado_direito as number | string | null,
             'Lado Esq.': u.lado_esquerdo as number | string | null,
             front_segment_index: u.front_segment_index as number | null,
             frontStreetName: (u.front_street_name as string | null) ?? null,
             frontStreetType: (u.front_street_type as string | null) ?? null,
             frontStreetWidth:
               u.front_street_width != null
                 ? Number(u.front_street_width)
                 : null,
             frontStreetId: (u.front_street_id as string | null) ?? null,
             frontStreetDisplay: (u.front_street_name as string | null) ?? null,
           }));
           startTransition(() => {
             setFrontPatchBatch((prev) => ({
               rev: (prev?.rev ?? 0) + 1,
               patches,
             }));
           });
           if (perfOn) gisPerfIdentifyFrontsMark('state_end');
       }

       alert(
         updates.length > 0
           ? `Frentes identificadas e recalculadas para ${updates.length} lotes!${
               skippedUnchanged > 0
                 ? ` (${skippedUnchanged} já estavam corretos)`
                 : ''
             }`
           : skippedUnchanged > 0
             ? `Nenhuma frente nova — ${skippedUnchanged} lotes já estavam corretos.`
             : 'Nenhuma frente identificada com as ruas visíveis.',
       );

       if (perfOn) {
         gisPerfIdentifyFrontsEnd({
           path: 'ok',
           updates: updates.length,
           skippedUnchanged,
           streetApplied,
           refreshKeyBumped: false,
           fitBounds: false,
         });
       }

    } catch (e: any) {
       console.error(e);
       if (perfOn) gisPerfIdentifyFrontsEnd({ path: 'error' });
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
        .select('*')
        .order('created_at', { ascending: false });

      query = applyTenantFilterToProjectsQuery(query, user, activeTenantId);

      const { data, error } = await query;

      if (error) {
        console.warn('Error fetching projects:', error);
        setProjects([]);
        setProjectLotStats({});
        return;
      }

      const projectList = data || [];
      const ownerCtx = await loadOwnerAccessContext(supabase, user, activeTenantId);
      const ownerMapProjectIds = ownerCtx.isOwner
        ? getOwnerAllowedProjectIdsForModule(ownerCtx.rows, 'map')
        : ownerCtx.allowedProjectIds;
      const filteredList = filterProjectsForUser(
        user,
        projectList,
        ownerMapProjectIds,
      );
      setProjects(filteredList);

      try {
        const stats = await fetchProjectLotStatsMap(
          supabase,
          filteredList.map((p: { id?: string }) => String(p.id || '')),
          {
            applyTenant: !rlsCtx.isSuperAdmin,
            tenantId: activeTenantId,
          },
        );
        setProjectLotStats(stats);
      } catch (statsErr) {
        console.warn('[MAP] falha ao contar lotes por projeto', statsErr);
        setProjectLotStats({});
      }

      logSaasCompanyContext(activeTenantId, saasCompany, filteredList.length);
      try {
        await cacheProjectsForOffline(filteredList);
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
      if (isOwnerRole(user?.role) && projects.length > 0) {
        restoredGisProjectRef.current = true;
        openGisProject(projects[0]);
        return;
      }
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
  }, [loading, projects, router, openGisProject, user?.role]);

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
    setNewProjectFinancialAccountId(initialData.financial_account_id);
    setNewProjectContractModel(initialData.contract_model);
    setMundoNovoSellerContacts(initialData.seller_party_contacts || []);
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
      projects.length >= projectLimit &&
      user?.role !== 'SUPER_ADMIN'
    ) {
      setProjectFeedback({
        type: 'error',
        message: formatProjectLimitMessage(projectLimit),
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
    if (!user) {
      setProjectFeedback({ type: 'error', message: 'Sessão não carregada. Faça login novamente.' });
      return;
    }
    if (!validateProjectForm()) return;

    const name = newProjectName.trim();
    const city = newProjectCity.trim();
    const state = newProjectUf.trim().toUpperCase();
    const neighborhood = newProjectNbhd.trim() || null;
    const address = newProjectAddr.trim() || null;
    const contract_city = newProjectForum.trim() || city;
    const location = [city, state].filter(Boolean).join(' - ');

    setProjectFormSubmitting(true);
    try {
      const impersonatingTenantId =
        typeof window !== 'undefined' ? localStorage.getItem('impersonating_tenant_id') : null;

      const { project: saved } = await updateProjectThroughApi(editingProject.id, {
        name,
        city,
        uf: state,
        neighborhood,
        address,
        forum_city: contract_city,
        impersonatingTenantId:
          user.role === 'SUPER_ADMIN' ? impersonatingTenantId : null,
        financial_account_id: newProjectFinancialAccountId || null,
        contract_model: newProjectContractModel || null,
        seller_party_contacts:
          normalizeSaleContractModel(
            newProjectContractModel || companyDefaultContractModel,
          ) === 'MUNDO_NOVO'
            ? mundoNovoSellerContacts
            : undefined,
      });

      const updatedFields = {
        name: String(saved.name ?? name),
        city: String(saved.city ?? city),
        uf: String(saved.uf ?? state),
        state: String(saved.state ?? state),
        neighborhood: (saved.neighborhood as string | null) ?? neighborhood,
        address: (saved.address as string | null) ?? address,
        forum_city: String(saved.forum_city ?? contract_city),
        contract_city: String(saved.contract_city ?? contract_city),
        location: String(saved.location ?? location),
        financial_account_id:
          (saved.financial_account_id as string | null) ??
          (newProjectFinancialAccountId || null),
        contract_model:
          (saved.contract_model as string | null) ??
          (newProjectContractModel || null),
        seller_parties_json:
          saved.seller_parties_json ?? editingProject.seller_parties_json,
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
      projects.length >= projectLimit &&
      user.role !== 'SUPER_ADMIN'
    ) {
      setProjectFeedback({
        type: 'error',
        message: formatProjectLimitMessage(projectLimit),
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
        contract_model: newProjectContractModel || null,
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
          const allowed = await ensureLotImportAllowed(
            finalTenantId,
            blocksToInsert.length,
            isMasterAdmin,
          );
          if (!allowed) {
            setImporting(false);
            return;
          }

          const { total: kmlInserted } = await insertBlocksInBatches(
            supabase,
            blocksToInsert as Record<string, unknown>[],
            { batchSize: 200, select: 'id, number' },
          );
          if (kmlInserted !== blocksToInsert.length) {
            throw new Error(
              `Importação parcial KML: ${kmlInserted}/${blocksToInsert.length} lotes inseridos.`,
            );
          }
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

      const priceParse = parsePricePerM2Input(importTxtPricePerM2);
      if (!priceParse.ok) {
        alert(priceParse.error);
        setImportingTxt(false);
        return;
      }
      const pricePerM2 = priceParse.value;

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

      const { data: existingQuadraLots } = await supabase
        .from('blocks')
        .select('number, lot_number, price')
        .eq('project_id', selectedProject.id)
        .eq('block_name', quadraName);

      const existingPriceByLot = new Map<string, number>();
      const existingLotNumbers = new Set<string>();
      for (const row of existingQuadraLots ?? []) {
        const key = lotNumberKey(row.number ?? row.lot_number);
        if (!key) continue;
        existingLotNumbers.add(key);
        if (row.price != null && Number.isFinite(Number(row.price))) {
          existingPriceByLot.set(key, Number(row.price));
        }
      }
      const isReimport = existingLotNumbers.size > 0;
      const quadraLotsCount = existingQuadraLots?.length ?? 0;
      const netLotAdd = Math.max(0, blocksParsed.length - quadraLotsCount);
      const allowedLots = await ensureLotImportAllowed(
        finalTenantId,
        netLotAdd,
        isMasterAdmin,
      );
      if (!allowedLots) {
        setImportingTxt(false);
        return;
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

      const lotsWithGeometry = blocksParsed.filter((b) => b.geometrySaved);
      const lotsWithoutGeometry = blocksParsed.length - lotsWithGeometry.length;

      console.log("[TXT] resumo geometria quadra", {
        quadra: quadraName,
        total: blocksParsed.length,
        comGeometria: lotsWithGeometry.length,
        semGeometria: lotsWithoutGeometry,
        pricePerM2,
        overwriteExistingPrices: importTxtOverwritePrices,
        isReimport,
      });

      let pricedFromM2Count = 0;
      let preservedPriceCount = 0;

      const blocksToInsert = blocksParsed.map((b) => {
          const finalArea = b.area;
          const lotKey = lotNumberKey(b.name);
          const hadExistingLot = existingLotNumbers.has(lotKey);
          const existingPrice = existingPriceByLot.get(lotKey) ?? null;
          const finalPrice = resolveImportedLotPrice({
            areaM2: finalArea,
            pricePerM2,
            existingPrice,
            overwriteExistingPrices: importTxtOverwritePrices,
            hadExistingLot,
          });

          if (
            pricePerM2 != null &&
            finalPrice != null &&
            (!hadExistingLot || importTxtOverwritePrices || existingPrice == null)
          ) {
            pricedFromM2Count += 1;
          } else if (
            hadExistingLot &&
            finalPrice != null &&
            existingPrice != null &&
            finalPrice === existingPrice &&
            !importTxtOverwritePrices
          ) {
            preservedPriceCount += 1;
          }

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
          const { inserted, total: insertedTotal } = await insertBlocksInBatches(
            supabase,
            insertPayload as Record<string, unknown>[],
            { batchSize: 200, select: 'id, number' },
          );

          if (insertedTotal !== insertPayload.length) {
            throw new Error(
              `Importação parcial TXT: ${insertedTotal}/${insertPayload.length} lotes inseridos.`,
            );
          }

          if (inserted?.length) {
            for (let i = 0; i < inserted.length; i++) {
              const lotId = inserted[i]?.id;
              const officialSegs = blocksToInsert[i]?._officialSegs;
              const lotRow = blocksToInsert[i];
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

              if (lotRow && lotRow.price != null) {
                void logLotAuditEvent(supabase, {
                  ...lotAuditContextFromBlock({
                    id: lotId,
                    project_id: selectedProject.id,
                    tenant_id: finalTenantId,
                    company_id: finalTenantId,
                    number: lotRow.number,
                    block_name: quadraName,
                  }),
                  userId: user.id,
                  action: 'lot_created',
                  title: 'Lote importado (TXT Civil 3D)',
                  description:
                    pricePerM2 != null
                      ? `Valor calculado: ${Number(lotRow.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${Number(lotRow.area).toLocaleString('pt-BR')} m² × R$ ${pricePerM2.toFixed(2).replace('.', ',')}/m²)`
                      : 'Importado sem preço por m²',
                  newData: {
                    price: lotRow.price,
                    area: lotRow.area,
                    source_import: 'TXT_CIVIL3D',
                    price_per_m2: pricePerM2,
                  },
                  source: 'gis_map',
                });
              }
            }
          }
      }

      try {
        await supabase.from('audit_logs').insert({
          tenant_id: finalTenantId,
          company_id: finalTenantId,
          user_id: user.id,
          action: 'TXT_CIVIL3D_IMPORT',
          module: 'GIS',
          description: buildTxtImportAuditDescription({
            quadraName,
            lotCount: blocksToInsert.length,
            pricePerM2,
            overwriteExistingPrices: importTxtOverwritePrices,
            isReimport,
            pricedFromM2Count,
            preservedPriceCount,
          }),
          reference_id: selectedProject.id,
        });
      } catch (auditErr) {
        console.warn('[TXT] audit_logs importação', auditErr);
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
      setImportTxtPricePerM2('');
      setImportTxtOverwritePrices(false);
      setImportTxtIsReimport(false);
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
        const allowedLots = await ensureLotImportAllowed(
          finalTenantId,
          inserts.length,
          isMasterAdmin,
        );
        if (!allowedLots) {
          setImportingShp(false);
          return;
        }

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

    const mode = streetGuideModal.mode;
    const perfOn = isGisPerfDiagnosticsEnabled();
    if (perfOn) {
      gisPerfStreetSaveBegin({
        mode,
        streetGuideCountBefore: streetGuides.length,
      });
    }

    console.log('STREET_GUIDE_SAVE_PAYLOAD', payload);

    const applyGuides = (updater: (prev: any[]) => any[]) => {
      startTransition(() => {
        setStreetGuides(updater);
      });
      if (perfOn) gisPerfStreetSaveMark('state_end');
    };

    if (mode === 'edit' && streetGuideModal.guide?.id) {
      const id = String(streetGuideModal.guide.id);
      if (id.startsWith('temp-')) {
        applyGuides((prev) =>
          prev.map((g) =>
            g.id === id ? normalizeStreetGuideRow({ ...g, ...payload, id }) : g,
          ),
        );
        if (perfOn) {
          gisPerfStreetSaveMark('modal_close');
          gisPerfStreetSaveEnd({ path: 'edit_temp' });
        }
        return;
      }
      if (perfOn) gisPerfStreetSaveMark('db_start');
      const { data, error } = await supabase
        .from('street_guides')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (perfOn) gisPerfStreetSaveMark('db_end');
      if (error) {
        if (perfOn) gisPerfStreetSaveEnd({ path: 'edit_error' });
        throw error;
      }
      if (data) {
        applyGuides((prev) =>
          prev.map((g) =>
            g.id === id ? normalizeStreetGuideRow(data as Record<string, unknown>) : g,
          ),
        );
      }
      if (perfOn) {
        gisPerfStreetSaveMark('modal_close');
        gisPerfStreetSaveEnd({ path: 'edit_ok' });
      }
      return;
    }

    // Create: optimistic + replace id (sem rebuild de audits/lotes — streetGuides não invalida mais).
    const tempId = `temp-${Date.now()}`;
    applyGuides((prev) => [
      ...prev,
      normalizeStreetGuideRow({
        id: tempId,
        ...payload,
        visible: true,
      }),
    ]);

    if (perfOn) gisPerfStreetSaveMark('db_start');
    const { data, error } = await supabase
      .from('street_guides')
      .insert(payload)
      .select();
    if (perfOn) gisPerfStreetSaveMark('db_end');

    if (error) {
      console.error('Save street guide error:', error);
      if (perfOn) gisPerfStreetSaveEnd({ path: 'create_error' });
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
      applyGuides((prev) =>
        prev.map((g) =>
          g.id === tempId
            ? normalizeStreetGuideRow(data[0] as Record<string, unknown>)
            : g,
        ),
      );
    }
    if (perfOn) {
      gisPerfStreetSaveMark('modal_close');
      gisPerfStreetSaveEnd({
        path: 'create_ok',
        streetGuideCountAfter: streetGuides.length + 1,
      });
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
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-lg overflow-hidden shadow-2xl fade-in-up max-h-[90vh] flex flex-col">
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
            <h3 className="font-bold text-[var(--text-primary)] text-lg">
              {projectFormMode === 'edit' ? 'Editar Projeto' : 'Novo Projeto'}
            </h3>
            <button
              type="button"
              onClick={closeProjectForm}
              className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors"
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
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
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
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
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
                  className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] uppercase"
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
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
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
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
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
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Conta financeira padrão do empreendimento
              </label>
              <select
                value={newProjectFinancialAccountId}
                onChange={(e) => setNewProjectFinancialAccountId(e.target.value)}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">Usar conta padrão da empresa</option>
                {projectFinancialAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatFinancialAccountLabel({
                      name: account.name,
                      accountType: (account.accountType as 'IMOBILIARIA') || 'IMOBILIARIA',
                      beneficiaryName: account.beneficiaryName,
                      provider: account.provider ?? null,
                    })}
                    {account.isDefault ? ' (Padrão)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Modelo de contrato padrão do empreendimento
              </label>
              <select
                value={newProjectContractModel}
                onChange={(e) => setNewProjectContractModel(e.target.value)}
                className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
              >
                <option value="">
                  Usar modelo padrão da empresa (
                  {SALE_CONTRACT_MODEL_LABELS[companyDefaultContractModel]})
                </option>
                {SALE_CONTRACT_MODEL_OPTIONS.map((model) => (
                  <option key={model} value={model}>
                    {SALE_CONTRACT_MODEL_LABELS[model]}
                  </option>
                ))}
              </select>
            </div>
            {normalizeSaleContractModel(
              newProjectContractModel || companyDefaultContractModel,
            ) === 'MUNDO_NOVO' &&
              mundoNovoSellerContacts.length > 0 && (
              <div className="rounded-lg border border-[var(--color-border)] p-3 flex flex-col gap-3">
                <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                  Contato dos PROMITENTES VENDEDORES (e-sign)
                </p>
                {mundoNovoSellerContacts.map((seller, idx) => (
                  <div key={`${seller.order}-${seller.name}`} className="flex flex-col gap-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {seller.name}
                    </p>
                    <input
                      type="email"
                      value={seller.email}
                      onChange={(e) =>
                        setMundoNovoSellerContacts((prev) =>
                          prev.map((row, rowIdx) =>
                            rowIdx === idx ? { ...row, email: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="E-mail"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                    <input
                      type="tel"
                      value={seller.phone}
                      onChange={(e) =>
                        setMundoNovoSellerContacts((prev) =>
                          prev.map((row, rowIdx) =>
                            rowIdx === idx ? { ...row, phone: e.target.value } : row,
                          ),
                        )
                      }
                      placeholder="Telefone / WhatsApp"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={projectFormSubmitting}
              className="w-full shrink-0 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
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
      <div className="gis-project-map-view flex-1 w-full h-full flex flex-col pt-0 relative bg-[var(--color-background)]">
        {/* LEGENDA - BOTTOM LEFT */}
        <div
          data-testid="map-status-legend"
          className="gis-map-legend-anchor map-status-legend absolute bottom-4 left-4 z-[400] pointer-events-auto"
        >
           <div className="gis-shell-panel bg-[var(--bg-card)]/95 backdrop-blur-md border border-[var(--border-color)] rounded flex flex-col gap-1.5 p-2 shadow-lg max-w-[150px]">
              <div className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-secondary)]">
                <div className="w-3 h-3 rounded-sm bg-[#22c55e] border border-[#16a34a]" /> Disponível
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-secondary)]">
                <div className="w-3 h-3 rounded-sm bg-[#eab308] border border-[#ca8a04]" /> Reservado
              </div>
              <div className="flex items-center gap-2 text-[10px] font-medium text-[var(--text-secondary)]">
                <div className="w-3 h-3 rounded-sm bg-[#ef4444] border border-[#dc2626]" /> Vendido
              </div>
           </div>
        </div>

        {/* Voltar — sem card de nome (nome no header global) */}
        <div className="absolute top-2 left-2 md:top-4 md:left-4 z-[400] pointer-events-auto">
          <button
            type="button"
            onClick={handleBack}
            className="gis-shell-panel flex items-center justify-center p-2.5 bg-[var(--bg-card)]/95 backdrop-blur-md border border-[var(--border-color)] shadow-lg rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-alt)] transition-colors"
            title="Voltar aos projetos"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {/* GIS TOOLS VERTICAL BAR - RIGHT */}
        <div
          data-testid="gis-tools-toolbar"
          aria-hidden={isAnyModalOpen}
          className={`gis-tools-toolbar absolute top-16 right-2 md:top-4 md:right-4 z-[400] flex flex-col gap-1.5 items-end transition-all duration-200 ease-out ${
            isAnyModalOpen ? GIS_TOOLBAR_HIDE_CLASS : GIS_TOOLBAR_SHOW_CLASS
          }`}
        >
           {/* Botão toggle da barra para mobile (opcional, ou mantemos sempre visível pois é fino) */}
           <div className="gis-shell-panel bg-[var(--bg-card)]/95 backdrop-blur-md border border-[var(--border-color)] py-1.5 px-1.5 rounded-lg shadow-lg flex flex-col gap-1.5 w-10 md:w-12 items-center relative">
             
             {canManageGisProject(user?.role) && (
               <div className="gis-toolbar-desktop-only contents">
                 <ProjectQuadrasPanel
                   open={quadrasPanelOpen}
                   onToggleOpen={() => setQuadrasPanelOpen((o) => !o)}
                   quadras={projectQuadras}
                   loading={quadrasLoading}
                   actionLoading={quadraActionLoading}
                   onViewOnMap={handleViewQuadraOnMap}
                   onReimportTxt={handleReimportQuadraTxt}
                   onUpdateIndividualLot={handleUpdateIndividualLotQuadra}
                   onRequestDeleteLot={handleDeleteIndividualLotQuadra}
                   onRequestDelete={setDeleteQuadraConfirm}
                 />

                 <hr className="w-2/3 border-[var(--border-color)]" />

                 {/* Import — oficial: TXT Civil 3D */}
                 {SHOW_LEGACY_GIS_IMPORT && (
                   <button
                     type="button"
                     onClick={() => setIsImportModalOpen(true)}
                     className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent text-sky-400/75 hover:bg-sky-500/15 hover:text-sky-400 transition-colors group relative"
                   >
                     <Upload className="w-4 h-4 md:w-5 md:h-5" />
                     <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Importar Quadras (KML)</span>
                   </button>
                 )}

                 <button
                    type="button"
                    onClick={() => setIsImportTxtModalOpen(true)}
                    className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent text-sky-300/80 hover:bg-sky-400/15 hover:text-sky-300 transition-colors group relative"
                 >
                    <FileUp className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">Importar TXT</span>
                 </button>

                 {SHOW_LEGACY_GIS_IMPORT && (
                   <button
                     type="button"
                     onClick={() => setIsImportShpModalOpen(true)}
                     className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent text-sky-300/80 hover:bg-sky-400/15 hover:text-sky-300 transition-colors group relative"
                   >
                     <Layers className="w-4 h-4 md:w-5 md:h-5" />
                     <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[11rem] text-right leading-tight">Shapefile (.zip)</span>
                   </button>
                 )}

                 <button
                   type="button"
                   onClick={() => void handleRunAutomaticConfrontation()}
                   disabled={confrontationRunning}
                   className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent text-violet-400/75 hover:bg-violet-500/15 hover:text-violet-400 transition-colors group relative disabled:opacity-40"
                 >
                   {confrontationRunning ? (
                     <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                   ) : (
                     <GitBranch className="w-4 h-4 md:w-5 md:h-5" />
                   )}
                   <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">Confrontação Automática</span>
                 </button>

                 <button
                   type="button"
                   onClick={() => {
                     setAssistedConfrontationMode((v) => !v);
                   }}
                   className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${
                     assistedConfrontationMode
                       ? 'bg-slate-400/20 text-slate-300'
                       : 'bg-transparent text-slate-400/75 hover:bg-slate-400/15 hover:text-slate-300'
                   }`}
                 >
                   <Eye className="w-4 h-4 md:w-5 md:h-5" />
                   <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">
                     Revisar Confrontações
                   </span>
                 </button>

                 <hr className="w-2/3 border-[var(--border-color)]" />
               </div>
             )}

             {canManageGisProject(user?.role) && (
               <>
                 <button
                   type="button"
                   onClick={() => {
                     setMemorialTarget(null);
                     setMemorialPickMode(true);
                     setLotSheetPickMode(false);
                     setLotSheetTarget(null);
                     setMeasureActive(false);
                     setAreaMeasureActive(false);
                     setDrawStreetActive(false);
                   }}
                   className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${memorialPickMode || memorialTarget ? 'bg-[#f59e0b]/20 text-[#fbbf24]' : 'bg-transparent hover:bg-[var(--bg-card-alt)] text-[var(--text-secondary)] hover:text-[#f59e0b]'}`}
                 >
                   <ScrollText className="w-4 h-4 md:w-5 md:h-5" />
                   <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase max-w-[12rem] text-right leading-tight">Memorial Descritivo</span>
                 </button>
                 <hr className="gis-toolbar-desktop-only w-2/3 border-[var(--border-color)]" />
               </>
             )}
             
             {/* GPS */}
             <button 
                onClick={() => setGpsActive(!gpsActive)} 
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${gpsActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-transparent text-cyan-400/75 hover:bg-cyan-500/15 hover:text-cyan-400'}`}
             >
                <LocateFixed className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Centralizar GPS</span>
             </button>
             
             {/* Medição */}
             <button 
                type="button"
                onClick={() => {
                  if (measureActive) {
                    setMeasureActive(false);
                  } else {
                    setAreaMeasureActive(false);
                    setMemorialPickMode(false);
                    setMemorialTarget(null);
                    setLotSheetPickMode(false);
                    setLotSheetTarget(null);
                    setDrawStreetActive(false);
                    setMeasureActive(true);
                  }
                }}
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${measureActive ? 'bg-yellow-400/20 text-yellow-300' : 'bg-transparent text-yellow-400/75 hover:bg-yellow-400/15 hover:text-yellow-300'}`}
             >
                <Ruler className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Medir Distância</span>
             </button>

             {/* Medir Área */}
             <button
                type="button"
                onClick={() => {
                  if (areaMeasureActive) {
                    setAreaMeasureActive(false);
                  } else {
                    setMeasureActive(false);
                    setMemorialPickMode(false);
                    setMemorialTarget(null);
                    setLotSheetPickMode(false);
                    setLotSheetTarget(null);
                    setDrawStreetActive(false);
                    setAreaMeasureActive(true);
                  }
                }}
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${areaMeasureActive ? 'bg-blue-500/20 text-blue-300' : 'bg-transparent text-blue-400/75 hover:bg-blue-500/15 hover:text-blue-300'}`}
             >
                <LandPlot className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Medir Área</span>
             </button>

             {/* Prancha Geral */}
             <button
                type="button"
                onClick={() => {
                  setEnterpriseOverviewOptions(DEFAULT_ENTERPRISE_OVERVIEW_OPTIONS);
                  setIsEnterpriseOverviewModalOpen(true);
                }}
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${isEnterpriseOverviewModalOpen ? 'bg-orange-600/20 text-orange-400' : 'bg-transparent text-orange-500/80 hover:bg-orange-600/15 hover:text-orange-400'}`}
             >
                <MapPinned className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Prancha Geral</span>
             </button>

             {/* Relatório de Vias */}
             <button
                type="button"
                data-testid="gis-street-guides-report-btn"
                title="Relatório de Vias"
                aria-label="Relatório de Vias"
                onClick={() => {
                  if (!selectedProject) {
                    alert('Selecione um empreendimento.');
                    return;
                  }
                  setIsStreetGuidesReportModalOpen(true);
                }}
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${isStreetGuidesReportModalOpen ? 'bg-sky-600/20 text-sky-300' : 'bg-transparent text-sky-400/80 hover:bg-sky-600/15 hover:text-sky-300'}`}
             >
                <ClipboardList className="w-4 h-4 md:w-5 md:h-5" aria-hidden />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Relatório de Vias</span>
             </button>

             {/* Prancha PDF */}
             <button
                type="button"
                onClick={() => {
                  console.log('LOT_SHEET_PRINT_CLICK');
                  setLotSheetTarget(null);
                  setLotSheetPickMode(true);
                  setMeasureActive(false);
                  setAreaMeasureActive(false);
                  setDrawStreetActive(false);
                  console.log('LOT_SHEET_PICK_MODE_ENABLED');
                }}
                className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${lotSheetPickMode || lotSheetTarget ? 'bg-orange-500/20 text-orange-400' : 'bg-transparent text-orange-400/75 hover:bg-orange-500/15 hover:text-orange-400'}`}
             >
                <FileText className="w-4 h-4 md:w-5 md:h-5" />
                <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Gerar Prancha do Lote</span>
             </button>
             
             {/* Map Style */}
             <div className="relative w-full">
               <button
                 type="button"
                 onClick={() => setLayerMenuOpen((open) => !open)}
                 className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${
                   layerMenuOpen
                     ? 'bg-emerald-500/20 text-emerald-400'
                     : 'bg-transparent text-emerald-400/75 hover:bg-emerald-500/15 hover:text-emerald-400'
                 }`}
               >
                 <MapIcon className="w-4 h-4 md:w-5 md:h-5" />
                 <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">
                   Camadas do Mapa
                 </span>
               </button>
               {layerMenuOpen && (
                 <div className="absolute right-full top-0 mr-2 z-[1200] min-w-[168px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-xl p-1.5 space-y-0.5">
                   <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                     Camada do mapa
                   </p>
                   {GIS_BASE_LAYER_ORDER.map((layerId) => (
                     <button
                       key={layerId}
                       type="button"
                       onClick={() => {
                         setActiveLayer(layerId);
                         setLayerMenuOpen(false);
                       }}
                       className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-semibold transition-colors ${
                         activeLayer === layerId
                           ? 'bg-[#f59e0b]/15 text-[#f59e0b]'
                           : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)]'
                       }`}
                     >
                       {GIS_BASE_LAYER_LABELS[layerId]}
                     </button>
                   ))}
                 </div>
               )}
             </div>
             
             {canManageGisProject(user?.role) && (
               <div className="gis-toolbar-desktop-only contents">
                 <hr className="w-2/3 border-[var(--border-color)]" />

                 {/* Linha de Rua */}
                 <button 
                    onClick={() => setDrawStreetActive(!drawStreetActive)} 
                    className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${drawStreetActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-transparent text-emerald-400/75 hover:bg-emerald-500/15 hover:text-emerald-400'}`}
                 >
                    <Route className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Linha de Rua</span>
                 </button>
                 
                 {/* Identificar Frentes */}
                 <button 
                    onClick={handleIdentifyFronts} 
                    className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent text-blue-400/75 hover:bg-blue-500/15 hover:text-blue-400 transition-colors group relative"
                 >
                    <Scan className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Identificar Frentes</span>
                 </button>
                 
                 {/* Visibility Toggle */}
                 <button 
                    onClick={() => setStreetGuidesVisible(!streetGuidesVisible)} 
                    className={`w-full aspect-square flex items-center justify-center rounded-md transition-colors group relative ${streetGuidesVisible ? 'bg-amber-500/15 text-amber-400' : 'bg-transparent text-amber-400/70 hover:bg-amber-500/15 hover:text-amber-400'}`}
                 >
                    {streetGuidesVisible ? <Eye className="w-4 h-4 md:w-5 md:h-5" /> : <EyeOff className="w-4 h-4 md:w-5 md:h-5" />}
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[var(--bg-card-alt)] border border-[var(--border-color)] text-[10px] font-bold text-[var(--text-secondary)] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">
                       {streetGuidesVisible ? "Ocultar Linhas" : "Mostrar Linhas"}
                    </span>
                 </button>
               </div>
             )}
             
           </div>
        </div>
        
        {/* Map Container */}
        <div className="flex-1 w-full h-full z-0 relative">
          {(canViewEnterpriseValues(user?.role) || isOwnerRole(user?.role)) && selectedProject?.id ? (
            <EnterpriseValueOverlay
              projectId={selectedProject.id}
              refreshKey={enterpriseRefreshKey}
            />
          ) : null}
          <GISMap 
            projectId={selectedProject.id} 
            activeLayer={activeLayer} 
            gpsActive={gpsActive} 
            measureActive={measureActive}
            onMeasureDeactivate={() => setMeasureActive(false)}
            areaMeasureActive={areaMeasureActive}
            onAreaMeasureDeactivate={() => setAreaMeasureActive(false)}
            areaMeasureExportMeta={{
              projectName: selectedProject?.name ?? '—',
              companyName: String(saasCompany?.name ?? '—'),
              userName: user?.name ?? '—',
            }}
            refreshKey={mapRefreshKey}
            focusBlockName={focusBlockName}
            focusBlockKey={focusBlockKey}
            frontPatchBatch={frontPatchBatch}
            lotsMutation={lotsMutation}
            streetGuides={streetGuides}
            streetGuidesVisible={streetGuidesVisible}
            drawStreetActive={drawStreetActive}
            onStreetLineDrawn={handleStreetLineDrawn}
            onDrawStreetCancel={() => setDrawStreetActive(false)}
            onEditStreetGuide={(guide) =>
              setStreetGuideModal({ mode: 'edit', guide })
            }
            onDeleteStreetGuide={handleDeleteStreetGuide}
            lotSheetPickMode={ownerReadOnly ? false : lotSheetPickMode}
            onLotSheetLotPick={
              ownerReadOnly
                ? undefined
                : (lot) => {
              if (!lotSheetPickMode) return;
              console.log('LOT_SHEET_MAP_LOT_CLICK', { id: lot.id, number: lot.number });
              setLotSheetTarget(lot);
              setLotSheetPickMode(false);
              console.log('LOT_SHEET_MODAL_OPEN_WITH_LOT', { id: lot.id, number: lot.number });
            }}
            memorialPickMode={ownerReadOnly ? false : memorialPickMode}
            onMemorialLotPick={
              ownerReadOnly
                ? undefined
                : (lot) => {
              if (!memorialPickMode) return;
              setMemorialTarget(lot);
              setMemorialPickMode(false);
            }}
            onGenerateMemorialFromPopup={
              ownerReadOnly
                ? undefined
                : (lot) => {
              setMemorialTarget(lot);
              setMemorialPickMode(false);
            }}
            onGenerateLotSheetFromPopup={
              ownerReadOnly
                ? undefined
                : (lot) => {
              setLotSheetTarget(lot);
              setLotSheetPickMode(false);
            }}
            assistedConfrontationMode={assistedConfrontationMode}
            onOverlayOpenChange={setGisMapOverlayOpen}
            onEnterpriseValueRefresh={() =>
              setEnterpriseRefreshKey((k) => k + 1)
            }
          />
          <GisPerfDiagPanel />
        </div>

        {lotSheetPickMode && !lotSheetTarget && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
            <p className="text-xs font-semibold text-amber-100 bg-[var(--bg-card)]/95 border border-amber-500/40 rounded-lg px-3 py-2 shadow-lg text-center">
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

        {!ownerReadOnly && memorialPickMode && !memorialTarget && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
            <p className="text-xs font-semibold text-amber-100 bg-[var(--bg-card)]/95 border border-amber-500/40 rounded-lg px-3 py-2 shadow-lg text-center">
              Selecione um lote no mapa para gerar o memorial descritivo
            </p>
          </div>
        )}

        {!ownerReadOnly && memorialTarget && (saasTenantId || user?.tenant_id || selectedProject.tenant_id) && (
          <MemorialGenerateModal
            projectId={selectedProject.id}
            tenantId={String(saasTenantId || user?.tenant_id || selectedProject.tenant_id)}
            lot={memorialTarget}
            onClose={() => {
              setMemorialPickMode(false);
              setMemorialTarget(null);
            }}
            onSelectAnotherLot={() => {
              setMemorialTarget(null);
              setMemorialPickMode(true);
              setMeasureActive(false);
              setAreaMeasureActive(false);
              setDrawStreetActive(false);
            }}
          />
        )}

        {!ownerReadOnly && lotSheetTarget && (saasTenantId || user?.tenant_id || selectedProject.tenant_id) && (
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
              setAreaMeasureActive(false);
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
                    <h3 className="font-bold text-[var(--text-primary)] text-lg">Importar Lotes (KML)</h3>
                    <button onClick={() => setIsImportModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors">
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
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] uppercase"
                       />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Lote Inicial</label>
                          <input 
                            type="number" required
                            value={importLoteInicial} onChange={e => setImportLoteInicial(e.target.value)}
                            placeholder="Ex: 1"
                            className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                          />
                       </div>
                       <div>
                          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Ordenação</label>
                          <select 
                             value={importOrdem} onChange={e => setImportOrdem(e.target.value as 'ASC'|'DESC')}
                             className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
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
                       className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--text-primary)] font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
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
                <h3 className="font-bold text-[var(--text-primary)] text-lg">Excluir quadra</h3>
              </div>
              <div className="p-6">
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  Deseja excluir somente a{' '}
                  <strong className="text-[var(--text-primary)]">
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
                    className="flex-1 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--text-secondary)] font-semibold hover:bg-[var(--color-background)] transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(quadraActionLoading)}
                    onClick={handleConfirmDeleteQuadra}
                    className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-[var(--text-primary)] font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                    <h3 className="font-bold text-[var(--text-primary)] text-lg">Importar Lotes (TXT Civil 3D)</h3>
                    <button onClick={() => setIsImportTxtModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors">
                       <X className="w-5 h-5" />
                    </button>
                 </div>
                 <form onSubmit={handleImportTXT} className="p-6 flex flex-col gap-4">
                    <div>
                        <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Zona UTM</label>
                        <select 
                          value={importTxtUtmZone} onChange={e => setImportTxtUtmZone(e.target.value)}
                          className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
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
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] uppercase"
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

                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                        Preço por m² (R$)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={importTxtPricePerM2}
                        onChange={(e) => setImportTxtPricePerM2(e.target.value)}
                        placeholder="Ex: 120,00"
                        className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-2 leading-relaxed">
                        Se informado, o sistema calculará automaticamente o valor de cada lote com base na área importada.
                      </p>
                    </div>

                    {importTxtIsReimport && (
                      <label className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importTxtOverwritePrices}
                          onChange={(e) => setImportTxtOverwritePrices(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          Atualizar valores dos lotes existentes com o preço por m² informado
                        </span>
                      </label>
                    )}

                    <button 
                       type="submit" disabled={importingTxt}
                       className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--text-primary)] font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
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
                        className="w-full py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--text-secondary)] text-sm font-semibold hover:bg-[var(--color-background)] transition-colors flex items-center justify-center gap-2"
                      >
                        <Layers className="w-4 h-4" />
                        Importar Shapefile (.zip)
                      </button>
                    </div>
                 </form>
              </div>
           </div>
        )}

        <UpdateIndividualLotModal
          open={isUpdateLotModalOpen}
          quadra={updateLotQuadra}
          lotNumber={updateLotNumber}
          utmZone={updateLotUtmZone}
          file={updateLotFile}
          mode={updateLotMode}
          loading={updatingIndividualLot}
          onClose={() => setIsUpdateLotModalOpen(false)}
          onQuadraChange={setUpdateLotQuadra}
          onLotNumberChange={setUpdateLotNumber}
          onUtmZoneChange={setUpdateLotUtmZone}
          onFileChange={setUpdateLotFile}
          onModeChange={setUpdateLotMode}
          onSubmit={handleSubmitIndividualLotUpdate}
        />

        <DeleteIndividualLotModal
          open={isDeleteLotModalOpen}
          quadra={deleteLotQuadra}
          lotNumber={deleteLotNumber}
          confirmStep={deleteLotConfirmStep}
          loading={deletingIndividualLot}
          onClose={closeDeleteLotModal}
          onQuadraChange={setDeleteLotQuadra}
          onLotNumberChange={setDeleteLotNumber}
          onRequestConfirm={handleRequestDeleteLotConfirm}
          onBackToForm={() => setDeleteLotConfirmStep(false)}
          onConfirmDelete={() => void handleConfirmDeleteIndividualLot()}
        />

        <EnterpriseOverviewModal
          open={isEnterpriseOverviewModalOpen}
          projectName={selectedProject?.name || ''}
          options={enterpriseOverviewOptions}
          loading={enterpriseOverviewGenerating}
          onClose={() => setIsEnterpriseOverviewModalOpen(false)}
          onOptionsChange={setEnterpriseOverviewOptions}
          onSubmit={handleGenerateEnterpriseOverview}
        />

        <StreetGuidesReportModal
          open={isStreetGuidesReportModalOpen}
          projectName={selectedProject?.name || ''}
          streetCount={streetGuidesReportSummary.streetCount}
          totalLengthM={streetGuidesReportSummary.totalLengthM}
          loadingPdf={streetGuidesReportPdfLoading}
          loadingExcel={streetGuidesReportExcelLoading}
          onClose={() => setIsStreetGuidesReportModalOpen(false)}
          onExportPdf={() => void handleExportStreetGuidesPdf()}
          onExportExcel={() => void handleExportStreetGuidesExcel()}
        />

        {isImportShpModalOpen && (
           <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up">
                 <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h3 className="font-bold text-[var(--text-primary)] text-lg">Importar Shapefile (.zip)</h3>
                    <button onClick={() => setIsImportShpModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors">
                       <X className="w-5 h-5" />
                    </button>
                 </div>
                 <form onSubmit={handleImportShapefile} className="p-6 flex flex-col gap-4">
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      Envie um .zip com .shp, .shx, .dbf e .prj. O sistema associa cada polígono ao lote pela{' '}
                      <strong className="text-[var(--text-primary)]">quadra + lote</strong> (atributos DBF).
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
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)] uppercase"
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
                       className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-[var(--text-primary)] font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
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
    <div className="sv-page sv-page--scroll-y flex-1 p-4 md:p-8 flex flex-col h-full fade-in-up relative z-0 min-w-0">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Mapa GIS & Projetos</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider flexitems-center gap-2">
            Gestão Unificada de Loteamentos
            {user?.role !== 'SUPER_ADMIN' && projectLimit !== null && (
               <span className="ml-3 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                 Loteamentos: {projects.length} / {projectLimit}
                 {projects.length >= projectLimit ? ' — Limite atingido' : ''}
               </span>
            )}
            {user?.role !== 'SUPER_ADMIN' && lotLimit !== null && tenantLotCount != null && (
               <span className="ml-3 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs border border-amber-500/20">
                 Lotes: {tenantLotCount.toLocaleString('pt-BR')} / {lotLimit.toLocaleString('pt-BR')}
                 {tenantLotCount >= lotLimit ? ' — Limite atingido' : ''}
               </span>
            )}
          </p>
          {user?.role !== 'SUPER_ADMIN' && planAvailabilityMsg && (
            <p className="text-xs text-blue-400/90 mt-1">{planAvailabilityMsg}</p>
          )}
        </div>
        {canManageGisProject(user?.role) && (
          <button 
            onClick={openCreateProject}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--text-primary)] px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            Novo Projeto
          </button>
        )}
      </header>

      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl flex-1 flex flex-col overflow-hidden shadow-sm min-w-0 max-w-full">
        {/* Toolbar */}
        <div className="p-4 border-b border-[var(--color-border)] flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-2.5 w-5 h-5 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Buscar loteamentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg py-2 pl-10 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
        </div>

        {/* List — desktop/notebook: tabela; mobile: cards com nome completo */}
        <div className="flex-1 overflow-auto min-w-0">
          {loading ? (
             <div className="w-full h-full flex items-center justify-center py-16">
                 <Loader2 className="w-8 h-8 text-[var(--color-primary)] animate-spin" />
             </div>
          ) : filteredProjects.length > 0 ? (
             <>
               {/* Tabela administrativa — notebook/desktop */}
               <div className="hidden md:block min-w-0">
                 <table className="w-full text-left border-collapse min-w-[720px]">
                   <thead className="sticky top-0 z-10 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
                     <tr className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                       <th className="p-3 pl-4 min-w-[200px]">Projeto / Loteamento</th>
                       <th className="p-3 min-w-[120px]">Localização</th>
                       <th className="p-3 text-center w-20">Lotes</th>
                       <th className="p-3 min-w-[140px]">Vendas</th>
                       <th className="p-3 text-center w-28">GIS</th>
                       <th className="p-3 text-center w-28">KML</th>
                       <th className="p-3 pr-4 text-right min-w-[200px]">Ações</th>
                     </tr>
                   </thead>
                   <tbody>
                     {filteredProjects.map((p) => {
                       const stats = projectLotStats[String(p.id)] || {
                         total: Array.isArray(p.blocks) ? p.blocks.length : 0,
                         sold: Array.isArray(p.blocks)
                           ? p.blocks.filter((l: any) => l.status === 'Vendido')
                               .length
                           : 0,
                         hasGis: Array.isArray(p.blocks)
                           ? p.blocks.some((l: any) => l.geometry != null)
                           : false,
                       };
                       const total = stats.total;
                       const sold = stats.sold;
                       const hasGis = stats.hasGis;
                       const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
                       const locationLabel =
                         p.location ||
                         [p.city, p.uf || p.state].filter(Boolean).join(' - ') ||
                         'Sem localização';

                       return (
                         <tr
                           key={p.id}
                           className="border-b border-[var(--color-border)]/80 hover:bg-white/[0.02] transition-colors"
                         >
                           <td className="p-3 pl-4 align-middle">
                             <div className="flex items-start gap-3 min-w-0">
                               <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--color-background)] flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-border)]">
                                 <FolderOpen className="w-5 h-5" />
                               </div>
                               <div className="min-w-0">
                                 <p className="font-semibold text-[var(--text-primary)] text-sm leading-snug break-words">
                                   {p.name}
                                 </p>
                               </div>
                             </div>
                           </td>
                           <td className="p-3 align-middle text-xs text-[var(--color-text-muted)]">
                             <span className="break-words">{locationLabel}</span>
                           </td>
                           <td className="p-3 align-middle text-center">
                             <span className="text-sm font-mono text-[var(--text-primary)] tabular-nums">{total}</span>
                           </td>
                           <td className="p-3 align-middle">
                             <div className="flex flex-col gap-1 min-w-[120px]">
                               <span className="text-[11px] font-mono text-[var(--text-primary)] tabular-nums">
                                 {sold} / {total} ({pct}%)
                               </span>
                               <div className="w-full h-1.5 bg-[var(--color-background)] rounded-full overflow-hidden border border-[var(--color-border)]">
                                 <div
                                   className="h-full bg-[var(--color-primary)]"
                                   style={{ width: `${pct}%` }}
                                 />
                               </div>
                             </div>
                           </td>
                           <td className="p-3 align-middle text-center">
                             {hasGis ? (
                               <span className="inline-flex px-2 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] text-[10px] font-mono font-bold uppercase border border-[var(--color-success)]/20">
                                 OK
                               </span>
                             ) : (
                               <span className="inline-flex px-2 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[10px] font-mono font-bold uppercase border border-[var(--color-warning)]/20">
                                 Pendente
                               </span>
                             )}
                           </td>
                           <td className="p-3 align-middle text-center">
                             {hasGis ? (
                               <span className="inline-flex px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold uppercase border border-emerald-500/20">
                                 Importado
                               </span>
                             ) : (
                               <span className="inline-flex px-2 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[10px] font-mono font-bold uppercase border border-[var(--color-warning)]/20">
                                 Falta KML
                               </span>
                             )}
                           </td>
                           <td className="p-3 pr-4 align-middle">
                             <div className="flex items-center justify-end gap-2">
                               {canManageGisProject(user?.role) && (
                                 <>
                                   <button
                                     type="button"
                                     title="Editar"
                                     onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       openEditProject(p);
                                     }}
                                     className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
                                   >
                                     <Pencil className="w-4 h-4" />
                                   </button>
                                   <button
                                     type="button"
                                     title="Excluir"
                                     onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       handleDeleteProject(p.id);
                                     }}
                                     className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-[var(--color-danger)]"
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </button>
                                 </>
                               )}
                               <button
                                 type="button"
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   handleOpenProject(p);
                                 }}
                                 className="shrink-0 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--text-primary)] px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 whitespace-nowrap"
                               >
                                 <MapIcon className="w-4 h-4" /> Abrir Mapa
                               </button>
                             </div>
                           </td>
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>

               {/* Mobile — cards empilhados, nome completo */}
               <div className="md:hidden flex flex-col gap-3 p-4">
                 {filteredProjects.map((p) => {
                   const stats = projectLotStats[String(p.id)] || {
                     total: Array.isArray(p.blocks) ? p.blocks.length : 0,
                     sold: Array.isArray(p.blocks)
                       ? p.blocks.filter((l: any) => l.status === 'Vendido').length
                       : 0,
                     hasGis: Array.isArray(p.blocks)
                       ? p.blocks.some((l: any) => l.geometry != null)
                       : false,
                   };
                   const total = stats.total;
                   const sold = stats.sold;
                   const hasGis = stats.hasGis;
                   const pct = total > 0 ? Math.round((sold / total) * 100) : 0;
                   const locationLabel =
                     p.location ||
                     [p.city, p.uf || p.state].filter(Boolean).join(' - ') ||
                     'Sem localização';

                   return (
                     <div
                       key={p.id}
                       className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-4 flex flex-col gap-3"
                     >
                       <div className="flex items-start gap-3">
                         <div className="w-10 h-10 shrink-0 rounded-lg bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-border)]">
                           <FolderOpen className="w-5 h-5" />
                         </div>
                         <div className="min-w-0 flex-1">
                           <h3 className="font-bold text-[var(--text-primary)] text-base leading-snug break-words">
                             {p.name}
                           </h3>
                           <p className="text-xs text-[var(--color-text-muted)] mt-1 break-words">
                             {locationLabel}
                           </p>
                         </div>
                       </div>

                       <div className="grid grid-cols-2 gap-2 text-xs">
                         <div>
                           <span className="text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Lotes</span>
                           <p className="font-mono text-[var(--text-primary)] mt-0.5">{total}</p>
                         </div>
                         <div>
                           <span className="text-[var(--color-text-muted)] uppercase tracking-wider text-[10px]">Vendas</span>
                           <p className="font-mono text-[var(--text-primary)] mt-0.5">{sold} / {total} ({pct}%)</p>
                         </div>
                       </div>

                       <div className="w-full h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden border border-[var(--color-border)]">
                         <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
                       </div>

                       <div className="flex flex-wrap gap-2">
                         {hasGis ? (
                           <>
                             <span className="inline-flex px-2 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] text-[10px] font-mono font-bold uppercase border border-[var(--color-success)]/20">
                               GIS OK
                             </span>
                             <span className="inline-flex px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-mono font-bold uppercase border border-emerald-500/20">
                               KML Importado
                             </span>
                           </>
                         ) : (
                           <>
                             <span className="inline-flex px-2 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[10px] font-mono font-bold uppercase border border-[var(--color-warning)]/20">
                               GIS Pendente
                             </span>
                             <span className="inline-flex px-2 py-0.5 rounded bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-[10px] font-mono font-bold uppercase border border-[var(--color-warning)]/20">
                               Falta KML
                             </span>
                           </>
                         )}
                       </div>

                       <div className="flex items-center gap-2 pt-1">
                         <button
                           type="button"
                           onClick={() => handleOpenProject(p)}
                           className="flex-1 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--text-primary)] px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                         >
                           <MapIcon className="w-4 h-4" /> Abrir Mapa
                         </button>
                         {canManageGisProject(user?.role) && (
                           <>
                             <button
                               type="button"
                               title="Editar"
                               onClick={() => openEditProject(p)}
                               className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-white/10 hover:text-[var(--text-primary)]"
                             >
                               <Pencil className="w-4 h-4" />
                             </button>
                             <button
                               type="button"
                               title="Excluir"
                               onClick={() => handleDeleteProject(p.id)}
                               className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-red-500/10 hover:text-[var(--color-danger)]"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </>
                         )}
                       </div>
                     </div>
                   );
                 })}
               </div>
             </>
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
