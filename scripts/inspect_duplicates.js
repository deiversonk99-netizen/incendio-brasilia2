
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    const term = 'Dobradiça com mola para porta corta fogo';
    console.log(`Searching for products containing: "${term}"`);

    const { data, error } = await supabase
        .from('product_catalog')
        .select('*')
        .ilike('name', `%${term}%`);

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${data.length} matches.`);
    data.forEach(p => {
        console.log(`ID: ${p.id}`);
        console.log(`Name: "${p.name}"`);
        console.log(`Name (hex): ${Buffer.from(p.name).toString('hex')}`);
        console.log(`Created At: ${p.created_at}`);
        console.log('---');
    });
}

run();
