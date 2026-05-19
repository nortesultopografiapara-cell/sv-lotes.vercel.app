const fs = require('fs');
let content = fs.readFileSync('components/map/GISMap.tsx', 'utf8');
const lines = content.split('\n');

const newContent = `         
       if (updateError) throw updateError;
       
       // Processar Pós-Venda
       if (newStatus === 'Vendido' || newStatus === 'vendido') {
           alert("LOTE VENDIDO, CHAMANDO PÓS-VENDA");
           
           const processarPosVenda = async () => {
               try {
                   const resolvedTenantId = user?.company_id || lot?.projects?.company_id || user?.tenant_id || lot?.tenant_id;
                   console.log("TENANT RESOLVIDO", resolvedTenantId);

                   if (!resolvedTenantId) {
                       alert("tenant_id não encontrado");
                       return;
                   }

                   const salePayload = {
                       tenant_id: resolvedTenantId,
                       project_id: lot.project_id || null,
                       block_id: lot.id,
                       customer_id: customerId,
                       client_id: clientId,
                       user_id: user.id || null,
                       agreed_price: customerData.final_value || finalPrice,
                       lot_price: finalPrice,
                       payment_type: customerData.payment_type || 'À vista',
                       discount: customerData.discount_value || 0,
                       total_value: customerData.final_value || finalPrice,
                       down_payment: customerData.down_payment || 0,
                       installments_count: Math.max(1, customerData.installments_count || 1),
                       status: 'ACTIVE'
                   };
                   
                   console.log("SALE INSERT", salePayload);
                   
                   const { data: saleData, error: saleError } = await supabase
                       .from('sales')
                       .insert([salePayload])
                       .select('id')
                       .single();

                   if (saleError) {
                       alert("ERRO SALES: " + JSON.stringify(saleError));
                       console.error("ERRO SALES: ", saleError);
                       throw saleError;
                   }
                   
                   if (!saleData || !saleData.id) {
                       throw new Error("sale.id não retornado");
                   }
                   
                   const saleId = saleData.id;
                   const financePayloads: any[] = [];
                   
                   const pmtType = customerData.payment_type || 'À vista';
                   const downPayment = customerData.down_payment || 0;
                   const instCount = Math.max(1, customerData.installments_count || 1);
                   const fValue = customerData.final_value || finalPrice;

                   if (pmtType === 'À vista') {
                       financePayloads.push({
                           tenant_id: resolvedTenantId,
                           sale_id: saleId,
                           customer_id: customerId,
                           project_id: lot.project_id || null,
                           block_id: lot.id,
                           installment_number: 1,
                           amount: fValue,
                           due_date: customerData.down_payment_due_date || new Date().toISOString().split('T')[0],
                           status: 'pago',
                           paid_at: new Date().toISOString()
                       });
                   } else if (pmtType === 'Parcelado') {
                       let currentInst = 1;
                       if (downPayment > 0 && customerData.down_payment_due_date) {
                           financePayloads.push({
                               tenant_id: resolvedTenantId,
                               sale_id: saleId,
                               customer_id: customerId,
                               project_id: lot.project_id || null,
                               block_id: lot.id,
                               installment_number: currentInst++,
                               amount: downPayment,
                               due_date: customerData.down_payment_due_date,
                               status: 'pendente'
                           });
                       }
                       
                       if (customerData.first_installment_due_date) {
                           const parValue = Math.max(0, (fValue - downPayment) / instCount);
                           let cDate = new Date(customerData.first_installment_due_date + 'T12:00:00Z');
                           for (let i = 0; i < instCount; i++) {
                               financePayloads.push({
                                   tenant_id: resolvedTenantId,
                                   sale_id: saleId,
                                   customer_id: customerId,
                                   project_id: lot.project_id || null,
                                   block_id: lot.id,
                                   installment_number: currentInst++,
                                   amount: parValue,
                                   due_date: cDate.toISOString().split('T')[0],
                                   status: 'pendente'
                               });
                               cDate.setMonth(cDate.getMonth() + 1);
                           }
                       }
                   }
                   
                   console.log("FINANCE INSERT", financePayloads);
                   
                   if (financePayloads.length > 0) {
                       const { error: financeError } = await supabase.from('finance_receipts').insert(financePayloads);
                       if (financeError) {
                           alert("ERRO FINANCE: " + JSON.stringify(financeError));
                           console.error("ERRO FINANCE", financeError);
                           throw financeError;
                       }
                   }
                   
                   const cName = nameUpper || customerData.name || 'Cliente';
                   const lName = lot.block_name || lot.name || String(lot.id);
                   const contractHtml = \`
                       <div style="font-family: sans-serif; padding: 20px;">
                           <h2>Contrato de Compra e Venda</h2>
                           <p><strong>Cliente:</strong> \${cName}</p>
                           <p><strong>Lote:</strong> \${lName}</p>
                           <p><strong>Valor Final:</strong> R$ \${fValue}</p>
                       </div>
                   \`;

                   const contractPayload = {
                       tenant_id: resolvedTenantId,
                       sale_id: saleId,
                       customer_id: customerId,
                       project_id: lot.project_id || null,
                       block_id: lot.id,
                       contract_number: \`CTR-\${Date.now()}\`,
                       generated_html: contractHtml,
                       status: 'ativo'
                   };
                   
                   console.log("CONTRACT INSERT", contractPayload);

                   const { error: contractError } = await supabase.from('contracts').insert([contractPayload]);
                   if (contractError) {
                       alert("ERRO CONTRACT: " + JSON.stringify(contractError));
                       console.error("ERRO CONTRACT", contractError);
                       throw contractError;
                   }
                   
                   alert("Pós-venda gerado com sucesso (Sales, Finance, Contracts)");
                   
               } catch (err: any) {
                   console.error("Erro no pós-venda:", err);
                   alert("Exceção Pós Venda: " + JSON.stringify(err));
               }
           };

           await processarPosVenda();
       }`;

lines.splice(800, 155, newContent);
fs.writeFileSync('components/map/GISMap.tsx', lines.join('\n'));
console.log('Update successful');
