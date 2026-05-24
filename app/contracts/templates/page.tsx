'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { FileText, Plus, Loader2, ArrowLeft, Save, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const DEFAULT_CONTENT = `
<div style="text-align: center; margin-bottom: 32px;">
  <h1>CONTRATO DE COMPRA E VENDA</h1>
</div>

<h2 style="font-size: 14px; margin-top: 24px; border-bottom: 1px solid #000; padding-bottom: 4px; text-transform: uppercase;">1. Dos Contratantes</h2>
<p><strong>VENDEDOR(A):</strong> {{COMPANY_NAME}}, inscrita no CNPJ sob o nº {{COMPANY_CNPJ}}, com sede na {{COMPANY_ADDRESS}}... </p>
<p><strong>COMPRADOR(A):</strong> {{CLIENT_NAME}}, inscrito(a) no CPF/CNPJ sob o nº {{CLIENT_CPF}}, residente e domiciliado(a)...</p>

<h2 style="font-size: 14px; margin-top: 24px; border-bottom: 1px solid #000; padding-bottom: 4px; text-transform: uppercase;">2. Do Imóvel (Objeto do Contrato)</h2>
<p>O VENDEDOR promete vender ao COMPRADOR o imóvel constituído pelo <strong>Lote nº {{LOT_NUMBER}}</strong> da <strong>Quadra {{BLOCK_NAME}}</strong>, localizado no empreendimento <strong>{{PROJECT_NAME}}</strong>.</p>

<h2 style="font-size: 14px; margin-top: 24px; border-bottom: 1px solid #000; padding-bottom: 4px; text-transform: uppercase;">3. Do Valor</h2>
<p>Fica ajustado o valor total da venda em <strong>R$ {{SALE_VALUE}}</strong>, a ser pago na seguinte modalidade: <strong>{{PAYMENT_TYPE}}</strong>.</p>
`;

export default function TemplatesPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
     loadTemplates();
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadTemplates() {
      if (!user?.tenant_id) {
          setLoading(false);
          return;
      }
      const { data, error } = await supabase.from('contract_templates')
           .select('*')
           .eq('tenant_id', user.tenant_id)
           .order('name');
      
      if (data) setTemplates(data);
      setLoading(false);
  }

  const handleCreate = () => {
      setSelectedTemplate(null);
      setEditName('Novo Modelo de Contrato');
      setEditContent(DEFAULT_CONTENT);
      setIsEditing(true);
  };

  const handleEdit = (tmpl: any) => {
      setSelectedTemplate(tmpl);
      setEditName(tmpl.name);
      setEditContent(tmpl.content);
      setIsEditing(true);
  };

  const handleSave = async () => {
      if (!editName.trim()) return alert("O nome é obrigatório");
      if (!user?.tenant_id) return;

      setSaving(true);
      const payload = {
          tenant_id: user.tenant_id,
          name: editName,
          content: editContent
      };

      if (selectedTemplate?.id) {
          await supabase.from('contract_templates').update(payload).eq('id', selectedTemplate.id);
      } else {
          await supabase.from('contract_templates').insert(payload);
      }

      await loadTemplates();
      setSaving(false);
      setIsEditing(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm("Excluir este modelo?")) return;
      await supabase.from('contract_templates').delete().eq('id', id);
      if (selectedTemplate?.id === id) setIsEditing(false);
      loadTemplates();
  };

  const copyVariable = (v: string) => {
      navigator.clipboard.writeText(v);
      alert(`Variável ${v} copiada! Cole no editor.`);
  };

  if (authLoading) return null;

  return (
    <div className="flex h-full font-sans bg-[var(--color-background)]">
      {/* Sidebar */}
      {!isEditing && (
        <div className="w-full md:w-1/3 border-r border-[var(--color-border)] flex flex-col h-full shrink-0">
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <a href="/contracts" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface)] text-gray-400 hover:text-white transition-colors">
                      <ArrowLeft className="w-5 h-5" />
                  </a>
                  <h2 className="text-lg font-bold text-white">Modelos</h2>
              </div>
              <button onClick={handleCreate} className="w-8 h-8 bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-lg flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5" />
              </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loading ? (
                  <div className="p-4 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" /></div>
              ) : templates.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                      Nenhum modelo cadastrado.
                      <br/>Clique em + para criar o primeiro.
                  </div>
              ) : (
                  templates.map(tmpl => (
                      <div 
                          key={tmpl.id}
                          onClick={() => handleEdit(tmpl)}
                          className="p-3 rounded-lg cursor-pointer hover:bg-[var(--color-surface)] border border-transparent hover:border-[var(--color-border)] flex justify-between items-center group transition-colors"
                      >
                          <div className="flex items-center gap-3">
                              <FileText className="w-5 h-5 text-[var(--color-primary)]" />
                              <span className="text-sm font-semibold text-white">{tmpl.name}</span>
                          </div>
                          <button onClick={(e) => handleDelete(tmpl.id, e)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-4 h-4" />
                          </button>
                      </div>
                  ))
              )}
          </div>
        </div>
      )}

      {/* Editor Main Canvas */}
      {isEditing ? (
         <div className="flex-1 flex flex-col items-center overflow-hidden bg-gray-100/5 h-full relative">
              <div className="w-full bg-[var(--color-surface)] border-b border-[var(--color-border)] p-4 flex items-center justify-between shrink-0">
                   <div className="flex items-center gap-3">
                       <button onClick={() => setIsEditing(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-border)] text-gray-400 hover:text-white transition-colors">
                           <ArrowLeft className="w-5 h-5" />
                       </button>
                       <input 
                           type="text" 
                           value={editName}
                           onChange={e => setEditName(e.target.value)}
                           className="bg-transparent border-none text-lg font-bold text-white focus:outline-none focus:ring-0 min-w-[300px]"
                           placeholder="Nome do Modelo" 
                       />
                   </div>
                   <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white text-sm font-semibold rounded-lg hover:bg-[#8b5cf6] transition-colors disabled:opacity-50">
                       {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                       Salvar Modelo
                   </button>
              </div>
              
              <div className="flex-1 w-full flex overflow-hidden">
                  <div className="flex-1 overflow-y-auto p-8 flex justify-center">
                      <div className="w-full max-w-[800px] bg-white text-black min-h-[1056px] shadow-2xl flex flex-col p-8" style={{fontFamily: 'Arial, sans-serif'}}>
                          <textarea 
                              className="w-full flex-1 resize-none border-none focus:outline-none focus:ring-0 p-0 m-0 text-black text-base leading-relaxed bg-transparent"
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              placeholder="Digite ou cole o conteúdo do seu contrato aqui..."
                          />
                      </div>
                  </div>

                  <div className="w-64 border-l border-[var(--color-border)] shrink-0 overflow-y-auto bg-[var(--color-background)] p-4 flex flex-col gap-4">
                      <h3 className="font-bold text-white text-sm">Variáveis Disponíveis</h3>
                      <p className="text-xs text-gray-400">Clique para copiar as chaves e cole no editor para substituição automática.</p>
                      
                      <div className="space-y-4">
                          <div>
                              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Empresa</h4>
                              <div className="flex flex-col gap-1">
                                  {['COMPANY_NAME', 'COMPANY_CNPJ', 'COMPANY_ADDRESS', 'COMPANY_CITY_STATE'].map(v => (
                                      <button key={v} onClick={() => copyVariable(`{{${v}}}`)} className="text-left text-xs bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] rounded px-2 py-1.5 text-[var(--color-primary)] transition-colors">
                                          {`{{${v}}}`}
                                      </button>
                                  ))}
                              </div>
                          </div>
                          <div>
                              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Comprador</h4>
                              <div className="flex flex-col gap-1">
                                  {['CLIENT_NAME', 'CLIENT_CPF', 'CLIENT_RG', 'CLIENT_EMAIL', 'CLIENT_PHONE', 'CLIENT_ADDRESS'].map(v => (
                                      <button key={v} onClick={() => copyVariable(`{{${v}}}`)} className="text-left text-xs bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] rounded px-2 py-1.5 text-[var(--color-primary)] transition-colors">
                                          {`{{${v}}}`}
                                      </button>
                                  ))}
                              </div>
                          </div>
                          <div>
                              <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase">Imóvel e Valores</h4>
                              <div className="flex flex-col gap-1">
                                  {['LOT_NUMBER', 'BLOCK_NAME', 'PROJECT_NAME', 'SALE_VALUE', 'PAYMENT_TYPE'].map(v => (
                                      <button key={v} onClick={() => copyVariable(`{{${v}}}`)} className="text-left text-xs bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] rounded px-2 py-1.5 text-[var(--color-primary)] transition-colors">
                                          {`{{${v}}}`}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>
                  </div>
              </div>
         </div>
      ) : (
         <div className="flex-1 flex flex-col items-center justify-center text-gray-500 hidden md:flex">
             <FileText className="w-16 h-16 mb-4 opacity-20" />
             <p>Selecione um modelo à esquerda ou crie um novo.</p>
         </div>
      )}
    </div>
  );
}
