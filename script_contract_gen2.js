const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components/contracts/ContractGenerator.tsx');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/sale\.clients\?\.full_name/g, "(sale.customers?.name || sale.clients?.full_name)");
content = content.replace(/sale\.clients\?\.cpf_cnpj/g, "(sale.customers?.cpf_cnpj || sale.clients?.cpf_cnpj)");

fs.writeFileSync(filePath, content, 'utf8');
console.log("updated fallbacks");
