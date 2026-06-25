'use client';

import {
  ArrowDown,
  CheckCircle,
  Clock,
  ImageIcon,
  Lightbulb,
  PlayCircle,
  Route,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  MANUAL_COMMON_ERRORS,
  MANUAL_COMPLETE_FLOWS,
  MANUAL_FIRST_STEPS,
  MANUAL_ILLUSTRATION_META,
  MANUAL_MAIN_FLOWCHART,
  MANUAL_OPERATION_TIMES,
  type ManualIllustrationKey,
} from '@/lib/manualTraining';

const FLOW_COLORS = {
  orange: 'border-orange-500/30 bg-orange-500/5 text-orange-300',
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
  red: 'border-red-500/30 bg-red-500/5 text-red-300',
  sky: 'border-sky-500/30 bg-sky-500/5 text-sky-300',
} as const;

export function ManualReadingProgress({ progress }: { progress: number }) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 h-1 bg-white/5"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progresso de leitura do manual"
    >
      <div
        className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ManualIllustrationPlaceholder({ illustrationKey }: { illustrationKey: ManualIllustrationKey }) {
  const meta = MANUAL_ILLUSTRATION_META[illustrationKey];
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-[#0d1117] overflow-hidden">
      <div className="aspect-video flex flex-col items-center justify-center gap-2 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
          <ImageIcon className="w-6 h-6 text-gray-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Print — {meta.title}
        </p>
        <p className="text-[11px] text-gray-500 max-w-xs">{meta.caption}</p>
        <p className="text-[10px] text-gray-600 mt-1">Espaço reservado para imagem real</p>
      </div>
    </div>
  );
}

export function ManualVideoButton({ topic }: { topic: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.alert(`Vídeo em produção: ${topic}\n\nEm breve você poderá assistir ao tutorial desta função.`);
      }}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 text-xs font-medium hover:bg-purple-500/20 transition-colors"
      aria-label={`Assistir vídeo: ${topic}`}
    >
      <PlayCircle className="w-4 h-4 shrink-0" />
      Assistir vídeo desta função
    </button>
  );
}

export function ManualFirstStepsSection() {
  return (
    <section
      id="primeiros-passos"
      className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 to-[#11161d] scroll-mt-28 overflow-hidden"
    >
      <div className="p-5 md:p-6 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Primeiros Passos</h2>
            <p className="text-sm text-gray-400 mt-1">
              Sequência ideal para começar a utilizar o SV LOTES
            </p>
          </div>
        </div>
      </div>
      <ol className="p-5 md:p-6 space-y-3">
        {MANUAL_FIRST_STEPS.map((step) => (
          <li
            key={step.order}
            className="flex gap-3 rounded-xl border border-white/10 bg-[#0d1117]/80 p-4"
          >
            <span className="shrink-0 w-8 h-8 rounded-full bg-orange-500/20 text-orange-300 text-sm font-bold flex items-center justify-center border border-orange-500/30">
              {step.order}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-white">
                  {step.title}
                  {step.optional ? (
                    <span className="ml-2 text-[10px] font-normal text-gray-500 uppercase">
                      (opcional)
                    </span>
                  ) : null}
                </p>
                {step.estimatedTime ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                    <Clock className="w-3 h-3" />
                    {step.estimatedTime}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-gray-400 mt-1 leading-relaxed">{step.description}</p>
              {step.linkSectionId ? (
                <a
                  href={`#${step.linkSectionId}`}
                  className="inline-block mt-2 text-xs text-orange-400 hover:text-orange-300"
                >
                  Ver módulo →
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ManualMainFlowchartSection() {
  return (
    <section
      id="fluxograma"
      className="rounded-2xl border border-white/10 bg-[#11161d] scroll-mt-28 overflow-hidden"
    >
      <div className="p-5 md:p-6 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center shrink-0">
            <Route className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Fluxograma principal</h2>
            <p className="text-sm text-gray-400 mt-1">Ciclo completo da operação no SV LOTES</p>
          </div>
        </div>
      </div>
      <div className="p-5 md:p-6">
        <div className="flex flex-col items-center gap-0 max-w-md mx-auto">
          {MANUAL_MAIN_FLOWCHART.map((node, idx) => (
            <div key={node.id} className="flex flex-col items-center w-full">
              {node.linkSectionId ? (
                <a
                  href={`#${node.linkSectionId}`}
                  className="w-full text-center px-4 py-3 rounded-xl border border-blue-500/25 bg-blue-500/10 text-blue-200 text-sm font-semibold hover:bg-blue-500/20 transition-colors"
                >
                  {node.label}
                </a>
              ) : (
                <div className="w-full text-center px-4 py-3 rounded-xl border border-white/10 bg-[#0d1117] text-gray-300 text-sm font-semibold">
                  {node.label}
                </div>
              )}
              {idx < MANUAL_MAIN_FLOWCHART.length - 1 ? (
                <ArrowDown className="w-5 h-5 text-gray-600 my-1 shrink-0" aria-hidden />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ManualCompleteFlowsSection() {
  return (
    <section id="fluxos-completos" className="scroll-mt-28 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Fluxos completos</h2>
          <p className="text-sm text-gray-400">Passo a passo visual por operação</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MANUAL_COMPLETE_FLOWS.map((flow) => (
          <article
            key={flow.id}
            id={flow.id}
            className={`rounded-2xl border p-5 scroll-mt-28 ${FLOW_COLORS[flow.color]}`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="text-base font-bold text-white">{flow.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{flow.subtitle}</p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-gray-500 bg-black/20 px-2 py-1 rounded-md">
                <Clock className="w-3 h-3" />
                {flow.estimatedTime}
              </span>
            </div>
            <ol className="space-y-2">
              {flow.steps.map((step, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-gray-300 leading-relaxed">
                  <span className="text-gray-500 font-mono text-xs shrink-0 w-4">{idx + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ManualCommonErrorsSection() {
  return (
    <section
      id="erros-comuns"
      className="rounded-2xl border border-red-500/20 bg-[#11161d] scroll-mt-28 overflow-hidden"
    >
      <div className="p-5 md:p-6 border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Erros comuns</h2>
            <p className="text-sm text-gray-400 mt-1">Problemas frequentes e como resolver</p>
          </div>
        </div>
      </div>
      <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {MANUAL_COMMON_ERRORS.map((err) => (
          <div
            key={err.id}
            className="rounded-xl border border-red-500/15 bg-red-500/5 p-4 space-y-2"
          >
            <p className="text-sm font-semibold text-red-300">{err.title}</p>
            <p className="text-xs text-gray-400">
              <span className="text-gray-500 font-medium">Sintoma: </span>
              {err.symptom}
            </p>
            <p className="text-xs text-gray-300 leading-relaxed">
              <span className="text-emerald-400 font-medium">Solução: </span>
              {err.solution}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ManualOperationTimesSection() {
  return (
    <section
      id="tempos-medios"
      className="rounded-2xl border border-white/10 bg-[#11161d] p-5 md:p-6 scroll-mt-28"
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-gray-400" />
        <h2 className="text-base font-bold text-white">Tempo médio por operação</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {MANUAL_OPERATION_TIMES.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#0d1117] border border-white/5 text-sm"
          >
            <span className="text-gray-400">{item.label}</span>
            <span className="text-orange-300 font-semibold shrink-0">{item.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ManualTrainingTipsBlock({ tips }: { tips: string[] }) {
  if (!tips.length) return null;
  return (
    <div className="rounded-xl bg-violet-500/5 border border-violet-500/20 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400 mb-2 flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5" />
        Dicas do SV LOTES
      </p>
      <ul className="space-y-2">
        {tips.map((tip, idx) => (
          <li key={idx} className="flex gap-2 text-sm text-gray-300 leading-relaxed">
            <span className="text-violet-400 shrink-0">✓</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ManualEstimatedTimeBadge({ time }: { time: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-400">
      <Clock className="w-3.5 h-3.5 text-orange-400" />
      Tempo médio: <span className="text-orange-300 font-medium">{time}</span>
    </span>
  );
}
