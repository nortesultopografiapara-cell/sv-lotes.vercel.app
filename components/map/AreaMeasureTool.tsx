'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  Marker,
  Polygon,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { FileText, Trash2 } from 'lucide-react';
import {
  MEASURE_CLICK_DELAY_MS,
  MEASURE_DOUBLE_TAP_MS,
  segmentMidpoint,
  toGisLatLng,
  type GisLatLng,
} from '@/lib/gis/distanceMeasure';
import {
  buildAreaFillPositions,
  buildAreaSides,
  canFinalizeAreaMeasure,
  computeGeodesicAreaM2,
  computePerimeterM,
  formatGisAreaM2,
  formatGisLengthM,
} from '@/lib/gis/areaMeasure';
import { AreaMeasureExportModal } from '@/components/map/AreaMeasureExportModal';
import {
  canExportAreaMeasurePdf,
  downloadAreaMeasurePdf,
  type AreaMeasureExportForm,
} from '@/lib/gis/areaMeasurePdf';

const AREA_STROKE = '#3b82f6';

function latLngToGis(latlng: L.LatLng): GisLatLng {
  return toGisLatLng(latlng.lat, latlng.lng);
}

function createSideLabelIcon(distanceText: string): L.DivIcon {
  return L.divIcon({
    className: 'gis-area-measure-label',
    html: `<div style="
      transform: translate(-50%, -50%);
      pointer-events: none;
      white-space: nowrap;
      text-align: center;
      font-size: 10px;
      font-weight: 800;
      color: #fff;
      text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8);
    ">
      <span style="color:#bfdbfe;">${distanceText}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function useAreaMeasureWithHud(
  active: boolean,
  onDeactivate: () => void,
) {
  const [points, setPoints] = useState<GisLatLng[]>([]);
  const [finalized, setFinalized] = useState(false);
  const [cursor, setCursor] = useState<GisLatLng | null>(null);
  const [cursorPx, setCursorPx] = useState<{ x: number; y: number } | null>(
    null,
  );

  const reset = useCallback(() => {
    setPoints([]);
    setFinalized(false);
    setCursor(null);
    setCursorPx(null);
  }, []);

  const clearAndExit = useCallback(() => {
    reset();
    onDeactivate();
  }, [onDeactivate, reset]);

  const pointsRef = useRef(points);
  pointsRef.current = points;

  const finalize = useCallback(() => {
    if (!canFinalizeAreaMeasure(pointsRef.current)) return;
    setFinalized(true);
    setCursor(null);
    setCursorPx(null);
  }, []);

  const addPoint = useCallback(
    (latlng: L.LatLng) => {
      if (finalized) return;
      setPoints((prev) => [...prev, latLngToGis(latlng)]);
    },
    [finalized],
  );

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        clearAndExit();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, clearAndExit]);

  const sides = useMemo(
    () => buildAreaSides(points, finalized),
    [points, finalized],
  );
  const areaM2 = useMemo(
    () => computeGeodesicAreaM2(points, finalized, cursor),
    [points, finalized, cursor],
  );
  const perimeterM = useMemo(
    () => computePerimeterM(points, finalized, cursor),
    [points, finalized, cursor],
  );

  return {
    points,
    finalized,
    sides,
    areaM2,
    perimeterM,
    cursor,
    cursorPx,
    setCursor,
    setCursorPx,
    addPoint,
    finalize,
    clearAndExit,
    reset,
  };
}

type AreaMeasureMapProps = {
  active: boolean;
  measure: ReturnType<typeof useAreaMeasureWithHud>;
};

export function AreaMeasureMapContent({
  active,
  measure,
}: AreaMeasureMapProps) {
  const map = useMap();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const {
    points,
    finalized,
    sides,
    cursor,
    addPoint,
    finalize,
    setCursor,
    setCursorPx,
  } = measure;

  useEffect(() => {
    if (active) map.closePopup();
  }, [active, map]);

  const updateCursor = useCallback(
    (latlng: L.LatLng) => {
      if (finalized || points.length === 0) {
        setCursor(null);
        setCursorPx(null);
        return;
      }
      setCursor(latLngToGis(latlng));
      const px = map.latLngToContainerPoint(latlng);
      setCursorPx({ x: px.x, y: px.y });
    },
    [finalized, map, points.length, setCursor, setCursorPx],
  );

  useMapEvents({
    click(e) {
      if (!active || finalized) return;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        addPoint(e.latlng);
        clickTimerRef.current = null;
      }, MEASURE_CLICK_DELAY_MS);
    },
    dblclick(e) {
      if (!active || finalized) return;
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      L.DomEvent.stopPropagation(e.originalEvent);
      L.DomEvent.preventDefault(e.originalEvent);
      if (canFinalizeAreaMeasure(points)) finalize();
    },
    mousemove(e) {
      if (!active) return;
      updateCursor(e.latlng);
    },
    mouseout() {
      if (!active) return;
      setCursor(null);
      setCursorPx(null);
    },
  });

  useEffect(() => {
    if (!active) {
      map.getContainer().style.cursor = '';
      return;
    }
    map.getContainer().style.cursor = finalized ? 'default' : 'crosshair';
    return () => {
      map.getContainer().style.cursor = '';
    };
  }, [active, finalized, map]);

  useEffect(() => {
    if (!active) return;
    const container = map.getContainer();

    const onTouchEnd = (ev: TouchEvent) => {
      if (finalized || ev.changedTouches.length !== 1) return;
      const touch = ev.changedTouches[0];
      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t <= MEASURE_DOUBLE_TAP_MS &&
        Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < 28
      ) {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        if (canFinalizeAreaMeasure(points)) finalize();
        lastTapRef.current = null;
        return;
      }
      lastTapRef.current = { t: now, x: touch.clientX, y: touch.clientY };
    };

    container.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => container.removeEventListener('touchend', onTouchEnd);
  }, [active, finalized, finalize, map, points]);

  useEffect(
    () => () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    [],
  );

  if (!active) return null;

  const committedLine = points.map((p) => [p.lat, p.lng] as [number, number]);
  const previewLine =
    !finalized && cursor && points.length > 0
      ? [
          [points[points.length - 1].lat, points[points.length - 1].lng] as [
            number,
            number,
          ],
          [cursor.lat, cursor.lng] as [number, number],
        ]
      : null;

  const fillPositions = buildAreaFillPositions(points, finalized, cursor);

  const sideLabelPoints = finalized
    ? points.map((_, i) => {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        return { mid: segmentMidpoint(a, b), dist: sides[i]?.distanceM ?? 0, i };
      })
    : sides
        .map((side) => {
          const a = points[side.index];
          const b = points[side.index + 1];
          if (!a || !b) return null;
          return {
            mid: segmentMidpoint(a, b),
            dist: side.distanceM,
            i: side.index,
          };
        })
        .filter(Boolean) as { mid: GisLatLng; dist: number; i: number }[];

  return (
    <>
      {fillPositions && fillPositions.length >= 3 && (
        <Polygon
          positions={fillPositions}
          pathOptions={{
            color: AREA_STROKE,
            weight: finalized ? 3 : 2,
            fillColor: AREA_STROKE,
            fillOpacity: 0.25,
            dashArray: finalized ? undefined : '6, 8',
          }}
          interactive={false}
        />
      )}
      {committedLine.length >= 2 && (
        <Polyline
          positions={committedLine}
          pathOptions={{
            color: AREA_STROKE,
            weight: 3,
            opacity: 0.95,
          }}
          interactive={false}
        />
      )}
      {previewLine && (
        <Polyline
          positions={previewLine}
          pathOptions={{
            color: '#60a5fa',
            weight: 2,
            dashArray: '6, 8',
            opacity: 0.85,
          }}
          interactive={false}
        />
      )}
      {points.map((p, idx) => (
        <CircleMarker
          key={`am-pt-${idx}`}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            color: AREA_STROKE,
            fillColor: '#fff',
            fillOpacity: 1,
            weight: 2,
          }}
          interactive={false}
        />
      ))}
      {sideLabelPoints.map(({ mid, dist, i }) => (
        <Marker
          key={`am-side-${i}`}
          position={[mid.lat, mid.lng]}
          icon={createSideLabelIcon(formatGisLengthM(dist))}
          interactive={false}
        />
      ))}
    </>
  );
}

type AreaMeasureExportMeta = {
  projectName: string;
  companyName: string;
  userName: string;
};

type AreaMeasureOverlayProps = {
  active: boolean;
  measure: ReturnType<typeof useAreaMeasureWithHud>;
  exportMeta?: AreaMeasureExportMeta;
};

export function AreaMeasureOverlay({
  active,
  measure,
  exportMeta,
}: AreaMeasureOverlayProps) {
  const {
    points,
    finalized,
    sides,
    areaM2,
    perimeterM,
    cursorPx,
    finalize,
    clearAndExit,
  } = measure;

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const exportEnabled = canExportAreaMeasurePdf(areaM2, points.length);

  const handleExportSubmit = async (form: AreaMeasureExportForm) => {
    if (!exportMeta || areaM2 == null) return;
    setExportLoading(true);
    try {
      await downloadAreaMeasurePdf({
        propertyName: form.propertyName,
        ownerName: form.ownerName,
        observations: form.observations || null,
        projectName: exportMeta.projectName,
        companyName: exportMeta.companyName,
        userName: exportMeta.userName,
        measuredAt: new Date(),
        areaM2,
        perimeterM,
        sides: sides.map((s) => ({
          panelLabel: s.panelLabel,
          distanceM: s.distanceM,
        })),
        points,
      });
      setExportModalOpen(false);
    } catch (err) {
      console.error('GIS_AREA_MEASURE_PDF_ERROR', err);
      alert('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setExportLoading(false);
    }
  };

  if (!active) return null;

  const showPanel = points.length > 0 || !finalized;
  const showHud =
    !finalized && areaM2 != null && points.length >= 2 && cursorPx != null;

  return (
    <>
      {showHud && cursorPx && (
        <div
          className="absolute z-[600] pointer-events-none"
          style={{
            left: cursorPx.x + 14,
            top: cursorPx.y + 14,
          }}
        >
          <div className="bg-[#11141a]/95 border border-blue-500/40 rounded-lg px-2.5 py-2 shadow-lg text-[10px] leading-snug min-w-[7.5rem]">
            <div className="text-[var(--color-text-muted)] uppercase tracking-wide font-bold text-[9px]">
              Área
            </div>
            <div className="text-white font-bold text-xs tabular-nums">
              {formatGisAreaM2(areaM2!)}
            </div>
            <div className="text-[var(--color-text-muted)] uppercase tracking-wide font-bold text-[9px] mt-1.5">
              Perímetro
            </div>
            <div className="text-blue-300 font-bold text-xs tabular-nums">
              {formatGisLengthM(perimeterM)}
            </div>
          </div>
        </div>
      )}

      {showPanel && (
        <div
          className="gis-area-measure-panel-anchor absolute z-[550] pointer-events-auto w-[min(92vw,260px)]"
          data-testid="gis-area-measure-panel"
        >
          <div className="bg-[#11141a]/95 backdrop-blur-sm border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden fade-in-up">
            <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center gap-2">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider shrink-0">
                Medição de Área
              </span>
              <button
                type="button"
                disabled={!exportEnabled}
                onClick={() => setExportModalOpen(true)}
                className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold uppercase tracking-wide text-blue-300/90 border border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                data-testid="gis-area-measure-export-pdf"
                title="Exportar PDF"
              >
                <FileText className="w-3 h-3" />
                Exportar PDF
              </button>
              {finalized && (
                <span className="text-[9px] font-semibold text-emerald-400 uppercase shrink-0">
                  Finalizada
                </span>
              )}
            </div>

            <div className="px-3 py-2 max-h-[40vh] overflow-y-auto space-y-1.5">
              {points.length === 0 ? (
                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                  Clique no mapa para iniciar o polígono.
                </p>
              ) : (
                <>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="text-[var(--color-text-muted)] font-medium">
                      Área
                    </span>
                    <span className="text-white font-bold tabular-nums shrink-0">
                      {areaM2 != null ? formatGisAreaM2(areaM2) : '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="text-[var(--color-text-muted)] font-medium">
                      Perímetro
                    </span>
                    <span className="text-blue-300 font-bold tabular-nums shrink-0">
                      {formatGisLengthM(perimeterM)}
                    </span>
                  </div>
                  {sides.length > 0 && (
                    <hr className="border-[var(--color-border)] my-1" />
                  )}
                  {sides.map((side) => (
                    <div
                      key={side.index}
                      className="flex items-baseline justify-between gap-2 text-[11px]"
                    >
                      <span className="text-[var(--color-text-muted)] font-medium">
                        {side.panelLabel}
                      </span>
                      <span className="text-white font-bold tabular-nums shrink-0">
                        {formatGisLengthM(side.distanceM)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>

            <div className="px-2 pb-2 pt-1 flex flex-col gap-1.5 border-t border-[var(--color-border)]">
              {!finalized && (
                <button
                  type="button"
                  disabled={!canFinalizeAreaMeasure(points)}
                  onClick={() => finalize()}
                  className="w-full py-2 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  data-testid="gis-area-measure-finalize"
                >
                  Finalizar
                </button>
              )}
              <button
                type="button"
                onClick={() => clearAndExit()}
                className="w-full py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-blue-300 hover:border-blue-500/40 hover:bg-blue-500/10 transition-colors"
                data-testid="gis-area-measure-clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar
              </button>
            </div>
          </div>
        </div>
      )}

      <AreaMeasureExportModal
        open={exportModalOpen}
        loading={exportLoading}
        onClose={() => {
          if (!exportLoading) setExportModalOpen(false);
        }}
        onSubmit={(form) => void handleExportSubmit(form)}
      />

      {!finalized && active && points.length === 0 && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
          <p className="text-xs font-semibold text-blue-100 bg-[#11141a]/95 border border-blue-500/50 rounded-lg px-3 py-2 shadow-lg text-center">
            Medir área: clique para adicionar vértices. Duplo clique ou
            Finalizar encerra. ESC cancela.
          </p>
        </div>
      )}
    </>
  );
}
