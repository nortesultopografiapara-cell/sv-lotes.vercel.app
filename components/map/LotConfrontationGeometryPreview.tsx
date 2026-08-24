'use client';

/**
 * Mini visualização do polígono já disponível no popup GIS.
 * Não recalcula geometria — só projeta coordinates existentes em SVG.
 */

export function LotConfrontationGeometryPreview({
  positions,
  selectedIndexes = [],
  onSelectIndex,
}: {
  positions?: Array<[number, number]> | null;
  selectedIndexes?: number[];
  onSelectIndex?: (index: number) => void;
}) {
  const pts = (positions ?? []).filter(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]),
  );

  if (pts.length < 3) {
    return (
      <div className="h-full min-h-[120px] rounded-lg border border-gray-200 bg-gray-50/80 flex items-center justify-center px-3">
        <p className="text-[10px] text-gray-500 text-center leading-snug">
          Geometria do lote indisponível neste popup.
        </p>
      </div>
    );
  }

  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 1e-9);
  const lngSpan = Math.max(maxLng - minLng, 1e-9);
  const pad = 0.06;
  const vbW = 200;
  const vbH = 200;

  const project = (lat: number, lng: number): [number, number] => {
    const x = ((lng - minLng) / lngSpan) * (1 - pad * 2) * vbW + pad * vbW;
    const y = ((maxLat - lat) / latSpan) * (1 - pad * 2) * vbH + pad * vbH;
    return [x, y];
  };

  const projected = pts.map(([lat, lng]) => project(lat, lng));
  const isRing = projected.length >= 3;
  const edgeCount = isRing ? projected.length : projected.length - 1;
  const selected = new Set(selectedIndexes);
  const ringPath = projected
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')
    .concat(' Z');

  return (
    <div className="h-full min-h-[120px] rounded-lg border border-gray-200 bg-gray-50/80 p-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
        Geometria do lote
      </p>
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        className="w-full h-[calc(100%-18px)] min-h-[110px]"
        role="img"
        aria-label="Polígono do lote"
      >
        <path
          d={ringPath}
          fill="#e2e8f0"
          stroke="#94a3b8"
          strokeWidth="1.2"
        />
        {Array.from({ length: edgeCount }, (_, i) => {
          const a = projected[i];
          const b = projected[isRing ? (i + 1) % projected.length : i + 1];
          const isSel = selected.has(i);
          return (
            <g key={`edge-${i}`}>
              <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="transparent"
                strokeWidth="14"
                strokeLinecap="round"
                className={onSelectIndex ? 'cursor-pointer' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectIndex?.(i);
                }}
              />
              <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={isSel ? '#2563eb' : '#64748b'}
                strokeWidth={isSel ? 4 : 1.6}
                strokeLinecap="round"
                pointerEvents="none"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
