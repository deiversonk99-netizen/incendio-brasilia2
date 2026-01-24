import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        // 1. Total Count
        const { count, error: countError } = await supabase
            .from('product_catalog')
            .select('*', { count: 'exact', head: true });

        if (countError) console.error('Count Error:', countError);
        else console.log('Total Products in DB:', count);

        // 2. User ID Distribution (Need to fetch all and aggregate since we can't do GROUP BY easily via client)
        const { data: allProducts, error: fetchError } = await supabase
            .from('product_catalog')
            .select('user_id, name, created_at'); // minimal fields

        if (fetchError) {
            console.error('Fetch Error:', fetchError);
            return;
        }

        const userCounts = {};
        let nullUserCount = 0;
        let recentCount = 0;
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        allProducts.forEach(p => {
            if (p.user_id) {
                userCounts[p.user_id] = (userCounts[p.user_id] || 0) + 1;
            } else {
                nullUserCount++;
            }

            // Check if created recently (this check depends on if we set created_at or if DB sets it)
            // Assuming DB sets created_at
            if (p.created_at && new Date(p.created_at) > oneHourAgo) {
                recentCount++;
            }
        });

        console.log('User ID Distribution:');
        console.log(JSON.stringify(userCounts, null, 2));
        console.log('Products with NULL user_id:', nullUserCount);
        console.log('Products created in the last hour:', recentCount);

        // 3. List a few recent products
        const recentProducts = allProducts
            .filter(p => p.created_at && new Date(p.created_at) > oneHourAgo)
            .slice(0, 5)
            .map(p => ({ name: p.name, user_id: p.user_id }));

        console.log('Sample Recent Products:', recentProducts);

    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

run();
