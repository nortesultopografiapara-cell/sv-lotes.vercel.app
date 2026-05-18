const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/contracts/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/from\('sales'\)/g, "from('contracts')");
content = content.replace(/\.select\('\*, clients\(\*\), blocks\(number, block_name, name, projects\(name, city, state\)\)'\)/g, ".select('*, customers(name), blocks(number, block_name, name, projects(name, city, state))')");

content = content.replace(/s\.clients\?\.full_name/g, "s.customers?.name");
content = content.replace(/sale\.clients\?\.full_name/g, "sale.customers?.name");

// value -> valor_total
content = content.replace(/sale\.final_value \|\| sale\.agreed_price/g, "sale.valor_total");

fs.writeFileSync(filePath, content, 'utf8');
console.log("contracts check 1");
