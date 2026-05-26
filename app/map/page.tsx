'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase, getClientConfigErrorMessage } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, FolderOpen, MoreVertical, Edit2, Trash2, Loader2, ArrowLeft, Upload, Navigation, Map as MapIcon, Ruler, X, ChevronDown, ChevronUp, Scan, Eye, EyeOff, PenTool } from 'lucide-react';
import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import { calculateLotDimensions } from '@/utils/calculateLotDimensions';
import proj4 from 'proj4';

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

/** Resolve tenant/company ativo: perfil → DB → impersonação (super admin). */
async function resolveActiveTenantId(user: AuthUser | null): Promise<string | null> {
  if (!user) return null;
  if (user.tenant_id) return user.tenant_id;

  if (typeof window !== 'undefined') {
    const impersonating = localStorage.getItem('impersonating_tenant_id');
    if (impersonating && user.role === 'SUPER_ADMIN') return impersonating;
  }

  if (user.id && !['dev-preview-user', 'demo-user-id'].includes(user.id)) {
    const { data } = await supabase.from('users').select('tenant_id').eq('id', user.id).maybeSingle();
    if (data?.tenant_id) return data.tenant_id;
  }

  return null;
}

function applyTenantFilterToProjectsQuery(
  query: ReturnType<typeof supabase.from>,
  user: AuthUser,
  tenantId: string | null,
) {
  if (user.role === 'SUPER_ADMIN') return query;
  if (!tenantId) return query;
  return query.or(`tenant_id.eq.${tenantId},company_id.eq.${tenantId}`);
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
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectLimit, setProjectLimit] = useState<number | null>(null);
  const [companyPlan, setCompanyPlan] = useState<string>('Standard');
  
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

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

  // Map Tools States
  const [activeLayer, setActiveLayer] = useState<'streets'|'satellite'|'dark'>('satellite');
  const [gpsActive, setGpsActive] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // New Project States
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCity, setNewProjectCity] = useState('');
  const [newProjectUf, setNewProjectUf] = useState('');
  const [newProjectNbhd, setNewProjectNbhd] = useState('');
  const [newProjectAddr, setNewProjectAddr] = useState('');
  const [newProjectForum, setNewProjectForum] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectFeedback, setProjectFeedback] = useState<ProjectFeedback | null>(null);

  const [mapRefreshKey, setMapRefreshKey] = useState(0);

  // Street Guides States
  const [streetGuides, setStreetGuides] = useState<any[]>([]);
  const [drawStreetActive, setDrawStreetActive] = useState(false);
  const [streetGuidesVisible, setStreetGuidesVisible] = useState(true);

  const loadStreetGuides = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const { data, error } = await supabase.from('street_guides').select('*').eq('project_id', selectedProject.id);
      if (error && error.code !== 'PGRST205') console.warn('Error loading street guides:', error);
      if (data) setStreetGuides(data.map(g => ({ ...g, visible: true })));
    } catch (e) {}
  }, [selectedProject]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedProject) loadStreetGuides();
  }, [selectedProject, loadStreetGuides]);

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
       const guideLines = visibleGuides.map(g => turfHelpers.lineString(g.geometry_geojson.coordinates));

       const updates = [];

       for (const block of blocks) {
          if (!block.geometry || block.geometry.type !== 'Polygon') continue;
          
          let coords = block.geometry.coordinates[0];
          if (!coords || coords.length < 4) continue;
          
          // Use calculateLotDimensions utilities to extract segments
          const segments = extractSegments(coords, []); // not passing allPolys to keep it fast, we only care about closest to street
          
          let bestSegment = null;
          let bestScore = Infinity;

          for (const seg of segments) {
             const pA = turfHelpers.point(seg.p1);
             const pB = turfHelpers.point(seg.p2);
             
             for (const guide of guideLines) {
                 const nearestA = turfNearestOnLine.default(guide, pA);
                 const nearestB = turfNearestOnLine.default(guide, pB);
                 
                 const distA = nearestA.properties.dist || 0;
                 const distB = nearestB.properties.dist || 0;
                 
                 const avgDist = (distA + distB) / 2;
                 const parallelVariance = Math.abs(distA - distB);
                 
                 // Score = Average Distance + Penalty for not being parallel
                 const score = avgDist + (parallelVariance * 3);
                 
                 if (score < bestScore) {
                     bestScore = score;
                     bestSegment = seg;
                 }
             }
          }

          if (bestSegment) {
             // Set FRONT
             const frenteLength = bestSegment.length;
             
             // Back is furthest/opposite
             const otherSegments = segments.filter(s => s !== bestSegment);
             let backSegment = null;
             let maxDist = -1;
             
             const midFront = [ (bestSegment.p1[0] + bestSegment.p2[0])/2, (bestSegment.p1[1] + bestSegment.p2[1])/2 ];
             for (const oSeg of otherSegments) {
                const midO = [ (oSeg.p1[0] + oSeg.p2[0])/2, (oSeg.p1[1] + oSeg.p2[1])/2 ];
                const d = turfDistance.default(turfHelpers.point(midFront), turfHelpers.point(midO));
                if (d > maxDist) {
                   maxDist = d;
                   backSegment = oSeg;
                }
             }

             const fundoLength = backSegment ? backSegment.length : frenteLength;
             
             const sides = detectSides(segments, bestSegment, backSegment);
             
             const finalFrente = normalizeDimensions(frenteLength, 10);
             const finalFundo = normalizeDimensions(fundoLength, finalFrente);
             const finalDir = normalizeDimensions(sides.ladoDireito, finalFrente * 2);
             const finalEsq = normalizeDimensions(sides.ladoEsquerdo, finalDir);
             
             if (!block.id) continue;
             updates.push({
                 id: block.id,
                 frente: finalFrente,
                 fundo: finalFundo,
                 lado_direito: finalDir,
                 lado_esquerdo: finalEsq
             });
          }
       }

       if (updates.length > 0) {
           const updatePromises = updates.map(updateObj => {
              if (!updateObj.id) return Promise.resolve({ error: { message: "Mock error for no id" } });
              return supabase.from('blocks').update({
                  frente: updateObj.frente !== null ? Number(updateObj.frente) : null,
                  'Fundo': updateObj.fundo !== null ? String(updateObj.fundo).replace(/[^0-9.]/g, '') : null,
                  'Lado Dir.': updateObj.lado_direito !== null ? String(updateObj.lado_direito).replace(/[^0-9.]/g, '') : null,
                  'Lado Esq.': updateObj.lado_esquerdo !== null ? String(updateObj.lado_esquerdo).replace(/[^0-9.]/g, '') : null,
                  updated_at: new Date().toISOString()
              }).eq('id', updateObj.id);
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
    if (!user) return;
    setLoading(true);
    try {
      const activeTenantId = await resolveActiveTenantId(user);

      let limit: number | null = 5;
      let pName = 'Standard';
      const planTenantId = activeTenantId || user.tenant_id;
      if (planTenantId) {
        const { data: companyData } = await supabase
          .from('companies')
          .select('plan')
          .eq('id', planTenantId)
          .maybeSingle();
        if (companyData?.plan) {
          const plan = String(companyData.plan).toLowerCase();
          const PLAN_LIMITS: Record<string, { brokers: number; projects: number }> = {
            basic: { brokers: 5, projects: 3 },
            standard: { brokers: 10, projects: 5 },
            professional: { brokers: Infinity, projects: Infinity },
            premium: { brokers: Infinity, projects: Infinity },
          };
          const mappedLimits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.basic;
          limit = mappedLimits.projects === Infinity ? null : mappedLimits.projects;
          pName =
            plan === 'premium'
              ? 'Premium'
              : plan === 'professional'
                ? 'Profissional'
                : plan === 'standard'
                  ? 'Standard'
                  : 'Básico';
        }
      }
      setProjectLimit(limit);
      setCompanyPlan(pName);

      if (user.role !== 'SUPER_ADMIN' && !activeTenantId) {
        setProjects([]);
        return;
      }

      let query = supabase
        .from('projects')
        .select('*, blocks(status, geometry)')
        .order('created_at', { ascending: false });

      query = applyTenantFilterToProjectsQuery(query, user, activeTenantId);

      const { data, error } = await query;

      if (error) {
        console.warn('Error fetching projects:', error);
        setProjects([]);
        return;
      }

      setProjects(data || []);
    } catch (err) {
      console.error(err);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      loadProjects();
    }
  }, [user, authLoading, loadProjects]);

  useEffect(() => {
    if (typeof window === 'undefined' || projects.length === 0) return;
    const raw = sessionStorage.getItem('sv_gis_focus');
    if (!raw) return;
    try {
      const { projectId } = JSON.parse(raw) as { projectId?: string; blockId?: string };
      const proj = projects.find((p) => p.id === projectId);
      if (proj) setSelectedProject(proj);
      sessionStorage.removeItem('sv_gis_focus');
    } catch {
      sessionStorage.removeItem('sv_gis_focus');
    }
  }, [projects]);

  const filteredProjects = projects.filter(p => 
     p.name.toLowerCase().includes(search.toLowerCase()) || 
     (p.location && p.location.toLowerCase().includes(search.toLowerCase()))
  );

  const handleOpenProject = (project: any) => {
    setSelectedProject(project);
  };

  const handleBack = () => {
    setSelectedProject(null);
  };

  const resetNewProjectForm = () => {
    setNewProjectName('');
    setNewProjectCity('');
    setNewProjectUf('');
    setNewProjectNbhd('');
    setNewProjectAddr('');
    setNewProjectForum('');
  };

  const closeNewProjectModal = () => {
    setIsNewProjectModalOpen(false);
    setProjectFeedback(null);
    resetNewProjectForm();
  };

  const openNewProjectModal = () => {
    if (projectLimit !== null && projects.length >= projectLimit && user?.role !== 'SUPER_ADMIN') {
      setProjectFeedback({
        type: 'error',
        message: `Limite do plano (${projectLimit} loteamentos) atingido. Contate o administrador.`,
      });
      return;
    }
    setProjectFeedback(null);
    resetNewProjectForm();
    setIsNewProjectModalOpen(true);
  };

  const handleCreateProject = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setProjectFeedback(null);

    const projectNameStr = newProjectName.trim();
    const cityStr = newProjectCity.trim();
    const ufStr = newProjectUf.trim().toUpperCase();

    if (!projectNameStr) {
      setProjectFeedback({ type: 'error', message: 'Informe o nome do projeto.' });
      return;
    }
    if (!cityStr) {
      setProjectFeedback({ type: 'error', message: 'Informe a cidade do loteamento.' });
      return;
    }
    if (!ufStr || ufStr.length !== 2) {
      setProjectFeedback({ type: 'error', message: 'Informe a UF com 2 letras (ex: PA).' });
      return;
    }

    if (!user) {
      setProjectFeedback({ type: 'error', message: 'Sessão não carregada. Aguarde ou faça login novamente.' });
      return;
    }

    if (projectLimit !== null && projects.length >= projectLimit && user.role !== 'SUPER_ADMIN') {
      setProjectFeedback({
        type: 'error',
        message: `O limite do seu plano (${projectLimit} loteamentos) foi atingido.`,
      });
      return;
    }

    setCreatingProject(true);

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

      await loadProjects();

      setProjectFeedback({ type: 'success', message: 'Projeto criado com sucesso!' });
      setTimeout(() => {
        closeNewProjectModal();
      }, 600);
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
      setCreatingProject(false);
    }
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
      const blocksParsed = [];
      const nameChunks = text.split(/Name:\s*/i).slice(1);
      
      const zoneNum = parseInt(importTxtUtmZone.replace(/\D/g, ''));
      const proj4String = `+proj=utm +zone=${zoneNum} +south +datum=WGS84 +units=m +no_defs`;

      for (let chunk of nameChunks) {
         const name = chunk.split('\n')[0].trim();
         
         let area = 0;
         let perimeter = 0;
         let segments: any[] = [];
         let coords: number[][] = [];
         
         const areaMatch = chunk.match(/Area:\s*([0-9.]+)/i);
         if (areaMatch) area = parseFloat(areaMatch[1]);
         
         const perimeterMatch = chunk.match(/Perimeter:\s*([0-9.]+)/i);
         if (perimeterMatch) perimeter = parseFloat(perimeterMatch[1]);

         const northingMatches = [...chunk.matchAll(/North(?:ing)?\s*:\s*([0-9.]+)/ig)];
         const eastingMatches = [...chunk.matchAll(/East(?:ing)?\s*:\s*([0-9.]+)/ig)];
         const lengthMatches = [...chunk.matchAll(/Length\s*:\s*([0-9.]+)/ig)];

         const numPoints = Math.min(northingMatches.length, eastingMatches.length);
         for(let i=0; i < numPoints; i++) {
             const northing = parseFloat(northingMatches[i][1]);
             const easting = parseFloat(eastingMatches[i][1]);
             
             let seg: any = { northing, easting };
             if (i < lengthMatches.length) {
                 seg.length = parseFloat(lengthMatches[i][1]);
             }
             segments.push(seg);
             
             const [lng, lat] = proj4(proj4String, "EPSG:4326", [easting, northing]);
             coords.push([lng, lat]);
         }
         
         if (coords.length > 2) {
             const first = coords[0];
             const last = coords[coords.length - 1];
             if (first[0] !== last[0] || first[1] !== last[1]) {
                coords.push([...first]);
             }
         }
         
         blocksParsed.push({ name, area, perimeter, segments, coords });
      }

      if (blocksParsed.length === 0) {
         alert('Erro: Nenhum lote válido encontrado no arquivo TXT.');
         setImportingTxt(false);
         return;
      }

      const { data: blockCheck } = await supabase
         .from('blocks')
         .select('id')
         .eq('project_id', selectedProject.id)
         .eq('block_name', importTxtQuadra.toUpperCase().trim())
         .limit(1);

      if (blockCheck && blockCheck.length > 0) {
         alert(`Erro: A Quadra "${importTxtQuadra}" já existe neste projeto.`);
         setImportingTxt(false);
         return;
      }

      try { await supabase.rpc('reload_schema_cache'); } catch(e) {}
          
      const PRICE_PER_M2 = 0.0993035247984734; // Placeholder
      
      const blocksToInsert = blocksParsed.map((b) => {
          const finalArea = b.area;
          const finalPrice = parseFloat((finalArea * 120.00).toFixed(2));
          
          let frente = null;
          let fundo = null;
          let lado_direito = null;
          let lado_esquerdo = null;
          
          if (b.segments && b.segments.length >= 4) {
             frente = b.segments[0]?.length || null;
             lado_direito = b.segments[1]?.length || null;
             fundo = b.segments[2]?.length || null;
             lado_esquerdo = b.segments[3]?.length || null;
          }

          let geom = null;
          if (b.coords.length >= 4) {
             geom = {
                 type: "Polygon",
                 coordinates: [b.coords]
             };
          }

          return {
             project_id: selectedProject.id,
             name: importTxtQuadra.toUpperCase(),
             block_name: importTxtQuadra.toUpperCase(),
             number: b.name,
             lot_number: b.name,
             status: 'Disponível',
             area: finalArea,
             perimeter: b.perimeter,
             price: finalPrice,
             geometry: geom,
             tenant_id: finalTenantId,
             company_id: finalTenantId,
             frente: frente !== null ? Number(frente) : null,
             'Fundo': fundo !== null ? String(fundo).replace(/[^0-9.]/g, '') : null,
             'Lado Dir.': lado_direito !== null ? String(lado_direito).replace(/[^0-9.]/g, '') : null,
             'Lado Esq.': lado_esquerdo !== null ? String(lado_esquerdo).replace(/[^0-9.]/g, '') : null,
             segments_json: b.segments,
             coordinates_utm_json: b.coords,
             source_import: 'TXT_CIVIL3D'
          };
      });
      
      if (blocksToInsert.length > 0) {
          const { error: insertError } = await supabase.from('blocks').insert(blocksToInsert);
          if (insertError) throw insertError;
      }
      
      alert(`Importados ${blocksToInsert.length} lotes do TXT com sucesso!`);
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

  const handleSaveStreetGuide = async (latlngs: L.LatLng[]) => {
    if (!selectedProject || latlngs.length < 2) return;
    
    // Create LineString geojson
    const coordinates = latlngs.map(ll => [ll.lng, ll.lat]);
    const geojson = {
        type: "LineString",
        coordinates
    };

    try {
        let validTenantId = selectedProject.tenant_id;
        if (!validTenantId || validTenantId === 'MASTER-ADMIN') {
           validTenantId = selectedProject.company_id || user?.tenant_id || null;
        }

        const newGuideName = `Rua/Eixo ${streetGuides.length + 1}`;
        const tempGuide = {
            id: `temp-${Date.now()}`,
            tenant_id: validTenantId,
            project_id: selectedProject.id,
            name: newGuideName,
            geometry_geojson: geojson,
            visible: true
        };
        
        console.log('saving street guide', {
            tenant_id: validTenantId,
            project_id: selectedProject.id,
            user: user, // changed to user instead of user?.id
            role: user?.role,
            geometry_geojson: geojson
        });
        
        // Optimistic UI
        setStreetGuides(prev => [...prev, tempGuide]);
        setDrawStreetActive(false);

        const { data, error } = await supabase.from('street_guides').insert({
            tenant_id: validTenantId,
            project_id: selectedProject.id,
            name: newGuideName,
            geometry_geojson: geojson
        }).select();
        
        if (error) {
            console.error("Save street guide error:", error);
            if (error.code === 'PGRST205') {
                alert("Aviso: Tabela 'street_guides' não existe. A linha foi criada apenas localmente e pode ser usada para frentes.");
            } else {
                alert("Aviso: Erro ao salvar linha no banco (RLS?). Linha criada localmente. Detalhe: " + error.message);
            }
        } else if (data && data.length > 0) {
            setStreetGuides(prev => prev.map(g => g.id === tempGuide.id ? data[0] : g));
        }
        
    } catch (e: any) {
        console.error(e);
        alert("Aviso: Exceção ao salvar linha-guia no banco. Linha mantida localmente. " + e.message);
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

  // Se um projeto foi selecionado, exibe o Mapa
  if (selectedProject) {
    return (
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

        {/* TOP FLOATING HEADER - TOP LEFT */}
        <div className="absolute top-2 left-2 md:top-4 md:left-24 z-[400] pointer-events-auto">
          <div className="flex items-center bg-[#11141a]/95 backdrop-blur-md border border-[#2d3340] shadow-lg rounded-lg p-2 max-w-[250px]">
             <div className="flex items-center gap-2 overflow-hidden">
                <button onClick={handleBack} className="flex-shrink-0 p-1 hover:bg-[#2d3340] rounded text-gray-400 hover:text-white transition-colors" title="Voltar">
                   <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-sm font-bold text-white truncate">{selectedProject.name}</h2>
             </div>
          </div>
        </div>

        {/* GIS TOOLS VERTICAL BAR - RIGHT */}
        <div className="absolute top-16 right-2 md:top-4 md:right-4 z-[400] pointer-events-auto flex flex-col gap-1.5 items-end">
           {/* Botão toggle da barra para mobile (opcional, ou mantemos sempre visível pois é fino) */}
           <div className="bg-[#11141a]/95 backdrop-blur-md border border-[#2d3340] py-1.5 px-1.5 rounded-lg shadow-lg flex flex-col gap-1.5 w-10 md:w-12 items-center">
             
             {user?.role !== 'BROKER' && (
               <>
                 {/* Import */}
                 <button 
                    onClick={() => setIsImportModalOpen(true)} 
                    className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#4999e9] transition-colors group relative"
                 >
                    <Upload className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Importar Quadras (KML)</span>
                 </button>

                 <button 
                    onClick={() => setIsImportTxtModalOpen(true)} 
                    className="w-full aspect-square flex items-center justify-center rounded-md bg-transparent hover:bg-gray-800 text-gray-400 hover:text-[#4999e9] transition-colors group relative"
                 >
                    <FolderOpen className="w-4 h-4 md:w-5 md:h-5" />
                    <span className="absolute right-full mr-2 px-2 py-1 bg-[#1a1f29] border border-[#2d3340] text-[10px] font-bold text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none uppercase">Importar Quadras (TXT)</span>
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
            streetGuides={streetGuides}
            streetGuidesVisible={streetGuidesVisible}
            drawStreetActive={drawStreetActive}
            onSaveStreetGuide={handleSaveStreetGuide}
            onDeleteStreetGuide={handleDeleteStreetGuide}
          />
        </div>

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
                 </form>
              </div>
           </div>
        )}
      </div>
    );
  }

  // Lista de Projetos (quando map não está selecionado)
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full fade-in-up">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mapa GIS & Projetos</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider flexitems-center gap-2">
            Gestão Unificada de Loteamentos
            {user?.role !== 'SUPER_ADMIN' && (
               <span className="ml-3 px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                 Projetos: {projects.length} / {projectLimit === null ? 'Ilimitado' : projectLimit}
               </span>
            )}
          </p>
        </div>
        {user?.role !== 'BROKER' && (
          <button 
            onClick={openNewProjectModal}
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
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {filteredProjects.map(p => (
                 <ProjectCard 
                   key={p.id} 
                   project={p} 
                   user={user}
                   onOpen={() => handleOpenProject(p)} 
                   onDelete={() => handleDeleteProject(p.id)}
                 />
               ))}
             </div>
          ) : (
             <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                 Nenhum projeto encontrado.
             </div>
          )}
        </div>
      </div>

      {/* Modal Novo Projeto */}
      {isNewProjectModalOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl fade-in-up max-h-[90vh] flex flex-col">
               <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
                  <h3 className="font-bold text-white text-lg">Novo Projeto</h3>
                  <button type="button" onClick={closeNewProjectModal} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>
               <form
                 onSubmit={handleCreateProject}
                 className="p-6 flex flex-col gap-4 overflow-y-auto"
               >
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
                     <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Nome do Projeto *</label>
                     <input 
                       type="text" required
                       value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                       placeholder="Ex: Loteamento Bosque das Árvores"
                       className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Cidade *</label>
                       <input 
                         type="text" required
                         value={newProjectCity} onChange={e => setNewProjectCity(e.target.value)}
                         placeholder="Ex: Parauapebas"
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                       />
                    </div>
                    <div>
                       <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">UF *</label>
                       <input 
                         type="text" required maxLength={2}
                         value={newProjectUf} onChange={e => setNewProjectUf(e.target.value.toUpperCase())}
                         placeholder="Ex: PA"
                         className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)] uppercase"
                       />
                    </div>
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Bairro/Localidade</label>
                     <input 
                       type="text"
                       value={newProjectNbhd} onChange={e => setNewProjectNbhd(e.target.value)}
                       placeholder="Ex: Centro"
                       className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Endereço/Referência</label>
                     <input 
                       type="text"
                       value={newProjectAddr} onChange={e => setNewProjectAddr(e.target.value)}
                       placeholder="Endereço principal da área"
                       className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                     />
                  </div>
                  <div>
                     <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Município / Foro do Contrato</label>
                     <input 
                       type="text"
                       value={newProjectForum} onChange={e => setNewProjectForum(e.target.value)}
                       placeholder="Ex: Parauapebas (Deixe vazio para usar a cidade)"
                       className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                     />
                  </div>

                  <button 
                     type="submit" 
                     disabled={creatingProject}
                     className="w-full shrink-0 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                  >
                     {creatingProject ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Criar Projeto'}
                  </button>
               </form>
            </div>
         </div>
      )}
    </div>
  );
}

function ProjectCard({ project, user, onOpen, onDelete }: { project: any, user: any, onOpen: () => void, onDelete: () => void }) {
  const total = project.blocks?.length || 0;
  const sold = project.blocks?.filter((l: any) => l.status === 'Vendido').length || 0;
  const hasGis = project.blocks?.some((l: any) => l.geometry != null) || false;
  const pct = total > 0 ? (sold / total) * 100 : 0;

  return (
    <div className="bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-primary)]/50 transition-colors group flex flex-col">
       <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
             <div className="w-12 h-12 rounded-lg bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-primary)] border border-[var(--color-border)]">
               <FolderOpen className="w-6 h-6" />
             </div>
             <div>
                <h3 className="font-bold text-white text-lg leading-tight">{project.name}</h3>
                <p className="text-xs font-mono text-[var(--color-text-muted)] uppercase mt-1">{project.location || 'Sem localização'}</p>
             </div>
          </div>
          {user?.role !== 'BROKER' && (
            <div className="flex items-center gap-1">
               <button title="Editar" className="p-2 text-[var(--color-text-muted)] hover:text-white transition-colors">
                 <Edit2 className="w-4 h-4" />
               </button>
               <button title="Excluir" onClick={onDelete} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors">
                 <Trash2 className="w-4 h-4" />
               </button>
            </div>
          )}
       </div>

       <div className="mt-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Progresso de Vendas</span>
            <span className="text-xs font-mono text-white">{sold} / {total}</span>
          </div>
          <div className="w-full h-2 bg-[var(--color-surface)] rounded-full overflow-hidden mb-4 border border-[var(--color-border)]">
             <div className="h-full bg-[var(--color-primary)]" style={{ width: `${pct}%` }} />
          </div>

          <div className="flex items-center justify-between">
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
              onClick={onOpen}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
            >
              <MapIcon className="w-4 h-4" /> Abrir Mapa
            </button>
          </div>
       </div>
    </div>
  );
}
