'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { Globe, ShieldCheck, Map as MapIcon, Calendar, FileText, Wallet, Users, AreaChart, Lock, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#06090e] text-white selection:bg-[#2563eb] selection:text-white font-sans overflow-x-hidden">
      {/* HEADER */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#0a0d14]/80 backdrop-blur-md border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
               <Globe className="w-12 h-12 text-[#10b981]" />
               <div className="absolute inset-0 bg-[#2563eb] blur-[10px] opacity-30 mix-blend-screen" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tighter uppercase text-white leading-none">
                SV <span className="text-[#60a5fa] font-light">LOTES</span>
              </span>
              <span className="text-[9px] text-[#10b981] font-bold tracking-widest uppercase mt-1">Topografia & Projetos</span>
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
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-white hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)]"
            >
              Acessar Sistema
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section id="inicio" className="relative pt-48 pb-24 md:pt-60 md:pb-40 px-6 overflow-hidden">
          {/* Background effects */}
          <div className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#2563eb]/20 rounded-full blur-[150px] pointer-events-none" />
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-[#10b981]/15 rounded-full blur-[120px] pointer-events-none" />

          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-[#60a5fa] mb-8 shadow-[0_0_15px_rgba(96,165,250,0.15)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
                </span>
                Nova Versão 2.1 — Atualização Recente
              </div>
              <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
                SV LOTES — Gestão Inteligente para <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] to-[#10b981]">Loteamentos.</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-10 max-w-lg font-light">
                Mapa GIS, contratos, financeiro, corretores, reservas e relatórios em uma única plataforma completa.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4 mb-10">
                <a 
                  href="#demonstracao" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-bold rounded-xl bg-[#10b981] hover:bg-[#059669] text-white transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                >
                  Solicitar Demonstração <CheckCircle2 className="w-4 h-4" />
                </a>
                <Link 
                  href="/login" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-bold rounded-xl bg-transparent border border-white/20 text-white hover:bg-white/5 transition-all"
                >
                  Acessar Sistema <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {/* Mini Indicators */}
              <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-gray-400">
                 <div className="flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-[#2563eb]" /> 100% Seguro</div>
                 <div className="flex items-center gap-1.5"><MapIcon className="w-4 h-4 text-[#2563eb]" /> GIS Global</div>
                 <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-[#2563eb]" /> Automação</div>
                 <div className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-[#2563eb]" /> Multiempresa</div>
              </div>

              <div className="mt-10 flex items-center gap-4 opacity-60 bg-white/5 w-fit px-6 py-3 rounded-2xl border border-white/5">
                 <Globe className="w-10 h-10 text-gray-400" />
                 <div className="flex flex-col">
                    <span className="text-2xl font-black text-gray-300 tracking-tighter leading-none">SV</span>
                    <span className="text-[9px] font-bold tracking-widest text-[#10b981] uppercase mt-0.5">Topografia e Projetos</span>
                 </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative w-full aspect-[4/3] max-w-2xl mx-auto lg:ml-auto"
            >
                 {/* Main Dashboard Window */}
                 <div className="absolute inset-0 z-10 bg-[#0a0d14]/90 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden transform rotate-y-[-5deg] rotate-x-[5deg] perspective-1000 ring-1 ring-white/5">
                    {/* Window Header */}
                    <div className="h-10 border-b border-white/5 flex items-center px-4 gap-2 bg-[#11161d]">
                        <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
                        <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
                        <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
                        <div className="mx-auto text-[10px] font-mono text-gray-500 tracking-wider">svlotes.sys/dashboard</div>
                    </div>
                    {/* Dashboard Layout */}
                    <div className="flex-1 flex p-4 gap-4 bg-[#06090e]">
                        {/* Sidebar */}
                        <div className="w-12 border-r border-white/5 flex flex-col items-center py-4 gap-6">
                           <div className="w-8 h-8 rounded-lg bg-[#2563eb]/20 border border-[#2563eb]/40" />
                           <div className="w-8 h-8 rounded-lg bg-white/5" />
                           <div className="w-8 h-8 rounded-lg bg-white/5" />
                           <div className="w-8 h-8 rounded-lg bg-white/5" />
                        </div>
                        {/* Content */}
                        <div className="flex-1 flex flex-col gap-4">
                           {/* KPIs */}
                           <div className="grid grid-cols-3 gap-4">
                               <div className="h-20 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-center">
                                  <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-widest">VGV Total</div>
                                  <div className="text-xl font-bold text-white">R$ 24.5M</div>
                               </div>
                               <div className="h-20 bg-[#10b981]/10 border border-[#10b981]/30 rounded-xl p-4 flex flex-col justify-center shadow-[0_0_20px_rgba(16,185,129,0.15)] relative overflow-hidden">
                                  <div className="absolute right-0 top-0 w-16 h-16 bg-[#10b981]/20 blur-xl" />
                                  <div className="text-[10px] text-[#10b981] mb-1 uppercase tracking-widest font-bold">Vendas Mês</div>
                                  <div className="text-xl font-bold text-white">R$ 1.8M</div>
                               </div>
                               <div className="h-20 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-center">
                                  <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-widest">Lotes Vendidos</div>
                                  <div className="text-xl font-bold text-white">128</div>
                               </div>
                           </div>
                           {/* Map & Chart row */}
                           <div className="flex-1 flex gap-4">
                               <div className="flex-[2] bg-[#0f172a] rounded-xl border border-white/5 relative overflow-hidden flex flex-col">
                                   <div className="p-3 border-b border-white/5 text-[10px] uppercase tracking-widest text-gray-500 font-bold bg-[#11161d]">Mapa GIS Interativo</div>
                                   <div className="flex-1 w-full relative">
                                      <div className="absolute inset-0 bg-[#06090e] opacity-90" style={{ backgroundImage: 'radial-gradient(#2563eb 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                                      {/* Fake map plots */}
                                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-40 rotate-[15deg] flex flex-wrap gap-1 p-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl shadow-2xl">
                                         {Array(20).fill(0).map((_, i) => (
                                            <div key={i} className={`w-8 h-10 rounded-sm ${i%4===0 ? 'bg-[#10b981]/60 border border-[#10b981]' : i%5===0 ? 'bg-red-500/60 border border-red-500' : 'bg-[#2563eb]/60 border border-[#2563eb]'}`} />
                                         ))}
                                      </div>
                                   </div>
                               </div>
                               <div className="flex-1 bg-white/5 rounded-xl border border-white/10 flex flex-col p-4 justify-end gap-3">
                                  <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-auto">Receitas</div>
                                  {/* Bar chart */}
                                  <div className="w-full h-2/3 flex items-end gap-3 px-2">
                                     <div className="w-full bg-[#3b82f6]/40 hover:bg-[#3b82f6] transition-colors rounded-t-sm" style={{height: '30%'}}/>
                                     <div className="w-full bg-[#3b82f6]/40 hover:bg-[#3b82f6] transition-colors rounded-t-sm" style={{height: '50%'}}/>
                                     <div className="w-full bg-[#3b82f6]/40 hover:bg-[#3b82f6] transition-colors rounded-t-sm" style={{height: '80%'}}/>
                                     <div className="w-full bg-[#10b981] rounded-t-sm shadow-[0_0_15px_rgba(16,185,129,0.5)]" style={{height: '100%'}}/>
                                  </div>
                               </div>
                           </div>
                        </div>
                    </div>
                 </div>
                 
                 {/* Floating Mobile Mockup */}
                 <div className="absolute -right-12 -bottom-16 z-20 w-48 h-80 bg-[#06090e]/95 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] shadow-2xl p-2 transform rotate-12 scale-90 ring-1 ring-white/10">
                    <div className="w-full h-full border border-white/10 rounded-[2rem] overflow-hidden flex flex-col pt-6 bg-[#11161d]">
                       <div className="absolute top-0 inset-x-0 h-6 bg-black rounded-b-2xl w-1/2 mx-auto" />
                       <div className="px-4 pb-3 pt-2 border-b border-white/5 text-xs font-bold text-white tracking-widest text-center">CT-2026-0045</div>
                       <div className="flex-1 p-4 flex flex-col gap-4">
                          <div className="h-24 w-full bg-[#2563eb]/20 rounded-xl flex items-center justify-center border border-[#2563eb]/30 text-[#60a5fa]"><FileText className="w-10 h-10" /></div>
                          <div className="h-4 w-3/4 bg-white/10 rounded-full" />
                          <div className="h-2 w-full bg-white/5 rounded-full" />
                          <div className="h-2 w-5/6 bg-white/5 rounded-full" />
                          <div className="mt-auto px-4 py-2 bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 rounded-lg text-center text-[10px] font-bold uppercase tracking-widest">Assinado</div>
                       </div>
                    </div>
                 </div>
            </motion.div>
          </div>
        </section>

        {/* RECURSOS */}
        <section id="recursos" className="py-24 px-6 bg-[#0a0d14]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Tudo o que sua loteadora precisa</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Ferramentas avançadas que simplificam a gestão, da prospecção até a quitação, em um ambiente seguro e na nuvem.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <FeatureCard 
                icon={<MapIcon className="text-[#10b981]" />} 
                title="Mapa GIS Interativo" 
                desc="Acompanhe vendas em tempo real sobre mapa de satélite com calibração topográfica avançada."
                glowColor="#10b981"
              />
              <FeatureCard 
                icon={<Calendar className="text-[#f59e0b]" />} 
                title="Vendas e Reservas" 
                desc="Gerencie disponibilidade, reservas temporárias e efetivação de vendas com facilidade."
                glowColor="#f59e0b"
              />
              <FeatureCard 
                icon={<FileText className="text-[#2563eb]" />} 
                title="Contratos Automáticos" 
                desc="Gere instrumentos particulares de compra e venda instantaneamente em PDF ou Word."
                glowColor="#2563eb"
              />
              <FeatureCard 
                icon={<Wallet className="text-[#8b5cf6]" />} 
                title="Financeiro Completo" 
                desc="Acompanhe recebimentos, comissões pagas e pendentes, e gere relatórios financeiros detalhados."
                glowColor="#8b5cf6"
              />
              <FeatureCard 
                icon={<Users className="text-[#ec4899]" />} 
                title="Corretores e Comissões" 
                desc="Controle extratos de comissão, defina diferentes times e delegue acesso restrito via painel."
                glowColor="#ec4899"
              />
              <FeatureCard 
                icon={<AreaChart className="text-[#06b6d4]" />} 
                title="Relatórios PDF/Excel" 
                desc="Extraia inteligência dos seus projetos com exportações padronizadas de dados cruciais."
                glowColor="#06b6d4"
              />
              <FeatureCard 
                icon={<ShieldCheck className="text-[#f43f5e]" />} 
                title="Multiempresa SaaS" 
                desc="Capacidade de gerir diferentes CNPJs (tenants) sob a mesma estrutura administrativa de forma isolada."
                glowColor="#f43f5e"
              />
              <FeatureCard 
                icon={<Lock className="text-[#eab308]" />} 
                title="Segurança e Auditoria" 
                desc="Trilhas de auditoria, logins seguros via Supabase e infraestrutura criptografada em nuvem."
                glowColor="#eab308"
              />
            </div>
          </div>
        </section>

        {/* DEMONSTRAÇÃO VISUAL */}
        <section id="demonstracao" className="py-32 px-6 relative overflow-hidden bg-[#0a0d14]">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[#2563eb]/10 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
          
          <div className="max-w-7xl mx-auto flex flex-col items-center">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center">Demonstração da Plataforma</h2>
            <p className="text-gray-400 text-lg mb-12 text-center max-w-2xl font-light">Interface moderna, intuitiva e completa para sua gestão. Simplicidade premium em cada tela.</p>
            
            {/* Fake Tabs */}
            <div className="flex flex-wrap justify-center gap-2 mb-12 p-2 bg-white/5 rounded-2xl backdrop-blur-md border border-white/10 ring-1 ring-white/5">
               <div className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#3b82f6] text-white font-bold text-sm shadow-[0_0_20px_rgba(37,99,235,0.4)]">Dashboard</div>
               <div className="px-8 py-3 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Mapa GIS</div>
               <div className="px-8 py-3 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Financeiro</div>
               <div className="px-8 py-3 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Contratos</div>
               <div className="px-8 py-3 rounded-xl text-gray-400 font-medium text-sm hover:text-white cursor-pointer transition-colors hover:bg-white/5">Corretores</div>
            </div>

            {/* Huge Mockup Screen */}
            <div className="w-full max-w-5xl aspect-video bg-[#06090e]/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative flex flex-col overflow-hidden ring-1 ring-white/10">
                {/* Header */}
                <div className="h-14 border-b border-white/5 flex items-center px-6 justify-between bg-[#11161d]">
                   <div className="flex gap-2.5">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#ff5f56]" />
                      <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e]" />
                      <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f]" />
                   </div>
                   <div className="px-6 py-2 bg-[#06090e] rounded-lg text-xs text-gray-400 font-mono tracking-widest flex items-center gap-2 border border-white/5 shadow-inner">
                      <Lock className="w-3 h-3 text-[#10b981]" /> https://sys.svlotes.com/dashboard
                   </div>
                   <div className="w-20" />
                </div>
                {/* Body */}
                <div className="flex-1 flex bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-[#0a0d14]">
                   {/* Sidebar */}
                   <div className="w-56 border-r border-white/5 px-4 py-8 hidden md:flex flex-col gap-3 bg-[#06090e]">
                       <div className="w-full h-10 bg-[#2563eb]/20 rounded-xl border border-[#2563eb]/30 mb-6 flex items-center px-4"><div className="w-4 h-4 bg-[#60a5fa] rounded-sm" /></div>
                       <div className="w-full h-8 bg-white/5 rounded-lg" />
                       <div className="w-full h-8 bg-white/5 rounded-lg" />
                       <div className="w-3/4 h-8 bg-white/5 rounded-lg" />
                       <div className="w-full h-8 bg-white/5 rounded-lg mt-auto" />
                   </div>
                   {/* Content */}
                   <div className="flex-1 p-8 flex flex-col gap-8 opacity-90">
                      <div className="w-64 h-10 bg-white/10 rounded-lg" />
                      <div className="grid grid-cols-4 gap-6">
                         <div className="h-32 bg-white/5 rounded-2xl border border-white/10 p-4" />
                         <div className="h-32 bg-white/5 rounded-2xl border border-white/10 p-4" />
                         <div className="h-32 bg-[#10b981]/10 rounded-2xl border border-[#10b981]/20 p-4 shadow-[0_0_30px_rgba(16,185,129,0.1)]" />
                         <div className="h-32 bg-white/5 rounded-2xl border border-white/10 p-4" />
                      </div>
                      <div className="flex-1 flex gap-6">
                         <div className="flex-[2] bg-white/5 rounded-2xl border border-white/10" />
                         <div className="flex-1 bg-white/5 rounded-2xl border border-white/10" />
                      </div>
                   </div>
                </div>
            </div>
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" className="py-32 px-6 bg-[#06090e]">
          <div className="max-w-7xl mx-auto">
             <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Escolha o plano ideal</h2>
              <p className="text-gray-400 max-w-2xl mx-auto text-lg font-light">Preços transparentes. Sem taxas ocultas. Cancele quando quiser.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Básico */}
              <div className="bg-[#0a0d14]/80 backdrop-blur-xl border border-white/10 hover:border-[#2563eb]/50 rounded-[2rem] p-10 flex flex-col transition-all duration-300">
                <h3 className="text-xl font-bold text-gray-300 mb-2">Básico</h3>
                <div className="flex items-start gap-1 mb-10">
                  <span className="text-5xl font-black text-white">R$ 329,99</span>
                  <span className="text-gray-500 font-medium text-sm mt-2">/mês</span>
                </div>
                <div className="space-y-5 mb-10 flex-1">
                  <PlanFeature text="3 loteamentos" />
                  <PlanFeature text="5 corretores" />
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Gerador de Contratos" />
                  <PlanFeature text="Financeiro Intermediário" />
                  <PlanFeature text="Relatórios" />
                  <PlanFeature text="Suporte via Ticket" />
                </div>
                <Link href="#contato" className="block w-full text-center px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold border border-white/10 transition-colors">
                  Escolher Plano
                </Link>
              </div>

              {/* Business */}
              <div className="bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-[#2563eb] rounded-[2.5rem] p-12 flex flex-col relative transform md:-translate-y-8 shadow-[0_0_50px_rgba(37,99,235,0.15)] ring-1 ring-[#2563eb]/50 z-10">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-[#2563eb] rounded-full text-xs font-black tracking-widest uppercase text-white shadow-lg whitespace-nowrap">Mais Popular</div>
                <h3 className="text-2xl font-bold text-[#60a5fa] mb-2">Business</h3>
                <div className="flex items-start gap-1 mb-10">
                  <span className="text-6xl font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">R$ 549,99</span>
                  <span className="text-[#60a5fa] font-medium text-sm mt-3">/mês</span>
                </div>
                <div className="space-y-5 mb-10 flex-1">
                  <PlanFeature text="6 loteamentos" />
                  <PlanFeature text="10 corretores" />
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Contratos Automáticos" />
                  <PlanFeature text="Financeiro Completo" />
                  <PlanFeature text="Relatórios PDF/Excel" />
                  <PlanFeature text="Suporte WhatsApp" />
                </div>
                <Link href="/login" className="block w-full text-center px-6 py-4 rounded-xl bg-gradient-to-r from-[#10b981] to-[#059669] hover:opacity-90 text-white font-black tracking-wide shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
                  Escolher Plano
                </Link>
              </div>

              {/* Profissional */}
              <div className="bg-[#0a0d14]/80 backdrop-blur-xl border border-white/10 hover:border-[#8b5cf6]/50 rounded-[2rem] p-10 flex flex-col transition-all duration-300">
                <h3 className="text-xl font-bold text-gray-300 mb-2">Profissional</h3>
                <div className="flex items-start gap-1 mb-10">
                  <span className="text-5xl font-black text-white">R$ 1.099,99</span>
                  <span className="text-gray-500 font-medium text-sm mt-2">/mês</span>
                </div>
                <div className="space-y-5 mb-10 flex-1">
                  <PlanFeature text="25 loteamentos" />
                  <PlanFeature text="50 corretores" />
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Contratos Automáticos" />
                  <PlanFeature text="Financeiro Completo" />
                  <PlanFeature text="Relatórios PDF/Excel" />
                  <PlanFeature text="Suporte WhatsApp" />
                </div>
                <Link href="#contato" className="block w-full text-center px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold border border-white/10 transition-colors">
                  Escolher Plano
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL & CONTACT */}
        <section id="contato" className="py-40 px-6 relative overflow-hidden bg-[#0a0d14]">
           <div className="absolute inset-0 bg-[#2563eb]/5 -z-10" />
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#10b981]/10 rounded-full blur-[150px] pointer-events-none" />

           <div className="max-w-5xl mx-auto text-center relative z-10 flex flex-col items-center">
              <div className="mb-10 opacity-70">
                 <Globe className="w-20 h-20 text-[#2563eb] mx-auto drop-shadow-[0_0_20px_rgba(37,99,235,0.5)]" />
              </div>
              <h2 className="text-5xl md:text-6xl font-black tracking-tight mb-8">Pronto para profissionalizar sua <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#2563eb] to-[#60a5fa]">loteadora?</span></h2>
              <p className="text-gray-400 text-xl mb-12 max-w-2xl mx-auto font-light">Junte-se à nova geração de loteamentos inteligentes. O timming perfeito para crescer com governança e inovação metodológica SIG.</p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <a 
                  href="#" 
                  className="w-full sm:w-auto px-10 py-5 flex items-center justify-center gap-3 text-sm font-bold rounded-xl bg-[#10b981] hover:bg-[#059669] text-white transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)]"
                  onClick={(e) => { e.preventDefault(); alert('Fale com especialista (WhatsApp) - Contato placeholder'); }}
                >
                  Falar com Especialista <CheckCircle2 className="w-5 h-5" />
                </a>
                <Link 
                  href="/login" 
                  className="w-full sm:w-auto px-10 py-5 flex items-center justify-center gap-3 text-sm font-bold rounded-xl bg-transparent text-white border border-white/20 hover:bg-white/10 transition-all hover:border-white/40"
                >
                  Acessar Sistema <ChevronRight className="w-5 h-5" />
                </Link>
              </div>
           </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#06090e] pt-20 pb-10 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-16 mb-20">
           <div>
              <div className="flex items-center gap-3 mb-6">
                <Globe className="w-8 h-8 text-[#10b981]" />
                <span className="text-2xl font-black tracking-tighter uppercase text-white">SV<span className="text-[#60a5fa] font-light">LOTES</span></span>
              </div>
              <p className="text-gray-500 text-sm max-w-sm leading-relaxed">Plataforma SaaS completa para gestão de loteamentos e empreendimentos. Integração GIS, financeira e contratual.</p>
           </div>
           
           <div className="flex gap-20">
              <div>
                 <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">Produto</h4>
                 <ul className="space-y-4 text-sm text-gray-400 font-medium">
                    <li><a href="#recursos" className="hover:text-white transition-colors">Recursos Globais</a></li>
                    <li><a href="#planos" className="hover:text-white transition-colors">Planos & Preços</a></li>
                    <li><a href="/login" className="hover:text-white transition-colors">Painel Cliente</a></li>
                 </ul>
              </div>
              <div>
                 <h4 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">Contato</h4>
                 <ul className="space-y-4 text-sm text-gray-400 font-medium">
                    <li><a href="#" className="hover:text-white transition-colors">WhatsApp</a></li>
                    <li><a href="#" className="hover:text-white transition-colors">comercial@svtopografiaeprojetos.com.br</a></li>
                    <li><a href="#" className="hover:text-white transition-colors">Instagram</a></li>
                 </ul>
              </div>
           </div>
        </div>
        
        <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 text-xs text-gray-500 font-medium tracking-wide">
           <p>© {new Date().getFullYear()} SV TOPOGRAFIA E PROJETOS. Todos os direitos reservados.</p>
           <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Termos de Serviço</a>
              <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
           </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc, glowColor }: any) {
  return (
    <div className="group relative bg-[#11161d] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-colors overflow-hidden">
       {/* Hover gradient glow */}
       <div 
         className="absolute -right-8 -top-8 w-24 h-24 rounded-full opacity-0 blur-2xl group-hover:opacity-20 transition-opacity duration-500" 
         style={{ backgroundColor: glowColor }}
       />
       <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/5 flex items-center justify-center mb-4">
          {icon}
       </div>
       <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
       <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function VisualDemoItem({ title, desc }: any) {
  return (
     <div className="flex gap-4">
        <div className="w-8 h-8 rounded-full bg-[#2563eb]/20 border border-[#2563eb]/30 flex items-center justify-center flex-shrink-0 text-[#60a5fa] font-bold">
           <CheckCircle2 className="w-4 h-4" />
        </div>
        <div>
           <h4 className="text-lg font-bold text-white mb-1">{title}</h4>
           <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
        </div>
     </div>
  );
}

function PlanFeature({ text }: { text: string }) {
  return (
     <div className="flex items-center gap-3">
        <CheckCircle2 className="w-4 h-4 text-[#10b981]" />
        <span className="text-gray-300 text-sm">{text}</span>
     </div>
  );
}
