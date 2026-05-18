const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components/contracts/ContractGenerator.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const target = "{selectedTemplate ? (";

const replacement = `{sale.generated_html ? (
                        <div dangerouslySetInnerHTML={{ __html: sale.generated_html }} />
                    ) : selectedTemplate ? (`

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("SUCCESS");
} else {
    console.log("NOT FOUND.")
}
