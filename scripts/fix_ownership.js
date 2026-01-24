import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        // 1. Get the "Good" User ID from a visible product
        const { data: visible, error: err1 } = await supabase
            .from('product_catalog')
            .select('user_id')
            .ilike('name', '%Abraçadeira gota 1" galvanizada%')
            .limit(1);

        if (err1 || !visible || visible.length === 0) {
            console.error('Could not find visible product to copy user_id from.');
            return;
        }

        const correctUserId = visible[0].user_id;
        console.log(`Target User ID (Visible): ${correctUserId}`);

        // 2. Find recent products (last 2 hours) that MIGHT have the wrong ID
        // Actually, let's just update ALL products created recently to this ID.
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

        console.log(`Updating products created after ${twoHoursAgo}...`);

        const { data: updated, error: updateError } = await supabase
            .from('product_catalog')
            .update({ user_id: correctUserId })
            .gt('created_at', twoHoursAgo)
            .select();

        if (updateError) console.error('Update Error:', updateError);
        else console.log(`Successfully updated ownership for ${updated.length} products.`);

    } catch (err) {
        console.error(err);
    }
}
run();
