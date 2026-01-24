import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const __dirname = dirname(fileURLToPath(import.meta.url));
const tempFile = join(__dirname, 'temp_products.json');

function excelDateToJSDate(serial) {
    if (!serial) return new Date().toISOString();
    // Excel base date is 1899-12-30 usually? Or 1900-01-01.
    // Correct logic for modern excel: (serial - 25569) * 86400 * 1000
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    const date_info = new Date(utc_value * 1000);
    return date_info.toISOString();
}

async function run() {
    try {
        const rawData = JSON.parse(readFileSync(tempFile, 'utf-8'));
        console.log(`Loaded ${rawData.length} products from temporary file.`);

        // Fetch existing products and a valid user_id
        const { data: existingProducts, error: prodError } = await supabase
            .from('product_catalog')
            .select('name, user_id');

        if (prodError) throw prodError;

        const userId = existingProducts.length > 0 ? existingProducts[0].user_id : null;
        if (!userId) {
            console.error('Could not find a valid user_id to attribute products to (no existing products or no user_id found).');
            // Optimistic fallback: trying a hardcoded ID if needed, but let's hope for the best or fail.
        }
        console.log(`Using user_id: ${userId} for new products.`);

        const existingNames = new Set(existingProducts.map(p => p.name.trim().toLowerCase()));

        // Fetch suppliers for mapping
        const { data: existingSuppliers, error: suppError } = await supabase
            .from('suppliers')
            .select('id, name');

        if (suppError) throw suppError;

        const supplierMap = new Map();
        existingSuppliers.forEach(s => supplierMap.set(s.name.toLowerCase().trim(), s.id));

        const productsToInsert = [];
        const suppliersToCreate = new Set();
        const suppliersCreatedMap = new Map();

        // Pass 1: Identify new suppliers
        rawData.forEach(item => {
            const suppName = item.Fornecedor ? String(item.Fornecedor).trim() : null;
            if (suppName && !supplierMap.has(suppName.toLowerCase()) && !suppliersToCreate.has(suppName)) {
                suppliersToCreate.add(suppName);
            }
        });

        // Insert new suppliers if any
        if (suppliersToCreate.size > 0) {
            console.log(`Creating ${suppliersToCreate.size} new suppliers...`);
            const newSuppliersArray = Array.from(suppliersToCreate).map(name => ({ name }));
            const { data: createdSuppliers, error: createSuppError } = await supabase
                .from('suppliers')
                .insert(newSuppliersArray)
                .select();

            if (createSuppError) {
                console.error('Error creating suppliers:', createSuppError);
            } else {
                createdSuppliers.forEach(s => supplierMap.set(s.name.toLowerCase().trim(), s.id));
            }
        }

        // Pass 2: Prepare products
        for (const item of rawData) {
            const normalizedName = String(item.Nome).trim();
            if (existingNames.has(normalizedName.toLowerCase())) {
                continue; // Skip existing
            }

            const suppName = item.Fornecedor ? String(item.Fornecedor).trim() : null;
            let supplierId = null;
            if (suppName) {
                supplierId = supplierMap.get(suppName.toLowerCase());
            }

            productsToInsert.push({
                name: normalizedName,
                price: typeof item.Preco === 'number' ? item.Preco : 0,
                cost_price: typeof item.Custo === 'number' ? item.Custo : 0,
                observation: item.Observacao || '',
                // Date handling: Check if it's number (serial) or string
                registration_date: typeof item.DataCadastro === 'number' ? excelDateToJSDate(item.DataCadastro) : (item.DataCadastro || new Date().toISOString()),
                category: 'Material', // Default
                unit: 'un', // Default
                supplier_id: supplierId,
                user_id: userId
            });
        }

        if (productsToInsert.length === 0) {
            console.log('No new products to insert.');
            return;
        }

        console.log(`Inserting ${productsToInsert.length} new products...`);

        // Insert in batches
        const batchSize = 100;
        for (let i = 0; i < productsToInsert.length; i += batchSize) {
            const batch = productsToInsert.slice(i, i + batchSize);
            const { error: insertError } = await supabase
                .from('product_catalog')
                .insert(batch);

            if (insertError) {
                console.error(`Error inserting batch ${i}:`, insertError);
            } else {
                console.log(`Inserted items ${i} to ${i + batch.length}`);
            }
        }

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

run();
