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
}

interface TaskGroup {
    id: string;
    name: string;
}

const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, onSuccess, defaultGroupId, boardId }) => {
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

    useEffect(() => {
        if (isOpen) {
            fetchInitialData();
            if (defaultGroupId) setGroupId(defaultGroupId);
        }
    }, [isOpen, defaultGroupId, boardId]);

    const fetchInitialData = async () => {
        let groupsQuery = supabase.from('task_groups').select('id, name').order('order_index');
        if (boardId) {
            groupsQuery = groupsQuery.eq('board_id', boardId);
        }

        const [{ data: pData }, { data: gData }] = await Promise.all([
            supabase.from('projects').select('*').order('name'),
            groupsQuery
        ]);
        if (pData) setProjects(pData);
        if (gData) setGroups(gData);
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
        setLoading(true);

        try {
            let fileUrl = '';
            if (file) {
                fileUrl = await handleUpload(file);
            }

            const { error } = await supabase.from('tasks').insert({
                title,
                description,
                group_id: groupId || null,
                label_color: labelColor,
                category,
                project_id: projectId || null,
                file_url: fileUrl,
                user_id: user?.id
            });

            if (error) throw error;

            onSuccess();
            onClose();
            // Reset form
            setTitle('');
            setDescription('');
            setFile(null);
        } catch (error: any) {
            console.error(error);
            alert('Erro ao criar tarefa: ' + (error.message || 'Verifique se o bucket "task-attachments" existe no Supabase.'));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Nova Tarefa</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Título</label>
                        <input
                            required
                            className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="O que precisa ser feito?"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Descrição</label>
                        <textarea
                            className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none h-24 resize-none"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Detalhes adicionais..."
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Grupo (Coluna)</label>
                            <select
                                className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                                value={groupId}
                                onChange={e => setGroupId(e.target.value)}
                                required
                            >
                                <option value="" disabled>Selecione...</option>
                                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-400 mb-1">Cor de Sinalização</label>
                            <select
                                className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                                value={labelColor}
                                onChange={e => setLabelColor(e.target.value)}
                            >
                                <option value="transparent">Nenhuma</option>
                                <option value="bg-red-500">Urgente (Vermelho)</option>
                                <option value="bg-yellow-500">Atenção (Amarelo)</option>
                                <option value="bg-blue-500">Informativo (Azul)</option>
                                <option value="bg-green-500">OK (Verde)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Vincular Projeto (Opcional)</label>
                        <select
                            className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                            value={projectId}
                            onChange={e => setProjectId(e.target.value)}
                        >
                            <option value="">Nenhum</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Anexo (Arquivo)</label>
                        <input
                            type="file"
                            className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                            onChange={e => setFile(e.target.files?.[0] || null)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-primary/20 disabled:opacity-50 mt-4"
                    >
                        {loading ? 'Criando...' : 'Criar Tarefa'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default NewTaskModal;
