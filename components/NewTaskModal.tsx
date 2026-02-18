import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project } from '../types';
import { isTaskCentralUser } from '../lib/permissions';

interface NewTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultGroupId?: string;
    boardId?: string;
    taskToEdit?: any;
}

// Update interface
interface TaskGroup {
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
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<Project[]>([]);
    const [groups, setGroups] = useState<TaskGroup[]>([]);

    // Form State
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
    const [users, setUsers] = useState<any[]>([]); // Store user profiles

    // Checklist State
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
                if (taskToEdit.id) {
                    fetchChecklist(taskToEdit.id);
                }
            } else {
                setTitle('');
                setDescription('');
                // If defaultGroupId is passed, use it, otherwise validation will force selection
                setGroupId(defaultGroupId || '');
                setLabelColor('transparent');
                setCategory('Engenharia');
                setProjectId('');
                setIsAnnual(false);
                setExpirationDate('');
                setAssignee('');
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
        // Fetch groups with their board info
        let groupsQuery = supabase
            .from('task_groups')
            .select('id, name, board_id, task_boards(name, user_id)')
            .order('order_index');

        // Only filter by board if it's a valid ID and NOT the virtual sync board
        if (boardId && boardId !== 'central-sync') {
            groupsQuery = groupsQuery.eq('board_id', boardId);
        }

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
            supabase.from('user_profiles').select('id, email, professional_title')
        ]);

        if (uData) {
            setUsers(uData);
        }

        if (pData) {
            // IDs of projects that have records in Phase A, B, or C
            const linkedProjectIds = new Set([
                ...(fData || []).map(f => f.project_id),
                ...(bData || []).map(b => b.project_id),
                ...(prData || []).map(pr => pr.project_id)
            ]);

            // Filter projects to only those that are in Phase A, B, or C
            let filteredProjects = pData.filter(p => linkedProjectIds.has(p.id));

            // Remove duplicate names, keeping only the most recent (last in alphabetical order? Or just first found)
            // The user said "sem duplicar o nome do projeto"
            const uniqueProjects: Project[] = [];
            const seenNames = new Set();

            // pData is already ordered by name. We just need to pick one for each name.
            filteredProjects.forEach(p => {
                if (!seenNames.has(p.name)) {
                    uniqueProjects.push(p);
                    seenNames.add(p.name);
                }
            });

            setProjects(uniqueProjects);
        }

        if (gData) {
            const isCentral = isTaskCentralUser(user?.email);
            const accessibleGroups = (gData as any[]).filter(g => {
                if (isCentral) return true;
                if (!profile) return true;

                // For non-central users, strictly enforce board ownership
                // If the group belongs to a board, check if that board belongs to the user
                if (g.task_boards) {
                    const boardOwnerId = Array.isArray(g.task_boards)
                        ? g.task_boards[0]?.user_id
                        : g.task_boards?.user_id;

                    if (boardOwnerId && boardOwnerId !== user?.id) {
                        return false;
                    }
                }

                if (profile.role === 'ADMIN' || profile.role === 'MANAGER') return true;

                const key = `GROUP_${g.id}`;
                if (profile.permissions && profile.permissions[key] !== undefined) {
                    return profile.permissions[key];
                }
                return true;
            });

            setGroups(accessibleGroups);

            // If currently selected groupId is not in the fetched groups (and we are not editing), clear it
            // This prevents "ghost" selections if switching contexts
            // However, if we are editing, we trust the task's current group
            if (!taskToEdit && groupId && !gData.some((g: any) => g.id === groupId)) {
                setGroupId('');
            }

            // If no group is selected, select the first one automatically if available
            if (!groupId && !taskToEdit && gData.length > 0) {
                // Try to respect defaultGroupId if it exists in the new list
                const hasDefault = gData.some((g: any) => g.id === defaultGroupId);
                if (!hasDefault) {
                    setGroupId(gData[0].id);
                }
            }
        }
    };

    const handleUpload = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        // Upload to 'task-attachments' bucket
        const { error: uploadError, data } = await supabase.storage
            .from('task-attachments')
            .upload(filePath, file);

        if (uploadError) {
            // If bucket doesn't exist, this will fail. 
            // In a real app we'd handle bucket creation or instruct user.
            throw uploadError;
        }

        const { data: { publicUrl } } = supabase.storage
            .from('task-attachments')
            .getPublicUrl(filePath);

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
            if (file) {
                fileUrl = await handleUpload(file);
            }

            const payload = {
                title,
                description,
                group_id: groupId,
                label_color: labelColor,
                category,
                project_id: projectId || null,
                file_url: fileUrl || (taskToEdit?.file_url || ''),
                user_id: user?.id,
                is_annual: isAnnual,
                expiration_date: expirationDate || null,
                assignee: assignee || null, // Add assignee
                order_index: taskToEdit ? (taskToEdit.order_index || 0) : 0, // Default to top for new tasks
                status: taskToEdit ? (taskToEdit.status || 'PENDING') : 'PENDING'
            };

            const { data: taskData, error } = taskToEdit
                ? await supabase.from('tasks').update(payload).eq('id', taskToEdit.id).select().single()
                : await supabase.from('tasks').insert(payload).select().single();

            if (error) throw error;

            // Handle Checklist
            if (taskData) {
                // We delete all existing items for this task to sync state (simplest approach for now)
                // Or better: Upsert/Delete differential.
                // For simplicity, let's just delete all and insert current state? 
                // No, that changes IDs. Better to just handle inserts/updates. 
                // But for "offline-first" feel, let's just process the list.

                // Strategy: 
                // 1. Delete items not in current list (if they have ID)
                // 2. Upsert items in current list

                const currentIds = checklistItems.filter(i => i.id).map(i => i.id);
                if (taskToEdit) {
                    await supabase.from('task_checklist_items').delete().eq('task_id', taskToEdit.id).not('id', 'in', `(${currentIds.join(',')})`);
                    // Note: Supabase not syntax for IN might be tricky with empty array.
                    // If empty, delete all.
                    if (currentIds.length === 0) {
                        await supabase.from('task_checklist_items').delete().eq('task_id', taskToEdit.id);
                    } else {
                        await supabase.from('task_checklist_items').delete().eq('task_id', taskToEdit.id).not('id', 'in', `(${currentIds.join(',')})`);
                    }
                }

                const itemsToUpsert = checklistItems.map(item => ({
                    id: item.id, // If undefined, Supabase will generate new UUID if we don't pass it? No, upsert needs PK.
                    // Actually, for new items, id is undefined. 
                    // Let's separate new vs existing.
                    task_id: taskData.id,
                    content: item.content,
                    is_completed: item.is_completed
                }));

                for (const item of itemsToUpsert) {
                    if (item.id) {
                        await supabase.from('task_checklist_items').update({ content: item.content, is_completed: item.is_completed }).eq('id', item.id);
                    } else {
                        await supabase.from('task_checklist_items').insert({ task_id: taskData.id, content: item.content, is_completed: item.is_completed });
                    }
                }
            }

            onSuccess();
            onClose();
            // Reset form
            setTitle('');
            setDescription('');
            setAssignee('');
            setFile(null);
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
                            <input
                                required
                                className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all font-medium text-sm"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Ex: Vistoria técnica no Bloco A"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Descrição Detalhada</label>
                            <textarea
                                className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none h-28 resize-none transition-all text-sm font-medium"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Descreva os detalhes e observações importantes..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Estágio (Coluna)</label>
                                <div className="relative group">
                                    <select
                                        className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10"
                                        value={groupId}
                                        onChange={e => setGroupId(e.target.value)}
                                        required
                                    >
                                        <option value="" disabled className="bg-surface-dark">Selecione o estágio...</option>
                                        {groups.map(g => {
                                            // Handle potential single or array return from join (Supabase edge case)
                                            const boardName = Array.isArray(g.task_boards)
                                                ? g.task_boards[0]?.name
                                                : g.task_boards?.name;

                                            return (
                                                <option key={g.id} value={g.id} className="bg-surface-dark">
                                                    {boardName ? `${boardName} > ${g.name}` : g.name}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">expand_more</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Sinalização Visual</label>
                                <div className="relative group">
                                    <select
                                        className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10"
                                        value={labelColor}
                                        onChange={e => setLabelColor(e.target.value)}
                                    >
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

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Categoria</label>
                                <div className="relative group">
                                    <select
                                        className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10"
                                        value={category}
                                        onChange={e => setCategory(e.target.value)}
                                    >
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
                                    <select
                                        className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10"
                                        value={projectId}
                                        onChange={e => setProjectId(e.target.value)}
                                    >
                                        <option value="" className="bg-surface-dark">Nenhum Projeto</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id} className="bg-surface-dark">{p.name}</option>
                                        ))}
                                    </select>
                                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">folder_open</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] mb-2 block">Responsável (Atribuir a)</label>
                            <div className="relative group">
                                <select
                                    className="appearance-none w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 focus:bg-white/10 outline-none transition-all text-sm font-medium pr-10"
                                    value={assignee}
                                    onChange={e => setAssignee(e.target.value)}
                                >
                                    <option value="" className="bg-surface-dark">Sem Responsável</option>
                                    {users.map(u => (
                                        <option key={u.id} value={u.id} className="bg-surface-dark">
                                            {u.email} {u.professional_title ? `(${u.professional_title})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 pointer-events-none group-focus-within:text-primary transition-colors">person</span>
                            </div>
                        </div>

                    </div>

                    <div className="bg-primary/5 p-6 rounded-2xl border border-primary/20 space-y-6 shadow-xl shadow-black/20">
                        <label className="flex items-center gap-4 cursor-pointer group">
                            <div className={`size-7 rounded-lg flex items-center justify-center border-2 transition-all ${isAnnual ? 'bg-primary border-primary shadow-lg shadow-primary/20 scale-110' : 'bg-white/5 border-white/10 group-hover:border-white/20'}`}>
                                {isAnnual && <span className="material-symbols-outlined text-white text-[20px] font-bold">check</span>}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={isAnnual}
                                onChange={e => setIsAnnual(e.target.checked)}
                            />
                            <div className="flex flex-col">
                                <span className="text-[13px] font-black text-white uppercase tracking-wider">Aditivo de Renovação Anual</span>
                                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mt-0.5">Ativar controle recorrente para este contrato</p>
                            </div>
                        </label>

                        {isAnnual && (
                            <div className="animate-in slide-in-from-top-4 duration-300 pt-2 grid grid-cols-1 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2 block">Vencimento do Contrato / Renovação</label>
                                    <div className="relative group">
                                        <input
                                            type="date"
                                            className="w-full bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white focus:border-primary/50 outline-none text-sm transition-all"
                                            value={expirationDate}
                                            onChange={e => setExpirationDate(e.target.value)}
                                        />
                                        <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-[18px] text-primary/40 pointer-events-none">event</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Checklist Section */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em]">Checklist / Sub-tarefas</label>
                            <span className="text-[10px] font-bold text-slate-600 bg-white/5 px-2 py-0.5 rounded-lg">
                                {checklistItems.filter(i => i.is_completed).length}/{checklistItems.length}
                            </span>
                        </div>

                        <div className="space-y-2">
                            {checklistItems.map((item, index) => (
                                <div key={index} className="flex items-center gap-3 group">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newItems = [...checklistItems];
                                            newItems[index].is_completed = !newItems[index].is_completed;
                                            setChecklistItems(newItems);
                                        }}
                                        className={`size-5 rounded border flex items-center justify-center transition-all ${item.is_completed ? 'bg-green-500 border-green-500 text-white' : 'bg-transparent border-slate-600 hover:border-primary'}`}
                                    >
                                        {item.is_completed && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                    </button>
                                    <input
                                        value={item.content}
                                        onChange={(e) => {
                                            const newItems = [...checklistItems];
                                            newItems[index].content = e.target.value;
                                            setChecklistItems(newItems);
                                        }}
                                        className={`flex-1 bg-transparent border-b border-transparent focus:border-primary/50 outline-none text-sm transition-all ${item.is_completed ? 'text-slate-500 line-through decoration-slate-600' : 'text-white'}`}
                                        placeholder="Item da checklist..."
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setChecklistItems(checklistItems.filter((_, i) => i !== index))}
                                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 transition-all"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">close</span>
                                    </button>
                                </div>
                            ))}

                            <div className="flex items-center gap-2 mt-2">
                                <span className="material-symbols-outlined text-slate-500 text-[18px]">add</span>
                                <input
                                    value={newChecklistItem}
                                    onChange={(e) => setNewChecklistItem(e.target.value)}
                                    // Add on Enter
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (newChecklistItem.trim()) {
                                                setChecklistItems([...checklistItems, { content: newChecklistItem, is_completed: false }]);
                                                setNewChecklistItem('');
                                            }
                                        }
                                    }}
                                    className="flex-1 bg-transparent border-none outline-none text-sm text-slate-300 placeholder:text-slate-600"
                                    placeholder="Adicionar item (Pressione Enter)"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.15em] block">Documentação / Anexos</label>
                        <div className="relative group h-14">
                            <input
                                type="file"
                                className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                                onChange={e => setFile(e.target.files?.[0] || null)}
                            />
                            <div className="absolute inset-0 bg-white/5 border border-dashed border-white/10 rounded-xl flex items-center px-5 gap-3 group-hover:bg-white/10 group-hover:border-primary/30 transition-all">
                                <span className="material-symbols-outlined text-slate-400 group-hover:text-primary">upload_file</span>
                                <span className="text-sm font-medium text-slate-400 truncate flex-1">
                                    {file ? file.name : 'Selecionar arquivo ou soltar aqui...'}
                                </span>
                                {file && (
                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFile(null); }} className="size-6 flex items-center justify-center hover:bg-red-500/10 rounded-full text-red-500 transition-all relative z-20">
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-6 py-4 rounded-xl border border-white/5 text-slate-400 font-black text-[11px] uppercase tracking-[0.15em] hover:bg-white/5 transition-all active:scale-95"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-[2] bg-primary hover:bg-primary-dark text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-primary/20 active:scale-95 disabled:opacity-50 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2"
                        >
                            {loading && <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                            <span>{loading ? (taskToEdit ? 'Salvando...' : 'Criando...') : (taskToEdit ? 'Salvar Alterações' : 'Criar Tarefa')}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default NewTaskModal;
