
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('Fetching all products for deduplication...');

    let allProducts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    // Fetch all products
    try {
        while (hasMore) {
            const { data, error } = await supabase
                .from('product_catalog')
                .select('*')
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

    // Group by name
    const nameMap = {};
    allProducts.forEach(p => {
        // More aggressive normalization: lowercase, trim, and collapse multiple spaces
        const normalizedName = p.name ? p.name.trim().toLowerCase().replace(/\s+/g, ' ') : '';
        if (!normalizedName) return;

        if (nameMap[normalizedName]) {
            nameMap[normalizedName].push(p);
        } else {
            nameMap[normalizedName] = [p];
        }
    });

    // Identify duplicates
    const duplicates = Object.values(nameMap).filter(group => group.length > 1);
    console.log(`Found ${duplicates.length} groups of duplicates.`);

    for (const group of duplicates) {
        // Sort by created_at descending (newest first)
        // If created_at is missing, sort by ID roughly
        group.sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
        });

        const keeper = group[0];
        const toDelete = group.slice(1);
        const idsToDelete = toDelete.map(p => p.id);

        console.log(`Processing "${keeper.name}" - Keeping ${keeper.id}, Deleting ${idsToDelete.length} others.`);

        // 1. Re-link references
        // We need to check tables that reference product_id: 
        // - product_stock
        // - kit_components (if exists, check schema) -> assuming 'kit_components'
        // - budget_items (might store product_id?) -> check schema

        // Update product_stock
        const { error: stockError } = await supabase
            .from('product_stock')
            .update({ product_id: keeper.id })
            .in('product_id', idsToDelete);

        if (stockError) console.error(`  Error updating product_stock for ${keeper.name}:`, stockError);

        // Update supplier_purchases (from types.ts)
        const { error: purchaseError } = await supabase
            .from('supplier_purchases') // Assuming table name based on interface SupplierPurchase
            .update({ product_id: keeper.id })
            .in('product_id', idsToDelete);

        if (purchaseError && purchaseError.code !== '42P01') { // Ignore if table doesn't exist
            console.error(`  Error updating supplier_purchases for ${keeper.name}:`, purchaseError);
        }

        // Update kit_components (assuming based on typical schema, though not in provided types.ts explicitly joined)
        const { error: kitError } = await supabase
            .from('kit_components')
            .update({ product_id: keeper.id })
            .in('product_id', idsToDelete);

        if (kitError && kitError.code !== '42P01') {
            console.error(`  Error updating kit_components for ${keeper.name}:`, kitError);
        }

        // Update service_model_items 
        const { error: serviceError } = await supabase
            .from('service_model_items')
            .update({ product_id: keeper.id })
            .in('product_id', idsToDelete);

        if (serviceError && serviceError.code !== '42P01') {
            console.error(`  Error updating service_model_items for ${keeper.name}:`, serviceError);
        }


        // 2. Delete duplicates
        const { error: deleteError } = await supabase
            .from('product_catalog')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) {
            console.error(`  Error deleting duplicates for ${keeper.name}:`, deleteError);
        } else {
            console.log(`  Successfully deleted ${idsToDelete.length} duplicates.`);
        }
    }

    console.log('Deduplication complete.');
}

run();
