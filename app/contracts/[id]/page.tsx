'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Download, ChevronLeft, Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';

export default function ContractViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const [contractText, setContractText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchContract() {
      if (!id) return;
      try {
        const { data, error } = await supabase
          .from('contracts')
          .select('contract_text')
          .eq('id', id)
          .single();

        if (error) throw error;
        if (data) {
          setContractText(data.contract_text);
        }
      } catch (err: any) {
        console.error("Erro ao carregar contrato:", err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [id]);

  if (loading) {
     return (
        <div className="w-full h-screen flex items-center justify-center bg-gray-100">
           <Loader2 className="w-8 h-8 text-[#f59e0b] animate-spin" />
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 pb-12 print:bg-white print:pb-0">
       
      {/* Top Bar - Hidden on print */}
      <div className="print:hidden sticky top-0 bg-white border-b border-gray-200 shadow-sm z-10 px-4 sm:px-8 py-4 flex items-center justify-between">
         <button onClick={() => router.push('/contracts')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium transition-colors">
            <ChevronLeft className="w-5 h-5" /> Voltar
         </button>
         <div className="flex gap-3">
            <button 
               onClick={() => window.print()}
               className="flex items-center gap-2 bg-[#f59e0b] hover:bg-[#d97706] text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
            >
               <Download className="w-4 h-4" />
               Baixar em PDF / Imprimir
            </button>
            <button 
               onClick={() => {
                   const blob = new Blob([contractText], { type: 'application/msword' });
                   const url = URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.href = url;
                   a.download = `contrato_${id}.doc`;
                   document.body.appendChild(a);
                   a.click();
                   document.body.removeChild(a);
               }}
               className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
            >
               <Download className="w-4 h-4" />
               Baixar DOCX
            </button>
         </div>
      </div>

      {/* A4 Page Container */}
      <div className="mt-8 mx-auto max-w-4xl bg-white shadow-xl min-h-[297mm] p-12 sm:p-20 print:p-0 print:m-0 print:shadow-none font-serif text-justify whitespace-pre-wrap leading-relaxed text-sm">
         {contractText ? contractText : 'Contrato não encontrado.'}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
           @page { margin: 15mm; }
           body { -webkit-print-color-adjust: exact; background: white; }
           nav { display: none !important; }
        }
      `}} />
    </div>
  );
}
