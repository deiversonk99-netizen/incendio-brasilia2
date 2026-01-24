import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, '../public/produtos atualizados.xlsx');
const outputPath = join(__dirname, 'temp_products.json');

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Filter valid rows (must have at least a Name)
    const validData = data.filter(row => row.Nome && String(row.Nome).trim() !== '');

    writeFileSync(outputPath, JSON.stringify(validData, null, 2));
    console.log(`Saved ${validData.length} items to ${outputPath}`);
} catch (error) {
    console.error('Error reading/writing file:', error);
    process.exit(1);
}
