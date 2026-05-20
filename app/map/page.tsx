'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, FolderOpen, MoreVertical, Edit2, Trash2, Loader2, ArrowLeft, Upload, Navigation, Map as MapIcon, Ruler, X, ChevronDown, ChevronUp } from 'lucide-react';
import { area as turfArea } from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import { calculateLotDimensions } from '@/utils/calculateLotDimensions';

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

export default function MapPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  // KML Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importQuadra, setImportQuadra] = useState('');
  const [importLoteInicial, setImportLoteInicial] = useState('1');
  const [importOrdem, setImportOrdem] = useState<'ASC'|'DESC'>('ASC');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

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
       // Only dynamically import turf logic to avoid SSR issues if necessary or just await import
       const turfHelpers = await import('@turf/helpers');
       const turfNearestOnLine = await import('@turf/nearest-point-on-line');
       const turfDistance = await import('@turf/distance');
       const { extractSegments, detectSides, normalizeDimensions } = await import('@/utils/calculateLotDimensions');

       // 1. Load all blocks from this project
       const { data: blocks, error } = await supabase.from('blocks').select('*').eq('project_id', selectedProject.id);
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
                  frente: updateObj.frente,
                  fundo: updateObj.fundo,
                  lado_direito: updateObj.lado_direito,
                  lado_esquerdo: updateObj.lado_esquerdo,
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

  useEffect(() => {
    async function loadProjects() {
      if (!user) return;
      try {
        const { data, error } = await supabase.from('projects').select('*, blocks(status, geometry)').order('created_at', { ascending: false });
        
        if (error) {
           console.warn("Error fetching projects:", error);
           setProjects([]);
           return;
        }
        
        setProjects(data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    if (!authLoading) {
      loadProjects();
    }
  }, [user, authLoading]);

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

  const handleCreateProject = async (e?: React.FormEvent | any) => {
    if (e && e.preventDefault) e.preventDefault();
    const projectNameStr = newProjectName.trim();
    if (!projectNameStr) return;
    setCreatingProject(true);
    
    try {
      let createTenantId = user?.tenant_id;
      if (!createTenantId) {
        const { data: userData } = await supabase.from('users').select('tenant_id').eq('id', user?.id).single();
        if (userData?.tenant_id) {
            createTenantId = userData.tenant_id;
        }
      }
      
      const isMasterAdmin = user?.email === 'severino@nortesultopografia.com.br' || user?.email === 'nortesultopografiapara@gmail.com' || user?.role === 'SUPER_ADMIN';
      if (!createTenantId && isMasterAdmin) {
          createTenantId = null;
      }
      
      const { error } = await supabase.from('projects').insert([{ 
        name: projectNameStr,
        city: newProjectCity.trim() || null,
        uf: newProjectUf.trim().toUpperCase() || null,
        neighborhood: newProjectNbhd.trim() || null,
        address: newProjectAddr.trim() || null,
        forum_city: newProjectForum.trim() || null,
        tenant_id: createTenantId 
      }]);

      if (error) {
         throw error;
      }
      
      const { data: updatedProjects } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (updatedProjects) {
         setProjects(updatedProjects);
      }
      
      setIsNewProjectModalOpen(false);
      setNewProjectName('');
      setNewProjectCity('');
      setNewProjectUf('');
      setNewProjectNbhd('');
      setNewProjectAddr('');
      setNewProjectForum('');
      
    } catch (err: any) {
      console.error(err);
      alert('Erro ao criar projeto: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Tem certeza que deseja excluir este projeto?")) return;
    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId);
      if (error) throw error;
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
      if (tenantId === 'MASTER-ADMIN') {
        tenantId = null;
      }
      
      const text = await importFile.text();
      const geometries = parseKML(text);
      
      if (geometries.length === 0) {
         alert('Nenhum polígono ou linha encontrado no arquivo KML.');
         setImporting(false);
         return;
      }

      let finalTenantId = tenantId;
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
             frente: dims.frente,
             fundo: dims.fundo,
             lado_direito: dims.ladoD,
             lado_esquerdo: dims.ladoE
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
        {/* Top Floating Header inside Map */}
        <div className="absolute top-2 left-2 right-2 md:top-4 md:left-24 md:right-auto md:w-96 z-[400] pointer-events-none flex flex-col gap-1.5 md:gap-2">
          
          <div className="flex items-center justify-between pointer-events-auto bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-lg p-2 shadow-sm">
             <div className="flex items-center gap-2 overflow-hidden">
                <button onClick={handleBack} className="flex-shrink-0 p-1.5 hover:bg-[var(--color-border)] rounded-md text-[var(--color-text-muted)] hover:text-white transition-colors">
                   <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-sm font-bold text-white truncate">{selectedProject.name}</h2>
             </div>
             <button 
                onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
                className="flex-shrink-0 p-1.5 hover:bg-[var(--color-border)] rounded-md text-[var(--color-text-muted)] hover:text-white transition-colors"
                title={isMobilePanelOpen ? "Recolher painel" : "Expandir painel"}
             >
                {isMobilePanelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
             </button>
          </div>

          <div className={`bg-[var(--color-surface)]/95 backdrop-blur-md rounded-lg shadow-lg pointer-events-auto transition-all duration-300 md:border md:border-[var(--color-border)] md:overflow-y-auto ${isMobilePanelOpen ? 'p-3 border border-[var(--color-border)]' : 'max-h-0 opacity-0 overflow-hidden border-transparent md:max-h-[800px] md:opacity-100 md:p-3'}`}>
             <div className="flex flex-row justify-between items-start mb-3 hidden md:flex">
               <div>
                  <h2 className="text-sm font-bold text-white mb-0.5">Painel Operacional</h2>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">Ferramentas GIS</p>
               </div>
             </div>
            
            <div className="flex flex-row md:grid md:grid-cols-2 gap-2 flex-wrap pb-1">
              <button 
                onClick={() => setIsImportModalOpen(true)} 
                className="flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] text-[var(--color-text-muted)] transition-colors"
                title="Importar Quadras"
              >
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">Importar</span>
              </button>
              
              <button 
                onClick={() => setGpsActive(!gpsActive)} 
                className={`flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 border rounded-lg transition-colors ${gpsActive ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]' : 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[#10b981] hover:text-[#10b981]'}`}
                title="Navegação GPS"
              >
                <Navigation className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">GPS</span>
              </button>
              
              <button 
                onClick={() => setMeasureActive(!measureActive)} 
                className={`flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 border rounded-lg transition-colors ${measureActive ? 'bg-[var(--color-info)]/10 border-[var(--color-info)] text-[var(--color-info)]' : 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-info)] hover:text-[var(--color-info)]'}`}
                title="Medição"
              >
                <Ruler className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">Medição</span>
              </button>

              <button 
                onClick={() => {
                   if (activeLayer === 'satellite') setActiveLayer('streets');
                   else if (activeLayer === 'streets') setActiveLayer('dark');
                   else setActiveLayer('satellite');
                }} 
                className="flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:border-[#f59e0b] hover:text-[#f59e0b] text-[var(--color-text-muted)] transition-colors"
                title={`Estilo atual: ${activeLayer}`}
              >
                <MapIcon className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">
                   {activeLayer === 'satellite' ? 'Satélite' : activeLayer === 'streets' ? 'Vetor' : 'Dark Mode'}
                </span>
              </button>
            </div>

            <div className="hidden lg:flex flex-col gap-2 pt-3 mt-3 border-t border-[var(--color-border)]">
              <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Ruas & Frentes</span>
              <div className="grid grid-cols-2 gap-2">
                 <button 
                   onClick={() => setDrawStreetActive(!drawStreetActive)} 
                   className={`flex items-center justify-center gap-2 p-2.5 border rounded-lg transition-colors ${drawStreetActive ? 'bg-[#10b981]/10 border-[#10b981] text-[#10b981]' : 'bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[#10b981] hover:text-[#10b981]'}`}
                   title="Linha de Rua"
                 >
                   <span className="text-[10px] font-bold uppercase tracking-wider">Linha de Rua</span>
                 </button>
                 <button 
                   onClick={handleIdentifyFronts} 
                   className="flex items-center justify-center gap-2 p-2.5 bg-[var(--color-primary)]/10 border border-[var(--color-primary)] rounded-lg hover:bg-[var(--color-primary)] text-[var(--color-primary)] hover:text-white transition-colors"
                   title="Identificar Frentes"
                 >
                   <span className="text-[10px] font-bold uppercase tracking-wider">Identificar Frentes</span>
                 </button>
                 <button 
                   onClick={() => setStreetGuidesVisible(!streetGuidesVisible)} 
                   className="col-span-2 flex items-center justify-center gap-2 p-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:border-[#f59e0b] hover:text-[#f59e0b] text-[var(--color-text-muted)] transition-colors"
                   title={streetGuidesVisible ? "Ocultar Linhas" : "Mostrar Linhas"}
                 >
                   <span className="text-[10px] font-bold uppercase tracking-wider">{streetGuidesVisible ? "Ocultar Linhas" : "Mostrar Linhas"}</span>
                 </button>
              </div>
            </div>

            <div className="flex flex-row md:flex-col gap-3 md:gap-2 pt-3 mt-3 md:pt-4 md:mt-4 border-t border-[var(--color-border)] overflow-x-auto">
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#22c55e] border border-[#16a34a]" /> Disponível
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#eab308] border border-[#ca8a04]" /> Reservado
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#ef4444] border border-[#dc2626]" /> Vendido
              </div>
            </div>
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
      </div>
    );
  }

  // Lista de Projetos (quando map não está selecionado)
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 flex flex-col h-full fade-in-up">
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mapa GIS & Projetos</h1>
          <p className="text-sm font-mono text-[var(--color-text-muted)] uppercase tracking-wider">
            Gestão Unificada de Loteamentos
          </p>
        </div>
        <button 
          onClick={() => setIsNewProjectModalOpen(true)}
          className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Projeto
        </button>
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
                  <button onClick={() => setIsNewProjectModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>
               <div className="p-6 flex flex-col gap-4 overflow-y-auto">
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
                     type="button" 
                     onClick={handleCreateProject}
                     disabled={creatingProject || !newProjectName.trim() || !newProjectCity.trim() || !newProjectUf.trim()}
                     className="w-full shrink-0 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                  >
                     {creatingProject ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Criar Projeto'}
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onOpen, onDelete }: { project: any, onOpen: () => void, onDelete: () => void }) {
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
          <div className="flex items-center gap-1">
             <button title="Editar" className="p-2 text-[var(--color-text-muted)] hover:text-white transition-colors">
               <Edit2 className="w-4 h-4" />
             </button>
             <button title="Excluir" onClick={onDelete} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors">
               <Trash2 className="w-4 h-4" />
             </button>
          </div>
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
