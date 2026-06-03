'use client';

import { Map as MapIcon, ArrowRight } from 'lucide-react';
import { LandingScreenshot } from './LandingScreenshot';

export function LandingMapDemo() {
  return (
    <section
      id="mapa-demo"
      className="landing-section landing-map-demo border-t border-[var(--color-border)]/40"
    >
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div className="order-2 lg:order-1">
          <p className="landing-badge inline-block text-[10px] font-semibold uppercase tracking-widest mb-3 px-3 py-1 rounded-full">
            Demonstração do mapa
          </p>
          <h2 className="landing-section-title text-2xl sm:text-3xl font-bold mb-4 tracking-tight">
            Venda lotes direto no mapa GIS
          </h2>
          <p className="landing-lead leading-relaxed mb-6">
            Visualize status por cores, consulte metragem e feche negócios no terreno com a mesma
            interface que sua equipe usa no escritório — em tempo real.
          </p>
          <ul className="space-y-3 mb-8">
            {[
              'Lotes disponíveis, reservados e vendidos',
              'Georreferenciamento e camadas do empreendimento',
              'Integração com contratos e financeiro',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm landing-body">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          <a href="#planos" className="landing-btn-ghost inline-flex">
            Ver planos
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="order-1 lg:order-2 relative landing-map-demo-visual">
          <div className="absolute -inset-4 bg-emerald-500/10 rounded-3xl blur-3xl pointer-events-none" />
          <div className="absolute -inset-2 bg-[var(--color-primary)]/8 rounded-3xl blur-2xl pointer-events-none" />
          <div className="landing-glass p-1.5 rounded-2xl relative shadow-2xl">
            <div className="aspect-[16/10] rounded-xl overflow-hidden relative">
              <LandingScreenshot id="map" />
            </div>
          </div>
          <div className="absolute -bottom-3 -left-3 landing-glass px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg">
            <MapIcon className="w-4 h-4 text-[var(--success)]" />
            <span className="text-xs font-medium landing-body">Mapa GIS em produção</span>
          </div>
        </div>
      </div>
    </section>
  );
}
