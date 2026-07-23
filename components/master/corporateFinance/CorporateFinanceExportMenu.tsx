'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import type { CorporateExportFormat } from '@/lib/master/corporateFinance/exports/exportTypes';
import styles from './corporateFinance.module.css';

export type CorporateFinanceExportMenuProps = {
  /** Query string completa (inclui userId e filtros), sem format. */
  buildQuery: () => URLSearchParams;
  endpoint: string;
  disabled?: boolean;
  onError?: (message: string) => void;
  onSuccess?: (format: CorporateExportFormat, filename: string) => void;
};

const OPTIONS: Array<{
  format: CorporateExportFormat;
  label: string;
  hint: string;
  icon: typeof FileSpreadsheet;
}> = [
  {
    format: 'xlsx',
    label: 'Excel (.xlsx)',
    hint: 'Planilha profissional',
    icon: FileSpreadsheet,
  },
  {
    format: 'pdf',
    label: 'PDF',
    hint: 'Relatório para impressão',
    icon: FileText,
  },
  {
    format: 'csv',
    label: 'CSV',
    hint: 'Arquivo técnico',
    icon: Download,
  },
];

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="([^"]+)"/i.exec(header);
  return m?.[1] || fallback;
}

export default function CorporateFinanceExportMenu({
  buildQuery,
  endpoint,
  disabled,
  onError,
  onSuccess,
}: CorporateFinanceExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeFormat, setActiveFormat] = useState<CorporateExportFormat | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const runExport = useCallback(
    async (format: CorporateExportFormat) => {
      if (loading || disabled) return;
      setLoading(true);
      setActiveFormat(format);
      setOpen(false);
      try {
        const p = buildQuery();
        p.set('format', format);
        const res = await fetch(`${endpoint}?${p.toString()}`);
        if (!res.ok) {
          let message = `Falha na exportação (HTTP ${res.status}).`;
          try {
            const data = await res.json();
            if (typeof data.error === 'string' && data.error.trim()) message = data.error;
          } catch {
            /* body binário ou vazio */
          }
          throw new Error(message);
        }
        const blob = await res.blob();
        const filename = filenameFromDisposition(
          res.headers.get('Content-Disposition'),
          res.headers.get('X-Export-Filename') || `exportacao.${format}`,
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        onSuccess?.(format, filename);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Erro ao exportar.');
      } finally {
        setLoading(false);
        setActiveFormat(null);
      }
    },
    [buildQuery, disabled, endpoint, loading, onError, onSuccess],
  );

  return (
    <div className={styles.exportMenuRoot} ref={rootRef}>
      <button
        type="button"
        className={`${styles.btn} ${styles.btnGhost}`}
        disabled={disabled || loading}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        {loading ? <Loader2 className={`w-4 h-4 ${styles.spin}`} /> : <Download className="w-4 h-4" />}
        {loading ? `Exportando ${activeFormat?.toUpperCase() || ''}…` : 'Exportar'}
        <ChevronDown className="w-4 h-4" />
      </button>
      {open ? (
        <div className={styles.exportMenuPanel} id={menuId} role="menu">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.format}
                type="button"
                role="menuitem"
                className={styles.exportMenuItem}
                disabled={loading}
                onClick={() => void runExport(opt.format)}
              >
                <Icon className="w-4 h-4" />
                <span>
                  <strong>{opt.label}</strong>
                  <small>{opt.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
