'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { ShieldCheck, Map as MapIcon, Calendar, FileText, Wallet, Users, AreaChart, Lock, ChevronRight, CheckCircle2 } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#06090e] text-white selection:bg-[#2563eb] selection:text-white font-sans overflow-x-hidden">
      {/* HEADER */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#0a0d14]/80 backdrop-blur-md border-b border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#10b981]" />
            <span className="text-xl font-black tracking-tight uppercase text-white">
              SV<span className="text-[#60a5fa]">_LOTES</span>
            </span>
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
        <section id="inicio" className="relative pt-40 pb-20 md:pt-52 md:pb-32 px-6 overflow-hidden">
          {/* Background effects */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#2563eb]/20 rounded-full blur-[120px] pointer-events-none" />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#10b981]/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-[#60a5fa] mb-6">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#60a5fa] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#60a5fa]"></span>
                </span>
                Nova Versão 2.1 Lançada
              </div>
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.1] mb-6">
                Gestão Inteligente para <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60a5fa] to-[#10b981]">Loteamentos.</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 leading-relaxed mb-8 max-w-lg">
                Mapa GIS, contratos, financeiro, corretores, reservas e relatórios em uma única plataforma padrão SaaS.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Link 
                  href="/login" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl bg-white text-[#0a0d14] hover:bg-gray-100 transition-colors"
                >
                  Acessar Sistema <ChevronRight className="w-4 h-4" />
                </Link>
                <a 
                  href="#demonstracao" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl bg-white/5 text-white border border-white/10 hover:bg-white/10 transition-colors"
                >
                  Solicitar Demonstração
                </a>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0f172a]">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0f172a]">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <div className="w-3 h-3 rounded-full bg-green-400/80" />
                  <div className="ml-4 px-3 py-1 bg-white/5 rounded-md flex-1/2 min-w-[200px]" />
                </div>
                <div className="aspect-[4/3] bg-gradient-to-br from-[#1e293b] to-[#0f172a] p-6 relative overflow-hidden flex items-center justify-center">
                   {/* Abstract representation of dashboard */}
                   <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(#2563eb 1px, transparent 1px), linear-gradient(90deg, #2563eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                   <div className="relative w-full h-full flex flex-col gap-4">
                      <div className="flex gap-4">
                         <div className="h-24 flex-1 bg-gradient-to-tr from-[#10b981]/20 to-[#10b981]/5 border border-[#10b981]/20 rounded-xl" />
                         <div className="h-24 flex-1 bg-gradient-to-tr from-[#3b82f6]/20 to-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-xl" />
                         <div className="h-24 flex-1 bg-gradient-to-tr from-[#f59e0b]/20 to-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-xl" />
                      </div>
                      <div className="flex-1 flex gap-4">
                         <div className="flex-[2] bg-gradient-to-tr from-[#6366f1]/20 to-[#6366f1]/5 border border-[#6366f1]/20 rounded-xl" />
                         <div className="flex-1 bg-gradient-to-tr from-[#8b5cf6]/20 to-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-xl" />
                      </div>
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
        <section id="demonstracao" className="py-24 px-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#06090e] to-[#0a0d14] -z-10" />
          <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-[#6366f1]/10 rounded-full blur-[120px] pointer-events-none -translate-y-1/2 -z-10" />
          
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              <div className="lg:w-1/2 items-start text-left">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">Plataforma que se adapta perfeitamente ao seu negócio</h2>
                <div className="space-y-8">
                  <VisualDemoItem 
                    title="Dashboard Analítico"
                    desc="Painel unificado com métricas cruciais de negócio: Vendas por mês (VGV), inadimplência e distros de lotes."
                  />
                  <VisualDemoItem 
                    title="Interface GIS Nativa"
                    desc="Ao invés de planilhas engessadas, seu time interage diretamente com o mapa do projeto atualizado dinamicamente."
                  />
                  <VisualDemoItem 
                    title="Gerador de Contratos"
                    desc="Templates configuráveis e vinculação automática de clientes, lotes e parcelamentos em apenas 2 cliques."
                  />
                </div>
              </div>
              <div className="lg:w-1/2 w-full">
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0f172a] aspect-[4/3] flex items-center justify-center">
                   {/* Abstract Map Interface Mockup */}
                   <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#10b981 1px, transparent 1px)', backgroundSize: '15px 15px' }} />
                   <div className="relative w-4/5 h-4/5 bg-gradient-to-tr from-[#0a0d14] to-[#1e293b] rounded-2xl border border-white/5 shadow-2xl p-4 flex flex-col gap-4">
                      {/* Sub-header */}
                      <div className="h-8 w-full bg-white/5 rounded-md" />
                      {/* Content */}
                      <div className="flex-1 flex gap-4">
                          <div className="w-1/3 bg-white/5 rounded-md flex flex-col gap-2 p-2">
                              <div className="h-6 w-3/4 bg-white/10 rounded" />
                              <div className="h-4 w-1/2 bg-white/5 rounded mt-4" />
                              <div className="h-4 w-full bg-white/5 rounded" />
                              <div className="h-4 w-5/6 bg-white/5 rounded" />
                          </div>
                          <div className="flex-1 bg-white/5 rounded-md relative flex items-center justify-center overflow-hidden">
                             <div className="w-20 h-16 border-2 border-[#10b981] bg-[#10b981]/20 -rotate-12 absolute left-10" />
                             <div className="w-16 h-12 border-2 border-[#f59e0b] bg-[#f59e0b]/20 rotate-6 absolute right-10 top-10" />
                             <div className="w-24 h-20 border-2 border-[#ef4444] bg-[#ef4444]/20 -rotate-3 absolute bottom-8 left-20" />
                          </div>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PLANOS */}
        <section id="planos" className="py-24 px-6 bg-[#0a0d14]">
          <div className="max-w-7xl mx-auto">
             <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">Escolha o plano ideal</h2>
              <p className="text-gray-400 max-w-2xl mx-auto">Preços transparentes, pagos mensalmente. Sem taxas ocultas.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Básico */}
              <div className="bg-[#11161d] border border-white/5 rounded-3xl p-8 flex flex-col">
                <h3 className="text-lg font-bold text-gray-300 mb-2">Básico</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-black text-white">R$ 329,99</span>
                  <span className="text-gray-500 font-medium text-sm">/mês</span>
                </div>
                <div className="space-y-4 mb-8 flex-1">
                  <PlanFeature text="Até 3 loteamentos" />
                  <PlanFeature text="Até 5 corretores" />
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Gerador de Contratos" />
                  <PlanFeature text="Financeiro Intermediário" />
                </div>
                <Link href="#contato" className="block w-full text-center px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors">
                  Assinar Básico
                </Link>
              </div>

              {/* Business */}
              <div className="bg-gradient-to-b from-[#1e293b] to-[#0f172a] border border-[#3b82f6]/40 rounded-3xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-[#3b82f6]/10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 bg-gradient-to-r from-[#2563eb] to-[#3b82f6] rounded-full text-[10px] font-bold tracking-wider uppercase text-white shadow-lg">Mais Popular</div>
                <h3 className="text-lg font-bold text-blue-400 mb-2">Business</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-black text-white">R$ 549,99</span>
                  <span className="text-gray-500 font-medium text-sm">/mês</span>
                </div>
                <div className="space-y-4 mb-8 flex-1">
                  <PlanFeature text="Até 6 loteamentos" />
                  <PlanFeature text="Até 10 corretores" />
                  <PlanFeature text="Mapa GIS Interativo" />
                  <PlanFeature text="Contratos Automáticos + Custom" />
                  <PlanFeature text="Módulo Financeiro Avançado" />
                  <PlanFeature text="Relatórios Excel / PDF" />
                  <PlanFeature text="Suporte Prioritário" />
                </div>
                <Link href="/login" className="block w-full text-center px-4 py-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold shadow-lg shadow-[#2563eb]/20 transition-colors">
                  Acessar Sistema
                </Link>
              </div>

              {/* Profissional */}
              <div className="bg-[#11161d] border border-white/5 rounded-3xl p-8 flex flex-col">
                <h3 className="text-lg font-bold text-purple-400 mb-2">Profissional</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-black text-white">R$ 1.099,99</span>
                  <span className="text-gray-500 font-medium text-sm">/mês</span>
                </div>
                <div className="space-y-4 mb-8 flex-1">
                  <PlanFeature text="Até 25 loteamentos" />
                  <PlanFeature text="Até 50 corretores" />
                  <PlanFeature text="Recursos totais do Business" />
                  <PlanFeature text="Dashboard Analítico C-Level" />
                  <PlanFeature text="Auditoria de Logs Total" />
                  <PlanFeature text="Múltiplos CNPJs" />
                </div>
                <Link href="#contato" className="block w-full text-center px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium border border-white/10 transition-colors">
                  Assinar Profissional
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* CTA FINAL & CONTACT */}
        <section id="contato" className="py-32 px-6 relative overflow-hidden">
           <div className="absolute inset-0 bg-[#2563eb]/5 -z-10" />
           <div className="max-w-4xl mx-auto text-center relative z-10">
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-6">Pronto para profissionalizar sua loteadora?</h2>
              <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">Junte-se à nova geração de loteamentos inteligentes. O timming perfeito para crescer com governança e inovação metodológica SIG.</p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link 
                  href="/login" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl bg-white text-[#0a0d14] hover:bg-gray-100 transition-colors"
                >
                  Acessar Sistema
                </Link>
                <a 
                  href="#" 
                  className="w-full sm:w-auto px-8 py-4 flex items-center justify-center gap-2 text-sm font-semibold rounded-xl bg-transparent text-white border border-white/20 hover:bg-white/5 transition-colors"
                  onClick={(e) => { e.preventDefault(); alert('Fale com especialista (WhatsApp) - Contato placeholder'); }}
                >
                  Falar com Especialista
                </a>
              </div>
           </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#06090e] pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12 mb-16">
           <div>
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="w-6 h-6 text-[#10b981]" />
                <span className="text-lg font-black tracking-tight uppercase text-white">SV<span className="text-[#60a5fa]">_LOTES</span></span>
              </div>
              <p className="text-gray-500 text-sm max-w-xs">Software SaaS dedicado ao controle GIS, vendas, faturamento e integrações para grandes projetos urbanísticos.</p>
           </div>
           
           <div className="flex gap-16">
              <div>
                 <h4 className="font-semibold text-white mb-4">Produto</h4>
                 <ul className="space-y-2 text-sm text-gray-500">
                    <li><a href="#recursos" className="hover:text-[#60a5fa] transition-colors">Recursos Globais</a></li>
                    <li><a href="#planos" className="hover:text-[#60a5fa] transition-colors">Planos & Preços</a></li>
                    <li><a href="/login" className="hover:text-[#60a5fa] transition-colors">Painel Cliente</a></li>
                 </ul>
              </div>
              <div>
                 <h4 className="font-semibold text-white mb-4">Contato</h4>
                 <ul className="space-y-2 text-sm text-gray-500">
                    <li><a href="#" className="hover:text-[#60a5fa] transition-colors">WhatsApp</a></li>
                    <li><a href="#" className="hover:text-[#60a5fa] transition-colors">comercial@nortesultopografia.com.br</a></li>
                    <li><a href="#" className="hover:text-[#60a5fa] transition-colors">Instagram</a></li>
                 </ul>
              </div>
           </div>
        </div>
        
        <div className="max-w-7xl mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-600">
           <p>© {new Date().getFullYear()} SV LOTES — By NORTE SUL TOPOGRAFIA E SERVIÇOS LTDA. Todos os direitos reservados.</p>
           <div className="flex gap-4">
              <a href="#" className="hover:text-gray-400">Termos de Serviço</a>
              <a href="#" className="hover:text-gray-400">Política de Privacidade</a>
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
