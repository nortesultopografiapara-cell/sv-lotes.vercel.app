import { NextResponse } from 'next/server';
import { generateContractHTML } from '@/lib/contractTemplate';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: contracts, error } = await supabaseAdmin.from('contracts').select(`
    *,
    customers:customer_id(*),
    sales:sale_id(*, projects:project_id(*), blocks:block_id(*)),
    projects:project_id(*),
    blocks:block_id(*, projects:project_id(*))
  `);

  if (error) return NextResponse.json({ error }, { status: 500 });
  
  let updatedCount = 0;
  for (const contract of contracts) {
      let fetchedProject = contract.projects;
      const pid = contract.project_id || contract.sales?.project_id || contract.blocks?.project_id;
      if (pid) {
         const { data: pj } = await supabaseAdmin.from('projects').select('*').eq('id', pid).maybeSingle();
         if (pj) fetchedProject = pj;
      }
      
      const projData = fetchedProject || contract.sales?.projects || contract.blocks?.projects || {};
      
      const isValid = (val: any) => typeof val === 'string' && val.trim() !== '' && !val.includes('não informad');
      
      const contractPayloadPartial = {
         project_name_snapshot: isValid(contract.project_name_snapshot) ? contract.project_name_snapshot : (projData.name || null),
         project_city_snapshot: isValid(contract.project_city_snapshot) ? contract.project_city_snapshot : (projData.city || null),
         project_uf_snapshot: isValid(contract.project_uf_snapshot) ? contract.project_uf_snapshot : (projData.uf || null),
         forum_city_snapshot: isValid(contract.forum_city_snapshot) ? contract.forum_city_snapshot : (projData.forum_city || projData.city || null),
      };
      
      const updatedContract = { ...contract, ...contractPayloadPartial };
      
      let receipts_sum = 0;
      if (contract.sale_id) {
         const { data: recs } = await supabaseAdmin.from("finance_receipts").select("amount").eq("sale_id", contract.sale_id).neq("status", "cancelled");
         if (recs && recs.length) receipts_sum = recs.reduce((a, b) => a + Number(b.amount || 0), 0);
      }
      
      let tenantData = {};
      if (contract.tenant_id) {
          const { data: t } = await supabaseAdmin.from('companies').select('*').eq('id', contract.tenant_id).maybeSingle();
          if (t) tenantData = t;
      }
      
      const newHtml = generateContractHTML({
         tenant: tenantData,
         customer: updatedContract.customers || (updatedContract.customer_id ? { id: updatedContract.customer_id } : {}),
         project: projData,
         block: updatedContract.blocks || updatedContract.sales?.blocks || {},
         sale: { ...(updatedContract.sales || {}), receipts_sum },
         contractSnapshot: updatedContract,
         contractDate: updatedContract.created_at,
      });
      
      await supabaseAdmin.from("contracts").update({ generated_html: newHtml, ...contractPayloadPartial }).eq("id", contract.id);
      updatedCount++;
  }

  return NextResponse.json({ success: true, updatedCount });
}
