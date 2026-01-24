
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('Fetching all products to check for duplicates...');

    let allProducts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // Fetch all products first
    try {
        while (hasMore) {
            const { data, error } = await supabase
                .from('product_catalog')
                .select('id, name, created_at')
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (error) throw error;

            if (data && data.length > 0) {
                allProducts = [...allProducts, ...data];
                if (data.length < pageSize) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
        }
    } catch (err) {
        console.error('Error fetching products:', err);
        return;
    }

    console.log(`Total products fetched: ${allProducts.length}`);

    // Find duplicates by name
    const nameMap = {};
    const duplicates = [];

    allProducts.forEach(p => {
        const normalizedName = p.name ? p.name.trim().toLowerCase() : '';
        if (!normalizedName) return;

        if (nameMap[normalizedName]) {
            nameMap[normalizedName].push(p);
        } else {
            nameMap[normalizedName] = [p];
        }
    });

    let duplicateCount = 0;
    Object.entries(nameMap).forEach(([name, products]) => {
        if (products.length > 1) {
            duplicateCount++;
            duplicates.push({
                name: name,
                ids: products.map(p => p.id),
                count: products.length,
                details: products
            });
        }
    });

    console.log(`Found ${duplicateCount} unique names with duplicates.`);

    if (duplicateCount > 0) {
        console.log('Top 5 Duplicates:');
        duplicates.slice(0, 5).forEach(d => {
            console.log(`- "${d.name}": ${d.count} copies`);
            // Sort by created_at to see which is newest
            const sorted = d.details.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            console.log(`  Newest: ${sorted[0].id} (${sorted[0].created_at})`);
            console.log(`  Oldest: ${sorted[sorted.length - 1].id} (${sorted[sorted.length - 1].created_at})`);
        });
    }
}

run();
