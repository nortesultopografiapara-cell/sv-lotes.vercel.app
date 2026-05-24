'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Globe, ShieldCheck, Map as MapIcon, Calendar, FileText, Wallet, Users, AreaChart, Lock, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#040914] text-white selection:bg-[#00D26A] selection:text-black font-sans overflow-x-hidden">
      {/* HEADER */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#040914]/80 backdrop-blur-md border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative group">
               <Globe className="w-10 h-10 text-[#00D26A] transition-transform duration-500 group-hover:rotate-180" />
               <div className="absolute inset-0 bg-[#00D26A] blur-[15px] opacity-40 mix-blend-screen" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter uppercase text-white leading-none">
                SV <span className="text-[#00D26A] font-light">LOTES</span>
              </span>
            </div>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-400">
            <a href="#inicio" className="hover:text-white transition-colors">Início</a>
            <a href="#recursos" className="hover:text-white transition-colors">Recursos</a>
            <a href="#demonstracao" className="hover:text-white transition-colors">Demonstração</a>
            <a href="#planos" className="hover:text-white transition-colors">Planos</a>
            <a href="#contato" className="hover:text-white transition-colors">Contato</a>
          </nav>

          <div className="flex items-center gap-4">
            <Link 
              href="/login" 
              className="px-6 py-2.5 text-sm font-bold rounded-lg bg-[#0B1F3A] border border-[#0B1F3A] hover:bg-[#00D26A] hover:text-black hover:border-[#00D26A] text-white transition-all shadow-[0_0_20px_rgba(11,31,58,0.5)] hover:shadow-[0_0_25px_rgba(0,210,106,0.5)]"
            >
              Acessar Sistema
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section id="inicio" className="relative pt-40 pb-24 md:pt-48 md:pb-40 px-6 overflow-hidden">
          {/* Background effects */}
          <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#0B1F3A]/40 rounded-full blur-[150px] pointer-events-none" />
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[#00D26A]/10 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#00D26A 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]" />

          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
                SV LOTES — Gestão Inteligente para <span className="text-[#00D26A] drop-shadow-[0_0_15px_rgba(0,210,106,0.4)]">Loteamentos.</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-10 max-w-lg font-light">
                Mapa GIS, contratos, financeiro, reservas e relatórios em uma única plataforma.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
                <a 
                  href="#demonstracao" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-bold rounded-xl bg-[#00D26A] hover:bg-[#00b058] text-black transition-all shadow-[0_0_30px_rgba(0,210,106,0.3)] hover:shadow-[0_0_40px_rgba(0,210,106,0.5)]"
                >
                  Solicitar Demonstração
                </a>
                <Link 
                  href="/login" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-bold rounded-xl bg-transparent border border-[#0B1F3A] text-white hover:bg-[#0B1F3A]/50 hover:border-[#00D26A]/50 transition-all shadow-[0_0_20px_rgba(11,31,58,0.2)]"
                >
                  Acessar Sistema <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Mini Indicators */}
              <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-gray-400">
                 <div className="flex items-center gap-1.5"><ShieldCheck className="w-5 h-5 text-[#00D26A]" /> 100% Web e Seguro</div>
                 <div className="flex items-center gap-1.5"><MapIcon className="w-5 h-5 text-[#00D26A]" /> GIS Interativo</div>
                 <div className="flex items-center gap-1.5"><FileText className="w-5 h-5 text-[#00D26A]" /> Automação de Contratos</div>
                 <div className="flex items-center gap-1.5"><Users className="w-5 h-5 text-[#00D26A]" /> Multiempresa SaaS</div>
              </div>

            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative w-full aspect-[4/3] max-w-3xl mx-auto lg:ml-auto"
            >
                 {/* Main Dashboard Mockup - Giant */}
                 <div className="absolute inset-0 z-10 bg-[#0B1F3A]/30 backdrop-blur-3xl border border-[#0B1F3A] rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/5 group transition-transform duration-500 hover:scale-[1.02]">
                    {/* Window Header */}
                    <div className="h-10 border-b border-[#0B1F3A] flex items-center px-4 gap-2 bg-[#040914]/80">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                        <div className="mx-auto text-[10px] font-mono text-gray-500 tracking-wider">dashboard.svlotes.com</div>
                    </div>
                    {/* Dashboard Layout */}
                    <div className="flex-1 flex gap-4 bg-[#040914] p-4">
                        {/* Sidebar */}
                        <div className="w-14 border-r border-[#0B1F3A] flex flex-col items-center py-4 gap-6">
                           <div className="w-8 h-8 rounded-lg bg-[#00D26A]/20 border border-[#00D26A]/40 flex items-center justify-center shadow-[0_0_15px_rgba(0,210,106,0.2)]">
                              <Globe className="w-5 h-5 text-[#00D26A]" />
                           </div>
                           <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><AreaChart className="w-4 h-4 text-gray-500" /></div>
                           <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><FileText className="w-4 h-4 text-gray-500" /></div>
                           <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"><Wallet className="w-4 h-4 text-gray-500" /></div>
                        </div>
                        {/* Content */}
                        <div className="flex-1 flex flex-col gap-4">
                           {/* KPIs */}
                           <div className="grid grid-cols-4 gap-4">
                               <div className="h-20 bg-[#0B1F3A]/40 border border-[#0B1F3A] rounded-xl p-3 flex flex-col justify-center shadow-lg">
                                  <div className="text-[9px] text-gray-400 mb-1 uppercase tracking-widest font-bold">VGV Total</div>
                                  <div className="text-lg font-black text-white">R$ 24.5M</div>
                               </div>
                               <div className="h-20 bg-[#00D26A]/10 border border-[#00D26A]/30 rounded-xl p-3 flex flex-col justify-center shadow-[0_0_20px_rgba(0,210,106,0.15)] relative overflow-hidden">
                                  <div className="absolute right-0 top-0 w-16 h-16 bg-[#00D26A]/20 blur-xl" />
                                  <div className="text-[9px] text-[#00D26A] mb-1 uppercase tracking-widest font-bold">Vendas Mês</div>
                                  <div className="text-lg font-black text-white">R$ 1.8M</div>
                               </div>
                               <div className="h-20 bg-[#0B1F3A]/40 border border-[#0B1F3A] rounded-xl p-3 flex flex-col justify-center shadow-lg">
                                  <div className="text-[9px] text-gray-400 mb-1 uppercase tracking-widest font-bold">Lotes Vendidos</div>
                                  <div className="text-lg font-black text-white">128 / 450</div>
                               </div>
                               <div className="h-20 bg-[#0B1F3A]/40 border border-[#0B1F3A] rounded-xl p-3 flex flex-col justify-center shadow-lg">
                                  <div className="text-[9px] text-gray-400 mb-1 uppercase tracking-widest font-bold">Inadimplência</div>
                                  <div className="text-lg font-black text-white">2.4%</div>
                               </div>
                           </div>
                           {/* Map & Chart row */}
                           <div className="flex-1 flex gap-4">
                               <div className="flex-[2] bg-[#0B1F3A]/20 rounded-xl border border-[#0B1F3A] relative overflow-hidden flex flex-col shadow-lg items-center justify-center p-2">
                                    <div className="absolute inset-0 bg-[#040914] opacity-90" style={{ backgroundImage: 'radial-gradient(rgba(11, 31, 58, 0.5) 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
                                    <div className="absolute inset-0 flex flex-wrap content-center justify-center p-2 gap-1 rotate-6 scale-110">
                                       {Array(40).fill(0).map((_, i) => (
                                          <div key={i} className={`w-8 h-10 rounded-sm shadow-md transition-opacity duration-300 hover:opacity-100 ${i%4===0 ? 'bg-[#00D26A]/80 border border-[#00D26A] opacity-90' : i%7===0 ? 'bg-red-500/80 border border-red-500 opacity-90' : 'bg-[#0B1F3A]/80 border border-[#00D26A]/20 opacity-60'}`} />
                                       ))}
                                    </div>
                               </div>
                               <div className="flex-1 bg-[#0B1F3A]/20 rounded-xl border border-[#0B1F3A] flex flex-col p-4 justify-end gap-3 shadow-lg relative overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/50 to-transparent pointer-events-none" />
                                  <div className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-auto relative z-10">Receitas</div>
                                  {/* Bar chart */}
                                  <div className="w-full h-2/3 flex items-end justify-between gap-1 px-1 relative z-10">
                                     <div className="w-4 bg-white/20 hover:bg-[#00D26A] transition-colors rounded-t-sm" style={{height: '30%'}}/>
                                     <div className="w-4 bg-white/20 hover:bg-[#00D26A] transition-colors rounded-t-sm" style={{height: '50%'}}/>
                                     <div className="w-4 bg-white/20 hover:bg-[#00D26A] transition-colors rounded-t-sm" style={{height: '40%'}}/>
                                     <div className="w-4 bg-[#00D26A] rounded-t-sm shadow-[0_0_15px_rgba(0,210,106,0.6)]" style={{height: '90%'}}/>
                                  </div>
                               </div>
                           </div>
                        </div>
                    </div>
                 </div>
                 
                 {/* Floating Elements removed to focus on Giant Mockup */}
            </motion.div>
          </div>
        </section>

        {/* RECURSOS */}
        <section id="recursos" className="py-24 px-6 bg-[#0B1F3A]/10 border-y border-[#0B1F3A]">
          <div className="max-w-7xl mx-auto relative z-10">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#00D26A 2px, transparent 2px)', backgroundSize: '60px 60px' }} />
            <div className="text-center mb-16 relative z-10">
              <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 text-white">Tudo que sua loteadora precisa</h2>
              <p className="text-gray-400 max-w-2xl mx-auto text-lg font-light">Ferramentas avançadas para gestão, vendas, GIS e automação.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
              <FeatureCard 
                icon={<MapIcon className="text-[#00D26A]" />} 
                title="Mapa GIS Interativo" 
                desc="Acompanhe vendas em tempo real sobre mapa inteligente. Clique no lote e veja os dados."
              />
              <FeatureCard 
                icon={<Calendar className="text-[#00D26A]" />} 
                title="Reservas e Vendas" 
                desc="Gerencie disponibilidade e propostas comerciais rapidamente em um fluxo organizado."
              />
              <FeatureCard 
                icon={<FileText className="text-[#00D26A]" />} 
                title="Contratos Automáticos" 
                desc="Gere documentos preenchidos com os dados do cliente e do lote num clique."
              />
              <FeatureCard 
                icon={<Wallet className="text-[#00D26A]" />} 
                title="Financeiro Completo" 
                desc="Títulos a receber, inadimplência, relatórios de caixa e projeção de faturamento."
              />
              <FeatureCard 
                icon={<Users className="text-[#00D26A]" />} 
                title="Corretores e Comissões" 
                desc="Gestão impecável de corretores, pagamentos de comissão e controle de metas."
              />
              <FeatureCard 
                icon={<AreaChart className="text-[#00D26A]" />} 
                title="Relatórios PDF/Excel" 
                desc="Auditoria e exportação de dados com layout refinado para reuniões executivas."
              />
              <FeatureCard 
                icon={<Globe className="text-[#00D26A]" />} 
                title="Multiempresa SaaS" 
                desc="Organize diferentes CNPJs ou SPEs (loteamentos) com banco de dados seguro."
              />
              <FeatureCard 
                icon={<Lock className="text-[#00D26A]" />} 
                title="Segurança e Auditoria" 
                desc="Registro completo de tudo que acontece no sistema e proteção rigorosa de acessos."
              />
            </div>
          </div>
        </section>

        {/* DEMONSTRAÇÃO VISUAL */}
        <section id="demonstracao" className="py-32 px-6 relative overflow-hidden bg-[#040914]">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#00D26A]/5 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
          
          <div className="max-w-7xl mx-auto flex flex-col items-center">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center">Demonstração da Plataforma</h2>
            <p className="text-gray-400 text-lg mb-12 text-center max-w-2xl font-light">Interface moderna, intuitiva e completa.</p>
            
            {/* Fake Tabs */}
            <div className="flex flex-wrap justify-center gap-2 mb-12 p-1.5 bg-[#0B1F3A]/50 rounded-2xl backdrop-blur-md border border-[#0B1F3A]">
               <div className="px-6 py-2.5 rounded-xl bg-[#00D26A] text-black font-bold text-sm shadow-[0_0_20px_rgba(0,210,106,0.5)]">Dashboard</div>
               <div className="px-6 py-2.5 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Mapa GIS</div>
               <div className="px-6 py-2.5 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Financeiro</div>
               <div className="px-6 py-2.5 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Contratos</div>
               <div className="px-6 py-2.5 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Corretores</div>
               <div className="px-6 py-2.5 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Clientes</div>
            </div>

            {/* Huge Mockup Screen - Multi-panel */}
            <div className="w-full max-w-6xl aspect-[16/8] bg-[#040914]/90 backdrop-blur-2xl border border-[#0B1F3A] rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative flex overflow-hidden ring-1 ring-[#0B1F3A]/50 p-6 gap-6">
                 {/* Internal Dashboard Mockup */}
                 <div className="flex-1 border border-[#0B1F3A]/50 bg-[#0B1F3A]/20 rounded-2xl overflow-hidden flex flex-col p-4 shadow-xl">
                     <div className="h-6 w-1/3 bg-white/5 rounded-md mb-6" />
                     <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="h-24 bg-white/5 border border-white/5 rounded-xl" />
                        <div className="h-24 bg-white/5 border border-white/5 rounded-xl" />
                     </div>
                     <div className="flex-1 bg-white/5 border border-white/5 rounded-xl mt-2 flex items-center justify-center relative overflow-hidden">
                       <AreaChart className="w-16 h-16 text-[#00D26A] opacity-20" />
                       <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-[#00D26A]/20 to-transparent" />
                     </div>
                 </div>

                 {/* Middle GIS Mockup */}
                 <div className="flex-[1.5] border border-[#0B1F3A] bg-[#0B1F3A]/40 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(11,31,58,0.8)] relative group">
                    <div className="absolute inset-0 z-0 bg-[#040914] opacity-80" style={{ backgroundImage: 'radial-gradient(rgba(0, 210, 106, 0.4) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="absolute inset-4 border border-[#00D26A]/40 rounded-xl bg-[#00D26A]/5 backdrop-blur-sm z-10 p-4 flex flex-col items-center justify-center overflow-hidden">
                       <MapIcon className="w-20 h-20 text-[#00D26A]/50 mb-4" />
                       <div className="flex flex-wrap items-center justify-center gap-1 w-full h-full rotate-6">
                           {Array(30).fill(0).map((_, i) => (
                              <div key={i} className={`w-8 h-12 rounded-sm ${i%3===0 ? 'bg-red-500/80 border border-red-500' : 'bg-[#00D26A]/80 border border-[#00D26A]'}`} />
                           ))}
                       </div>
                    </div>
                 </div>

                 {/* Right Side Panel */}
                 <div className="flex-1 border border-[#0B1F3A]/50 bg-[#0B1F3A]/20 rounded-2xl overflow-hidden flex flex-col p-4 shadow-xl">
                     <div className="h-6 w-1/2 bg-white/5 rounded-md mb-6" />
                     <div className="space-y-3">
                        <div className="h-12 bg-white/5 border border-white/5 rounded-lg flex items-center px-4 justify-between"><div className="w-1/2 h-2 bg-white/10 rounded-full" /><div className="w-1/4 h-4 bg-[#00D26A]/50 rounded-md" /></div>
                        <div className="h-12 bg-white/5 border border-white/5 rounded-lg flex items-center px-4 justify-between"><div className="w-2/3 h-2 bg-white/10 rounded-full" /><div className="w-1/4 h-4 bg-[#0B1F3A]/80 rounded-md" /></div>
                        <div className="h-12 bg-white/5 border border-white/5 rounded-lg flex items-center px-4 justify-between"><div className="w-1/2 h-2 bg-white/10 rounded-full" /><div className="w-1/4 h-4 bg-red-500/50 rounded-md" /></div>
                        <div className="h-12 bg-white/5 border border-white/5 rounded-lg flex items-center px-4 justify-between"><div className="w-3/4 h-2 bg-white/10 rounded-full" /><div className="w-1/4 h-4 bg-[#00D26A]/50 rounded-md" /></div>
                     </div>
                 </div>
            </div>
            
            {/* Carousel dots */}
            <div className="flex justify-center gap-2 mt-8">
               <div className="w-2 h-2 rounded-full bg-[#00D26A] shadow-[0_0_10px_rgba(0,210,106,0.8)]" />
               <div className="w-2 h-2 rounded-full bg-gray-700" />
               <div className="w-2 h-2 rounded-full bg-gray-700" />
               <div className="w-2 h-2 rounded-full bg-gray-700" />
            </div>
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" className="py-32 px-6 bg-[#040914] border-t border-[#0B1F3A]">
          <div className="max-w-7xl mx-auto relative z-10">
             <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-white">Escolha o plano ideal</h2>
              <p className="text-gray-400 max-w-2xl mx-auto text-lg font-light">Planos flexíveis para loteadoras de todos os tamanhos.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Básico */}
              <div className="bg-[#0B1F3A]/20 backdrop-blur-xl border border-[#0B1F3A] hover:border-[#00D26A]/30 rounded-[2rem] p-10 flex flex-col transition-all duration-300 shadow-lg">
                <h3 className="text-xl font-bold text-gray-300 mb-2">Básico</h3>
                <div className="flex items-start gap-1 mb-8">
                  <span className="text-4xl font-black text-white">R$ 329,99</span>
                  <span className="text-gray-500 font-medium text-sm mt-2">/mês</span>
                </div>
                <div className="text-sm font-bold text-gray-400 mb-8 border-b border-[#0B1F3A] pb-4">
                  3 loteamentos<br/>5 corretores
                </div>
                <div className="space-y-5 mb-10 flex-1">
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Contratos Automáticos" />
                  <PlanFeature text="Financeiro Básico" />
                  <PlanFeature text="Suporte Ticket" />
                </div>
                <Link href="#contato" className="block w-full text-center px-6 py-4 rounded-xl bg-transparent border border-[#0B1F3A] hover:bg-[#0B1F3A]/50 text-white font-bold transition-colors">
                  Escolher Plano
                </Link>
              </div>

              {/* Business - DESTACADO */}
              <div className="bg-[#0B1F3A] border border-[#00D26A] rounded-[2.5rem] p-12 flex flex-col relative transform md:-translate-y-8 shadow-[0_0_50px_rgba(0,210,106,0.15)] ring-1 ring-[#00D26A]/50 z-10">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-1.5 bg-[#00D26A] rounded-full text-[10px] font-black tracking-widest uppercase text-black shadow-[0_0_15px_rgba(0,210,106,0.5)] whitespace-nowrap">Mais Popular</div>
                <h3 className="text-2xl font-bold text-[#00D26A] mb-2">Business</h3>
                <div className="flex items-start gap-1 mb-8">
                  <span className="text-5xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">R$ 549,99</span>
                  <span className="text-gray-400 font-medium text-sm mt-3">/mês</span>
                </div>
                 <div className="text-sm font-bold text-gray-300 mb-8 border-b border-[#00D26A]/20 pb-4">
                  6 loteamentos<br/>10 corretores
                </div>
                <div className="space-y-5 mb-10 flex-1">
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Contratos Automáticos" />
                  <PlanFeature text="Financeiro Completo" />
                  <PlanFeature text="Relatórios PDF/Excel" />
                  <PlanFeature text="Suporte via WhatsApp" />
                </div>
                <Link href="/login" className="block w-full text-center px-6 py-4 rounded-xl bg-[#00D26A] hover:bg-[#00b058] text-black font-black tracking-wide shadow-[0_0_20px_rgba(0,210,106,0.3)] transition-all">
                  Escolher Plano
                </Link>
              </div>

              {/* Profissional */}
              <div className="bg-[#0B1F3A]/20 backdrop-blur-xl border border-[#0B1F3A] hover:border-[#00D26A]/30 rounded-[2rem] p-10 flex flex-col transition-all duration-300 shadow-lg">
                <h3 className="text-xl font-bold text-gray-300 mb-2">Profissional</h3>
                <div className="flex items-start gap-1 mb-8">
                  <span className="text-4xl font-black text-white">R$ 1.099,99</span>
                  <span className="text-gray-500 font-medium text-sm mt-2">/mês</span>
                </div>
                <div className="text-sm font-bold text-gray-400 mb-8 border-b border-[#0B1F3A] pb-4">
                  25 loteamentos<br/>50 corretores
                </div>
                <div className="space-y-5 mb-10 flex-1">
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Contratos Automáticos" />
                  <PlanFeature text="Financeiro Completo" />
                  <PlanFeature text="Relatórios PDF/Excel" />
                  <PlanFeature text="Suporte via WhatsApp" />
                </div>
                <Link href="#contato" className="block w-full text-center px-6 py-4 rounded-xl bg-transparent border border-[#0B1F3A] hover:bg-[#0B1F3A]/50 text-white font-bold transition-colors">
                  Escolher Plano
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-[#0B1F3A] bg-[#040914] py-10 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-500 font-medium tracking-wide">
           <p>SV LOTES © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: any) {
  return (
    <div className="group relative bg-[#0B1F3A]/40 backdrop-blur-md border border-[#0B1F3A] rounded-2xl p-6 hover:border-[#00D26A] transition-all duration-300 overflow-hidden shadow-lg hover:shadow-[0_0_25px_rgba(0,210,106,0.15)] flex flex-col">
       {/* Hover gradient glow */}
       <div 
         className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-0 blur-2xl group-hover:opacity-20 transition-opacity duration-500 bg-[#00D26A]" 
       />
       <div className="w-12 h-12 bg-[#040914] rounded-xl border border-[#0B1F3A] flex items-center justify-center mb-4 group-hover:border-[#00D26A]/50 transition-colors">
          {icon}
       </div>
       <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
       <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
     <div className="flex items-center gap-3">
        <CheckCircle2 className="w-4 h-4 text-[#00D26A]" />
        <span className="text-gray-300 text-sm">{text}</span>
     </div>
  );
}
