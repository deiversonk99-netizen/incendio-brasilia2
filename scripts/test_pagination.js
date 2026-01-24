
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('Fetching page 1 (0-999)...');
    const { data: page1, error: error1 } = await supabase
        .from('product_catalog')
        .select('*')
        .range(0, 999);

    if (error1) console.error('Error 1:', error1);
    else console.log('Page 1 count:', page1.length);

    console.log('Fetching page 2 (1000-1999)...');
    const { data: page2, error: error2 } = await supabase
        .from('product_catalog')
        .select('*')
        .range(1000, 1999);

    if (error2) console.error('Error 2:', error2);
    else {
        console.log('Page 2 count:', page2.length);
        if (page2.length > 0) {
            console.log('First item of page 2:', page2[0].name);
        }
    }
}

run();
