export type ScreenId =
  | 'dashboard'
  | 'map'
  | 'finance'
  | 'contracts'
  | 'customers'
  | 'settings';

export const SCREEN_LABELS: Record<ScreenId, string> = {
  dashboard: 'Dashboard',
  map: 'Mapa GIS',
  finance: 'Financeiro',
  contracts: 'Contratos',
  customers: 'Clientes',
  settings: 'Configurações',
};

/** Screenshots em public/landing/ (01 = menu; 02–07 = telas do sistema) */
export const SCREEN_IMAGE_PATHS: Record<ScreenId, string> = {
  dashboard: '/landing/02.png',
  map: '/landing/03.png',
  finance: '/landing/06.png',
  contracts: '/landing/07.png',
  customers: '/landing/04.png',
  settings: '/landing/05.png',
};

export const LANDING_EXTRA_IMAGES = [
  { src: '/landing/01.png', label: 'Navegação integrada' },
] as const;

export const LANDING_CONTACT = {
  name: 'Severino França',
  role: 'Técnico Agrimensor | Direção Técnica',
  company: 'SV Topografia e Projetos LTDA',
  phones: ['(94) 99195-5918', '(94) 98446-1415'],
  email: 'gerencia@nortesultopografia.com.br',
  website: 'www.nortesultopografia.com.br',
  websiteUrl: 'https://www.nortesultopografia.com.br',
  city: 'Parauapebas - PA',
  slogan: 'Precisão e tecnologia para o seu projeto.',
  whatsappUrl: 'https://wa.me/5594991955918',
  mailto: 'mailto:gerencia@nortesultopografia.com.br',
} as const;

export const LANDING_SERVICES = [
  'Topografia',
  'Aerofotogrametria e Drones',
  'Georreferenciamento e Cadastro',
  'Projetos e Levantamentos',
] as const;

function MockChrome({ title }: { title: string }) {
  return (
    <div className="landing-mock-bar shrink-0">
      <span className="landing-mock-dot" />
      <span className="landing-mock-dot" />
      <span className="landing-mock-dot" />
      <span className="ml-2 text-[9px] text-slate-500 font-mono truncate">{title}</span>
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-slate-900/80 border border-slate-700/50 p-2 min-w-0">
      <p className="text-[8px] uppercase tracking-wide text-slate-500 truncate">{label}</p>
      <p className="text-sm font-bold text-white tabular-nums" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

export function ScreenMock({ id }: { id: ScreenId }) {
  const title = `SV LOTES — ${SCREEN_LABELS[id]}`;

  if (id === 'dashboard') {
    return (
      <div className="landing-mock w-full h-full flex flex-col">
        <MockChrome title={title} />
        <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
          <div className="grid grid-cols-4 gap-2">
            <Kpi label="Vendas" value="128" color="#f97316" />
            <Kpi label="Recebido" value="R$ 2,4M" color="#22c55e" />
            <Kpi label="Inadimpl." value="12" color="#ef4444" />
            <Kpi label="Lotes livres" value="84" color="#3b82f6" />
          </div>
          <div className="flex-1 grid grid-cols-3 gap-2 min-h-0">
            <div className="col-span-2 rounded-md bg-slate-900/60 border border-slate-700/40 p-2 flex flex-col">
              <p className="text-[8px] text-slate-500 mb-1">Fluxo de vendas</p>
              <div className="flex-1 flex items-end gap-1 px-1">
                {[40, 55, 35, 70, 50, 85, 60, 75, 45, 90].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm bg-gradient-to-t from-orange-600/80 to-orange-400/90"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-md bg-slate-900/60 border border-slate-700/40 p-2">
              <p className="text-[8px] text-slate-500 mb-1">Status lotes</p>
              <div className="w-16 h-16 mx-auto rounded-full border-[6px] border-orange-500/80 border-r-emerald-500/70 border-b-slate-600/50 border-l-blue-500/60" />
            </div>
          </div>
          <div className="h-16 rounded-md bg-emerald-950/30 border border-emerald-800/30 relative overflow-hidden">
            <div className="absolute inset-0 opacity-40 bg-[linear-gradient(90deg,transparent_0%,#166534_50%,transparent_100%)]" />
            <div className="absolute inset-2 grid grid-cols-6 grid-rows-2 gap-1">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-sm ${i % 3 === 0 ? 'bg-orange-500/50' : i % 3 === 1 ? 'bg-emerald-500/40' : 'bg-slate-600/40'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (id === 'map') {
    return (
      <div className="landing-mock w-full h-full flex flex-col">
        <MockChrome title={title} />
        <div className="flex-1 relative bg-[#0c1410] min-h-0">
          <div className="absolute inset-0 opacity-60 bg-[radial-gradient(circle_at_30%_40%,#14532d_0%,transparent_45%),radial-gradient(circle_at_70%_60%,#166534_0%,transparent_40%)]" />
          <div className="absolute inset-4 grid grid-cols-5 grid-rows-4 gap-1">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className={`rounded border ${
                  i === 7
                    ? 'bg-orange-500/70 border-orange-400'
                    : i === 3 || i === 11
                      ? 'bg-emerald-600/50 border-emerald-500/50'
                      : 'bg-slate-800/50 border-slate-600/40'
                }`}
              />
            ))}
          </div>
          <div className="absolute bottom-3 left-3 right-3 h-8 rounded bg-slate-900/90 border border-slate-700 flex items-center px-2 gap-2 text-[8px] text-slate-400">
            <span className="text-orange-400 font-semibold">Lote 42-A</span>
            <span>· Disponível · 360 m²</span>
          </div>
        </div>
      </div>
    );
  }

  if (id === 'finance') {
    return (
      <div className="landing-mock w-full h-full flex flex-col">
        <MockChrome title={title} />
        <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
          <div className="grid grid-cols-3 gap-2">
            <Kpi label="A receber" value="R$ 890k" color="#eab308" />
            <Kpi label="Recebido mês" value="R$ 312k" color="#22c55e" />
            <Kpi label="Atrasado" value="R$ 48k" color="#ef4444" />
          </div>
          <div className="flex-1 rounded-md border border-slate-700/50 overflow-hidden">
            <div className="grid grid-cols-5 gap-px bg-slate-800 text-[7px] text-slate-500 uppercase">
              {['Cliente', 'Parcela', 'Venc.', 'Valor', 'Status'].map((h) => (
                <div key={h} className="bg-slate-900/90 px-2 py-1.5">
                  {h}
                </div>
              ))}
            </div>
            {[
              ['Silva', '12/48', '10/06', 'R$ 1.240', 'pago'],
              ['Oliveira', '08/36', '15/06', 'R$ 980', 'pend.'],
              ['Costa', '03/24', '01/05', 'R$ 1.100', 'atr.'],
            ].map((row, ri) => (
              <div key={ri} className="grid grid-cols-5 gap-px bg-slate-800/80 text-[8px]">
                {row.map((cell, ci) => (
                  <div
                    key={ci}
                    className={`bg-slate-900/70 px-2 py-1.5 ${
                      ci === 4
                        ? cell === 'pago'
                          ? 'text-emerald-400'
                          : cell === 'atr.'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {cell}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (id === 'contracts') {
    return (
      <div className="landing-mock w-full h-full flex flex-col">
        <MockChrome title={title} />
        <div className="flex-1 p-3 flex gap-2 min-h-0">
          <div className="w-1/3 flex flex-col gap-1.5">
            {['000128/2026', '000127/2026', '000126/2026'].map((n, i) => (
              <div
                key={n}
                className={`rounded px-2 py-1.5 text-[8px] border ${
                  i === 0
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-200'
                    : 'bg-slate-900/60 border-slate-700/50 text-slate-400'
                }`}
              >
                {n}
              </div>
            ))}
          </div>
          <div className="flex-1 rounded-md bg-white/[0.03] border border-slate-700/50 p-2 text-[7px] text-slate-400 leading-relaxed">
            <p className="text-orange-400/90 font-semibold mb-1">INSTRUMENTO PARTICULAR DE COMPRA E VENDA</p>
            <p className="opacity-80">
              Entre as partes qualificadas, o presente contrato tem por objeto a venda do lote
              identificado no mapa cadastral...
            </p>
            <div className="mt-2 h-6 rounded bg-slate-800/60 border border-dashed border-slate-600" />
          </div>
        </div>
      </div>
    );
  }

  if (id === 'customers') {
    return (
      <div className="landing-mock w-full h-full flex flex-col">
        <MockChrome title={title} />
        <div className="flex-1 p-3 grid grid-cols-2 gap-2 min-h-0">
          <div className="flex flex-col gap-1.5">
            <p className="text-[8px] text-slate-500 uppercase">Clientes</p>
            {['Maria Santos', 'João Pereira', 'Ana Lima'].map((name, i) => (
              <div
                key={name}
                className={`flex items-center gap-2 rounded px-2 py-1.5 border ${
                  i === 0 ? 'border-purple-500/30 bg-purple-500/10' : 'border-slate-700/50 bg-slate-900/50'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500/60 to-orange-500/40 shrink-0" />
                <span className="text-[8px] text-slate-300 truncate">{name}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-[8px] text-slate-500 uppercase">Corretores</p>
            {['Carlos M.', 'Patrícia R.'].map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 rounded px-2 py-1.5 border border-cyan-700/30 bg-cyan-950/20"
              >
                <div className="w-6 h-6 rounded-full bg-cyan-500/30 shrink-0" />
                <span className="text-[8px] text-slate-300">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-mock w-full h-full flex flex-col">
      <MockChrome title={title} />
      <div className="flex-1 p-3 flex gap-2 min-h-0">
        <div className="w-24 flex flex-col gap-1 text-[7px] text-slate-500">
          {['Empresa', 'Usuários', 'Mapa', 'Financeiro', 'Contratos'].map((item, i) => (
            <div
              key={item}
              className={`px-2 py-1 rounded ${i === 0 ? 'bg-orange-500/20 text-orange-300' : ''}`}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="flex-1 rounded-md border border-slate-700/50 p-2 space-y-2">
          <p className="text-[8px] text-slate-400">Dados da loteadora</p>
          <div className="h-5 rounded bg-slate-800/80 border border-slate-700" />
          <div className="h-5 rounded bg-slate-800/80 border border-slate-700 w-3/4" />
          <div className="flex gap-2 mt-3">
            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-dashed border-slate-600 flex items-center justify-center text-[7px] text-slate-500">
              Logo
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-4 rounded bg-slate-800/80" />
              <div className="h-4 rounded bg-slate-800/80 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
