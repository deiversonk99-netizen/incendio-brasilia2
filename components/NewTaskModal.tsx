import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Project } from '../types';

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

const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, onSuccess, defaultGroupId, boardId, taskToEdit }) => {
    const { user } = useAuth();
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
            }
        }
    }, [isOpen, defaultGroupId, boardId, taskToEdit]);

    const fetchInitialData = async () => {
        // Fetch groups with their board info
        let groupsQuery = supabase
            .from('task_groups')
            .select('id, name, board_id, task_boards(name)')
            .order('order_index');

        // Only filter by board if it's a valid ID and NOT the virtual sync board
        if (boardId && boardId !== 'central-sync') {
            groupsQuery = groupsQuery.eq('board_id', boardId);
        }

        const [{ data: pData }, { data: gData }] = await Promise.all([
            supabase.from('projects').select('*').order('name'),
            groupsQuery
        ]);

        if (pData) setProjects(pData);
        if (gData) {
            setGroups(gData as any);

            // If currently selected groupId is not in the fetched groups (and we are not editing), clear it
            // This prevents "ghost" selections if switching contexts
            // However, if we are editing, we trust the task's current group

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
                order_index: taskToEdit ? (taskToEdit.order_index || 0) : 0, // Default to top for new tasks
                status: taskToEdit ? (taskToEdit.status || 'PENDING') : 'PENDING'
            };

            const { error } = taskToEdit
                ? await supabase.from('tasks').update(payload).eq('id', taskToEdit.id)
                : await supabase.from('tasks').insert(payload);

            if (error) throw error;

            onSuccess();
            onClose();
            // Reset form
            setTitle('');
            setDescription('');
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
                                        {groups.map(g => (
                                            <option key={g.id} value={g.id} className="bg-surface-dark">
                                                {g.task_boards?.name ? `${g.task_boards.name} > ${g.name}` : g.name}
                                            </option>
                                        ))}
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
