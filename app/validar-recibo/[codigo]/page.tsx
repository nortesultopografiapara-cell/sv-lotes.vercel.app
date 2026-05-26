"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, FileText, Loader2, XCircle } from "lucide-react";

type ReceiptValidation = {
  valid: boolean;
  status?: string;
  empresa?: string;
  valor?: number;
  data?: string;
  categoria?: string;
  tipo_despesa?: string;
  descricao?: string;
  projeto?: string;
  cliente?: string;
  corretor?: string;
  contrato?: string;
  quadra_lote?: string;
  receipt_number?: string;
  validation_code?: string;
  autenticidade?: string;
  error?: string;
};

function formatBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default function ValidarReciboPage() {
  const params = useParams();
  const codigo = typeof params.codigo === "string" ? params.codigo : "";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReceiptValidation | null>(null);

  useEffect(() => {
    if (!codigo) {
      setData({ valid: false, error: "Código não informado" });
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/validar-recibo/${encodeURIComponent(codigo)}`,
        );
        const json = (await res.json()) as ReceiptValidation;
        setData(json);
      } catch {
        setData({ valid: false, error: "Falha ao validar recibo" });
      } finally {
        setLoading(false);
      }
    })();
  }, [codigo]);

  return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#13161c] border border-[#2d3340] rounded-xl p-8 shadow-xl">
        {loading ? (
          <div className="flex flex-col items-center gap-3 text-gray-400 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-[#2980b9]" />
            <span className="text-sm">Validando recibo…</span>
          </div>
        ) : data?.valid ? (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h1 className="text-xl font-bold text-white mb-1 text-center flex items-center justify-center gap-2">
              <FileText className="w-5 h-5 text-[#2980b9]" />
              Recibo autêntico
            </h1>
            <p className="text-emerald-400 font-semibold text-sm text-center mb-6">
              {data.autenticidade || "Documento gerado pelo SV LOTES"}
            </p>
            <div className="text-left space-y-3 text-sm text-gray-300 bg-[#1a1e27] rounded-lg p-4 border border-[#2d3340]">
              <Row label="Status" value={data.status || "Válido"} highlight />
              <Row label="Empresa" value={data.empresa || "—"} />
              <Row
                label="Valor"
                value={data.valor != null ? formatBrl(data.valor) : "—"}
              />
              <Row label="Data" value={data.data || "—"} />
              <Row label="Tipo / Categoria" value={data.tipo_despesa || data.categoria || "—"} />
              <Row label="Nº do recibo" value={data.receipt_number || "—"} mono />
              <Row label="Código" value={data.validation_code || codigo} mono />
              {data.projeto ? <Row label="Projeto" value={data.projeto} /> : null}
              {data.cliente && data.cliente !== "—" ? (
                <Row label="Cliente" value={data.cliente} />
              ) : null}
              {data.descricao ? <Row label="Descrição" value={data.descricao} /> : null}
            </div>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-white text-center mb-2">
              Recibo não validado
            </h1>
            <p className="text-gray-400 text-sm text-center">
              {data?.error || "Código inválido ou recibo não encontrado."}
            </p>
            <p className="text-xs text-gray-500 text-center mt-4 font-mono break-all">
              {codigo}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-gray-500 text-xs block">{label}</span>
      <span
        className={`${mono ? "font-mono text-xs break-all" : ""} ${
          highlight ? "text-emerald-400 font-medium" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
