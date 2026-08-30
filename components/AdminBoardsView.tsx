
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { canManageBoards } from '../lib/permissions';

interface UserProfile {
    id: string | null;
    email: string;
    professional_title?: string;
    status?: 'INVITED' | 'ACTIVE' | 'BLOCKED';
}

interface Board {
    id: string;
    name: string;
    user_id: string | null;
    is_visible: boolean;
    created_at: string;
    user_email?: string;
}

interface AdminBoardsViewProps {
    onOpenMonitoring?: () => void;
}

const AdminBoardsView: React.FC<AdminBoardsViewProps> = ({ onOpenMonitoring }) => {
    const { profile } = useAuth();
    const [boards, setBoards] = useState<Board[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [taskStats, setTaskStats] = useState<Record<string, number>>({});

    // Create Board Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newBoardName, setNewBoardName] = useState('');
    const [selectedUserValue, setSelectedUserValue] = useState(''); // Can be UUID or email

    const fetchData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        setErrorMessage('');

        try {
            const { data: userData, error: usersError } = await supabase
                .from('user_profiles')
                .select('id, email, professional_title, status');
            if (usersError) throw new Error('Usuários: ' + usersError.message);
            setUsers((userData || []).filter(item => item.status !== 'BLOCKED'));

            const { data: boardsData, error: boardsError } = await supabase
                .from('task_boards')
                .select('*')
                .order('created_at', { ascending: false });
            if (boardsError) throw new Error('Quadros: ' + boardsError.message);

            const enrichedBoards = (boardsData || []).map((board: any) => ({
                ...board,
                is_visible: board.is_visible !== false,
                user_email: (userData || []).find(user => user.id === board.user_id)?.email || board.user_email || 'Unknown'
            }));
            setBoards(enrichedBoards);

            const [{ data: groupsData, error: groupsError }, { data: tasksData, error: tasksError }] = await Promise.all([
                supabase.from('task_groups').select('id, board_id'),
                supabase.from('tasks').select('group_id')
            ]);
            if (groupsError) throw new Error('Colunas: ' + groupsError.message);
            if (tasksError) throw new Error('Tarefas: ' + tasksError.message);

            const boardToGroups: Record<string, string[]> = {};
            (groupsData || []).forEach(group => {
                if (!boardToGroups[group.board_id]) boardToGroups[group.board_id] = [];
                boardToGroups[group.board_id].push(group.id);
            });

            const stats: Record<string, number> = {};
            (boardsData || []).forEach(board => {
                const groupsForBoard = boardToGroups[board.id] || [];
                stats[board.id] = (tasksData || []).filter(task => task.group_id && groupsForBoard.includes(task.group_id)).length;
            });
            setTaskStats(stats);
        } catch (error: any) {
            console.error('Error loading board management:', error);
            setErrorMessage(error.message || 'Não foi possível carregar os quadros.');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Set up real-time subscriptions
        const boardsChannel = supabase.channel('admin-boards-all')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'task_boards' }, () => fetchData(false))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'task_groups' }, () => fetchData(false))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData(false))
            .subscribe();

        return () => {
            supabase.removeChannel(boardsChannel);
        };
    }, []);

    const toggleVisibility = async (boardId: string, currentVisibility: boolean) => {
        if (!canManageBoards(profile)) return;
        const { error } = await supabase
            .from('task_boards')
            .update({ is_visible: !currentVisibility })
            .eq('id', boardId);

        if (error) {
            alert('Erro ao alterar visibilidade: ' + error.message);
        } else {
            setBoards(prev => prev.map(b => b.id === boardId ? { ...b, is_visible: !currentVisibility } : b));
        }
    };

    const deleteBoard = async (boardId: string) => {
        if (!canManageBoards(profile)) return;
        if (!confirm('Tem certeza que deseja excluir este quadro permanentemente?')) return;

        const { error } = await supabase.rpc('delete_task_board', { p_board_id: boardId });
        if (error) {
            alert('Erro ao excluir quadro: ' + error.message);
        } else {
            setBoards(prev => prev.filter(b => b.id !== boardId));
        }
    };

    const renameBoard = async (boardId: string, currentName: string) => {
        if (!canManageBoards(profile)) return;
        const newName = prompt('Novo nome para o quadro:', currentName);
        if (!newName || newName === currentName) return;

        const { error } = await supabase
            .from('task_boards')
            .update({ name: newName })
            .eq('id', boardId);

        if (error) {
            alert('Erro ao renomear quadro: ' + error.message);
        } else {
            setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name: newName } : b));
        }
    };

    // Helper: check if a string looks like a UUID
    const isUUID = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const createBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBoardName || !selectedUserValue) return;
        if (!canManageBoards(profile)) {
            alert('Seu perfil não pode gerenciar quadros.');
            return;
        }
        if (!isUUID(selectedUserValue)) {
            alert('Este usuário precisa concluir o primeiro acesso antes de receber um quadro.');
            return;
        }

        try {
            const selectedProfile = users.find(item => item.id === selectedUserValue);
            const { error } = await supabase.rpc('create_task_board_with_default_group', {
                p_name: newBoardName.trim(),
                p_user_id: selectedUserValue,
                p_user_email: selectedProfile?.email || null
            });
            if (error) throw error;

            setIsModalOpen(false);
            setNewBoardName('');
            setSelectedUserValue('');
            fetchData();
        } catch (err: any) {
            console.error('Erro ao criar quadro:', err);
            alert('Erro ao criar quadro: ' + err.message);
        }
    };


    return (
        <div className="flex-1 flex flex-col h-full bg-background-dark overflow-hidden">
            <header className="px-4 md:px-8 py-6 md:py-8 border-b border-white/5 bg-background-dark/40 backdrop-blur-md">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">admin_panel_settings</span>
                            Gerenciamento Central de Quadros
                        </h2>
                        <p className="text-sm md:text-base text-slate-400 mt-2 font-medium">Controle total sobre os espaços de trabalho de todos os usuários</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                        {onOpenMonitoring && (
                            <button
                                onClick={onOpenMonitoring}
                                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined">groups</span>
                                Monitorar Tarefas
                            </button>
                        )}
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            Criar Quadro para Usuário
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {errorMessage && (
                    <div role="alert" className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3 text-sm text-red-300">
                        <span className="material-symbols-outlined text-red-400">error</span>
                        <div>
                            <p className="font-bold text-red-400">Não foi possível carregar o gerenciamento de quadros</p>
                            <p className="text-xs mt-1">{errorMessage}</p>
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-slate-400 font-bold uppercase tracking-widest">Carregando dados mestre...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {boards.map(board => (
                            <div key={board.id} className={`bg-white/[0.03] border rounded-2xl p-6 transition-all hover:bg-white/[0.05] ${board.is_visible ? 'border-white/5' : 'border-red-500/20 bg-red-500/5'}`}>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="bg-primary/10 text-primary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                                        {board.user_email?.split('@')[0]}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => renameBoard(board.id, board.name)}
                                            className="size-8 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 rounded-lg transition-all"
                                            title="Renomear Quadro"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">edit</span>
                                        </button>
                                        <button
                                            onClick={() => toggleVisibility(board.id, board.is_visible)}
                                            className={`size-8 flex items-center justify-center rounded-lg transition-all ${board.is_visible ? 'text-slate-500 hover:text-white hover:bg-white/10' : 'text-red-500 hover:text-red-400 bg-red-500/10'}`}
                                            title={board.is_visible ? 'Ocultar quadro para o usuário' : 'Mostrar quadro para o usuário'}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">{board.is_visible ? 'visibility' : 'visibility_off'}</span>
                                        </button>
                                        <button
                                            onClick={() => deleteBoard(board.id)}
                                            className="size-8 flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                            title="Excluir Quadro"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-white mb-1">{board.name}</h3>
                                <p className="text-xs text-slate-500 mb-6 truncate">{board.user_email}</p>

                                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-slate-400 text-sm">task</span>
                                        <span className="text-sm font-bold text-white">{taskStats[board.id] || 0} Tarefas</span>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${board.is_visible ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {board.is_visible ? 'Visível' : 'Oculto'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-surface-dark border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <form onSubmit={createBoard} className="p-6 md:p-8 space-y-6">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-xl font-bold text-white">Novo Quadro</h3>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-white">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Nome do Quadro</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                                    placeholder="Ex: Projetos de Engenharia"
                                    value={newBoardName}
                                    onChange={e => setNewBoardName(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Usuário Destinatário</label>
                                <select
                                    required
                                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all"
                                    value={selectedUserValue}
                                    onChange={e => setSelectedUserValue(e.target.value)}
                                >
                                    <option value="">Selecione um usuário...</option>
                                    {users.map(u => (
                                        <option key={u.id || u.email} value={u.id || ''} disabled={!u.id || !isUUID(u.id)}>
                                            {u.email}{!u.id || !isUUID(u.id) ? ' (aguardando 1º acesso)' : ''}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-500 mt-1">
                                    Usuários marcados como "aguardando 1º acesso" precisam entrar no sistema antes que o quadro seja criado.
                                </p>
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
                                >
                                    Criar e Vincular
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminBoardsView;
