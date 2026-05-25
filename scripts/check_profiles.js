import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vegvkcbgxibmjurwgvqv.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlZ3ZrY2JneGlibWp1cndndnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMzc5MjQsImV4cCI6MjA4MTkxMzkyNH0.bSggLhmMtRmzCr7hg9cdZ9E6AfxKibhF5Bqz48s1SY8';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*');

        if (error) {
            console.error('Error fetching user_profiles:', error);
        } else {
            console.log('All User Profiles:');
            console.log(JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

run();
