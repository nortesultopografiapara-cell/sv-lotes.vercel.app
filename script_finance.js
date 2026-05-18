const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/finance/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    /\.from\('payments'\)\s*\.select\('([\s\S]*?)'\)/g,
    ".from('finance_receipts').select('*, blocks(name, block_name, number, projects(name)), customers(name)')"
);

content = content.replace(
    /\.order\('due_date',/g,
    ".order('vencimento',"
);

// Variables mappings:
// p.sales?.contract_url -> p.contract_id
// p.sales?.clients?.full_name -> p.customers?.name
// p.amount -> p.valor
// p.due_date -> p.vencimento
// p.sales?.blocks -> p.blocks

content = content.replace(/p\.sales\?\.contract_url\?\.toLowerCase\(\)\.includes/g, "p.id?.toLowerCase().includes");
content = content.replace(/p\.sales\?\.clients\?\.full_name\?\.toLowerCase\(\)\.includes/g, "p.customers?.name?.toLowerCase().includes");

content = content.replace(/p\.status === 'PAID'/g, "p.status === 'pago'");
content = content.replace(/p\.status === 'PENDING'/g, "p.status === 'pendente'");
content = content.replace(/p\.status === 'OVERDUE'/g, "p.status === 'vencido'");
content = content.replace(/Number\(p\.amount\)/g, "Number(p.valor)");
content = content.replace(/p\.due_date/g, "p.vencimento");

content = content.replace(/p\.sales\?\.blocks\?\.projects\?\.name/g, "p.blocks?.projects?.name");
content = content.replace(/p\.sales\?\.blocks\?\.block_name/g, "p.blocks?.block_name");
content = content.replace(/p\.sales\?\.blocks\?\.name/g, "p.blocks?.name");
content = content.replace(/p\.sales\?\.blocks\?\.number/g, "p.blocks?.number");

content = content.replace(/contract=\{p\.sales\?\.contract_url \|\| p\.sales\?\.id\?\.split\('-'\)\[0\]\.toUpperCase\(\)\}/, "contract={p.contract_id?.split('-')[0].toUpperCase() || p.id?.split('-')[0].toUpperCase()}");
content = content.replace(/client=\{p\.sales\?\.clients\?\.full_name \|\| 'Desconhecido'\}/, "client={p.customers?.name || 'Desconhecido'}");

content = content.replace(/case 'PAID':/g, "case 'pago':");
content = content.replace(/case 'PENDING':/g, "case 'pendente':");
content = content.replace(/case 'OVERDUE':/g, "case 'vencido':");
content = content.replace(/p\.status === 'PAID' \? 'PAGO' : p\.status === 'PENDING' \? 'A VENCER' : 'EM ATRASO'/g, "p.status === 'pago' ? 'PAGO' : p.status === 'pendente' ? 'A VENCER' : 'EM ATRASO'");

fs.writeFileSync(filePath, content, 'utf8');
console.log("finance ok");
