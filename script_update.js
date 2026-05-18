const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components/map/GISMap.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const replacement = `            if (!saleErr && saleData) {
               console.log("Venda criada:", saleData.id);

                const tenantId = user.tenant_id || lot.tenant_id;
                let companyId = null;
                let companyData = null;
                let templateId = null;
                let templateContent = "<h1>Contrato de Compra e Venda</h1><p>Vendedor: {{EMPRESA}}</p><p>Comprador: {{CLIENTE}}</p><p>Lote: {{LOTE}}</p><p>Valor: {{VALOR}}</p><p><br/><br/>{{ASSINATURA}}</p>";
                
                if (tenantId) {
                    const { data: cData } = await supabase.from('companies').select('*').eq('id', tenantId).maybeSingle();
                    if (cData) { companyId = cData.id; companyData = cData; }
                    const { data: tData } = await supabase.from('contract_templates').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1).maybeSingle();
                    if (tData && tData.content) { templateId = tData.id; templateContent = tData.content; }
                }

                const formatMoney = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val) || 0);
                
                let htmlGenerated = templateContent
                    .replace(/\\{\\{EMPRESA\\}\\}/g, companyData?.business_name || companyData?.trade_name || 'Empresa Desconhecida')
                    .replace(/\\{\\{CNPJ\\}\\}/g, companyData?.document || '')
                    .replace(/\\{\\{CLIENTE\\}\\}/g, customerData.name || '')
                    .replace(/\\{\\{CPF\\}\\}/g, customerData.cpf_cnpj || '')
                    .replace(/\\{\\{LOTE\\}\\}/g, String(lot.number || ''))
                    .replace(/\\{\\{QUADRA\\}\\}/g, String(lot.block || lot.block_name || ''))
                    .replace(/\\{\\{PROJETO\\}\\}/g, lot.projects?.name || '')
                    .replace(/\\{\\{VALOR\\}\\}/g, formatMoney(customerData.final_value || finalPrice))
                    .replace(/\\{\\{ENTRADA\\}\\}/g, formatMoney(customerData.down_payment))
                    .replace(/\\{\\{PARCELAS\\}\\}/g, String(customerData.installments_count || 1))
                    .replace(/\\{\\{VENCIMENTO\\}\\}/g, customerData.payment_type === 'À vista' ? (customerData.down_payment_due_date || '') : (customerData.first_installment_due_date || ''))
                    .replace(/\\{\\{DATA\\}\\}/g, new Date().toLocaleDateString('pt-BR'))
                    .replace(/\\{\\{ASSINATURA\\}\\}/g, '_________________________________\\nAssinatura do Cliente');

                const contractData = {
                    ...( tenantId ? { tenant_id: tenantId } : {} ),
                    project_id: lot.project_id || null,
                    lot_id: lot.id,
                    customer_id: customerId,
                    company_id: companyId,
                    template_id: templateId,
                    valor_total: customerData.final_value || finalPrice,
                    entrada: customerData.down_payment || 0,
                    parcelas: customerData.installments_count || 1,
                    forma_pagamento: customerData.payment_type || 'À vista',
                    vencimento_inicial: customerData.payment_type === 'À vista' ? customerData.down_payment_due_date : customerData.first_installment_due_date,
                    status: 'ativo',
                    generated_html: htmlGenerated
                };

                const { data: contractInserted, error: contractErr } = await supabase.from('contracts').insert([contractData]).select('id').maybeSingle();
                
                if (contractErr) console.warn("Erro ao criar contrato em contracts:", contractErr);
                else if (contractInserted) console.log("Contrato criado com sucesso, ID:", contractInserted.id);

                const financeToInsert = [];
                let parcelaCount = customerData.payment_type === 'À vista' ? 1 : Math.max(1, Number(customerData.installments_count) || 1);
                
                if (customerData.payment_type === 'À vista' && customerData.down_payment_due_date) {
                    financeToInsert.push({
                        ...( tenantId ? { tenant_id: tenantId } : {} ),
                        project_id: lot.project_id || null,
                        lot_id: lot.id,
                        customer_id: customerId,
                        contract_id: contractInserted?.id || null,
                        parcela_numero: 1,
                        parcela_total: 1,
                        valor: customerData.final_value || finalPrice,
                        vencimento: customerData.down_payment_due_date,
                        status: 'pendente'
                    });
                } else if (customerData.payment_type === 'Parcelado') {
                    if (Number(customerData.down_payment) > 0 && customerData.down_payment_due_date) {
                        financeToInsert.push({
                            ...( tenantId ? { tenant_id: tenantId } : {} ),
                            project_id: lot.project_id || null,
                            lot_id: lot.id,
                            customer_id: customerId,
                            contract_id: contractInserted?.id || null,
                            parcela_numero: 0,
                            parcela_total: parcelaCount,
                            valor: customerData.down_payment,
                            vencimento: customerData.down_payment_due_date,
                            status: 'pendente'
                        });
                    }
                    
                    if (customerData.first_installment_due_date) {
                        let currentDueDate = new Date(customerData.first_installment_due_date + 'T12:00:00Z');
                        for (let i = 0; i < parcelaCount; i++) {
                            financeToInsert.push({
                                ...( tenantId ? { tenant_id: tenantId } : {} ),
                                project_id: lot.project_id || null,
                                lot_id: lot.id,
                                customer_id: customerId,
                                contract_id: contractInserted?.id || null,
                                parcela_numero: i + 1,
                                parcela_total: parcelaCount,
                                valor: customerData.installment_value,
                                vencimento: currentDueDate.toISOString().split('T')[0],
                                status: 'pendente'
                            });
                            currentDueDate.setMonth(currentDueDate.getMonth() + 1);
                        }
                    }
                }
                
                if (financeToInsert.length > 0) {
                    const { error: finError } = await supabase.from('finance_receipts').insert(financeToInsert);
                    if (finError) console.warn("Erro ao criar finance_receipts:", finError);
                    else console.log("Financeiro criado com sucesso. Parcelas geradas:", financeToInsert.length);
                }
            } else {
                console.warn("Erro ao criar registro de venda:", saleErr);
            }`;

let idxStart = content.indexOf(\`            if (!saleErr && saleData) {\`);
let idxEnd = content.indexOf(\`            } else {\\n                console.warn("Erro ao criar registro de venda:", saleErr);\\n            }\`);

if (idxStart > -1 && idxEnd > -1) {
    let actualTarget = content.substring(idxStart, idxEnd + \`            } else {\\n                console.warn("Erro ao criar registro de venda:", saleErr);\\n            }\`.length);
    content = content.replace(actualTarget, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESS NEW METHOOOOD");
} else {
    console.log("Still failed.");
}
