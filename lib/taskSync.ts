import { SupabaseClient } from '@supabase/supabase-js';

export const syncExpiredRenewals = async (supabase: SupabaseClient, userId: string): Promise<boolean> => {
    if (!userId) return false;

    const today = new Date().toISOString().split('T')[0];
    let hasChanges = false;

    // 1. Fetch expired manual renewals that haven't created a task yet
    const { data: expiredManuals } = await supabase
        .from('contract_renewals')
        .select('*, projects(name), clients(name)')
        .lte('end_date', today)
        .eq('task_created', false);

    // 2. Fetch expired annual tasks that haven't created a task yet
    const { data: expiredTasks } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('is_annual', true)
        .lte('expiration_date', today)
        .eq('task_created', false);

    if ((expiredManuals?.length || 0) === 0 && (expiredTasks?.length || 0) === 0) {
        return false;
    }

    // 3. Pre-fetch ALL existing renewal task titles to prevent any duplicates
    const { data: existingRenewalTasks } = await supabase
        .from('tasks')
        .select('title')
        .or('title.ilike.[RENOVAÇÃO]%,title.ilike.[RENOVAÇÃO ANUAL]%');

    const existingTitles = new Set(
        (existingRenewalTasks || []).map(t => t.title.trim().toLowerCase())
    );

    // 4. Helper to find the "Pendentes" group for a user
    const userGroupCache: Record<string, string | null> = {};

    const getGroupForUser = async (targetUserId: string) => {
        if (userGroupCache[targetUserId] !== undefined) return userGroupCache[targetUserId];

        // Strategy A: Find boards owned by this user
        const { data: boards } = await supabase.from('task_boards').select('id').eq('user_id', targetUserId);
        if (boards && boards.length > 0) {
            const boardIds = boards.map(b => b.id);
            const { data: groups } = await supabase.from('task_groups')
                .select('id')
                .in('board_id', boardIds)
                .ilike('name', '%Pendente%')
                .limit(1);
            if (groups && groups.length > 0) {
                userGroupCache[targetUserId] = groups[0].id;
                return groups[0].id;
            }
            
            // If no "Pendente" group found on user board, take the first group of any board they own
            const { data: anyGroup } = await supabase.from('task_groups')
                .select('id')
                .in('board_id', boardIds)
                .limit(1);
            if (anyGroup && anyGroup.length > 0) {
                userGroupCache[targetUserId] = anyGroup[0].id;
                return anyGroup[0].id;
            }
        }

        // Strategy B: Fallback to any "Pendentes" group in the system
        const { data: fallbackGroup } = await supabase.from('task_groups')
            .select('id')
            .ilike('name', '%Pendente%')
            .limit(1)
            .maybeSingle();
            
        userGroupCache[targetUserId] = fallbackGroup?.id || null;
        return userGroupCache[targetUserId];
    };

    // 5. Process Manual Renewals
    for (const manual of (expiredManuals || [])) {
        const targetUserId = manual.user_id || userId;
        const groupId = await getGroupForUser(targetUserId);

        // SAFETY: Never create a task without a valid group
        if (!groupId) continue;

        const title = `[RENOVAÇÃO] ${manual.projects?.name || manual.clients?.name || 'Cliente Avulso'}`;

        // DEDUPLICATION: Skip if a task with this exact title already exists
        if (existingTitles.has(title.trim().toLowerCase())) {
            // Still mark as claimed so it doesn't keep trying
            await supabase.from('contract_renewals').update({ task_created: true }).eq('id', manual.id);
            continue;
        }

        // ATOMIC CLAIM: Try to reserve this renewal for task creation
        const { data: claimed, error: claimError } = await supabase
            .from('contract_renewals')
            .update({ task_created: true })
            .eq('id', manual.id)
            .eq('task_created', false)
            .select()
            .single();

        // If another session already claimed it, skip
        if (!claimed || claimError) continue;

        const description = `Contrato vencido em ${new Date(manual.end_date).toLocaleDateString('pt-BR')}.\nValor: R$ ${manual.value?.toLocaleString('pt-BR')}\nNotas: ${manual.notes || ''}`;

        const { error: insertError } = await supabase.from('tasks').insert({
            title,
            description,
            group_id: groupId,
            user_id: targetUserId,
            project_id: manual.project_id,
            status: 'PENDING',
            priority: 'HIGH',
            task_created: true // Mark the generated task itself so it's never reprocessed
        });

        if (insertError) {
            // Rollback the claim so it can be attempted again later
            await supabase.from('contract_renewals').update({ task_created: false }).eq('id', manual.id);
            console.error('Failed to create synced task for renewal:', insertError);
        } else {
            // Add to our local set to prevent duplicates within the same sync run
            existingTitles.add(title.trim().toLowerCase());
            hasChanges = true;
        }
    }

    // 6. Process Annual Tasks
    for (const task of (expiredTasks || [])) {
        const targetUserId = task.user_id || userId;
        const groupId = await getGroupForUser(targetUserId);

        // SAFETY: Never create a task without a valid group
        if (!groupId) continue;

        const title = `[RENOVAÇÃO ANUAL] ${task.title}`;

        // DEDUPLICATION: Skip if a task with this exact title already exists
        if (existingTitles.has(title.trim().toLowerCase())) {
            // Still mark as claimed so it doesn't keep trying
            await supabase.from('tasks').update({ task_created: true }).eq('id', task.id);
            continue;
        }

        // ATOMIC CLAIM: Try to reserve this task for creation
        const { data: claimed, error: claimError } = await supabase
            .from('tasks')
            .update({ task_created: true })
            .eq('id', task.id)
            .eq('task_created', false)
            .select()
            .single();

        // If another session already claimed it, skip
        if (!claimed || claimError) continue;

        const description = `Tarefa anual vencida em ${new Date(task.expiration_date).toLocaleDateString('pt-BR')}.\nOriginal: ${task.description || ''}`;

        const { error: insertError } = await supabase.from('tasks').insert({
            title,
            description,
            group_id: groupId,
            user_id: targetUserId,
            project_id: task.project_id,
            status: 'PENDING',
            priority: 'HIGH',
            task_created: true // Mark the generated task itself so it's never reprocessed
        });

        if (insertError) {
            // Rollback the claim so it can be attempted again later
            await supabase.from('tasks').update({ task_created: false }).eq('id', task.id);
            console.error('Failed to create synced task for annual task:', insertError);
        } else {
            existingTitles.add(title.trim().toLowerCase());
            hasChanges = true;
        }
    }

    return hasChanges;
};
