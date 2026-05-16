'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Search, FolderOpen, MoreVertical, Edit2, Trash2, Loader2, ArrowLeft, Upload, Navigation, Map as MapIcon, Ruler, X } from 'lucide-react';

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
  const placemarks = xmlDoc.getElementsByTagName("Placemark");
  const geometries: any[] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const coordinatesNode = placemark.querySelector('LineString coordinates') || placemark.querySelector('Polygon coordinates');
    
    if (coordinatesNode && coordinatesNode.textContent) {
      const coordsText = coordinatesNode.textContent.trim();
      if (!coordsText) continue;
      
      const coordsArray = coordsText.replace(/\r?\n|\r/g, " ").split(/\s+/).filter(Boolean).map(pair => {
         if (!pair || !pair.includes(',')) return [0, 0];
         const parts = pair.split(',');
         const lng = parseFloat(parts[0]) || 0;
         const lat = parseFloat(parts[1]) || 0;
         return [lng, lat];
      }).filter(c => c[0] !== 0 || c[1] !== 0);
      
      const isPolygon = placemark.querySelector('Polygon') !== null;

      if (isPolygon) {
         // Fix rings for polygon
         if (coordsArray.length > 0) {
            const first = coordsArray[0];
            const last = coordsArray[coordsArray.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) {
               coordsArray.push([...first]);
            }
         }
         geometries.push({
           type: "Polygon",
           coordinates: [coordsArray]
         });
      } else {
         geometries.push({
           type: "LineString",
           coordinates: coordsArray
         });
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
  const [creatingProject, setCreatingProject] = useState(false);

  const [mapRefreshKey, setMapRefreshKey] = useState(0);

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
      const { error } = await supabase.from('projects').insert([{ name: projectNameStr, tenant_id: 'MASTER-ADMIN' }]);

      if (error) {
         throw error;
      }
      
      const { data: updatedProjects } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (updatedProjects) {
         setProjects(updatedProjects);
      }
      
      setIsNewProjectModalOpen(false);
      setNewProjectName('');
      
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
        tenantId = 'MASTER-ADMIN';
      }

      if (!tenantId) {
        alert("Erro: Não foi possível identificar a empresa vinculada à sua conta.");
        return;
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
          
      // Preparar inserção na tabela blocks
      let currentNumber = parseInt(importLoteInicial, 10) || 1;
      const blocksToInsert = geometries.map((geom, index) => {
          const numberStr = (importOrdem === 'ASC' ? currentNumber + index : currentNumber - index).toString();
          return {
             project_id: selectedProject.id,
             name: importQuadra.toUpperCase(),
             block_name: importQuadra.toUpperCase(),
             number: numberStr,
             geometry: geom,
             tenant_id: finalTenantId
          };
      });
      
      if (blocksToInsert.length > 0) {
          const { error: insertError } = await supabase.from('blocks').insert(blocksToInsert);
          if (insertError) throw insertError;
      }
      
      alert(`Importados ${blocksToInsert.length} elementos geográficos com sucesso!`);
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

  // Se um projeto foi selecionado, exibe o Mapa
  if (selectedProject) {
    return (
      <div className="flex-1 w-full h-full flex flex-col pt-0 relative bg-[var(--color-background)]">
        {/* Top Floating Header inside Map */}
        <div className="absolute top-4 left-4 right-4 md:left-24 md:right-auto md:w-96 z-[400] pointer-events-none flex flex-col gap-2">
          
          <div className="flex items-center justify-between mb-2 pointer-events-auto">
             <div className="flex items-center gap-2">
                <button onClick={handleBack} className="p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full text-[var(--color-text-muted)] hover:text-white transition-colors shadow-lg">
                   <ArrowLeft className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold text-white shadow-sm drop-shadow-md">{selectedProject.name}</h2>
             </div>
             <button 
                onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
                className="md:hidden p-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full text-[var(--color-text-muted)] hover:text-white transition-colors shadow-lg"
             >
                <MoreVertical className="w-5 h-5" />
             </button>
          </div>

          <div className={`bg-[var(--color-surface)]/95 backdrop-blur-md rounded-xl shadow-lg pointer-events-auto transition-all duration-300 md:border md:border-[var(--color-border)] ${isMobilePanelOpen ? 'p-4 border border-[var(--color-border)]' : 'max-h-0 opacity-0 overflow-hidden border-transparent md:max-h-[500px] md:opacity-100 md:p-4'}`}>
             <div className="flex flex-row justify-between items-start mb-4">
               <div>
                  <h2 className="text-base font-bold text-white mb-1">Painel Operacional</h2>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">Ferramentas GIS</p>
               </div>
               <button onClick={() => setIsMobilePanelOpen(false)} className="md:hidden text-[var(--color-text-muted)] hover:text-white p-1 -mr-2 -mt-2">
                  <X className="w-5 h-5"/>
               </button>
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
                onClick={() => {
                  setMeasureActive(!measureActive);
                  alert(measureActive ? 'Modo de medição desativado' : 'Modo de medição ativado. Clique no mapa para desenhar polígonos ou traçar distâncias.');
                }} 
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
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-full max-w-sm overflow-hidden shadow-2xl fade-in-up">
               <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                  <h3 className="font-bold text-white text-lg">Novo Projeto</h3>
                  <button onClick={() => setIsNewProjectModalOpen(false)} className="text-[var(--color-text-muted)] hover:text-white transition-colors">
                     <X className="w-5 h-5" />
                  </button>
               </div>
               <div className="p-6 flex flex-col gap-4">
                  <div>
                     <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Nome do Projeto</label>
                     <input 
                       type="text" required
                       value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
                       onKeyDown={(e) => { if(e.key === 'Enter') handleCreateProject(e as any) }}
                       placeholder="Ex: Loteamento Bosque das Árvores"
                       className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                     />
                  </div>

                  <button 
                     type="button" 
                     onClick={handleCreateProject}
                     disabled={creatingProject}
                     className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white font-bold py-3 mt-4 rounded-lg transition-colors flex justify-center items-center gap-2"
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
  const sold = project.blocks?.filter((l: any) => l.status === 'SOLD').length || 0;
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
