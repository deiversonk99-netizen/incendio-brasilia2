import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { canDelegateTask, isTaskCentralUser } from '../lib/permissions';
import { Project } from '../types';

const SYNC_BOARD_ID = 'central-sync';

// ============================================================
// TASK SYNC LOGIC (inlined from lib/taskSync.ts)
// ============================================================
const syncExpiredRenewals = async (supabase: SupabaseClient, userId: string): Promise<boolean> => {
    if (!userId) return false;

    const today = new Date().toISOString().split('T')[0];
    let hasChanges = false;

    const { data: expiredManuals } = await supabase
        .from('contract_renewals')
        .select('*, projects(name), clients(name)')
        .lte('end_date', today)
        .eq('task_created', false);

    const { data: expiredTasks } = await supabase
        .from('tasks')
        .select('*, projects(name)')
        .eq('is_annual', true)
        .lte('expiration_date', today)
        .eq('task_created', false);

    if ((expiredManuals?.length || 0) === 0 && (expiredTasks?.length || 0) === 0) {
        return false;
    }

    const { data: existingRenewalTasks } = await supabase
        .from('tasks')
        .select('title')
        .or('title.ilike.[RENOVAÇÃO]%,title.ilike.[RENOVAÇÃO ANUAL]%');

    const existingTitles = new Set(
        (existingRenewalTasks || []).map(t => t.title.trim().toLowerCase())
    );

    const userGroupCache: Record<string, string | null> = {};

    const getGroupForUser = async (targetUserId: string) => {
        if (userGroupCache[targetUserId] !== undefined) return userGroupCache[targetUserId];
        const { data: boards } = await supabase.from('task_boards').select('id').eq('user_id', targetUserId);
        if (boards && boards.length > 0) {
            const boardIds = boards.map(b => b.id);
            const { data: groups } = await supabase.from('task_groups').select('id').in('board_id', boardIds).ilike('name', '%Pendente%').limit(1);
            if (groups && groups.length > 0) {
                userGroupCache[targetUserId] = groups[0].id;
                return groups[0].id;
            }
            const { data: anyGroup } = await supabase.from('task_groups').select('id').in('board_id', boardIds).limit(1);
            if (anyGroup && anyGroup.length > 0) {
                userGroupCache[targetUserId] = anyGroup[0].id;
                return anyGroup[0].id;
            }
        }
        
        // Fallback removed as per plan: do not use a global group for other users.
        userGroupCache[targetUserId] = null;
        return null;

        userGroupCache[targetUserId] = null;
        return null;
    };

    // Process Manual Renewals
    for (const manual of (expiredManuals || [])) {
        const targetUserId = manual.user_id || userId;
        const groupId = await getGroupForUser(targetUserId);

        if (!groupId) continue;

        const title = `[RENOVAÇÃO] ${manual.projects?.name || manual.clients?.name || 'Cliente Avulso'}`;

        if (existingTitles.has(title.trim().toLowerCase())) {
            await supabase.from('contract_renewals').update({ task_created: true }).eq('id', manual.id);
            continue;
        }

        const { data: claimed, error: claimError } = await supabase
            .from('contract_renewals')
            .update({ task_created: true })
            .eq('id', manual.id)
            .eq('task_created', false)
            .select()
            .single();

        if (!claimed || claimError) continue;

        const description = `Contrato vencido em ${new Date(manual.end_date).toLocaleDateString('pt-BR')}.\nValor: R$ ${manual.value?.toLocaleString('pt-BR')}\nNotas: ${manual.notes || ''}`;

        const { error: insertError } = await supabase.from('tasks').insert({
            title,
            description,
            group_id: groupId,
            user_id: targetUserId,
            assignee: targetUserId,
            project_id: manual.project_id,
            status: 'PENDING',
            priority: 'HIGH',
            task_created: true
        });

        if (insertError) {
            await supabase.from('contract_renewals').update({ task_created: false }).eq('id', manual.id);
            console.error('Failed to create synced task for renewal:', insertError);
        } else {
            existingTitles.add(title.trim().toLowerCase());
            hasChanges = true;
        }
    }

    // Process Annual Tasks
    for (const task of (expiredTasks || [])) {
        const targetUserId = task.user_id || userId;
        const groupId = await getGroupForUser(targetUserId);

        if (!groupId) continue;

        const title = `[RENOVAÇÃO ANUAL] ${task.title}`;

        if (existingTitles.has(title.trim().toLowerCase())) {
            await supabase.from('tasks').update({ task_created: true }).eq('id', task.id);
            continue;
        }

        const { data: claimed, error: claimError } = await supabase
            .from('tasks')
            .update({ task_created: true })
            .eq('id', task.id)
            .eq('task_created', false)
            .select()
            .single();

        if (!claimed || claimError) continue;

        const description = `Tarefa anual vencida em ${new Date(task.expiration_date).toLocaleDateString('pt-BR')}.\nOriginal: ${task.description || ''}`;

        const { error: insertError } = await supabase.from('tasks').insert({
            title,
            description,
            group_id: groupId,
            user_id: targetUserId,
            assignee: targetUserId,
            project_id: task.project_id,
            status: 'PENDING',
            priority: 'HIGH',
            task_created: true
        });

        if (insertError) {
            await supabase.from('tasks').update({ task_created: false }).eq('id', task.id);
            console.error('Failed to create synced task for annual task:', insertError);
        } else {
            existingTitles.add(title.trim().toLowerCase());
            hasChanges = true;
        }
    }

    return hasChanges;
};

interface TaskBoard {
  id: string;
  name: string;
  user_id?: string;
}

interface TaskGroup {
  id: string;
  name: string;
  color: string;
  order_index: number;
  board_id: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  completed?: boolean;
  group_id: string;
  category: string;
  file_url: string;
  label_color?: string;
  project_id: string;
  is_annual?: boolean;
  expiration_date?: string;
  projects?: { name: string };
  order_index: number;
  user_id: string;
  assignee?: string;
  assignee_profile?: { email: string; professional_title?: string };
  user_profiles?: { email: string };
  checklist_progress?: string | null;
  checklist_percentage?: number;
}

interface TasksViewProps {
  viewMode?: 'minhas_tarefas' | 'monitoramento' | 'atribuidas';
}

// ============================================================
// NEW TASK MODAL
// ============================================================
interface NewTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultGroupId?: string;
    boardId?: string;
    taskToEdit?: any;
}

interface ModalTaskGroup {
    id: string;
    name: string;
    task_boards?: {
        name: string;
    };
}

interface ChecklistItem {
    id?: string;
    task_id?: string;
    content: string;
    is_completed: boolean;
}

const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, onSuccess, defaultGroupId, boardId, taskToEdit }) => {
    const { user, profile } = useAuth();
    const canDelegate = canDelegateTask(profile);
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [groups, setGroups] = useState<ModalTaskGroup[]>([]);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [groupId, setGroupId] = useState(defaultGroupId || '');
    const [labelColor, setLabelColor] = useState('transparent');
    const [category, setCategory] = useState('Engenharia');
    const [projectId, setProjectId] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [isAnnual, setIsAnnual] = useState(false);
    const [expirationDate, setExpirationDate] = useState('');
    const [assignee, setAssignee] = useState('');
    const [users, setUsers] = useState<any[]>([]);
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
    const [newChecklistItem, setNewChecklistItem] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchInitialData();
            if (taskToEdit) {
                setTitle(taskToEdit.title || '');
                setDescription(taskToEdit.description || '');
                setGroupId(taskToEdit.group_id || '');
                setLabelColor(taskToEdit.label_color || 'transparent');
                setCategory(taskToEdit.category || 'Engenharia');
                setProjectId(taskToEdit.project_id || '');
                setIsAnnual(taskToEdit.is_annual || false);
                setExpirationDate(taskToEdit.expiration_date || '');
                setAssignee(taskToEdit.assignee || '');
                if (taskToEdit.id) fetchChecklist(taskToEdit.id);
            } else {
                setTitle('');
                setDescription('');
                setGroupId(defaultGroupId || '');
                setLabelColor('transparent');
                setCategory('Engenharia');
                setProjectId('');
                setIsAnnual(false);
                setExpirationDate('');
                setAssignee(canDelegate ? '' : (user?.id || ''));
                setChecklistItems([]);
                setNewChecklistItem('');
            }
        }
    }, [isOpen, defaultGroupId, boardId, taskToEdit]);

    const fetchChecklist = async (taskId: string) => {
        try {
            const { data, error } = await supabase
                .from('task_checklist_items')
                .select('*')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true });
            if (error) throw error;
            if (data) setChecklistItems(data);
        } catch (error) {
            console.error('Error fetching checklist:', error);
        }
    };

    const fetchInitialData = async () => {
        let groupsQuery = supabase
            .from('task_groups')
            .select('id, name, board_id, task_boards(name, user_id)')
            .order('order_index');
        if (boardId && boardId !== 'central-sync') {
            groupsQuery = groupsQuery.eq('board_id', boardId);
        }
        const usersRequest = canDelegate
            ? supabase.from('user_profiles').select('id, email, professional_title, status')
            : Promise.resolve({
                data: user ? [{ id: user.id, email: user.email, professional_title: profile?.professional_title }] : [],
                error: null
            });
        const [
            { data: pData },
            { data: gData },
            { data: fData },
            { data: bData },
            { data: prData },
            { data: uData }
        ] = await Promise.all([
            supabase.from('projects').select('*').order('name'),
            groupsQuery,
            supabase.from('floors').select('project_id'),
            supabase.from('budget_items').select('project_id'),
            supabase.from('proposals').select('project_id'),
            usersRequest
        ]);
        if (uData) setUsers(uData.filter((item: any) => !item.status || item.status === 'ACTIVE'));
        if (pData) {
            const linkedProjectIds = new Set([
                ...(fData || []).map(f => f.project_id),
                ...(bData || []).map(b => b.project_id),
                ...(prData || []).map(pr => pr.project_id)
            ]);
            let filteredProjects = pData.filter(p => linkedProjectIds.has(p.id));
            const uniqueProjects: Project[] = [];
            const seenNames = new Set();
            filteredProjects.forEach(p => {
                if (!seenNames.has(p.name)) {
                    uniqueProjects.push(p);
                    seenNames.add(p.name);
                }
            });
            setProjects(uniqueProjects);
        }
        if (gData) {
            const accessibleGroups = (gData as any[]).filter(g => {
                if (canDelegate) return true;
                if (!user) return false;
                if (g.task_boards) {
                    const boardOwnerId = Array.isArray(g.task_boards)
                        ? g.task_boards[0]?.user_id
                        : g.task_boards?.user_id;
                    if (boardOwnerId && boardOwnerId !== user.id) return false;
                }
                const key = `GROUP_${g.id}`;
                if (profile?.permissions && profile.permissions[key] !== undefined) {
                    return profile.permissions[key];
                }
                return true;
            });
            setGroups(accessibleGroups);
            if (!taskToEdit && groupId && !accessibleGroups.some((g: any) => g.id === groupId)) {
                setGroupId('');
            }
            if (!groupId && !taskToEdit && accessibleGroups.length > 0) {
                const hasDefault = accessibleGroups.some((g: any) => g.id === defaultGroupId);
                if (!hasDefault) setGroupId(accessibleGroups[0].id);
            }
        }
    };

    const handleUpload = async (uploadFile: File) => {
        const fileExt = uploadFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
            .from('task-attachments')
            .upload(fileName, uploadFile);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
            .from('task-attachments')
            .getPublicUrl(fileName);
        return publicUrl;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!groupId) {
            alert('Por favor, selecione um estágio (grupo) para a tarefa.');
            return;
        }
        setLoading(true);
        try {
            let fileUrl = '';
            if (file) fileUrl = await handleUpload(file);
            let targetUserId = user?.id;
            if (!taskToEdit && groupId) {
                const selectedGroup = groups.find(g => g.id === groupId);
                if (selectedGroup) {
                    const boardOwnerId = Array.isArray(selectedGroup.task_boards)
                        ? selectedGroup.task_boards[0]?.user_id
                        : (selectedGroup.task_boards as any)?.user_id;
                    if (boardOwnerId) targetUserId = boardOwnerId;
                }
            }
            const effectiveAssignee = canDelegate
                ? (assignee || null)
                : (taskToEdit?.assignee || user?.id || null);
            const payload = {
                title, description, group_id: groupId, label_color: labelColor,
                category, project_id: projectId || null,
                file_url: fileUrl || (taskToEdit?.file_url || ''),
                user_id: taskToEdit ? taskToEdit.user_id : targetUserId,
                is_annual: isAnnual, expiration_date: expirationDate || null,
                assignee: effectiveAssignee,
                order_index: taskToEdit ? (taskToEdit.order_index || 0) : 0,
                status: taskToEdit ? (taskToEdit.status || 'PENDING') : 'PENDING'
            };
            
            let taskId = taskToEdit?.id;
            
            if (taskToEdit) {
                const { error } = await supabase.from('tasks').update(payload).eq('id', taskToEdit.id);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('tasks').insert(payload).select().single();
                if (error) throw error;
                if (data) taskId = data.id;
            }

            if (taskId) {
                const currentIds = checklistItems.filter(i => i.id).map(i => i.id);
                const deleteQuery = supabase.from('task_checklist_items').delete().eq('task_id', taskId);
                if (currentIds.length > 0) {
                    await deleteQuery.not('id', 'in', `(${currentIds.map(id => `'${id}'`).join(',')})`);
                } else {
                    await deleteQuery;
                }
                for (const item of checklistItems) {
                    if (item.id) {
                        await supabase.from('task_checklist_items').update({ content: item.content, is_completed: item.is_completed }).eq('id', item.id);
                    } else {
                        await supabase.from('task_checklist_items').insert({ task_id: taskId, content: item.content, is_completed: item.is_completed });
                    }
                }
            }
            onSuccess();
            onClose();
            setTitle(''); setDescription(''); setAssignee(''); setFile(null);
        } catch (error: any) {
            console.error('Error creating task:', error);
            alert('Erro ao criar tarefa: ' + (error.message || 'Erro desconhecido.'));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 text-primary">
                            <span className="material-symbols-outlined text-[24px]">{taskToEdit ? 'edit_square' : 'add_task'}</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white tracking-tight">{taskToEdit ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{taskToEdit ? 'Ajuste os detalhes abaixo' : 'Preencha os dados do novo card'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="size-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-6 custom-scrollbar-minimal">
                    <div className="space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Título da Tarefa</label>
                            <input required className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all font-medium text-sm" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Vistoria técnica no Bloco A" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Descrição Detalhada</label>
                            <textarea className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none h-28 resize-none transition-all text-sm font-medium" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva os detalhes e observações importantes..." />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Estágio (Coluna)</label>
                                <div className="relative group">
                                    <select className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10" value={groupId} onChange={e => setGroupId(e.target.value)} required>
                                        <option value="" disabled className="bg-surface-dark">Selecione o estágio...</option>
                                        {groups.map(g => {
                                            const boardName = Array.isArray(g.task_boards) ? g.task_boards[0]?.name : g.task_boards?.name;
                                            return (<option key={g.id} value={g.id} className="bg-surface-dark">{boardName ? `${boardName} > ${g.name}` : g.name}</option>);
                                        })}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">expand_more</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Sinalização Visual</label>
                                <div className="relative group">
                                    <select className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10" value={labelColor} onChange={e => setLabelColor(e.target.value)}>
                                        <option value="transparent" className="bg-surface-dark">Nenhuma</option>
                                        <option value="bg-red-500" className="bg-surface-dark">🔴 Crítico / Urgente</option>
                                        <option value="bg-yellow-500" className="bg-surface-dark">🟡 Atenção</option>
                                        <option value="bg-blue-500" className="bg-surface-dark">🔵 Informativo</option>
                                        <option value="bg-green-500" className="bg-surface-dark">🟢 Concluído / OK</option>
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">palette</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Categoria</label>
                                <div className="relative group">
                                    <select className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10" value={category} onChange={e => setCategory(e.target.value)}>
                                        <option value="Engenharia" className="bg-surface-dark">Engenharia</option>
                                        <option value="Vendas" className="bg-surface-dark">Vendas</option>
                                        <option value="Operacional" className="bg-surface-dark">Operacional</option>
                                        <option value="Administrativo" className="bg-surface-dark">Administrativo</option>
                                        <option value="Financeiro" className="bg-surface-dark">Financeiro</option>
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">category</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Vincular Projeto</label>
                                <div className="relative group">
                                    <select className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10" value={projectId} onChange={e => setProjectId(e.target.value)}>
                                        <option value="" className="bg-surface-dark">Nenhum Projeto</option>
                                        {projects.map(p => (<option key={p.id} value={p.id} className="bg-surface-dark">{p.name}</option>))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">folder_open</span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Responsável (Atribuir a)</label>
                            <div className="relative group">
                                <select disabled={!canDelegate} className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10 disabled:opacity-60 disabled:cursor-not-allowed" value={assignee} onChange={e => setAssignee(e.target.value)}>
                                    {canDelegate && <option value="" className="bg-surface-dark">Sem Responsável</option>}
                                    {users.map(u => (<option key={u.id} value={u.id} className="bg-surface-dark">{u.email} {u.professional_title ? `(${u.professional_title})` : ''}</option>))}
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">person</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Prazo de Entrega / Vencimento</label>
                        <div className="relative group">
                            <input type="date" className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 outline-none text-sm transition-all" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} />
                            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none">event</span>
                        </div>
                    </div>
                    <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20 shadow-xl shadow-black/20">
                        <label className="flex items-center gap-4 cursor-pointer group">
                            <div className={`size-7 rounded-lg flex items-center justify-center border-2 transition-all ${isAnnual ? 'bg-primary border-primary shadow-lg shadow-primary/20 scale-110' : 'bg-white/5 border-white/10 group-hover:border-white/20'}`}>
                                {isAnnual && <span className="material-symbols-outlined text-white text-[20px] font-bold">check</span>}
                            </div>
                            <input type="checkbox" className="hidden" checked={isAnnual} onChange={e => setIsAnnual(e.target.checked)} />
                            <div className="flex flex-col">
                                <span className="text-[13px] font-black text-white uppercase tracking-wider">Aditivo de Renovação Anual</span>
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Ativar controle recorrente para este contrato</p>
                            </div>
                        </label>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Checklist / Sub-tarefas</label>
                            <span className="text-[10px] font-bold text-slate-600 bg-white/5 px-2 py-0.5 rounded-lg">{checklistItems.filter(i => i.is_completed).length}/{checklistItems.length}</span>
                        </div>
                        <div className="space-y-2">
                            {checklistItems.map((item, index) => (
                                <div key={index} className="flex items-center gap-3 group">
                                    <button type="button" onClick={() => { const newItems = [...checklistItems]; newItems[index].is_completed = !newItems[index].is_completed; setChecklistItems(newItems); }} className={`size-5 rounded border flex items-center justify-center transition-all ${item.is_completed ? 'bg-green-500 border-green-500 text-white' : 'bg-transparent border-slate-600 hover:border-primary'}`}>
                                        {item.is_completed && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                    </button>
                                    <input value={item.content} onChange={(e) => { const newItems = [...checklistItems]; newItems[index].content = e.target.value; setChecklistItems(newItems); }} className={`flex-1 bg-transparent border-b border-transparent focus:border-primary/50 outline-none text-sm transition-all ${item.is_completed ? 'text-slate-500 line-through decoration-slate-600' : 'text-white'}`} placeholder="Item da checklist..." />
                                    <button type="button" onClick={() => setChecklistItems(checklistItems.filter((_, i) => i !== index))} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 transition-all">
                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                </div>
                            ))}
                            <div className="flex items-center gap-2 mt-2">
                                <span className="material-symbols-outlined text-slate-500 text-[18px]">add</span>
                                <input value={newChecklistItem} onChange={(e) => setNewChecklistItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newChecklistItem.trim()) { setChecklistItems([...checklistItems, { content: newChecklistItem, is_completed: false }]); setNewChecklistItem(''); } } }} className="flex-1 bg-transparent border-none outline-none text-sm text-slate-300 placeholder:text-slate-600" placeholder="Adicionar item (Pressione Enter)" />
                            </div>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] block">Documentação / Anexos</label>
                        <div className="relative group h-14">
                            <input type="file" className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer" onChange={e => setFile(e.target.files?.[0] || null)} />
                            <div className="absolute inset-0 bg-white/5 border border-dashed border-white/10 rounded-xl flex items-center px-5 gap-3 group-hover:bg-white/10 group-hover:border-primary/30 transition-all">
                                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">upload_file</span>
                                <span className="text-sm font-medium text-slate-400 truncate flex-1">{file ? file.name : 'Selecionar arquivo ou soltar aqui...'}</span>
                                {file && (
                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFile(null); }} className="size-6 flex items-center justify-center hover:bg-red-500/10 rounded-full text-red-500 transition-all relative z-20">
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="pt-4 flex gap-4">
                        <button type="button" onClick={onClose} className="flex-1 px-6 py-4 rounded-xl border border-white/5 text-slate-400 font-black text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 transition-all active:scale-95">Cancelar</button>
                        <button type="submit" disabled={loading} className="flex-[2] bg-primary hover:bg-primary-dark text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                            {loading && <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                            <span>{loading ? (taskToEdit ? 'Salvando...' : 'Criando...') : (taskToEdit ? 'Salvar Alterações' : 'Criar Tarefa')}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ============================================================
// MAIN TASKS VIEW COMPONENT
// ============================================================

const TasksView: React.FC<TasksViewProps> = ({ viewMode: initialViewMode = 'minhas_tarefas' }) => {
  const { user, profile } = useAuth();
  const [viewMode, setViewMode] = useState<'minhas_tarefas' | 'atribuidas' | 'monitoramento'>(initialViewMode);

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCompact, setIsCompact] = useState(false);
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null);
  const fetchDataRef = useRef<() => Promise<void>>(null as any);

  const [isAddBoardModalOpen, setIsAddBoardModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardUserId, setNewBoardUserId] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TaskGroup | null>(null);
  const [groupFormName, setGroupFormName] = useState('');
  const [groupFormColor, setGroupFormColor] = useState('bg-slate-500');

  const GROUP_COLORS = [
    'bg-slate-500', 'bg-blue-500', 'bg-sky-500', 'bg-emerald-500',
    'bg-green-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500',
    'bg-rose-500', 'bg-pink-500', 'bg-purple-500', 'bg-indigo-500'
  ];

  const isCentral = isTaskCentralUser(user?.email, profile);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuTaskId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Limpa tarefas e colunas ao trocar de aba e recarrega
  useEffect(() => {
    setTasks([]);
    setGroups([]);
    setLoading(true);
  }, [viewMode]);

  // FIX Bug 1 & 2: fetchData como useCallback com dependências corretas, sem depender do state `users`
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // 1. Fetch Board/User Info
    let currentUsers: any[] = [];
    if (isCentral) {
      const { data: uData } = await supabase
        .from('user_profiles')
        .select('id, email, professional_title, status');
      if (uData) {
        currentUsers = uData.filter((item: any) => !item.status || item.status === 'ACTIVE');
        setUsers(currentUsers);
      }
    }

    if (viewMode === 'monitoramento') {
      // MONITORAMENTO MODE: Fetch all pending tasks across visible boards
      // Use the existing SYNC_BOARD_ID logic but explicitly tied to viewMode
      
      const { data: visibleBoards } = await supabase
        .from('task_boards')
        .select('id')
        .or('is_visible.eq.true,is_visible.is.null');

      const visibleBoardIds = visibleBoards?.map(b => b.id) || [];
      const { data: visibleGroups } = await supabase
        .from('task_groups')
        .select('id')
        .in('board_id', visibleBoardIds);
      const visibleGroupIds = visibleGroups?.map(g => g.id) || [];

      if (visibleGroupIds.length === 0) {
        setTasks([]);
        setGroups([]);
        setLoading(false);
        return;
      }

      const [{ data: syncData }, { data: profilesData }, { data: checklistsData }] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, projects(name)')
          .eq('status', 'PENDING') // User requested: Trazer apenas pendentes no monitoramento
          .in('group_id', visibleGroupIds)
          .order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('id, email'),
        supabase.from('task_checklist_items').select('task_id, is_completed')
      ]);

      if (syncData) {
        const enrichedSyncData = syncData.map((t: any) => {
          const taskChecklist = checklistsData?.filter((c: any) => c.task_id === t.id) || [];
          const completedCount = taskChecklist.filter((c: any) => c.is_completed).length;
          const totalCount = taskChecklist.length;
          return {
            ...t,
            user_profiles: profilesData?.find(p => p.id === t.user_id) || { email: '?' },
            assignee_profile: t.assignee ? profilesData?.find(p => p.id === t.assignee) : null,
            checklist_progress: totalCount > 0 ? `${completedCount}/${totalCount}` : null,
            checklist_percentage: totalCount > 0 ? (completedCount / totalCount) * 100 : 0
          };
        });
        setTasks(enrichedSyncData);

        // Group by Assignee
        const uniqueAssignees = Array.from(
          new Set(enrichedSyncData.map((t: any) => t.assignee || 'UNASSIGNED'))
        );

        const colorPalette = [
          'bg-emerald-500', 'bg-purple-500', 'bg-amber-500',
          'bg-sky-500', 'bg-rose-500', 'bg-indigo-500', 'bg-orange-500'
        ];

        const userGroups = uniqueAssignees.map((assigneeId: any, idx) => {
          if (assigneeId === 'UNASSIGNED') {
            return {
              id: 'sync-unassigned',
              name: 'Sem Responsável',
              color: 'bg-slate-500',
              order_index: 999, // Fica no final
              board_id: SYNC_BOARD_ID
            };
          }
          const profile = profilesData?.find(p => p.id === assigneeId);
          return {
            id: `sync-user-${assigneeId}`,
            name: `Monitoramento - ${profile?.email?.split('@')[0] || 'Usuário'}`,
            color: colorPalette[idx % colorPalette.length],
            order_index: idx,
            board_id: SYNC_BOARD_ID
          };
        }).sort((a, b) => a.order_index - b.order_index);

        setGroups(userGroups);
      }
    } else if (viewMode === 'atribuidas') {
      // TAREFAS ATRIBUIDAS MODE: Fetch tasks assigned to the logged-in user
      const [{ data: tasksData }, { data: profilesData }, { data: checklistsData }] = await Promise.all([
        supabase
          .from('tasks')
          .select('*, projects(name), task_groups(id, name, color, order_index, board_id, task_boards(id, name, user_id))')
          .eq('assignee', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('user_profiles').select('id, email'),
        supabase.from('task_checklist_items').select('task_id, is_completed')
      ]);

      if (tasksData) {
        const enrichedTasks = tasksData.map((t: any) => {
          const taskChecklist = checklistsData?.filter((c: any) => c.task_id === t.id) || [];
          const completedCount = taskChecklist.filter((c: any) => c.is_completed).length;
          const totalCount = taskChecklist.length;
          return {
            ...t,
            user_profiles: profilesData?.find(p => p.id === t.user_id) || { email: '?' },
            assignee_profile: t.assignee ? profilesData?.find(p => p.id === t.assignee) : null,
            checklist_progress: totalCount > 0 ? `${completedCount}/${totalCount}` : null,
            checklist_percentage: totalCount > 0 ? (completedCount / totalCount) * 100 : 0
          };
        });
        setTasks(enrichedTasks);

        // Extract unique groups from the assigned tasks
        const uniqueGroupsMap: Record<string, any> = {};
        enrichedTasks.forEach((t: any) => {
          if (t.task_groups) {
            uniqueGroupsMap[t.task_groups.id] = t.task_groups;
          }
        });
        const assignedGroups = Object.values(uniqueGroupsMap).sort((a: any, b: any) => a.order_index - b.order_index);
        setGroups(assignedGroups as any);
      }
    } else {
      // MINHAS TAREFAS MODE: Fetch visible boards for logged user
      const { data: boardsData } = await supabase
        .from('task_boards')
        .select('*')
        .eq('user_id', user.id)
        .or('is_visible.eq.true,is_visible.is.null')
        .order('name');

      if (boardsData) {
        setBoards(boardsData);
        let activeBoardId = selectedBoardId;
        const activeBoardExists = boardsData.some(b => b.id === activeBoardId);
        
        if (!activeBoardExists && boardsData.length > 0) {
          activeBoardId = boardsData[0].id;
          setSelectedBoardId(activeBoardId);
        } else if (boardsData.length === 0) {
          setSelectedBoardId('');
          setTasks([]);
          setGroups([]);
        }

        if (activeBoardId) {
          const { data: groupsData } = await supabase
            .from('task_groups')
            .select('*')
            .eq('board_id', activeBoardId)
            .order('order_index', { ascending: true });

          if (groupsData) {
            setGroups(groupsData);
            const groupIds = groupsData.map(g => g.id);

            const [{ data: tasksData }, { data: profilesData }, { data: checklistsData }] = await Promise.all([
              supabase.from('tasks').select('*, projects(name)').in('group_id', groupIds).order('order_index', { ascending: true }),
              supabase.from('user_profiles').select('id, email'),
              supabase.from('task_checklist_items').select('task_id, is_completed')
            ]);

            if (tasksData) {
              const enrichedTasks = tasksData.map((t: any) => {
                const taskChecklist = checklistsData?.filter((c: any) => c.task_id === t.id) || [];
                const completedCount = taskChecklist.filter((c: any) => c.is_completed).length;
                const totalCount = taskChecklist.length;
                return {
                  ...t,
                  user_profiles: profilesData?.find(p => p.id === t.user_id) || { email: '?' },
                  assignee_profile: t.assignee ? profilesData?.find(p => p.id === t.assignee) : null,
                  checklist_progress: totalCount > 0 ? `${completedCount}/${totalCount}` : null,
                  checklist_percentage: totalCount > 0 ? (completedCount / totalCount) * 100 : 0
                };
              });
              setTasks(enrichedTasks as any);
            }
          }
        }
      }
    }

    setLoading(false);
  }, [user?.id, selectedBoardId, isCentral, profile, viewMode]);

  // FIX Bug 6: Separar o real-time subscription do effect de dados
  // Effect 1: Real-time — monta uma única vez, nunca recria o canal
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchDataRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_groups' }, () => {
        fetchDataRef.current?.();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_boards' }, () => {
        fetchDataRef.current?.();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // ← apenas user.id, não selectedBoardId

  // Effect 2: Dados — roda quando board muda ou fetchData muda
  useEffect(() => {
    if (!user) return;

    // Atualiza a ref sempre que fetchData for recriado
    fetchDataRef.current = fetchData;

    const init = async () => {
      // await syncExpiredRenewals(supabase, user.id); // Disabled as per RBAC plan (Step 1.3)
      await fetchData();
    };

    init();
  }, [user?.id, selectedBoardId, fetchData]);

  const handleConvertToProject = async (task: Task) => {
    if (!confirm(`Deseja converter a tarefa "${task.title}" em um novo Projeto?`)) return;
    try {
      // Find client name from linked project or use default
      let clientName = 'Indefinido (Via Tarefa)';
      if (task.project_id) {
        const { data: p } = await supabase.from('projects').select('client').eq('id', task.project_id).single();
        if (p?.client) clientName = p.client;
      }

      const { error } = await supabase.from('projects').insert({
        name: task.title,
        status: 'ANALYSIS',
        client: clientName,
        type: 'business',
        value: 0,
        deadline: new Date().toISOString().split('T')[0],
        internal_observations: `Convertido da tarefa: ${task.description || ''}`,
        created_at: new Date().toISOString(),
        user_id: user?.id
      });
      if (error) throw error;

      // Mark as completed
      await supabase.from('tasks').update({ status: 'DONE', completed: true }).eq('id', task.id);
      
      alert('Projeto criado com sucesso! Status: Em Análise.');
      fetchData();
    } catch (error: any) {
      console.error('Error converting to project:', error);
      alert('Erro ao converter: ' + error.message);
    }
  };

  const handleUpdateTaskGroup = async (taskId: string, groupId: string) => {
    setTasks((prev: Task[]) => prev.map((t: Task) => t.id === taskId ? { ...t, group_id: groupId } : t));
    await supabase.from('tasks').update({ group_id: groupId }).eq('id', taskId);
  };

  const handleUpdateTaskColor = async (taskId: string, color: string) => {
    setTasks((prev: Task[]) => prev.map((t: Task) => t.id === taskId ? { ...t, label_color: color } : t));
    await supabase.from('tasks').update({ label_color: color }).eq('id', taskId);
  };

  const handleToggleComplete = async (task: Task) => {
    const isCurrentlyDone = task.status === 'DONE' || task.completed === true;
    const isNowCompleted = !isCurrentlyDone;
    const newStatus = isNowCompleted ? 'DONE' : 'PENDING';

    setTasks((prev: Task[]) => prev.map((t: Task) =>
      t.id === task.id ? { ...t, completed: isNowCompleted, status: newStatus } : t
    ));

    const { error } = await supabase
      .from('tasks')
      .update({ completed: isNowCompleted, status: newStatus })
      .eq('id', task.id);

    if (error) {
      console.error('Error toggling completion:', error);
      setTasks((prev: Task[]) => prev.map((t: Task) =>
        t.id === task.id ? { ...t, completed: !isNowCompleted, status: isCurrentlyDone ? 'DONE' : task.status } : t
      ));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    setTasks((prev: Task[]) => prev.filter((t: Task) => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Deseja excluir este grupo e todas as suas tarefas?')) return;
    setGroups((prev: TaskGroup[]) => prev.filter((g: TaskGroup) => g.id !== groupId));
    await supabase.from('tasks').delete().eq('group_id', groupId);
    await supabase.from('task_groups').delete().eq('id', groupId);
  };

  const handleEditGroupClick = (group: TaskGroup) => {
    setEditingGroup(group);
    setGroupFormName(group.name);
    setGroupFormColor(group.color || 'bg-slate-500');
    setIsGroupModalOpen(true);
  };

  const handleRenameBoard = async () => {
    if (!selectedBoardId || selectedBoardId === SYNC_BOARD_ID) return;
    const board = boards.find((b: TaskBoard) => b.id === selectedBoardId);
    const newName = prompt('Novo nome do quadro:', board?.name);
    if (!newName || newName === board?.name) return;
    setBoards((prev: TaskBoard[]) => prev.map((b: TaskBoard) => b.id === selectedBoardId ? { ...b, name: newName } : b));
    await supabase.from('task_boards').update({ name: newName }).eq('id', selectedBoardId);
  };

  const handleDeleteBoard = async () => {
    if (!selectedBoardId || selectedBoardId === SYNC_BOARD_ID) return;
    if (!confirm('Deseja excluir este QUADRO INTEIRO? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    await supabase.from('tasks').delete().in('group_id', groups.map((g: TaskGroup) => g.id));
    await supabase.from('task_groups').delete().eq('board_id', selectedBoardId);
    await supabase.from('task_boards').delete().eq('id', selectedBoardId);
    setBoards((prev: TaskBoard[]) => prev.filter((b: TaskBoard) => b.id !== selectedBoardId));
    setSelectedBoardId('');
    setLoading(false);
  };

  const handleReorderTask = async (taskId: string, targetGroupId: string, targetIndex: number) => {
    const taskToMove = tasks.find((t: Task) => t.id === taskId);
    if (!taskToMove) return;
    const otherTasks = tasks.filter((t: Task) => t.id !== taskId);
    const groupTasks = otherTasks.filter((t: Task) => t.group_id === targetGroupId);
    groupTasks.splice(targetIndex, 0, { ...taskToMove, group_id: targetGroupId });
    const updatedGroupTasks = groupTasks.map((t: Task, idx: number) => ({ ...t, order_index: idx }));
    const finalTasks = [
      ...otherTasks.filter((t: Task) => t.group_id !== targetGroupId),
      ...updatedGroupTasks
    ];
    setTasks(finalTasks as any);
    const { error } = await supabase.from('tasks').update({ group_id: targetGroupId, order_index: targetIndex }).eq('id', taskId);
    if (error) { console.error('Swap error:', error); return; }
    const updates = updatedGroupTasks.map((t, idx) =>
      supabase.from('tasks').update({ order_index: idx }).eq('id', t.id)
    );
    await Promise.all(updates);
  };

  const handleAddGroupClick = () => {
    if (!selectedBoardId || selectedBoardId === SYNC_BOARD_ID) return;
    setEditingGroup(null);
    setGroupFormName('');
    setGroupFormColor('bg-slate-500');
    setIsGroupModalOpen(true);
  };

  const handleSaveGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupFormName.trim()) return;
    setLoading(true);

    try {
      if (editingGroup) {
        setGroups((prev) => prev.map(g => g.id === editingGroup.id ? { ...g, name: groupFormName, color: groupFormColor } : g));
        await supabase.from('task_groups').update({ name: groupFormName, color: groupFormColor }).eq('id', editingGroup.id);
      } else {
        const { data, error } = await supabase.from('task_groups').insert({
          name: groupFormName,
          color: groupFormColor,
          order_index: groups.length,
          board_id: selectedBoardId,
          user_id: user?.id
        }).select().single();
        if (error) throw error;
        if (data) setGroups([...groups, data]);
      }
      setIsGroupModalOpen(false);
    } catch (error: any) {
      console.error('Error saving group:', error);
      alert('Erro ao salvar coluna: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // FIX Bug 7: Busca usuários frescos ao abrir o modal de criar quadro
  const handleAddBoardClick = async () => {
    setIsAddBoardModalOpen(true);
    setNewBoardName('');
    setNewBoardUserId('');
    if (isCentral) {
      const { data } = await supabase
        .from('user_profiles')
        .select('id, email, professional_title, status');
      if (data) setUsers(data.filter((item: any) => !item.status || item.status === 'ACTIVE'));
    }
  };

  const handleCreateBoardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName) return;

    // Check if the selected value is a UUID or an email (pre-registered user with no auth ID)
    const isUUID = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const selectedIsUUID = newBoardUserId ? isUUID(newBoardUserId) : false;

    try {
      const targetUserId = selectedIsUUID ? newBoardUserId : (newBoardUserId ? null : user?.id);
      const targetUserEmail = selectedIsUUID 
        ? users.find(u => u.id === newBoardUserId)?.email || null 
        : (newBoardUserId ? newBoardUserId : user?.email);

      const { data: boardData, error: boardError } = await supabase.rpc('create_task_board_with_default_group', {
        p_name: newBoardName,
        p_user_id: targetUserId,
        p_user_email: targetUserEmail
      });

      if (boardError) throw boardError;
      if (boardData) {
        setBoards([...boards, boardData]);
        setSelectedBoardId(boardData.id);
        setIsAddBoardModalOpen(false);
      }
    } catch (error: any) {
      console.error('Error adding board:', error);
      alert('Erro ao criar quadro: ' + error.message);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t: Task) =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.projects?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [tasks, searchTerm]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="relative z-10 px-4 md:px-8 py-4 md:py-6 flex flex-col gap-6 border-b border-white/5 bg-background-dark/40 backdrop-blur-md">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  {viewMode === 'monitoramento' ? 'groups' : viewMode === 'atribuidas' ? 'assignment_ind' : 'task_alt'}
                </span>
              </div>
              {viewMode === 'monitoramento' ? 'Monitoramento da Equipe' : viewMode === 'atribuidas' ? 'Tarefas Atribuídas a Mim' : 'Minhas Tarefas'}
            </h2>

            {/* Controle de Abas */}
            <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5 w-fit mt-2">
              <button
                onClick={() => setViewMode('minhas_tarefas')}
                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'minhas_tarefas' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                Minhas Tarefas
              </button>
              <button
                onClick={() => setViewMode('atribuidas')}
                className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'atribuidas' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                Atribuídas a Mim
              </button>
              {isCentral && (
                <button
                  onClick={() => setViewMode('monitoramento')}
                  className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${viewMode === 'monitoramento' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                  Monitoramento
                </button>
              )}
            </div>

            {viewMode === 'minhas_tarefas' ? (
              boards.length > 1 ? (
                <div className="flex items-center gap-3 mt-1">
                  <div className="relative group">
                    <select
                      className="appearance-none bg-white/5 hover:bg-white/10 text-primary text-[10px] font-black border border-white/5 rounded-full px-4 py-1.5 outline-none cursor-pointer transition-all uppercase tracking-widest pl-4 pr-8 max-w-[300px] truncate"
                      value={selectedBoardId}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedBoardId(e.target.value)}
                    >
                      {boards.map((b: TaskBoard) => (
                        <option key={b.id} value={b.id} className="bg-surface-dark text-white uppercase text-[10px] font-black">{b.name}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[14px] text-primary/60 pointer-events-none group-hover:text-primary transition-colors">expand_more</span>
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em] hidden sm:inline">
                    Controle de seus fluxos e processos
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 mt-1">
                  <div className="bg-white/5 text-primary text-[10px] font-black border border-white/5 rounded-full px-4 py-1.5 uppercase tracking-widest max-w-[300px] truncate">
                    {boards.find((b: TaskBoard) => b.id === selectedBoardId)?.name || 'MEU QUADRO'}
                  </div>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em] hidden sm:inline">
                    Controle de seus fluxos e processos
                  </p>
                </div>
              )
            ) : viewMode === 'atribuidas' ? (
              <div className="flex items-center gap-3 mt-1">
                <div className="bg-primary/10 text-primary text-[10px] font-black border border-primary/20 rounded-full px-4 py-1.5 uppercase tracking-widest">
                  Tarefas Sob Minha Responsabilidade
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em] hidden sm:inline">
                  Acompanhando o que foi atribuído a você
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 mt-1">
                <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-black border border-emerald-500/20 rounded-full px-4 py-1.5 uppercase tracking-widest">
                  Visão Geral da Equipe (Apenas Pendentes)
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em] hidden sm:inline">
                  Acompanhando produtividade e gargalos
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
              <button
                onClick={() => setIsCompact(!isCompact)}
                className={`flex items-center justify-center gap-2 rounded-lg h-9 px-4 transition-all text-[10px] font-black uppercase tracking-widest ${isCompact ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <span className="material-symbols-outlined text-[18px]">{isCompact ? 'view_kanban' : 'view_headline'}</span>
                <span>{isCompact ? 'Ver Padrão' : 'Ver Compacto'}</span>
              </button>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full sm:w-auto">
              <div className="relative group w-full sm:w-auto flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 group-focus-within:text-primary transition-colors">search</span>
                <input
                  className="bg-white/5 border border-white/5 text-white text-[11px] font-medium rounded-xl block w-full sm:w-56 pl-10 pr-4 py-2.5 outline-none focus:border-primary/50 focus:bg-white/10 transition-all shadow-inner"
                  placeholder="Buscar tarefa..."
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                />
              </div>
              {viewMode === 'minhas_tarefas' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-xl h-10 px-6 bg-primary hover:bg-red-600 text-white text-[11px] font-black uppercase tracking-[0.15em] transition-all shadow-xl shadow-primary/20 active:scale-95 w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  <span>Nova Tarefa</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4 md:p-6 z-10">
        {isCentral && (
          <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3 text-sm text-blue-300">
            <span className="material-symbols-outlined text-blue-400 shrink-0">info</span>
            <div className="flex flex-col gap-2">
              <p className="font-bold text-blue-400 mb-1">Guia de Gestão de Tarefas (Admin Central)</p>
              <ul className="list-disc pl-5 space-y-1 text-xs opacity-90">
                <li><strong className="text-blue-300">Aba de Tarefas Pessoais:</strong> Cada usuário visualiza apenas seus próprios quadros.</li>
                <li><strong className="text-blue-300">Monitoramento da Equipe:</strong> Gestores podem alternar entre a visão de qualquer usuário.</li>
                <li><strong className="text-blue-300">Gerenciamento de Quadros:</strong> Localizado no menu lateral, permite criar, excluir, alternar visibilidade e renomear quadros.</li>
                <li><strong className="text-blue-300">Automação de Renovações:</strong> Renovações expiradas se convertem automaticamente em tarefas, sem duplicidade.</li>
              </ul>
            </div>
          </div>
        )}

        {viewMode === 'minhas_tarefas' && !selectedBoardId && boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-red-500 text-[32px]">warning_amber</span>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-1">Nenhum quadro encontrado</h3>
              <p className="text-slate-400 max-w-xs mx-auto">Entre em contato com a administração para criar ou habilitar um quadro de tarefas para você.</p>
            </div>
          </div>
        ) : viewMode === 'atribuidas' && groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
            <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-primary text-[32px]">assignment_turned_in</span>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-1">Nenhuma tarefa atribuída</h3>
              <p className="text-slate-400 max-w-xs mx-auto">Você não possui nenhuma tarefa atribuída no momento.</p>
            </div>
          </div>
        ) : viewMode === 'monitoramento' && groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
            <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-primary text-[32px]">groups</span>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-1">Nenhuma tarefa pendente</h3>
              <p className="text-slate-400 max-w-xs mx-auto">Não há tarefas pendentes para monitorar neste momento.</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full gap-6 min-w-max pb-3 px-4">
            {groups.map(group => {
              const groupTasks = filteredTasks.filter(t => {
                if (viewMode === 'monitoramento') {
                  const targetAssigneeId = t.assignee ? `sync-user-${t.assignee}` : 'sync-unassigned';
                  return targetAssigneeId === group.id;
                }
                return t.group_id === group.id;
              });

              const getGroupIcon = (name: string) => {
                const lower = name.toLowerCase();
                if (lower.includes('penden') || lower.includes('fazer')) return 'inventory_2';
                if (lower.includes('exec') || lower.includes('andamento')) return 'cyclone';
                if (lower.includes('concl') || lower.includes('feito') || lower.includes('final')) return 'verified';
                if (lower.includes('paus') || lower.includes('bloq')) return 'block';
                return 'label';
              };

              return (
                <div key={group.id} className={`flex flex-col ${isCompact ? 'w-[260px]' : 'w-[320px]'} shrink-0 h-full rounded-2xl bg-white/[0.02] border border-white/5 overflow-hidden transition-all hover:bg-white/[0.04]`}>
                  <div className="p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg ${group.color || 'bg-slate-500'} flex items-center justify-center shadow-lg shadow-black/20`}>
                        <span className="material-symbols-outlined text-white text-[16px]">{getGroupIcon(group.name)}</span>
                      </div>
                      <div>
                        <h3
                          className="font-black text-white text-[11px] uppercase tracking-[0.1em] cursor-pointer hover:text-primary transition-colors"
                          onDoubleClick={() => {
                            if (viewMode === 'minhas_tarefas') handleEditGroupClick(group);
                          }}
                          title={viewMode === 'minhas_tarefas' ? "Clique duas vezes para editar" : undefined}
                        >
                          {group.name}
                        </h3>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">
                          {groupTasks.length} {groupTasks.length === 1 ? 'Tarefa' : 'Tarefas'}
                          {viewMode === 'atribuidas' && (group as any).task_boards?.name ? ` • ${(group as any).task_boards.name}` : ''}
                        </p>
                      </div>
                    </div>
                    {viewMode === 'minhas_tarefas' && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => handleEditGroupClick(group)} className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onClick={() => handleDeleteGroup(group.id)} className="size-8 flex items-center justify-center hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500 transition-all">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <div
                    className={`${isCompact ? 'p-2 space-y-2' : 'p-3 space-y-3'} flex-1 overflow-y-auto bg-black/20 scrollbar-hide min-h-[200px]`}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (viewMode === 'monitoramento') return;
                      const draggedTaskId = (window as any)._draggedTaskId;
                      if (draggedTaskId) handleReorderTask(draggedTaskId, group.id, groupTasks.length);
                      (window as any)._draggedTaskId = null;
                    }}
                  >
                    {loading ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-40">
                        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest">Carregando...</span>
                      </div>
                    ) : groupTasks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-20 border-2 border-dashed border-white/5 rounded-2xl m-2">
                        <span className="material-symbols-outlined text-[40px]">inbox</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-center px-4">Esta coluna está vazia</span>
                      </div>
                    ) : (
                      groupTasks.map((task, index) => {
                        const isExpired = task.expiration_date && new Date(task.expiration_date) < new Date();
                        const initials = (task as any).user_profiles?.email?.charAt(0).toUpperCase() || '?';
                        const isCompleted = task.status === 'DONE' || task.completed;

                        return (
                          <div
                            key={task.id}
                            draggable={viewMode === 'minhas_tarefas'}
                            onDragStart={() => (window as any)._draggedTaskId = task.id}
                            onDragOver={e => e.preventDefault()}
                            onDrop={(e) => {
                              e.stopPropagation();
                              if (viewMode === 'monitoramento') return;
                              const draggedTaskId = (window as any)._draggedTaskId;
                              if (draggedTaskId && draggedTaskId !== task.id) {
                                handleReorderTask(draggedTaskId, group.id, index);
                              }
                              (window as any)._draggedTaskId = null;
                            }}
                            onClick={() => {
                              if (viewMode === 'monitoramento') return;
                              setEditingTask(task);
                              setIsModalOpen(true);
                            }}
                            className={`bg-white/[0.03] rounded-xl border border-white/5 group shadow-lg transition-all relative ${viewMode === 'monitoramento' ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'} hover:border-primary/30 hover:bg-white/[0.05] hover:-translate-y-0.5 hover:z-10 ${isCompact ? 'p-3' : 'p-4'} ${isExpired ? 'border-red-500/30' : ''} ${isCompleted ? 'opacity-40 grayscale-[0.8] blur-[0.2px]' : ''}`}
                          >
                            {viewMode !== 'monitoramento' && <button
                              onClick={(e) => { e.stopPropagation(); handleToggleComplete(task); }}
                              className={`absolute -left-2 -top-2 size-6 rounded-lg border flex items-center justify-center transition-all z-20 shadow-xl ${isCompleted ? 'bg-green-500 border-green-400 text-white shadow-green-500/20' : 'bg-surface-dark border-white/10 text-transparent hover:border-green-500/50 hover:text-green-500 group-hover:scale-110'}`}
                              title={isCompleted ? "Reabrir tarefa" : "Concluir tarefa"}
                            >
                              <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                            </button>}

                            {task.label_color && task.label_color !== 'transparent' && (
                              <div className={`absolute top-0 right-0 w-1.5 h-full ${task.label_color} rounded-tr-xl rounded-br-xl`}></div>
                            )}

                            {isExpired && (
                              <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500 animate-pulse rounded-t-xl"></div>
                            )}

                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                {!isCompact && (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/10 truncate max-w-[140px]">
                                    {task.projects?.name || 'Projeto Avulso'}
                                  </span>
                                )}
                                {task.is_annual && (
                                  <div className="size-4 rounded-full bg-yellow-500/20 flex items-center justify-center" title="Renovação Anual">
                                    <span className="material-symbols-outlined text-yellow-500 text-[10px]">refresh</span>
                                  </div>
                                )}
                              </div>
                              {viewMode !== 'monitoramento' && <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all -mr-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setEditingTask(task); setIsModalOpen(true); }}
                                  className="size-7 flex items-center justify-center hover:bg-primary/10 rounded-lg text-slate-500 hover:text-primary transition-all bg-white/5 border border-white/10 shadow-sm"
                                  title="Editar"
                                >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>
                              </div>}
                            </div>

                            <h4 className={`text-white font-bold leading-relaxed tracking-tight ${isCompact ? 'text-[12px]' : 'text-[13px] mb-2'}`}>{task.title}</h4>

                            {!isCompact && task.description && (
                              <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed opacity-60 font-medium">{task.description}</p>
                            )}

                            {!isCompact && task.expiration_date && (
                              <div className={`flex items-center gap-1.5 mb-2 px-2 py-1 rounded-lg w-fit text-[10px] font-bold ${
                                isExpired
                                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  : (new Date(task.expiration_date).getTime() - new Date().getTime() < 7 * 24 * 60 * 60 * 1000)
                                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                    : 'bg-white/5 text-slate-400 border border-white/5'
                              }`}>
                                <span className="material-symbols-outlined text-[12px]">{isExpired ? 'warning' : 'schedule'}</span>
                                <span>{isExpired ? 'Atrasado' : 'Prazo'}:</span>
                                <span>{new Date(task.expiration_date).toLocaleDateString('pt-BR')}</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-3 border-t border-white/5">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1.5" title={`Dono: ${(task as any).user_profiles?.email}`}>
                                  <div className="size-6 rounded-lg bg-surface-dark border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-400 shadow-inner">
                                    {initials}
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-500 truncate max-w-[80px]">
                                    {(task as any).user_profiles?.email?.split('@')[0]}
                                  </span>
                                </div>

                                {(task as any).assignee_profile && (
                                  <div className="flex items-center gap-1.5 ml-2 border-l border-white/10 pl-2">
                                    <span className="text-[8px] font-bold text-slate-500 uppercase">Resp:</span>
                                    <div className="size-6 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-[10px] font-black text-primary shadow-inner" title={`Atribuído a: ${(task as any).assignee_profile.email}`}>
                                      {(task as any).assignee_profile.email?.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="text-[9px] font-bold text-primary truncate max-w-[80px]">
                                      {(task as any).assignee_profile.email?.split('@')[0]}
                                    </span>
                                  </div>
                                )}
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#c7949f] opacity-40">
                                  {task.category}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {(task as any).checklist_progress && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 text-[9px] font-bold text-slate-400" title="Checklist">
                                    <span className="material-symbols-outlined text-[12px]">check_box</span>
                                    <span>{(task as any).checklist_progress}</span>
                                  </div>
                                )}

                                {task.file_url && (
                                  <a href={task.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="size-6 flex items-center justify-center bg-primary/10 border border-primary/20 rounded-lg text-primary hover:bg-primary/20 transition-all">
                                    <span className="material-symbols-outlined text-[14px]">attachment</span>
                                  </a>
                                )}

                                {viewMode !== 'monitoramento' && <div className="flex gap-1.5">
                                  {['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'].map(c => (
                                    <button
                                      key={c}
                                      onClick={(e) => { e.stopPropagation(); handleUpdateTaskColor(task.id, c); }}
                                      className={`w-3.5 h-3.5 rounded-full ${c} ${task.label_color === c ? 'ring-2 ring-white scale-110 shadow-lg shadow-black/40' : 'opacity-50 hover:opacity-100 transition-all hover:scale-125'}`}
                                      title={`Trocar cor para ${c.replace('bg-', '').replace('-500', '')}`}
                                    />
                                  ))}
                                </div>}

                                {viewMode !== 'monitoramento' && <div className="relative ml-1">
                                  <button
                                    onClick={(e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id);
                                    }}
                                    className={`size-6 flex items-center justify-center rounded-lg transition-all ${openMenuTaskId === task.id ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-slate-500 hover:text-white'}`}
                                  >
                                    <span className="material-symbols-outlined text-[16px]">more_vert</span>
                                  </button>
                                  <div className={`absolute right-0 top-full mt-2 w-40 bg-surface-dark border border-white/10 rounded-xl shadow-2xl p-1 transition-all z-50 flex flex-col gap-1 ${openMenuTaskId === task.id ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'}`}>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingTask(task); setIsModalOpen(true); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 rounded-lg text-[10px] font-bold text-slate-300 hover:text-white text-left uppercase tracking-wider"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                                      Ver Detalhes
                                    </button>

                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleConvertToProject(task); }}
                                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 rounded-lg text-[10px] font-bold text-slate-300 hover:text-emerald-400 text-left uppercase tracking-wider"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">engineering</span>
                                      Virar Projeto
                                    </button>

                                    <div className="h-px bg-white/5 my-0.5"></div>
                                    <span className="text-[9px] font-black text-slate-600 px-3 py-1 uppercase tracking-widest">Mover para:</span>
                                    {viewMode === 'minhas_tarefas' ? (
                                      groups.filter(g => g.id !== group.id).map(g => (
                                        <button
                                          key={g.id}
                                          onClick={(e) => { e.stopPropagation(); handleUpdateTaskGroup(task.id, g.id); }}
                                          className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-white/5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white text-left truncate"
                                        >
                                          <span className="size-2 rounded-full bg-slate-500"></span>
                                          {g.name}
                                        </button>
                                      ))
                                    ) : (
                                      <span className="text-[9px] px-3 py-2 text-slate-500 text-center italic">Movimentação indisponível nesta aba</span>
                                    )}

                                    {viewMode === 'minhas_tarefas' && <>
                                      <div className="h-px bg-white/5 my-0.5"></div>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(task.id); setOpenMenuTaskId(null); }}
                                        className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-500/10 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 text-left uppercase tracking-wider"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">delete</span>
                                        Excluir Tarefa
                                      </button>
                                    </>}
                                  </div>
                                </div>}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {viewMode === 'minhas_tarefas' && (
                      <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full py-4 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-primary hover:bg-primary/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border-2 border-dashed border-white/5 hover:border-primary/20 transition-all group/btn"
                      >
                        <div className="size-8 rounded-full bg-white/5 flex items-center justify-center group-hover/btn:bg-primary/20 transition-all">
                          <span className="material-symbols-outlined text-[20px]">add</span>
                        </div>
                        Nova Tarefa
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {viewMode === 'minhas_tarefas' && selectedBoardId && (
              <div className={`${isCompact ? 'w-[260px]' : 'w-[320px]'} shrink-0 h-full flex flex-col items-center justify-center px-8 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01] transition-all hover:bg-white/[0.03] hover:border-primary/20 group`}>
                <button
                  onClick={handleAddGroupClick}
                  className="flex flex-col items-center gap-5 text-slate-600 group-hover:text-primary transition-all active:scale-95 text-center"
                >
                  <div className="size-16 rounded-full bg-white/5 flex items-center justify-center border-2 border-white/5 shadow-xl group-hover:border-primary/30 group-hover:bg-primary/10 transition-all">
                    <span className="material-symbols-outlined text-[40px] group-hover:scale-110 transition-transform">add_box</span>
                  </div>
                  <div>
                    <h4 className="text-[12px] font-black uppercase tracking-[0.2em] mb-2 group-hover:text-white transition-colors">Nova Coluna</h4>
                    <p className="text-[10px] font-medium text-slate-600 group-hover:text-slate-500 max-w-[160px] leading-relaxed">
                      Adicione um novo estágio para o seu fluxo de trabalho
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Board Modal */}
      {isAddBoardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-dark border border-white/10 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Criar Novo Quadro</h3>
              <button onClick={() => setIsAddBoardModalOpen(false)} className="text-slate-400 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateBoardSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Nome do Quadro</label>
                <input
                  required
                  type="text"
                  className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                  placeholder="Ex: Tarefas João"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                />
              </div>
              {isCentral && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Atribuir a (Opcional)</label>
                  <select
                    className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                    value={newBoardUserId}
                    onChange={(e) => setNewBoardUserId(e.target.value)}
                  >
                    <option value="">Selecione um usuário...</option>
                    {users.map(u => (
                      <option key={u.id || u.email} value={u.id && u.id.length > 5 ? u.id : u.email}>
                        {u.email}{u.professional_title ? ` (${u.professional_title})` : ''}{!u.id ? ' — aguardando 1º acesso' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Se não selecionado, o quadro será seu. Usuários "aguardando 1º acesso" ainda não fizeram login; o quadro será vinculado automaticamente quando eles entrarem.</p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAddBoardModalOpen(false)} className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg font-bold">
                  Cancelar
                </button>
                <button type="submit" disabled={!newBoardName} className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-bold disabled:opacity-50">
                  Criar Quadro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit/Add Group Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-dark border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-xl flex items-center justify-center border border-white/10 ${groupFormColor}`}>
                  <span className="material-symbols-outlined text-white text-[20px]">{editingGroup ? 'edit' : 'add_box'}</span>
                </div>
                <div>
                  <h3 className="text-xl font-black text-white tracking-tight">{editingGroup ? 'Editar Coluna' : 'Nova Coluna'}</h3>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{editingGroup ? 'Ajuste o nome e a cor' : 'Adicione um novo estágio'}</p>
                </div>
              </div>
              <button onClick={() => setIsGroupModalOpen(false)} className="size-8 flex items-center justify-center hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveGroupSubmit} className="p-6 space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Nome da Coluna</label>
                <input
                  required
                  type="text"
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all font-medium text-sm"
                  placeholder="Ex: Em Andamento"
                  value={groupFormName}
                  onChange={(e) => setGroupFormName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Cor de Destaque</label>
                <div className="flex flex-wrap gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                  {GROUP_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setGroupFormColor(color)}
                      className={`size-8 rounded-full ${color} transition-all shadow-lg ${groupFormColor === color ? 'ring-2 ring-white scale-110 shadow-black/40' : 'opacity-40 hover:opacity-100 hover:scale-110'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !groupFormName.trim()} className="flex-[2] px-6 py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? 'Salvando...' : 'Salvar Coluna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NewTaskModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingTask(null); }}
        onSuccess={() => fetchData()}
        defaultGroupId={groups[0]?.id}
        boardId={selectedBoardId}
        taskToEdit={editingTask}
      />
    </div>
  );
};

export default TasksView;
