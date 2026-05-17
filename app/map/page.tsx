"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus,
  Search,
  FolderOpen,
  MoreVertical,
  Edit2,
  Trash2,
  Loader2,
  ArrowLeft,
  Upload,
  Navigation,
  Map as MapIcon,
  Ruler,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { area as turfArea } from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";

const GISMap = dynamic(() => import("@/components/map/GISMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--color-background)]">
      <div className="w-8 h-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-4" />
      <span className="font-mono text-sm uppercase tracking-wider text-[var(--color-text-muted)]">
        Carregando Motor GIS...
      </span>
    </div>
  ),
});

// XML/KML Parser Utility
function parseKML(xmlString: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const geometries: any[] = [];

  const extractCoords = (text: string) => {
    return text
      .replace(/\r?\n|\r/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .map((pair) => {
        if (!pair || !pair.includes(",")) return [0, 0];
        const parts = pair.split(",");
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        return [Number.isNaN(lng) ? 0 : lng, Number.isNaN(lat) ? 0 : lat];
      })
      .filter((c) => c[0] !== 0 || c[1] !== 0);
  };

  const extractProperties = (node: Element) => {
    const props: any = {};
    const nameNode = node.getElementsByTagName("name")[0];
    if (nameNode && nameNode.textContent)
      props.name = nameNode.textContent.trim();

    const descNode = node.getElementsByTagName("description")[0];
    if (descNode && descNode.textContent)
      props.description = descNode.textContent.trim();

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
              geometries.push({
                type: "Polygon",
                coordinates: [coords],
                properties,
              });
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
            if (coords.length >= 2) {
              geometries.push({
                type: "LineString",
                coordinates: coords,
                properties,
              });
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
            geometries.push({
              type: "Polygon",
              coordinates: [coords],
              properties: {},
            });
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
          if (coords.length >= 2) {
            geometries.push({
              type: "LineString",
              coordinates: coords,
              properties: {},
            });
          }
        }
      }
    }
  }

  return geometries;
}

export default function MapPage() {
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProject, setSelectedProject] = useState<any | null>(null);

  // KML Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importQuadra, setImportQuadra] = useState("");
  const [importLoteInicial, setImportLoteInicial] = useState("1");
  const [importOrdem, setImportOrdem] = useState<"ASC" | "DESC">("ASC");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  // Map Tools States
  const [activeLayer, setActiveLayer] = useState<
    "streets" | "satellite" | "dark"
  >("satellite");
  const [gpsActive, setGpsActive] = useState(false);
  const [measureActive, setMeasureActive] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);

  // New Project States
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const [mapRefreshKey, setMapRefreshKey] = useState(0);

  useEffect(() => {
    async function loadProjects() {
      if (!user) return;
      try {
        let query = supabase
          .from("projects")
          .select("*, blocks(status, geometry)")
          .order("created_at", { ascending: false });

        if (user.tenant_id) {
          query = query.eq("company_id", user.tenant_id);
        } else {
          // Se não tiver tenant_id, não mostra nenhum projeto por segurança (ou de outras empresas)
          query = query.eq(
            "company_id",
            "00000000-0000-0000-0000-000000000000",
          );
        }

        const { data, error } = await query;

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

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.location && p.location.toLowerCase().includes(search.toLowerCase())),
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

    if (!user?.tenant_id) {
      alert(
        "Erro: Empresa não identificada no seu usuário. Faça login novamente.",
      );
      setCreatingProject(false);
      return;
    }

    try {
      const { error } = await supabase.from("projects").insert([
        {
          name: projectNameStr,
          company_id: user.tenant_id,
        },
      ]);

      if (error) {
        throw error;
      }

      let updatedQuery = supabase
        .from("projects")
        .select("*, blocks(status, geometry)")
        .order("created_at", { ascending: false });
      if (user && user.tenant_id) {
        updatedQuery = updatedQuery.eq("company_id", user.tenant_id);
      } else {
        updatedQuery = updatedQuery.eq(
          "company_id",
          "00000000-0000-0000-0000-000000000000",
        );
      }
      const { data: updatedProjects } = await updatedQuery;
      if (updatedProjects) {
        setProjects(updatedProjects);
      }

      setIsNewProjectModalOpen(false);
      setNewProjectName("");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao criar projeto: " + (err.message || "Erro desconhecido"));
    } finally {
      setCreatingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm("Tem certeza que deseja excluir este projeto?")) return;
    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", projectId);
      if (error) throw error;
      setProjects(projects.filter((p) => p.id !== projectId));
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
        const { data: userData } = await supabase
          .from("users")
          .select("tenant_id")
          .eq("id", user.id)
          .single();
        if (userData?.tenant_id) {
          tenantId = userData.tenant_id;
        }
      }

      const isMasterAdmin =
        user.email === "severino@nortesultopografia.com.br" ||
        user.email === "nortesultopografiapara@gmail.com" ||
        user.role === "SUPER_ADMIN";

      // Fallback para o Super Admin
      if (!tenantId && isMasterAdmin) {
        tenantId = "MASTER-ADMIN";
      }

      if (!tenantId) {
        alert(
          "Erro: Não foi possível identificar a empresa vinculada à sua conta.",
        );
        return;
      }

      const text = await importFile.text();
      let geometries: any[] = [];
      const extension = importFile.name.split(".").pop()?.toLowerCase();

      if (extension === "geojson" || extension === "json") {
        try {
          const geojson = JSON.parse(text);
          const features =
            geojson.features || (geojson.type === "Feature" ? [geojson] : []);
          geometries = features
            .map((f: any) => ({
              type: f.geometry?.type,
              coordinates: f.geometry?.coordinates,
              properties: f.properties || {},
            }))
            .filter(
              (g: any) => g.type === "Polygon" || g.type === "LineString",
            );
        } catch (err) {
          console.error("GeoJSON parse error", err);
        }
      } else {
        geometries = parseKML(text);
      }

      if (geometries.length === 0) {
        alert("Nenhum polígono ou linha encontrado no arquivo.");
        setImporting(false);
        return;
      }

      let finalTenantId = tenantId;
      try {
        await supabase.rpc("reload_schema_cache");
      } catch (e) {}

      // Utility to calculate distance between coords in meters
      const haversineDist = (p1: number[], p2: number[]) => {
        const r = 6371000;
        const p1lat = (p1[1] * Math.PI) / 180;
        const p2lat = (p2[1] * Math.PI) / 180;
        const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
        const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(p1lat) *
            Math.cos(p2lat) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return r * c;
      };

      // Extract all polygon coordinates for checking externals
      const allPolys = geometries
        .filter((g) => g.type === "Polygon" && g.coordinates)
        .map((g) => g.coordinates[0]);

      // Extract all line coordinates for checking frontage against streets
      const allLines = geometries
        .filter((g) => g.type === "LineString" && g.coordinates)
        .map((g) => g.coordinates);

      const getLotDimensions = (coords: number[][], geomProps: any) => {
        let result = {
          frente: null as number | null,
          fundo: null as number | null,
          ladoD: null as number | null,
          ladoE: null as number | null,
          frente_oficial: null as string | null,
          fundo_oficial: null as string | null,
          dir_oficial: null as string | null,
          esq_oficial: null as string | null,
          area_oficial: null as number | null,
        };
        if (!coords || coords.length < 4) return result;

        // Priorizar Metadados do KML (ExtendedData, description, etc) -> Oficial
        const extractProp = (keys: string[]) => {
          // 1. Procurar nas chaves de propriedades (ExtendedData / SimpleData fields)
          for (let key of keys) {
            for (let prop in geomProps) {
              if (prop.toUpperCase().includes(key)) {
                const valStr = geomProps[prop];
                if (typeof valStr === "string" || typeof valStr === "number") {
                  const match = String(valStr).match(/^[\d.,]+/);
                  if (match) {
                    return match[0] + " m";
                  }
                }
              }
            }
          }

          // 2. Procurar dentro do texto do bloco <description>
          if (
            geomProps.description &&
            typeof geomProps.description === "string"
          ) {
            for (let key of keys) {
              // Exemplo: 'FRENTE: 10,5' ou 'LADO DIR 25 m'
              const regex = new RegExp(key + "\\s*[:=]?\\s*([\\d.,]+)", "i");
              const match = geomProps.description.match(regex);
              if (match && match[1]) {
                return match[1] + " m";
              }
            }
          }

          return null;
        };

        const extractNumber = (keys: string[]) => {
          for (let key of keys) {
            for (let prop in geomProps) {
              if (prop.toUpperCase().includes(key)) {
                const valStr = geomProps[prop];
                if (typeof valStr === "string" || typeof valStr === "number") {
                  const match = String(valStr).match(/^[\d.,]+/);
                  if (match) {
                    const val = parseFloat(match[0].replace(",", "."));
                    if (!isNaN(val) && val > 0) return val;
                  }
                }
              }
            }
          }
          if (geomProps.description && typeof geomProps.description === "string") {
            for (let key of keys) {
              const regex = new RegExp(key + "\\s*[:=]?\\s*([\\d.,]+)", "i");
              const match = geomProps.description.match(regex);
              if (match && match[1]) {
                const val = parseFloat(match[1].replace(",", "."));
                if (!isNaN(val) && val > 0) return val;
              }
            }
          }
          return null;
        };

        result.frente_oficial = extractProp(["FRENTE", "FRONT"]);
        result.fundo_oficial = extractProp(["FUNDO", "BACK"]);
        result.dir_oficial = extractProp([
          "DIR",
          "DIREITA",
          "LADO_DIR",
          "LDIREITO",
          "COMPR_DIR",
          "COMPRIMENTO_DIR",
          "LAT_DIR",
        ]);
        result.esq_oficial = extractProp([
          "ESQ",
          "ESQUERDA",
          "LADO_ESQ",
          "LESQUERDO",
          "COMPR_ESQ",
          "MEDIDA_ESQ",
          "LAT_ESQ",
        ]);
        result.area_oficial = extractNumber(["AREA", "AREA_M2", "SUPERFICIE"]);

        // Fallback: Classificação de Lados por Orientação a Partir da Via Pública (Rua)
        const FATOR_CORRECAO_HORIZ = 0.9984089101034208;
        const FATOR_CORRECAO_VERT = 0.996941;

        const segments = [];
        let cx = 0,
          cy = 0;
        for (let i = 0; i < coords.length - 1; i++) {
          cx += coords[i][0];
          cy += coords[i][1];
          const rawLength = haversineDist(coords[i], coords[i + 1]);
          const mx = (coords[i][0] + coords[i + 1][0]) / 2;
          const my = (coords[i][1] + coords[i + 1][1]) / 2;
          segments.push({
            p1: coords[i],
            p2: coords[i + 1],
            rawLength,
            mx,
            my,
          });
        }
        cx /= Math.max(1, coords.length - 1);
        cy /= Math.max(1, coords.length - 1);

        // Definir Segmento da Frente (mais próximo a uma linha de arruamento ou mais externo)
        let frenteSeg = null;
        let minLineDist = Infinity;

        for (let s of segments) {
          let touchesLine = false;
          for (let lineItem of allLines) {
            for (let i = 0; i < lineItem.length; i++) {
              const d1 = haversineDist([s.mx, s.my], lineItem[i]);
              if (d1 < minLineDist) {
                minLineDist = d1;
                touchesLine = true;
              }
            }
          }
        }

        if (minLineDist < 10) {
          // dentro de 10m de uma via
          for (let s of segments) {
            for (let lineItem of allLines) {
              for (let i = 0; i < lineItem.length; i++) {
                const d = haversineDist([s.mx, s.my], lineItem[i]);
                if (d === minLineDist) frenteSeg = s;
              }
            }
          }
        }

        if (!frenteSeg) {
          // Fallback to max distance from centroid
          let maxD = -1;
          for (let s of segments) {
            let d = Math.sqrt(Math.pow(s.mx - cx, 2) + Math.pow(s.my - cy, 2));
            if (d > maxD) {
              maxD = d;
              frenteSeg = s;
            }
          }
        }

        let fmx = frenteSeg!.mx;
        let fmy = frenteSeg!.my;

        // Centroid to front midpoint
        let vxFront = fmx - cx;
        let vyFront = fmy - cy;
        let vLen = Math.sqrt(vxFront * vxFront + vyFront * vyFront);
        if (vLen === 0) {
          vxFront = 0;
          vyFront = 1;
          vLen = 1;
        }
        vxFront /= vLen;
        vyFront /= vLen;

        // Clockwise directions relative to Front vector
        let dirFrente = { x: vxFront, y: vyFront };
        let dirFundo = { x: -vxFront, y: -vyFront };
        let dirDir = { x: vyFront, y: -vxFront }; // Right (looking at front, rotate +90 deg clockwise)
        let dirEsq = { x: -vyFront, y: vxFront }; // Left

        let somaFrente = 0;
        let somaFundo = 0;
        let somaDir = 0;
        let somaEsq = 0;

        for (let s of segments) {
          let vx = s.mx - cx;
          let vy = s.my - cy;

          let sLen = Math.sqrt(vx * vx + vy * vy);
          if (sLen === 0) continue;
          vx /= sLen;
          vy /= sLen;

          let dotFrente = vx * dirFrente.x + vy * dirFrente.y;
          let dotFundo = vx * dirFundo.x + vy * dirFundo.y;
          let dotDir = vx * dirDir.x + vy * dirDir.y;
          let dotEsq = vx * dirEsq.x + vy * dirEsq.y;

          let maxDot = Math.max(dotFrente, dotFundo, dotDir, dotEsq);

          if (maxDot === dotFrente) somaFrente += s.rawLength;
          else if (maxDot === dotFundo) somaFundo += s.rawLength;
          else if (maxDot === dotDir) somaDir += s.rawLength;
          else somaEsq += s.rawLength;
        }

        result.frente =
          Math.round(somaFrente * FATOR_CORRECAO_HORIZ * 100) / 100;
        result.fundo = Math.round(somaFundo * FATOR_CORRECAO_HORIZ * 100) / 100;
        result.ladoD = Math.round(somaDir * FATOR_CORRECAO_VERT * 100) / 100;
        result.ladoE = Math.round(somaEsq * FATOR_CORRECAO_VERT * 100) / 100;

        return result;
      };

      // Preparar inserção na tabela blocks
      const PRICE_PER_M2 = 0.0993035247984734;
      let currentNumber = parseInt(importLoteInicial, 10) || 1;
      const blocksToInsert = geometries.map((geom, index) => {
        const numberStr = (
          importOrdem === "ASC" ? currentNumber + index : currentNumber - index
        ).toString();

        let calcArea = 0;
        let dims = {
          frente: null as number | null,
          fundo: null as number | null,
          ladoD: null as number | null,
          ladoE: null as number | null,
          frente_oficial: null as string | null,
          fundo_oficial: null as string | null,
          dir_oficial: null as string | null,
          esq_oficial: null as string | null,
          area_oficial: null as number | null,
        };
        if (
          geom.type === "Polygon" &&
          geom.coordinates &&
          geom.coordinates[0].length >= 4
        ) {
          try {
            const poly = turfPolygon(geom.coordinates);
            const areaCalculada = turfArea(poly);
            const areaRealCorrigida = areaCalculada * 0.9952546259435014;
            calcArea = areaRealCorrigida;

            dims = getLotDimensions(geom.coordinates[0], geom.properties || {});
          } catch (e) {
            console.error("Error calculating area:", e);
          }
        }

        if (calcArea <= 0) calcArea = 2500; // Fallback

        // area oficial has priority
        let finalArea = parseFloat(calcArea.toFixed(2));
        if (dims.area_oficial !== null) {
          finalArea = dims.area_oficial;
        }

        const finalPrice = parseFloat((finalArea * PRICE_PER_M2).toFixed(2));

        const blockObj: any = {
          project_id: selectedProject.id,
          name: importQuadra.toUpperCase(),
          block_name: importQuadra.toUpperCase(),
          number: numberStr,
          lot_number: numberStr,
          status: "Disponível",
          area: finalArea,
          area_oficial: finalArea,
          price: finalPrice,
          geometry: geom,
          tenant_id: finalTenantId,
        };

        // Salvar primariamente nos campos oficiais
        if (dims.frente_oficial !== null) {
          blockObj.frente_oficial = dims.frente_oficial;
        } else if (dims.frente !== null) {
          blockObj.frente_oficial = `${dims.frente} m`;
        }

        if (dims.fundo_oficial !== null) {
          blockObj.fundo_oficial = dims.fundo_oficial;
        } else if (dims.fundo !== null) {
          blockObj.fundo_oficial = `${dims.fundo} m`;
        }

        if (dims.dir_oficial !== null) {
          blockObj.dir_oficial = dims.dir_oficial;
        } else if (dims.ladoD !== null) {
          blockObj.dir_oficial = `${dims.ladoD} m`;
        }

        if (dims.esq_oficial !== null) {
          blockObj.esq_oficial = dims.esq_oficial;
        } else if (dims.ladoE !== null) {
          blockObj.esq_oficial = `${dims.ladoE} m`;
        }

        return blockObj;
      });

      if (blocksToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from("blocks")
          .insert(blocksToInsert);
        if (insertError) throw insertError;
      }

      alert(`Importados ${blocksToInsert.length} lotes com sucesso!`);
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportQuadra("");
      setImportLoteInicial("1");
      setMapRefreshKey((prev) => prev + 1);
    } catch (err: any) {
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
        <div className="absolute top-2 left-2 right-2 md:top-4 md:left-24 md:right-auto md:w-96 z-[400] pointer-events-none flex flex-col gap-1.5 md:gap-2">
          <div className="flex items-center justify-between pointer-events-auto bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-border)] rounded-lg p-2 shadow-sm">
            <div className="flex items-center gap-2 overflow-hidden">
              <button
                onClick={handleBack}
                className="flex-shrink-0 p-1.5 hover:bg-[var(--color-border)] rounded-md text-[var(--color-text-muted)] hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-sm font-bold text-white truncate">
                {selectedProject.name}
              </h2>
            </div>
            <button
              onClick={() => setIsMobilePanelOpen(!isMobilePanelOpen)}
              className="flex-shrink-0 p-1.5 hover:bg-[var(--color-border)] rounded-md text-[var(--color-text-muted)] hover:text-white transition-colors"
              title={isMobilePanelOpen ? "Recolher painel" : "Expandir painel"}
            >
              {isMobilePanelOpen ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>

          <div
            className={`bg-[var(--color-surface)]/95 backdrop-blur-md rounded-lg shadow-lg pointer-events-auto transition-all duration-300 md:border md:border-[var(--color-border)] ${isMobilePanelOpen ? "p-3 border border-[var(--color-border)]" : "max-h-0 opacity-0 overflow-hidden border-transparent md:max-h-[500px] md:opacity-100 md:p-3"}`}
          >
            <div className="flex flex-row justify-between items-start mb-3 hidden md:flex">
              <div>
                <h2 className="text-sm font-bold text-white mb-0.5">
                  Painel Operacional
                </h2>
                <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-text-muted)]">
                  Ferramentas GIS
                </p>
              </div>
            </div>

            <div className="flex flex-row md:grid md:grid-cols-2 gap-2 flex-wrap pb-1">
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] text-[var(--color-text-muted)] transition-colors"
                title="Importar Quadras"
              >
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">
                  Importar
                </span>
              </button>

              <button
                onClick={() => setGpsActive(!gpsActive)}
                className={`flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 border rounded-lg transition-colors ${gpsActive ? "bg-[#10b981]/10 border-[#10b981] text-[#10b981]" : "bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[#10b981] hover:text-[#10b981]"}`}
                title="Navegação GPS"
              >
                <Navigation className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">
                  GPS
                </span>
              </button>

              <button
                onClick={() => setMeasureActive(!measureActive)}
                className={`flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 border rounded-lg transition-colors ${measureActive ? "bg-[var(--color-info)]/10 border-[var(--color-info)] text-[var(--color-info)]" : "bg-[var(--color-background)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-info)] hover:text-[var(--color-info)]"}`}
                title="Medição"
              >
                <Ruler className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">
                  Medição
                </span>
              </button>

              <button
                onClick={() => {
                  if (activeLayer === "satellite") setActiveLayer("streets");
                  else if (activeLayer === "streets") setActiveLayer("dark");
                  else setActiveLayer("satellite");
                }}
                className="flex-1 min-w-[30%] md:min-w-0 flex items-center justify-center gap-2 p-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:border-[#f59e0b] hover:text-[#f59e0b] text-[var(--color-text-muted)] transition-colors"
                title={`Estilo atual: ${activeLayer}`}
              >
                <MapIcon className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-wider hidden md:block">
                  {activeLayer === "satellite"
                    ? "Satélite"
                    : activeLayer === "streets"
                      ? "Vetor"
                      : "Dark Mode"}
                </span>
              </button>
            </div>

            <div className="flex flex-row md:flex-col gap-3 md:gap-2 pt-3 mt-3 md:pt-4 md:mt-4 border-t border-[var(--color-border)] overflow-x-auto">
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#22c55e] border border-[#16a34a]" />{" "}
                Disponível
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#eab308] border border-[#ca8a04]" />{" "}
                Reservado
              </div>
              <div className="flex items-center gap-1.5 text-[10px] md:text-xs font-medium text-[var(--color-text-muted)] whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-sm bg-[#ef4444] border border-[#dc2626]" />{" "}
                Vendido
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
                <h3 className="font-bold text-white text-lg">
                  Importar Lotes (KML/GeoJSON)
                </h3>
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="text-[var(--color-text-muted)] hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={handleImportKML}
                className="p-6 flex flex-col gap-4"
              >
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                    Identificação da Quadra
                  </label>
                  <input
                    type="text"
                    required
                    value={importQuadra}
                    onChange={(e) => setImportQuadra(e.target.value)}
                    placeholder="Ex: A, B, C, Quadra 1..."
                    className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)] uppercase"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                      Lote Inicial
                    </label>
                    <input
                      type="number"
                      required
                      value={importLoteInicial}
                      onChange={(e) => setImportLoteInicial(e.target.value)}
                      placeholder="Ex: 1"
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                      Ordenação
                    </label>
                    <select
                      value={importOrdem}
                      onChange={(e) =>
                        setImportOrdem(e.target.value as "ASC" | "DESC")
                      }
                      className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--color-primary)]"
                    >
                      <option value="ASC">Crescente (1,2,3)</option>
                      <option value="DESC">Decrescente (3,2,1)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                    Arquivo KML, GeoJSON
                  </label>
                  <input
                    type="file"
                    accept=".kml,.geojson,.json"
                    required
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-[var(--color-text-muted)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)]/10 file:text-[var(--color-primary)] hover:file:bg-[var(--color-primary)]/20 file:transition-colors file:cursor-pointer cursor-pointer border border-[var(--color-border)] bg-[var(--color-background)] rounded-lg p-2"
                  />
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
                    Dica: O zoom automático é aplicado após salvar.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={importing}
                  className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 text-white font-bold py-3 mt-2 rounded-lg transition-colors flex justify-center items-center gap-2"
                >
                  {importing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-5 h-5" /> Processar e Salvar
                    </>
                  )}
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
          <h1 className="text-2xl font-bold text-white mb-1">
            Mapa GIS & Projetos
          </h1>
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
              {filteredProjects.map((p) => (
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
              <button
                onClick={() => setIsNewProjectModalOpen(false)}
                className="text-[var(--color-text-muted)] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  Nome do Projeto
                </label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateProject(e as any);
                  }}
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
                {creatingProject ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Criar Projeto"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: any;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const total = project.blocks?.length || 0;
  const sold =
    project.blocks?.filter((l: any) => l.status === "Vendido").length || 0;
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
            <h3 className="font-bold text-white text-lg leading-tight">
              {project.name}
            </h3>
            <p className="text-xs font-mono text-[var(--color-text-muted)] uppercase mt-1">
              {project.location || "Sem localização"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="Editar"
            className="p-2 text-[var(--color-text-muted)] hover:text-white transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            title="Excluir"
            onClick={onDelete}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
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
          <div
            className="h-full bg-[var(--color-primary)]"
            style={{ width: `${pct}%` }}
          />
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
