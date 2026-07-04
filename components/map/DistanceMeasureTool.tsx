'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { Trash2 } from 'lucide-react';
import {
  MEASURE_CLICK_DELAY_MS,
  MEASURE_DOUBLE_TAP_MS,
  buildMeasureSegments,
  canFinalizeMeasure,
  computePreviewDistanceM,
  computeTotalWithPreviewM,
  formatGisDistanceM,
  segmentMidpoint,
  toGisLatLng,
  type GisLatLng,
} from '@/lib/gis/distanceMeasure';

function latLngToGis(latlng: L.LatLng): GisLatLng {
  return toGisLatLng(latlng.lat, latlng.lng);
}

function createSegmentLabelIcon(mapLabel: string, distanceText: string): L.DivIcon {
  return L.divIcon({
    className: 'gis-distance-measure-label',
    html: `<div style="
      transform: translate(-50%, -50%);
      pointer-events: none;
      white-space: nowrap;
      text-align: center;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.25;
      color: #fff;
      text-shadow: 0 0 4px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.8);
    ">
      <div>${mapLabel}</div>
      <div style="font-size:11px;font-weight:800;color:#fecaca;">${distanceText}</div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function useDistanceMeasureWithHud(
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
    if (!canFinalizeMeasure(pointsRef.current)) return;
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

  const segments = useMemo(() => buildMeasureSegments(points), [points]);
  const segmentDistances = useMemo(
    () => segments.map((s) => s.distanceM),
    [segments],
  );
  const totalM = useMemo(
    () => segmentDistances.reduce((s, d) => s + d, 0),
    [segmentDistances],
  );
  const previewM = useMemo(
    () => (finalized ? null : computePreviewDistanceM(points, cursor)),
    [finalized, points, cursor],
  );
  const totalWithPreviewM = useMemo(
    () => computeTotalWithPreviewM(segmentDistances, previewM),
    [segmentDistances, previewM],
  );

  return {
    points,
    finalized,
    segments,
    totalM,
    previewM,
    totalWithPreviewM,
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

type DistanceMeasureMapProps = {
  active: boolean;
  measure: ReturnType<typeof useDistanceMeasureWithHud>;
};

export function DistanceMeasureMapContent({
  active,
  measure,
}: DistanceMeasureMapProps) {
  const map = useMap();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  const {
    points,
    finalized,
    segments,
    previewM,
    cursor,
    addPoint,
    finalize,
    setCursor,
    setCursorPx,
  } = measure;

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
      if (canFinalizeMeasure(points)) finalize();
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
        if (canFinalizeMeasure(points)) finalize();
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

  const linePositions = points.map((p) => [p.lat, p.lng] as [number, number]);
  const previewLine =
    !finalized && previewM != null && cursor && points.length > 0
      ? [
          [points[points.length - 1].lat, points[points.length - 1].lng] as [
            number,
            number,
          ],
          [cursor.lat, cursor.lng] as [number, number],
        ]
      : null;

  return (
    <>
      {linePositions.length >= 2 && (
        <Polyline
          positions={linePositions}
          pathOptions={{
            color: '#ef4444',
            weight: 3,
            opacity: 0.95,
          }}
        />
      )}
      {previewLine && (
        <Polyline
          positions={previewLine}
          pathOptions={{
            color: '#f87171',
            weight: 2,
            dashArray: '6, 8',
            opacity: 0.75,
          }}
        />
      )}
      {points.map((p, idx) => (
        <CircleMarker
          key={`dm-pt-${idx}`}
          center={[p.lat, p.lng]}
          radius={5}
          pathOptions={{
            color: '#ef4444',
            fillColor: '#fff',
            fillOpacity: 1,
            weight: 2,
          }}
          interactive={false}
        />
      ))}
      {segments.map((seg) => {
        const a = points[seg.index];
        const b = points[seg.index + 1];
        if (!a || !b) return null;
        const mid = segmentMidpoint(a, b);
        const icon = createSegmentLabelIcon(
          seg.mapLabel,
          formatGisDistanceM(seg.distanceM),
        );
        return (
          <Marker
            key={`dm-seg-${seg.index}`}
            position={[mid.lat, mid.lng]}
            icon={icon}
            interactive={false}
          />
        );
      })}
    </>
  );
}

type DistanceMeasureOverlayProps = {
  active: boolean;
  measure: ReturnType<typeof useDistanceMeasureWithHud>;
};

export function DistanceMeasureOverlay({
  active,
  measure,
}: DistanceMeasureOverlayProps) {
  const {
    points,
    finalized,
    segments,
    totalM,
    previewM,
    totalWithPreviewM,
    cursorPx,
    finalize,
    clearAndExit,
  } = measure;

  if (!active) return null;

  const showPanel = points.length > 0 || !finalized;
  const showHud =
    !finalized && previewM != null && points.length > 0 && cursorPx != null;

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
          <div className="bg-[#11141a]/95 border border-red-500/40 rounded-lg px-2.5 py-2 shadow-lg text-[10px] leading-snug min-w-[7rem]">
            <div className="text-[var(--color-text-muted)] uppercase tracking-wide font-bold text-[9px]">
              Trecho
            </div>
            <div className="text-white font-bold text-xs tabular-nums">
              {formatGisDistanceM(previewM!)}
            </div>
            <div className="text-[var(--color-text-muted)] uppercase tracking-wide font-bold text-[9px] mt-1.5">
              Total
            </div>
            <div className="text-red-300 font-bold text-xs tabular-nums">
              {formatGisDistanceM(totalWithPreviewM)}
            </div>
          </div>
        </div>
      )}

      {showPanel && (
        <div
          className="absolute z-[550] pointer-events-auto bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] w-[min(92vw,240px)]"
          data-testid="gis-distance-measure-panel"
        >
          <div className="bg-[#11141a]/95 backdrop-blur-sm border border-[var(--color-border)] rounded-xl shadow-xl overflow-hidden fade-in-up">
            <div className="px-3 py-2 border-b border-[var(--color-border)] flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                Medição
              </span>
              {finalized && (
                <span className="text-[9px] font-semibold text-emerald-400 uppercase">
                  Finalizada
                </span>
              )}
            </div>

            <div className="px-3 py-2 max-h-[40vh] overflow-y-auto space-y-1.5">
              {segments.length === 0 ? (
                <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                  {finalized
                    ? 'Nenhum trecho medido.'
                    : 'Clique no mapa para iniciar a medição.'}
                </p>
              ) : (
                segments.map((seg) => (
                  <div
                    key={seg.index}
                    className="flex items-baseline justify-between gap-2 text-[11px]"
                  >
                    <span className="text-[var(--color-text-muted)] font-medium">
                      {seg.panelLabel}
                    </span>
                    <span className="text-white font-bold tabular-nums shrink-0">
                      {formatGisDistanceM(seg.distanceM)}
                    </span>
                  </div>
                ))
              )}

              {segments.length > 0 && (
                <>
                  <hr className="border-[var(--color-border)] my-1" />
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">
                      Total
                    </span>
                    <span className="text-red-300 font-bold text-sm tabular-nums">
                      {formatGisDistanceM(totalM)}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="px-2 pb-2 pt-1 flex flex-col gap-1.5 border-t border-[var(--color-border)]">
              {!finalized && (
                <button
                  type="button"
                  disabled={!canFinalizeMeasure(points)}
                  onClick={() => finalize()}
                  className="w-full py-2 rounded-lg text-[11px] font-bold bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  data-testid="gis-distance-measure-finalize"
                >
                  Finalizar
                </button>
              )}
              <button
                type="button"
                onClick={() => clearAndExit()}
                className="w-full py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
                data-testid="gis-distance-measure-clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar Medição
              </button>
            </div>
          </div>
        </div>
      )}

      {!finalized && active && points.length === 0 && (
        <div className="absolute top-16 md:top-4 left-1/2 -translate-x-1/2 z-[500] pointer-events-none px-4 max-w-md w-full">
          <p className="text-xs font-semibold text-red-100 bg-[#11141a]/95 border border-red-500/50 rounded-lg px-3 py-2 shadow-lg text-center">
            Medir distância: clique para adicionar pontos. Duplo clique ou
            Finalizar encerra. ESC cancela.
          </p>
        </div>
      )}
    </>
  );
}
