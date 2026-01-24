
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const problematicName = "Dobradiça com mola para porta corta fogo, unidade"; // Exact string from error
    console.log(`Resolving conflict for: "${problematicName}"`);

    const { data, error } = await supabase
        .from('product_catalog')
        .select('*')
        .eq('name', problematicName); // Strict equality check

    if (error) {
        console.error("Error fetching:", error);
        return;
    }

    if (data.length < 2) {
        console.log("Less than 2 items found. Maybe fixed?");
        return;
    }

    console.log(`Found ${data.length} exact duplicates.`);

    // Sort Newest First
    data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const keeper = data[0];
    const toDelete = data.slice(1);

    console.log(`Keeping: ${keeper.id}`);

    for (const p of toDelete) {
        console.log(`Deleting: ${p.id}`);

        const tables = ['product_stock', 'supplier_purchases', 'kit_components', 'service_model_items', 'budget_items', 'stock_movements'];

        for (const table of tables) {
            // we try to update product_id. If table doesn't have it or row doesn't exist, it's fine (unless strict SQL mode throws, but JS client usually just returns 0 rows updated)
            // However, if budget_items doesn't have product_id, this might throw 'column does not exist'. 
            // We'll wrap in try/catch or just ignore error.
            try {
                const { error } = await supabase.from(table).update({ product_id: keeper.id }).eq('product_id', p.id);
                if (error) {
                    console.log(`  Reference update for ${table} failed:`, error.message);
                    // If update failed (likely due to unique constraint on target), delete the old reference
                    if (error.code === '23505') {
                        console.log(`  Deleting conflicting row in ${table} instead...`);
                        await supabase.from(table).delete().eq('product_id', p.id);
                    }
                }
                else console.log(`  Updated references in ${table}`);
            } catch (e) {
                console.log(`  Skipping table ${table}`);
            }
        }

        // Delete
        const { error: delError } = await supabase.from('product_catalog').delete().eq('id', p.id);
        if (delError) console.error("Delete failed:", delError);
        else console.log("Deleted.");
    }
}

run();
