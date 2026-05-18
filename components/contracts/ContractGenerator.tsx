'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Download, Printer, FileDown } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export function ContractGenerator({ sale }: { sale: any }) {
   const [company, setCompany] = useState<any>(null);
   const [loading, setLoading] = useState(true);
   const printRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
       async function loadCompany() {
           setLoading(true);
           if (sale.tenant_id) {
               const { data } = await supabase.from('companies').select('*').eq('id', sale.tenant_id).single();
               if (data) setCompany(data);
           }
           setLoading(false);
       }
       loadCompany();
   }, [sale.tenant_id]);

   const handlePrint = () => {
       const content = printRef.current;
       if (!content) return;
       const printWindow = window.open('', '_blank');
       if (!printWindow) return;
       
       printWindow.document.write(`
           <html>
               <head>
                   <title>Contrato de Compra e Venda</title>
                   <style>
                       body { font-family: Arial, sans-serif; padding: 40px; color: #000; line-height: 1.5; }
                       h1 { text-align: center; font-size: 18px; margin-bottom: 20px; }
                       h2 { font-size: 14px; margin-top: 20px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                       p { font-size: 12px; margin-bottom: 10px; text-align: justify; }
                       .header { text-align: center; margin-bottom: 20px; }
                       .header img { max-height: 60px; margin-bottom: 10px; }
                       table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 12px; }
                       th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                       th { background-color: #f5f5f5; }
                   </style>
               </head>
               <body>
                   ${content.innerHTML}
                   <script>
                       window.onload = () => { window.print(); window.close(); }
                   </script>
               </body>
           </html>
       `);
       printWindow.document.close();
   };

   const handleDownloadPDF = async () => {
       if (!printRef.current) return;
       try {
           const canvas = await html2canvas(printRef.current, { scale: 2 });
           const imgData = canvas.toDataURL('image/png');
           const pdf = new jsPDF('p', 'mm', 'a4');
           const pdfWidth = pdf.internal.pageSize.getWidth();
           const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
           
           pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
           pdf.save(`Contrato_${sale.clients?.full_name || 'Venda'}.pdf`);
       } catch(e) {
           alert("Erro ao gerar PDF.");
       }
   };

   const handleDownloadDocx = async () => {
       const doc = new Document({
            sections: [
                {
                    children: [
                        new Paragraph({
                            text: "CONTRATO DE COMPRA E VENDA",
                            heading: HeadingLevel.HEADING_1,
                            alignment: AlignmentType.CENTER,
                        }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "VENDEDOR", heading: HeadingLevel.HEADING_2 }),
                        new Paragraph({ text: `Razão Social: ${company?.razao_social || company?.name || 'Não informado'}` }),
                        new Paragraph({ text: `CNPJ: ${company?.cnpj || 'Não informado'}` }),
                        new Paragraph({ text: `Endereço: ${company?.address || ''}, ${company?.city || ''} - ${company?.state || ''}, CEP: ${company?.zip_code || ''}` }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "COMPRADOR", heading: HeadingLevel.HEADING_2 }),
                        new Paragraph({ text: `Nome: ${sale.clients?.full_name}` }),
                        new Paragraph({ text: `CPF/CNPJ: ${sale.clients?.cpf_cnpj || 'Não informado'}` }),
                        new Paragraph({ text: `Endereço: ${sale.clients?.address || 'Não informado'}` }),
                        new Paragraph({ text: `Telefone: ${sale.clients?.phone || 'Não informado'} | E-mail: ${sale.clients?.email || 'Não informado'}` }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "DO IMÓVEL (LOTE)", heading: HeadingLevel.HEADING_2 }),
                        new Paragraph({ text: `Projeto/Loteamento: ${sale.blocks?.projects?.name || ''}` }),
                        new Paragraph({ text: `Quadra: ${sale.blocks?.block_name || sale.blocks?.name || ''} | Lote: ${sale.blocks?.number || ''}` }),
                        new Paragraph({ text: `Localização: ${sale.blocks?.projects?.city || ''} - ${sale.blocks?.projects?.state || ''}` }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "CONDIÇÕES DE PAGAMENTO", heading: HeadingLevel.HEADING_2 }),
                        new Paragraph({ text: `Valor Total: R$ ${Number(sale.lot_value || sale.agreed_price).toFixed(2)}` }),
                        new Paragraph({ text: `Forma de Pagamento: ${sale.payment_type || 'À vista'}` }),
                        new Paragraph({ text: `Desconto: R$ ${Number(sale.discount_value || 0).toFixed(2)}` }),
                        new Paragraph({ text: `Valor Final a Pagar: R$ ${Number(sale.final_value || sale.agreed_price).toFixed(2)}` }),
                        new Paragraph({ text: `Entrada: R$ ${Number(sale.down_payment || 0).toFixed(2)}` }),
                        new Paragraph({ text: `Quantidade de Parcelas: ${sale.installments_count || 1}` }),
                        new Paragraph({ text: `Valor de Cada Parcela: R$ ${Number(sale.installment_value || 0).toFixed(2)}` }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: `Data da Venda: ${new Date(sale.created_at).toLocaleDateString('pt-BR')}` }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "_______________________________________________________", alignment: AlignmentType.CENTER }),
                        new Paragraph({ text: "Assinatura do Vendedor", alignment: AlignmentType.CENTER }),
                        new Paragraph({ text: "" }),
                        new Paragraph({ text: "_______________________________________________________", alignment: AlignmentType.CENTER }),
                        new Paragraph({ text: "Assinatura do Comprador", alignment: AlignmentType.CENTER }),
                    ],
                },
            ],
       });

       const blob = await Packer.toBlob(doc);
       saveAs(blob, `Contrato_${sale.clients?.full_name || 'Venda'}.docx`);
   };

   if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

   return (
       <div className="flex flex-col h-full">
           <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between shadow-sm">
               <h3 className="font-bold text-gray-800">Visualização de Contrato</h3>
               <div className="flex items-center gap-2">
                   <button onClick={handlePrint} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">
                       <Printer className="w-4 h-4" /> Imprimir
                   </button>
                   <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-medium rounded-lg transition-colors">
                       <FileDown className="w-4 h-4" /> PDF
                   </button>
                   <button onClick={handleDownloadDocx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                       <Download className="w-4 h-4" /> DOCX
                   </button>
               </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-gray-100">
               <div className="bg-white shadow-lg border border-gray-200 p-12 max-w-3xl w-full text-black font-serif text-sm leading-relaxed" ref={printRef} style={{ minHeight: '1056px' }}>
                   
                   <div className="text-center mb-8">
                       {company?.logo_url && <img src={company.logo_url} alt="Logo da Empresa" className="h-16 object-contain mx-auto mb-4" />}
                       <h1 className="text-xl font-bold uppercase underline mb-1">Instrumento Particular de Compromisso de Compra e Venda</h1>
                   </div>

                   <h2 className="font-bold border-b border-black pb-1 mb-3 uppercase text-xs mt-6">1. Dos Contratantes</h2>
                   <p className="mb-2 text-justify">
                       <strong>VENDEDOR(A):</strong> {company?.razao_social || company?.name || '__________'}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº {company?.cnpj || '__________'}, com sede na {company?.address || '__________'}, CEP: {company?.zip_code || '__________'}, na cidade de {company?.city || '__________'} - {company?.state || '___'}, neste ato representado por seu responsável legal {company?.responsible_name || '__________'} (CPF: {company?.responsible_cpf || '__________'}).
                   </p>
                   <p className="mb-2 text-justify">
                       <strong>COMPRADOR(A):</strong> {sale.clients?.full_name}, inscrito(a) no CPF/CNPJ sob o nº {sale.clients?.cpf_cnpj || '__________'}, MG/RG nº {sale.clients?.rg || '__________'}, profissão: {sale.clients?.profession || '__________'}, estado civil: {sale.clients?.marital_status || '__________'}, residente e domiciliado(a) na {sale.clients?.address || '__________'}, telefone {sale.clients?.phone || '__________'}, e-mail {sale.clients?.email || '__________'}.
                   </p>

                   <h2 className="font-bold border-b border-black pb-1 mb-3 uppercase text-xs mt-6">2. Do Imóvel (Objeto do Contrato)</h2>
                   <p className="mb-2 text-justify">
                       O VENDEDOR promete vender ao COMPRADOR, que por sua vez se compromete a adquirir, o imóvel constituído pelo <strong>Lote nº {sale.blocks?.number || '___'}</strong> da <strong>Quadra {sale.blocks?.block_name || sale.blocks?.name || '___'}</strong>, localizado no empreendimento <strong>{sale.blocks?.projects?.name || '__________'}</strong>, no município de {sale.blocks?.projects?.city || '__________'} - {sale.blocks?.projects?.state || '___'}.
                   </p>

                   <h2 className="font-bold border-b border-black pb-1 mb-3 uppercase text-xs mt-6">3. Do Valor e Forma de Pagamento</h2>
                   <p className="mb-2 text-justify">
                       Fica ajustado o valor total da venda em <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.final_value || sale.agreed_price)}</strong>, a ser pago na seguinte modalidade: <strong>{sale.payment_type?.toUpperCase() || 'À VISTA'}</strong>.
                   </p>
                   <ul className="list-disc pl-8 mb-2">
                       <li><strong>Valor Base:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.lot_value || sale.agreed_price)}</li>
                       <li><strong>Desconto Concedido:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.discount_value || 0)}</li>
                       <li><strong>Sinal / Entrada:</strong> {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.down_payment || 0)} com vencimento em {sale.down_payment_due_date ? new Date(sale.down_payment_due_date + 'T12:00:00Z').toLocaleDateString('pt-BR') : '___/___/____'}</li>
                       {sale.payment_type === 'Parcelado' && (
                           <li><strong>Saldo Restante:</strong> a ser pago em {sale.installments_count || 1} parcela(s) mensais e sucessivas de {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.installment_value || 0)}, vencendo a primeira em {sale.first_installment_due_date ? new Date(sale.first_installment_due_date + 'T12:00:00Z').toLocaleDateString('pt-BR') : '___/___/____'}.</li>
                       )}
                   </ul>

                   <h2 className="font-bold border-b border-black pb-1 mb-3 uppercase text-xs mt-6">4. Disposições Finais</h2>
                   <p className="mb-4 text-justify">
                       Esta venda e compra é pactuada em caráter irrevogável e irretratável. As partes elegem o foro da Comarca do imóvel para dirimir quaisquer dúvidas oriundas deste contrato.
                   </p>
                   <p className="mb-12 text-center text-sm">
                       {company?.city || 'Localidade'}, {new Date(sale.created_at || Date.now()).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}.
                   </p>

                   <div className="grid grid-cols-2 gap-8 mt-16 px-8 text-center text-sm">
                       <div>
                           {company?.signature_url ? (
                               <img src={company.signature_url} className="h-16 mx-auto mb-2 object-contain" alt="Assinatura Vendedor" />
                           ) : (
                               <div className="h-16 border-b border-black mx-4 mb-2"></div>
                           )}
                           <p className="font-bold">{company?.razao_social || company?.name || 'VENDEDOR'}</p>
                           <p className="text-xs">CNPJ: {company?.cnpj}</p>
                       </div>
                       <div>
                           <div className="h-16 border-b border-black mx-4 mb-2"></div>
                           <p className="font-bold">{sale.clients?.full_name}</p>
                           <p className="text-xs">CPF/CNPJ: {sale.clients?.cpf_cnpj}</p>
                       </div>
                   </div>

               </div>
           </div>
       </div>
   );
}
