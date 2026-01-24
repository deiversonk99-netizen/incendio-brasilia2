import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        console.log("Checking VISIBLE product 'Abraçadeira gota 1\" galvanizada'...");
        const { data: visible, error: err1 } = await supabase
            .from('product_catalog')
            .select('name, user_id')
            .ilike('name', '%Abraçadeira gota 1" galvanizada%')
            .limit(1);

        if (err1) console.error(err1);
        else console.log('Visible Product Owner:', visible);

        console.log("\nChecking HIDDEN product 'Placas de Sinalização'...");
        const { data: hidden, error: err2 } = await supabase
            .from('product_catalog')
            .select('name, user_id')
            .ilike('name', '%Placas de Sinalização%')
            .limit(1);

        if (err2) console.error(err2);
        else console.log('Hidden Product Owner:', hidden);

    } catch (err) {
        console.error(err);
    }
}
run();
