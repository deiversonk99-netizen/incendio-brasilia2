
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface UserProfile {
    id: string;
    email: string;
    professional_title?: string;
}

interface Board {
    id: string;
    name: string;
    user_id: string;
    is_visible: boolean;
    created_at: string;
    user_email?: string;
}

interface TaskStats {
    board_id: string;
    count: number;
}

const AdminBoardsView: React.FC = () => {
    const { user } = useAuth();
    const [boards, setBoards] = useState<Board[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [taskStats, setTaskStats] = useState<Record<string, number>>({});

    // Create Board Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newBoardName, setNewBoardName] = useState('');
    const [selectedUserId, setSelectedUserId] = useState('');

    const fetchData = async () => {
        setLoading(true);

        // Fetch all user profiles
        const { data: userData } = await supabase
            .from('user_profiles')
            .select('id, email, professional_title');

        if (userData) setUsers(userData);

        // Fetch all boards
        const { data: boardsData } = await supabase
            .from('task_boards')
            .select('*')
            .order('created_at', { ascending: false });

        if (boardsData) {
            const enrichedBoards = boardsData.map(b => ({
                ...b,
                user_email: userData?.find(u => u.id === b.user_id)?.email || 'Unknown'
            }));
            setBoards(enrichedBoards);

            // Fetch task counts for these boards
            // We need to fetch groups first to get tasks
            const { data: groupsData } = await supabase
                .from('task_groups')
                .select('id, board_id');

            if (groupsData) {
                const boardToGroups: Record<string, string[]> = {};
                groupsData.forEach(g => {
                    if (!boardToGroups[g.board_id]) boardToGroups[g.board_id] = [];
                    boardToGroups[g.board_id].push(g.id);
                });

                const { data: tasksData } = await supabase
                    .from('tasks')
                    .select('group_id');

                if (tasksData) {
                    const stats: Record<string, number> = {};
                    boardsData.forEach(b => {
                        const groupsForBoard = boardToGroups[b.id] || [];
                        stats[b.id] = tasksData.filter(t => groupsForBoard.includes(t.group_id)).length;
                    });
                    setTaskStats(stats);
                }
            }
        }

        setLoading(false);
    };

    useEffect(() => {
        fetchData();

        // Set up real-time subscriptions
        const boardsChannel = supabase.channel('admin-boards-all')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'task_boards' }, () => fetchData())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
            .subscribe();

        return () => {
            supabase.removeChannel(boardsChannel);
        };
    }, []);

    const toggleVisibility = async (boardId: string, currentVisibility: boolean) => {
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
        if (!confirm('Tem certeza que deseja excluir este quadro permanentemente?')) return;

        // We should probably delete tasks and groups first if the DB doesn't handle cascade
        const { data: groups } = await supabase.from('task_groups').select('id').eq('board_id', boardId);
        if (groups && groups.length > 0) {
            const groupIds = groups.map(g => g.id);
            await supabase.from('tasks').delete().in('group_id', groupIds);
            await supabase.from('task_groups').delete().eq('board_id', boardId);
        }

        const { error } = await supabase.from('task_boards').delete().eq('id', boardId);
        if (error) {
            alert('Erro ao excluir quadro: ' + error.message);
        } else {
            setBoards(prev => prev.filter(b => b.id !== boardId));
        }
    };

    const renameBoard = async (boardId: string, currentName: string) => {
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

    // Filter users to only those with a valid ID (linked to auth)
    const usersWithId = users.filter(u => u.id && u.id.length > 5);

    const createBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBoardName || !selectedUserId) return;

        try {
            const { data: board, error } = await supabase
                .from('task_boards')
                .insert({
                    name: newBoardName,
                    user_id: selectedUserId,
                    is_visible: true
                })
                .select()
                .single();

            if (error) throw error;

            // Add default column
            await supabase.from('task_groups').insert({
                name: 'Pendentes',
                color: 'bg-primary',
                order_index: 0,
                board_id: board.id,
                user_id: selectedUserId
            });

            setIsModalOpen(false);
            setNewBoardName('');
            setSelectedUserId('');
            fetchData();
        } catch (err: any) {
            console.error('Erro ao criar quadro:', err);
            alert('Erro ao criar quadro: ' + err.message);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-background-dark overflow-hidden">
            <header className="px-8 py-8 border-b border-white/5 bg-background-dark/40 backdrop-blur-md">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-black text-white flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary text-4xl">admin_panel_settings</span>
                            Gerenciamento Central de Quadros
                        </h2>
                        <p className="text-slate-400 mt-2 font-medium">Controle total sobre os espaços de trabalho de todos os usuários</p>
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl font-black uppercase tracking-widest transition-all shadow-xl shadow-primary/20 flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">add_circle</span>
                        Criar Quadro para Usuário
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8">
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
                        <form onSubmit={createBoard} className="p-8 space-y-6">
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
                                    value={selectedUserId}
                                    onChange={e => setSelectedUserId(e.target.value)}
                                >
                                    <option value="">Selecione um usuário...</option>
                                    {usersWithId.map(u => (
                                        <option key={u.id} value={u.id}>{u.email}</option>
                                    ))}
                                </select>
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
