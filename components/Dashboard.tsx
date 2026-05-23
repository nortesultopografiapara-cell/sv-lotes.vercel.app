'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { calibrateDistance, calibrateArea } from '@/utils/measurementCalibration';
import { Ruler, ShieldAlert, CheckCircle, Clock } from 'lucide-react';

interface DashboardProps {
  lots: any[];
}

export default function Dashboard({ lots }: DashboardProps) {
  // Aggregate status distribution
  const statusCounts = lots.reduce((acc, lot) => {
    const status = lot.status || 'Disponível';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const COLORS = {
    'Disponível': '#22c55e',
    'Vendido': '#ef4444',
    'Reservado': '#eab308'
  } as Record<string, string>;

  // Compute overall areas
  const totalRawArea = lots.reduce((sum, lot) => sum + (lot.area || 0), 0);
  const totalCalibratedArea = calibrateArea(totalRawArea);

  // Take the first 6 lots from the real Supabase database rows and map calibrated vs raw metrics
  const barData = lots.slice(0, 6).map(lot => {
    const name = `Q${lot.block_name} L${lot.lot_number}`;
    const raw = lot.area || 100;
    const calibrated = calibrateArea(raw);
    return { name, 'Área Bruta': raw, 'Área Calibrada': calibrated };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Visual stats cards */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Área Bruta Total (Planta)
          </span>
          <h3 className="text-2xl font-bold font-mono text-slate-600 mt-1">
            {totalRawArea.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} m²
          </h3>
          <span className="text-[10px] text-slate-400 block mt-1.5 italic">
            Área medida em plano cartográfico puro
          </span>
        </div>
        <div className="p-3.5 bg-slate-100 text-slate-400 rounded-2xl">
          <Ruler className="w-6 h-6" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-between bg-gradient-to-br from-white to-emerald-50/20">
        <div>
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
            Área Real Calibrada (SIG-UTM)
          </span>
          <h3 className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {totalCalibratedArea.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²
          </h3>
          <span className="text-[10px] text-emerald-600/80 block mt-1.5 font-semibold">
            Calibração de Fator Global Ativa: 0.997109
          </span>
        </div>
        <div className="p-3.5 bg-emerald-100 text-emerald-600 rounded-2xl">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
            Divergência Cartográfica Filtrada
          </span>
          <h3 className="text-2xl font-bold font-mono text-slate-700 mt-1">
            -{(totalRawArea - totalCalibratedArea).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²
          </h3>
          <span className="text-[10px] text-rose-500 block mt-1.5 font-medium">
            Correção matemática de distorção UTM
          </span>
        </div>
        <div className="p-3.5 bg-rose-50 text-rose-500 rounded-2xl">
          <Clock className="w-6 h-6" />
        </div>
      </div>

      {/* Grid Charts */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 md:col-span-2">
        <h4 className="font-sans font-bold text-sm text-slate-700 uppercase tracking-wide mb-4">
          Comparação de Área de Amostras (Bruta vs Calibrada)
        </h4>
        <div className="h-56 w-full">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Legend iconSize={8} />
                <Bar dataKey="Área Bruta" fill="#b91c1c" radius={[4, 4, 0, 0]} opacity={0.4} />
                <Bar dataKey="Área Calibrada" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
              Sem dados de lotes disponíveis para comparar.
            </div>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="font-sans font-bold text-sm text-slate-700 uppercase tracking-wide mb-4">
          Status de Lançamento
        </h4>
        <div className="h-44 w-full relative">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 font-mono text-xs">
              Sem lotes cadastrados.
            </div>
          )}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <span className="text-xl font-extrabold font-mono text-slate-700 block leading-none">
              {lots.length}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5 block">
              Lotes Total
            </span>
          </div>
        </div>
        <div className="flex justify-center gap-3 mt-4 text-xs font-mono">
          {(Object.entries(statusCounts) as [string, number][]).map(([status, val]) => (
            <div key={status} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[status] || '#64748b' }}></span>
              <span className="text-slate-500">{status}:</span>
              <span className="font-bold text-slate-800">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
