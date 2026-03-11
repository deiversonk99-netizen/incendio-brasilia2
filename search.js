const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'components', 'EngineeringProposal.tsx');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');

lines.forEach((l, i) => {
    const tl = l.toLowerCase();
    if (
        tl.includes('baseado') ||
        tl.includes('composição') ||
        tl.includes('valor total') ||
        tl.includes('serviço') ||
        tl.includes('mão de obra') ||
        tl.includes('%')
    ) {
        console.log(i + 1 + ': ' + l.trim());
    }
});
