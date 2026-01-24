import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('product_catalog')
            .select('name, created_at')
            .gt('created_at', oneHourAgo)
            .limit(10);

        if (error) console.error(error);
        else {
            console.log('--- RECENTLY ADDED PRODUCTS ---');
            data.forEach(p => console.log(`- ${p.name}`));
            console.log(`Total found in last hour: ${data.length} (showing max 10)`);
        }
    } catch (err) {
        console.error(err);
    }
}
run();
