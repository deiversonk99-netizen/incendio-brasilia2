
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function syncExpiredRenewals() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Checking for renewals expired on or before: ${today}`);

    // 1. Fetch expired manual renewals
    const { data: expiredManuals, error: manualError } = await supabase
        .from('contract_renewals')
        .select('*, projects(name), clients(name)')
        .lte('end_date', today)
        .eq('task_created', false);

    if (manualError) {
        console.error('Error fetching manuals:', manualError);
        return;
    }

    // 2. Fetch expired annual tasks
    const { data: expiredTasks, error: taskError } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('is_annual', true)
        .lte('expiration_date', today)
        .eq('task_created', false);

    if (taskError) {
        console.error('Error fetching tasks:', taskError);
        return;
    }

    console.log(`Found ${expiredManuals?.length || 0} expired manual renewals and ${expiredTasks?.length || 0} expired annual tasks.`);

    if ((expiredManuals?.length || 0) === 0 && (expiredTasks?.length || 0) === 0) {
        console.log('Nothing to sync.');
        return;
    }

    // 3. Find the "Pendentes" group ID
    let groupIdToUse = null;
    const { data: boards } = await supabase.from('task_boards').select('id, name');

    const monitorBoard = boards?.find(b =>
        b.name.toLowerCase().includes('monitor') ||
        b.name.toLowerCase().includes('sync') ||
        b.name.toLowerCase().includes('central')
    );

    if (monitorBoard) {
        const { data: group } = await supabase.from('task_groups')
            .select('id')
            .eq('board_id', monitorBoard.id)
            .ilike('name', '%Pendente%')
            .limit(1)
            .maybeSingle();
        if (group) groupIdToUse = group.id;
    }

    if (!groupIdToUse) {
        const generalBoard = boards?.find(b => b.name.toLowerCase().includes('geral'));
        if (generalBoard) {
            const { data: group } = await supabase.from('task_groups')
                .select('id')
                .eq('board_id', generalBoard.id)
                .ilike('name', '%Pendente%')
                .limit(1)
                .maybeSingle();
            if (group) groupIdToUse = group.id;
        }
    }

    if (!groupIdToUse) {
        const { data: group } = await supabase.from('task_groups').select('id').ilike('name', '%Pendente%').limit(1).maybeSingle();
        if (group) groupIdToUse = group.id;
    }

    if (!groupIdToUse) {
        console.error('Could not find a "Pendente" group.');
        return;
    }

    console.log(`Using group ID: ${groupIdToUse}`);

    // 4. Process Manual Renewals
    for (const manual of (expiredManuals || [])) {
        const title = `[RENOVAÇÃO] ${manual.projects?.name || manual.clients?.name || 'Cliente Avulso'}`;
        const description = `Contrato vencido em ${new Date(manual.end_date).toLocaleDateString('pt-BR')}.\nValor: R$ ${manual.value?.toLocaleString('pt-BR')}\nNotas: ${manual.notes || ''}`;

        console.log(`Creating task for manual: ${title}`);

        // Use a test user ID if manual.user_id is null, or just use manual.user_id
        const user_id = manual.user_id || 'fccae473-8363-4d73-8a12-f4a295229a3e'; // Fallback to a known user

        const { error: insertError } = await supabase.from('tasks').insert({
            title,
            description,
            group_id: groupIdToUse,
            user_id: user_id,
            project_id: manual.project_id,
            status: 'PENDING',
            priority: 'HIGH'
        });

        if (insertError) {
            console.error(`Error inserting task for manual ${manual.id}:`, insertError);
        } else {
            console.log(`Successfully created task for manual ${manual.id}. Updating task_created flag.`);
            await supabase.from('contract_renewals').update({ task_created: true }).eq('id', manual.id);
        }
    }

    // 5. Process Annual Tasks
    for (const task of (expiredTasks || [])) {
        const title = `[RENOVAÇÃO ANUAL] ${task.title}`;
        const description = `Tarefa anual vencida em ${new Date(task.expiration_date).toLocaleDateString('pt-BR')}.\nOriginal: ${task.description || ''}`;

        console.log(`Creating task for annual: ${title}`);

        const { error: insertError } = await supabase.from('tasks').insert({
            title,
            description,
            group_id: groupIdToUse,
            user_id: task.user_id,
            project_id: task.project_id,
            status: 'PENDING',
            priority: 'HIGH'
        });

        if (insertError) {
            console.error(`Error inserting task for annual task ${task.id}:`, insertError);
        } else {
            console.log(`Successfully created task for annual task ${task.id}. Updating task_created flag.`);
            await supabase.from('tasks').update({ task_created: true }).eq('id', task.id);
        }
    }

    console.log('Sync completed.');
}

syncExpiredRenewals();
