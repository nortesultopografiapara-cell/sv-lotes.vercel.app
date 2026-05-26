"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, FileText } from "lucide-react";

function ValidarContent() {
  const searchParams = useSearchParams();
  const codigo = searchParams.get("codigo") || "";
  const tipo = searchParams.get("tipo") || "Relatório financeiro";
  const empresa = searchParams.get("empresa") || "SV LOTES";
  const emitido = searchParams.get("emitido") || new Date().toLocaleString("pt-BR");

  return (
    <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#13161c] border border-[#2d3340] rounded-xl p-8 text-center shadow-xl">
        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2 flex items-center justify-center gap-2">
          <FileText className="w-5 h-5 text-[#2980b9]" />
          Validação de documento
        </h1>
        <p className="text-emerald-400 font-semibold text-sm mb-6">
          Documento gerado pelo SV LOTES
        </p>

        <div className="text-left space-y-3 text-sm text-gray-300 bg-[#1a1e27] rounded-lg p-4 border border-[#2d3340]">
          <div>
            <span className="text-gray-500 text-xs block">Código</span>
            <span className="font-mono text-white break-all">
              {codigo || "—"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Empresa</span>
            <span>{decodeURIComponent(empresa)}</span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Tipo de documento</span>
            <span>{decodeURIComponent(tipo)}</span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Data de emissão</span>
            <span>{decodeURIComponent(emitido)}</span>
          </div>
          <div>
            <span className="text-gray-500 text-xs block">Status</span>
            <span className="text-emerald-400 font-medium">Válido</span>
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-6">
          Este código confirma que o documento foi emitido pelo sistema SV LOTES.
        </p>
      </div>
    </div>
  );
}

export default function ValidarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0b0e14] flex items-center justify-center text-gray-400">
          Carregando…
        </div>
      }
    >
      <ValidarContent />
    </Suspense>
  );
}
