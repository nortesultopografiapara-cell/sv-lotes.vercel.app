import { useState } from "react";
import { X, Save, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function AvulsoContractModal({
  isOpen,
  onClose,
  onSave,
  tenantId,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  tenantId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    block_name: "",
    number: "",
    area: "",
    frente: "",
    fundo: "",
    lateral_dir: "",
    lateral_esq: "",
    price: "",
    down_payment: "",
    installments: "",
    installment_value: "",
    first_due_date: "",
    customer_name: "",
    customer_cpf_cnpj: "",
    customer_rg: "",
    customer_nacionalidade: "",
    customer_estado_civil: "",
    customer_profissao: "",
    customer_phone: "",
    customer_email: "",
    customer_address: "",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create or get customer
      let customerId = null;
      if (formData.customer_cpf_cnpj) {
        const { data: extCus } = await supabase
          .from("customers")
          .select("id")
          .eq("document", formData.customer_cpf_cnpj.trim())
          .maybeSingle();
        if (extCus) {
          customerId = extCus.id;
        }
      }

      if (!customerId) {
        const { data: newCustomer, error: cErr } = await supabase
          .from("customers")
          .insert({
            tenant_id: tenantId,
            name: formData.customer_name.trim().toUpperCase(),
            document: formData.customer_cpf_cnpj.trim(),
            cpf_cnpj:
              formData.customer_cpf_cnpj.trim() /* some logic had both */,
            rg: formData.customer_rg.trim(),
            nacionalidade: formData.customer_nacionalidade.trim(),
            estado_civil: formData.customer_estado_civil.trim(),
            profissao: formData.customer_profissao.trim(),
            email: formData.customer_email.trim().toUpperCase(),
            phone: formData.customer_phone.trim(),
            address: formData.customer_address.trim().toUpperCase(),
          })
          .select("id")
          .single();

        if (cErr) {
          // Maybe fallback to upsert or check unique
          console.log("Error inserting customer, attempting upsert", cErr);
          const { data: upCus, error: upError } = await supabase
            .from("customers")
            .upsert(
              {
                tenant_id: tenantId,
                name: formData.customer_name.trim().toUpperCase(),
                document: formData.customer_cpf_cnpj.trim(),
                cpf_cnpj: formData.customer_cpf_cnpj.trim(),
                rg: formData.customer_rg.trim(),
                nacionalidade: formData.customer_nacionalidade.trim(),
                estado_civil: formData.customer_estado_civil.trim(),
                profissao: formData.customer_profissao.trim(),
                email: formData.customer_email.trim().toUpperCase(),
                phone: formData.customer_phone.trim(),
                address: formData.customer_address.trim().toUpperCase(),
              },
              { onConflict: "document" },
            )
            .select("id")
            .single();
          if (upError) throw upError;
          customerId = upCus.id;
        } else {
          customerId = newCustomer.id;
        }
      }

      // Find an arbitrary project to link to, or a dummy project if project_id is required
      const { data: proj } = await supabase
        .from("projects")
        .select("id")
        .eq("company_id", tenantId)
        .limit(1)
        .maybeSingle();
      const projId = proj ? proj.id : null;

      // Insert "block" (contract/lote avulso)
      const numberPrice = Number(formData.price.replace(/\D/g, "")) / 100 || 0;
      const numberDownPayment =
        Number(formData.down_payment.replace(/\D/g, "")) / 100 || 0;
      const numberInstallmentValue =
        Number(formData.installment_value.replace(/\D/g, "")) / 100 || 0;

      const { data: block, error: blockErr } = await supabase
        .from("blocks")
        .insert({
          tenant_id: tenantId,
          project_id: projId,
          name: formData.block_name,
          block_name: formData.block_name,
          number: formData.number,
          area: Number(formData.area),
          price: numberPrice,
          down_payment: numberDownPayment > 0 ? numberDownPayment : null,
          installments: formData.installments
            ? Number(formData.installments)
            : null,
          installment_value:
            numberInstallmentValue > 0 ? numberInstallmentValue : null,
          first_due_date: formData.first_due_date || null,
          frente_oficial: Number(formData.frente) || 0,
          fundo_oficial: Number(formData.fundo) || 0,
          dir_oficial: Number(formData.lateral_dir) || 0,
          esq_oficial: Number(formData.lateral_esq) || 0,
          status: "Vendido",
          customer_id: customerId,
        })
        .select()
        .single();

      if (blockErr) throw blockErr;

      // Generate contract text
      const { data: comp } = await supabase
        .from("companies")
        .select("*")
        .eq("id", tenantId)
        .single();

      const { generateContractText } = await import("@/lib/contractGenerator");

      const contractText = generateContractText({
        company_name: comp?.name || comp?.razao_social,
        company_cnpj: comp?.cnpj,
        comprador_nome: formData.customer_name,
        comprador_cpf: formData.customer_cpf_cnpj,
        comprador_estado_civil: formData.customer_estado_civil,
        comprador_endereco: formData.customer_address,
        lote_numero: formData.number,
        lote_quadra: formData.block_name,
        lote_area: formData.area,
        conf_norte: formData.frente,
        conf_sul: formData.fundo,
        projeto_nome: "Empreendimento Avulso",
        valor_total: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(numberPrice),
        valor_entrada: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(numberDownPayment),
        data_entrada: new Date().toLocaleDateString("pt-BR"),
        qtd_parcelas: formData.installments,
        valor_parcela: new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(numberInstallmentValue),
        primeiro_vencimento: formData.first_due_date,
      });

      // Save to public.contracts
      await supabase.from("contracts").insert([
        {
          company_id: tenantId,
          project_id: projId,
          lot_id: block.id,
          buyer_name: formData.customer_name,
          buyer_cpf: formData.customer_cpf_cnpj,
          contract_text: contractText,
        },
      ]);

      onSave(block);
    } catch (e: any) {
      console.error(e);
      alert("Erro ao gerar contrato: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: any) => {
    setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));
  };

  const handlePriceChange = (e: any) => {
    let raw = e.target.value.replace(/\D/g, "");
    let num = Number(raw) / 100;
    setFormData((p) => ({
      ...p,
      price: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(num),
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold text-gray-900">
            Gerar Contrato Avulso
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="avulso-form" onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 pb-2 border-b">
                Dados do Lote / Terreno
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quadra
                  </label>
                  <input
                    required
                    type="text"
                    name="block_name"
                    value={formData.block_name}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                    placeholder="Ex: A"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Lote
                  </label>
                  <input
                    required
                    type="text"
                    name="number"
                    value={formData.number}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                    placeholder="Ex: 01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Área Total (m²)
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    name="area"
                    value={formData.area}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                    placeholder="Ex: 250"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Frente (m)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="frente"
                    value={formData.frente}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Fundo (m)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="fundo"
                    value={formData.fundo}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Lateral Dir (m)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="lateral_dir"
                    value={formData.lateral_dir}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Lateral Esq (m)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    name="lateral_esq"
                    value={formData.lateral_esq}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 pb-2 border-b">
                Financeiro
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Valor Total (R$)
                  </label>
                  <input
                    required
                    type="text"
                    name="price"
                    value={formData.price}
                    onChange={handlePriceChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm font-medium"
                    placeholder="R$ 0,00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Valor de Entrada (R$)
                  </label>
                  <input
                    required
                    type="text"
                    name="down_payment"
                    value={formData.down_payment}
                    onChange={(e) => {
                      let raw = e.target.value.replace(/\D/g, "");
                      let num = Number(raw) / 100;
                      setFormData((p) => ({
                        ...p,
                        down_payment: new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(num),
                      }));
                    }}
                    className="w-full border border-gray-300 rounded p-2 text-sm font-medium"
                    placeholder="R$ 0,00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantidade de Parcelas
                  </label>
                  <input
                    required
                    type="number"
                    name="installments"
                    value={formData.installments}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm font-medium"
                    placeholder="Ex: 60"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Valor da Parcela (R$)
                  </label>
                  <input
                    required
                    type="text"
                    name="installment_value"
                    value={formData.installment_value}
                    onChange={(e) => {
                      let raw = e.target.value.replace(/\D/g, "");
                      let num = Number(raw) / 100;
                      setFormData((p) => ({
                        ...p,
                        installment_value: new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(num),
                      }));
                    }}
                    className="w-full border border-gray-300 rounded p-2 text-sm font-medium"
                    placeholder="R$ 0,00"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Data de Vencimento da 1ª Parcela
                  </label>
                  <input
                    required
                    type="date"
                    name="first_due_date"
                    value={formData.first_due_date}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm font-medium"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 pb-2 border-b">
                Dados do Comprador
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nome Completo / Razão Social
                  </label>
                  <input
                    required
                    type="text"
                    name="customer_name"
                    value={formData.customer_name}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    CPF / CNPJ
                  </label>
                  <input
                    required
                    type="text"
                    name="customer_cpf_cnpj"
                    value={formData.customer_cpf_cnpj}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    RG
                  </label>
                  <input
                    type="text"
                    name="customer_rg"
                    value={formData.customer_rg}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Nacionalidade
                  </label>
                  <input
                    type="text"
                    name="customer_nacionalidade"
                    value={formData.customer_nacionalidade}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Estado Civil
                  </label>
                  <input
                    type="text"
                    name="customer_estado_civil"
                    value={formData.customer_estado_civil}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Profissão
                  </label>
                  <input
                    type="text"
                    name="customer_profissao"
                    value={formData.customer_profissao}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Telefone
                  </label>
                  <input
                    type="text"
                    name="customer_phone"
                    value={formData.customer_phone}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    name="customer_email"
                    value={formData.customer_email}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Endereço Completo
                  </label>
                  <input
                    required
                    type="text"
                    name="customer_address"
                    value={formData.customer_address}
                    onChange={handleChange}
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                  />
                </div>
              </div>
            </div>
          </form>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 font-medium rounded-lg text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            form="avulso-form"
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-[#f59e0b] hover:bg-[#d97706] text-white font-medium rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Salvar Contrato
          </button>
        </div>
      </div>
    </div>
  );
}
