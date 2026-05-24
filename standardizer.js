const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    if (fs.statSync(dirPath).isDirectory()) {
      if (!dirPath.includes('node_modules') && !dirPath.includes('.next')) {
        walk(dirPath, callback);
      }
    } else {
      callback(path.join(dir, f));
    }
  });
}

const colorReplacements = [
  // Backgrounds
  { regex: /bg-white(?![/a-zA-Z0-9])/g, replace: 'bg-[var(--color-surface)]' },
  { regex: /bg-\[#(11151c|13161c|1c212a|1a1f29|161a22|1a1e27|070b14|11141a|11161d|0E1116)\]/gi, replace: 'bg-[var(--color-surface)]' },
  { regex: /bg-\[#(0b0b0b|050816|091224|0b1111|0E172B|0b0e14)\]/gi, replace: 'bg-[var(--color-background)]' },
  { regex: /bg-slate-(50|100|200)/g, replace: 'bg-[var(--color-background)]' },
  // Borders
  { regex: /border-slate-(100|200|300|600|700|800)/g, replace: 'border-[var(--color-border)]' },
  { regex: /border-gray-(100|200|300|600|700|800)/g, replace: 'border-[var(--color-border)]' },
  { regex: /border-\[#(1f232b|2d3340|1e293b|334155)\]/gi, replace: 'border-[var(--color-border)]' },
  // Text
  { regex: /text-gray-(800|900)/g, replace: 'text-[var(--color-text-main)]' },
  { regex: /text-slate-(800|900)/g, replace: 'text-[var(--color-text-main)]' },
  { regex: /text-gray-(400|500|600)/g, replace: 'text-[var(--color-text-muted)]' },
  { regex: /text-slate-(400|500|600)/g, replace: 'text-[var(--color-text-muted)]' },
  // Random isolated colors
  { regex: /bg-orange-[456]00/g, replace: 'bg-[var(--color-primary)]' },
  { regex: /text-orange-[456]00/g, replace: 'text-[var(--color-primary)]' },
  // Buttons default (some use #2563EB directly or random blues/oranges)
  { regex: /bg-\[#(2980B9|06b6d4|3B82F6|2563EB|F27D26|f8b63a|1f6b9c)\]/gi, replace: 'bg-[var(--color-primary)]' },
  { regex: /text-\[#(2980B9|06b6d4|3B82F6|2563EB|F27D26|f8b63a|1f6b9c)\]/gi, replace: 'text-[var(--color-primary)]' },
  { regex: /border-\[#(2980B9|06b6d4|3B82F6|2563EB|F27D26|f8b63a|1f6b9c)\]/gi, replace: 'border-[var(--color-primary)]' },
  // Hover primary
  { regex: /hover:bg-\[#(3B82F6|2563EB|F27D26|f8b63a|1f6b9c|8b5cf6)\]/gi, replace: 'hover:bg-[var(--color-primary-hover)]' }
];

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts') && !filePath.endsWith('.jsx') && !filePath.endsWith('.js')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;

  colorReplacements.forEach(rep => {
    newContent = newContent.replace(rep.regex, rep.replace);
  });

  if (content !== newContent) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Updated: ${filePath}`);
  }
}

walk('./app', processFile);
walk('./components', processFile);

console.log("Standardization complete!");
