
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NewTaskModal from './NewTaskModal';
import { useAuth } from '../contexts/AuthContext';
import { isTaskCentralUser } from '../lib/permissions';

const SYNC_BOARD_ID = 'central-sync';

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
  isTeamMonitoring?: boolean;
}

const TasksView: React.FC<TasksViewProps> = ({ isTeamMonitoring = false }) => {
  const { user, profile } = useAuth();
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

  // Add Board Modal State
  const [isAddBoardModalOpen, setIsAddBoardModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardUserId, setNewBoardUserId] = useState('');
  const [users, setUsers] = useState<any[]>([]);

  const isCentral = isTaskCentralUser(user?.email);

  useEffect(() => {
    const handleClickOutside = () => setOpenMenuTaskId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const fetchData = async () => {
    setLoading(true);

    let currentUsers = users;
    if (isCentral && users.length === 0) {
      const { data: uData } = await supabase.from('user_profiles').select('id, email, professional_title');
      if (uData) {
        setUsers(uData);
        currentUsers = uData;
      }
    }

    // 1. Fetch Boards
    let boardsQuery = supabase
      .from('task_boards')
      .select('*')
      .order('name');

    const { data: boardsData } = await boardsQuery;

    if (boardsData) {
      let allowedBoards = boardsData.filter(b => {
        if (isTeamMonitoring && isCentral) return true;

        // Regular users only see visible boards they own
        if (b.user_id === user?.id) {
          return b.is_visible !== false;
        }

        // Check explicitly granted permissions
        const permKey = `BOARD_${b.id}`;
        return profile?.permissions && profile.permissions[permKey] === true;
      }).map(b => {
        // Append user identification to board name if we are in Team Monitoring
        if (isTeamMonitoring && isCentral && b.user_id) {
          const owner = currentUsers.find(u => u.id === b.user_id);
          if (owner) {
            return { ...b, name: `${b.name} (${owner.email.split('@')[0]})` };
          }
        }
        return b;
      });

      if (isTeamMonitoring) {
        // In team monitoring, we add the Sync Board as a virtual option
        const syncBoardOption = {
          id: SYNC_BOARD_ID,
          name: '🔄 Quadro Geral (Pendências)',
          user_id: undefined
        };
        
        // If central, they see ALL boards + sync board
        // Regular users probably shouldn't be in Team Monitoring anyway (Sidebar blocks it)
        setBoards([syncBoardOption, ...allowedBoards]);

        if (!selectedBoardId) {
          setSelectedBoardId(SYNC_BOARD_ID);
          setLoading(false);
          return;
        }
      } else {
        if (isCentral) {
          const listViewOption = {
            id: 'lista-pendencias-global',
            name: '📋 Lista de Pendências Global',
            user_id: undefined
          };
          setBoards([listViewOption]);

          if (!selectedBoardId || selectedBoardId !== 'lista-pendencias-global') {
            setSelectedBoardId('lista-pendencias-global');
            setLoading(false);
            return;
          }
        } else {
          setBoards(allowedBoards);

          if (!selectedBoardId && allowedBoards.length > 0) {
            setSelectedBoardId(allowedBoards[0].id);
            setLoading(false);
            return;
          }
        }
      }
    }

    if (!selectedBoardId) {
      setLoading(false);
      return;
    }

    // Special Sync Board and List View Handling
    if (selectedBoardId === SYNC_BOARD_ID || selectedBoardId === 'lista-pendencias-global') {
      // First get visible board IDs
      const { data: visibleBoards } = await supabase
        .from('task_boards')
        .select('id')
        .eq('is_visible', true);

      const visibleBoardIds = visibleBoards?.map(b => b.id) || [];

      // Get groups belonging to these boards
      const { data: visibleGroups } = await supabase
        .from('task_groups')
        .select('id')
        .in('board_id', visibleBoardIds);

      const visibleGroupIds = visibleGroups?.map(g => g.id) || [];

      const [{ data: syncData }, { data: profilesData }, { data: checklistsData }] = await Promise.all([
        supabase
          .from('tasks')
          .select(`
            *, 
            projects(name)
          `)
          .eq('status', 'PENDING')
          .in('group_id', visibleGroupIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_profiles')
          .select('id, email'),
        supabase
          .from('task_checklist_items')
          .select('task_id, is_completed')
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

        // Group by user
        const uniqueUserIds = Array.from(new Set(enrichedSyncData.map((t: any) => t.user_id)));
        const userGroups = uniqueUserIds.map((uId, idx) => ({
          id: `sync-user-${uId}`,
          name: `Pendentes - ${enrichedSyncData.find((t: any) => t.user_id === uId)?.user_profiles?.email?.split('@')[0] || 'Usuário'}`,
          color: 'bg-primary',
          order_index: idx,
          board_id: SYNC_BOARD_ID
        }));

        setGroups(userGroups);
      }

      setLoading(false);
      return;
    }

    // 2. Fetch Groups for Selected Board
    const { data: groupsData } = await supabase
      .from('task_groups')
      .select('*')
      .eq('board_id', selectedBoardId)
      .order('order_index', { ascending: true });

    if (groupsData) {
      // Filter accessible groups
      const accessibleGroups = groupsData.filter(g => {
        if (!profile) return true;

        const key = `GROUP_${g.id}`;

        // Explicit permissions override role check
        if (profile.permissions && profile.permissions[key] !== undefined) {
          return profile.permissions[key] === true;
        }

        if (isCentral) return true;
        if (profile.role === 'ADMIN' || profile.role === 'MANAGER') return true;

        // Default: Visible
        return true;
      });

      setGroups(accessibleGroups);
    }

    // 3. Fetch Tasks
    const groupIds = groupsData?.map(g => g.id) || [];

    const [{ data: tasksData, error: tasksError }, { data: profilesData }, { data: checklistsData }] = await Promise.all([
      supabase
        .from('tasks')
        .select('*, projects(name)')
        .in('group_id', groupIds)
        .order('order_index', { ascending: true }),
      supabase
        .from('user_profiles')
        .select('id, email'),
      supabase
        .from('task_checklist_items')
        .select('task_id, is_completed')
    ]);

    if (tasksError) console.error('Tasks Fetch Error:', tasksError);

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

    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    // Set up real-time subscriptions
    const channel = supabase.channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_groups' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_boards' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedBoardId]);

  const handleConvertToProject = async (task: Task) => {
    if (!confirm(`Deseja converter a tarefa "${task.title}" em um novo Projeto?`)) return;

    try {
      const { data: newProject, error } = await supabase.from('projects').insert({
        name: task.title,
        status: 'ANALYSIS',
        client: 'Indefinido (Via Tarefa)',
        type: 'business', // Default
        value: 0,
        deadline: new Date().toISOString().split('T')[0],
        internal_observations: `Convertido da tarefa: ${task.description || ''}`,
        created_at: new Date().toISOString(),
        user_id: user?.id
      }).select().single();

      if (error) throw error;

      alert('Projeto criado com sucesso! Status: Em Análise.');

      // Optional: Delete the task or move it? 
      // User said "move to Em Análise na Gestão de Projetos". 
      // The task itself could be deleted or kept as reference. 
      // Let's keep it but maybe mark it? Or just delete it?
      // I'll leave it for now to avoid data loss.

    } catch (error: any) {
      console.error('Error converting to project:', error);
      alert('Erro ao converter: ' + error.message);
    }
  };

  const handleUpdateTaskGroup = async (taskId: string, groupId: string) => {
    // Optimistic
    setTasks((prev: Task[]) => prev.map((t: Task) => t.id === taskId ? { ...t, group_id: groupId } : t));
    await supabase.from('tasks').update({ group_id: groupId }).eq('id', taskId);
  };

  const handleUpdateTaskColor = async (taskId: string, color: string) => {
    setTasks((prev: Task[]) => prev.map((t: Task) => t.id === taskId ? { ...t, label_color: color } : t));
    await supabase.from('tasks').update({ label_color: color }).eq('id', taskId);
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

  const handleRenameGroup = async (groupId: string) => {
    const group = groups.find((g: TaskGroup) => g.id === groupId);
    const newName = prompt('Novo nome do grupo:', group?.name);
    if (!newName || newName === group?.name) return;

    setGroups((prev: TaskGroup[]) => prev.map((g: TaskGroup) => g.id === groupId ? { ...g, name: newName } : g));
    await supabase.from('task_groups').update({ name: newName }).eq('id', groupId);
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

    // Add to the new group at specific index
    const groupTasks = otherTasks.filter((t: Task) => t.group_id === targetGroupId);
    groupTasks.splice(targetIndex, 0, { ...taskToMove, group_id: targetGroupId });

    // Update indexes for all in this group
    const updatedGroupTasks = groupTasks.map((t: Task, idx: number) => ({ ...t, order_index: idx }));

    const finalTasks = [
      ...otherTasks.filter((t: Task) => t.group_id !== targetGroupId),
      ...updatedGroupTasks
    ];

    setTasks(finalTasks as any);

    // Persist to Supabase
    const { error } = await supabase.from('tasks').update({
      group_id: targetGroupId,
      order_index: targetIndex
    }).eq('id', taskId);

    if (error) {
      console.error('Swap error:', error);
      return;
    }

    // Ensure database consistency
    const updates = updatedGroupTasks.map((t, idx) =>
      supabase.from('tasks').update({ order_index: idx }).eq('id', t.id)
    );
    await Promise.all(updates);
  };

  const handleAddGroup = async () => {
    if (!selectedBoardId || selectedBoardId === SYNC_BOARD_ID) return;
    const name = prompt('Nome do novo grupo:');
    if (!name) return;

    try {
      const { data, error } = await supabase.from('task_groups').insert({
        name,
        color: 'bg-slate-400',
        order_index: groups.length,
        board_id: selectedBoardId,
        user_id: user?.id
      }).select().single();

      if (error) throw error;
      if (data) setGroups([...groups, data]);
    } catch (error: any) {
      console.error('Error adding group:', error);
      alert('Erro ao criar grupo: ' + error.message);
    }
  };

  const handleAddBoardClick = () => {
    setIsAddBoardModalOpen(true);
    setNewBoardName('');
    setNewBoardUserId('');
  };

  const handleCreateBoardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName) return;

    try {
      const { data: boardData, error: boardError } = await supabase.from('task_boards').insert({
        name: newBoardName,
        user_id: newBoardUserId || user?.id
      }).select().single();

      if (boardError) throw boardError;

      if (boardData) {
        // Create a default column for the new board
        await supabase.from('task_groups').insert({
          name: 'Pendentes',
          color: 'bg-primary',
          order_index: 0,
          board_id: boardData.id,
          user_id: newBoardUserId || user?.id
        });

        setBoards([...boards, boardData]);
        setSelectedBoardId(boardData.id);
        setIsAddBoardModalOpen(false);
      }
    } catch (error: any) {
      console.error('Error adding board:', error);
      alert('Erro ao criar quadro: ' + error.message);
    }
  };

  const filteredTasks = tasks.filter((t: Task) => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.projects?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="relative z-10 px-8 py-6 flex flex-col gap-6 border-b border-white/5 bg-background-dark/40 backdrop-blur-md">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  {isTeamMonitoring ? 'groups' : 'task_alt'}
                </span>
              </div>
              {isTeamMonitoring ? 'Monitoramento da Equipe' : 'Minhas Tarefas'}
            </h2>
            {boards.length > 1 || isTeamMonitoring ? (
              <div className="flex items-center gap-3">
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
                  {isTeamMonitoring ? 'Visão global e por membro da equipe' : 'Controle de seus fluxos e processos'}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <div className="bg-white/5 text-primary text-[10px] font-black border border-white/5 rounded-full px-4 py-1.5 uppercase tracking-widest max-w-[300px] truncate">
                    {boards.find((b: TaskBoard) => b.id === selectedBoardId)?.name || 'MEU QUADRO'}
                  </div>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em] hidden sm:inline">
                  Controle de seus fluxos e processos
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">


            {/* View Controls */}
            <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
              <button
                onClick={() => setIsCompact(!isCompact)}
                className={`flex items-center justify-center gap-2 rounded-lg h-9 px-4 transition-all text-[10px] font-black uppercase tracking-widest ${isCompact ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <span className="material-symbols-outlined text-[18px]">{isCompact ? 'view_kanban' : 'view_headline'}</span>
                <span>{isCompact ? 'Ver Padrão' : 'Ver Compacto'}</span>
              </button>

            </div>

            {/* Search & Action */}
            <div className="flex items-center gap-3">
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 group-focus-within:text-primary transition-colors">search</span>
                <input
                  className="bg-white/5 border border-white/5 text-white text-[11px] font-medium rounded-xl block w-56 pl-10 pr-4 py-2.5 outline-none focus:border-primary/50 focus:bg-white/10 transition-all shadow-inner"
                  placeholder="Buscar tarefa ou projeto..."
                  value={searchTerm}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                />
              </div>
              {selectedBoardId !== 'lista-pendencias-global' && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-xl h-10 px-6 bg-primary hover:bg-red-600 text-white text-[11px] font-black uppercase tracking-[0.15em] transition-all shadow-xl shadow-primary/20 active:scale-95"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                  <span>Nova Tarefa</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4 z-10">
        {/* Info Banner for Central Admin */}
        {isCentral && (
          <div className="mb-6 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3 text-sm text-blue-300">
            <span className="material-symbols-outlined text-blue-400 shrink-0">info</span>
            <div className="flex flex-col gap-2">
              <p className="font-bold text-blue-400 mb-1">Guia de Gestão de Tarefas (Admin Central)</p>
              <ul className="list-disc pl-5 space-y-1 text-xs opacity-90">
                <li><strong className="text-blue-300 pointer-events-none">Aba de Tarefas Pessoais:</strong> Cada usuário visualiza apenas seus próprios quadros. Se o usuário não possuir nenhum, uma mensagem orienta o contato com a administração.</li>
                <li><strong className="text-blue-300 pointer-events-none">Monitoramento da Equipe:</strong> Gestores podem alternar entre a visão de qualquer usuário. O "Quadro Geral (Pendências)" exibe as tarefas de todos agrupadas.</li>
                <li><strong className="text-blue-300 pointer-events-none">Gerenciamento de Quadros:</strong> Localizado no menu lateral, permite criar, excluir, alternar visibilidade e renomear quadros da equipe.</li>
                <li><strong className="text-blue-300 pointer-events-none">Automação de Renovações:</strong> Renovações expiradas ou no prazo se convertem automaticamente em tarefas no quadro de quem as gerou, sem duplicidade.</li>
              </ul>
            </div>
          </div>
        )}

        {!selectedBoardId && boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="size-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
              <span className="material-symbols-outlined text-red-500 text-[32px]">warning_amber</span>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-white mb-1">Nenhum quadro encontrado</h3>
              <p className="text-slate-400 max-w-xs mx-auto">Entre em contato com a administração para criar ou habilitar um quadro de tarefas para você.</p>
            </div>
          </div>
        ) : selectedBoardId === 'lista-pendencias-global' ? (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
              <table className="w-full text-left">
                <thead className="bg-black/40 uppercase tracking-widest text-slate-500 font-black text-[10px]">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-xl w-[60px] text-center">Status</th>
                    <th className="px-6 py-4">Tarefa</th>
                    <th className="px-6 py-4">Projeto / Cliente</th>
                    <th className="px-6 py-4">Responsável</th>
                    <th className="px-6 py-4">Prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="flex flex-col items-center justify-center gap-4 opacity-40">
                          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Carregando...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-slate-500 font-black tracking-widest uppercase text-[10px] bg-black/10">
                        <div className="flex flex-col items-center gap-3 opacity-60">
                          <span className="material-symbols-outlined text-[32px]">task_alt</span>
                          Nenhuma tarefa pendente encontrada.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map((task: any) => {
                      const isExpired = task.expiration_date && new Date(task.expiration_date) < new Date();
                      const userName = task.user_profiles?.email?.split('@')[0] || 'Desconhecido';
                      const initials = userName.charAt(0).toUpperCase();

                      return (
                        <tr 
                          key={task.id} 
                          onClick={() => { setEditingTask(task); setIsModalOpen(true); }} 
                          className="hover:bg-white/[0.04] transition-colors cursor-pointer group bg-black/20"
                        >
                          <td className="px-6 py-4 text-center">
                            <span className={`material-symbols-outlined text-[18px] ${isExpired ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'text-slate-500 group-hover:text-primary transition-colors'}`}>
                              {isExpired ? 'warning' : 'assignment'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-black text-white text-[12px] group-hover:text-primary transition-colors">{task.title}</div>
                            {task.company_name && <div className="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">{task.company_name}</div>}
                          </td>
                          <td className="px-6 py-4">
                            {task.projects?.name ? (
                              <div className="bg-primary/10 text-primary border border-primary/20 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 font-black uppercase tracking-widest text-[9px] shadow-sm">
                                <span className="material-symbols-outlined text-[14px]">apartment</span>
                                {task.projects.name}
                              </div>
                            ) : (
                              <span className="text-slate-600 font-bold uppercase tracking-widest">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col gap-2">
                              {/* Dono / Criador */}
                              <div className="flex items-center gap-2" title="Dono do Quadro / Tarefa">
                                <div className="size-6 rounded-full bg-surface-dark border border-white/10 flex items-center justify-center text-[9px] font-black text-slate-400 shadow-inner">
                                  {initials}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[8px] font-bold text-slate-500 uppercase leading-none">Dono</span>
                                  <span className="text-slate-300 font-black uppercase tracking-widest text-[10px] truncate max-w-[120px]">{userName}</span>
                                </div>
                              </div>
                              
                              {/* Assignee / Responsável */}
                              {task.assignee_profile && (
                                <div className="flex items-center gap-2" title="Responsável pela Execução">
                                  <div className="size-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-[9px] font-black text-primary shadow-inner">
                                    {(task.assignee_profile?.email || '?').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-[8px] font-bold text-primary/70 uppercase leading-none">Resp. Executivo</span>
                                    <span className="text-primary font-black uppercase tracking-widest text-[10px] truncate max-w-[120px]">{task.assignee_profile.email.split('@')[0]}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {task.expiration_date ? (
                              <div className={`flex items-center gap-2 font-black uppercase tracking-widest text-[10px] ${isExpired ? 'text-red-400 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20 inline-flex' : 'text-slate-400'}`}>
                                <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                {new Date(task.expiration_date).toLocaleDateString()}
                              </div>
                            ) : (
                              <span className="text-slate-600 font-bold uppercase tracking-widest">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex h-full gap-6 min-w-max pb-3 px-4">
            {groups.map(group => {
            const groupTasks = filteredTasks.filter(t => {
              if (selectedBoardId === SYNC_BOARD_ID) {
                return `sync-user-${t.user_id}` === group.id;
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
                        onDoubleClick={() => handleRenameGroup(group.id)} // Double click to rename
                        title="Clique duas vezes para renomear"
                      >
                        {group.name}
                      </h3>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{groupTasks.length} {groupTasks.length === 1 ? 'Tarefa' : 'Tarefas'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleRenameGroup(group.id)} className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all">
                      <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onClick={() => handleDeleteGroup(group.id)} className="size-8 flex items-center justify-center hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-500 transition-all">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>

                <div
                  className={`${isCompact ? 'p-2 space-y-2' : 'p-3 space-y-3'} flex-1 overflow-y-auto bg-black/20 scrollbar-hide min-h-[200px]`}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
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

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={() => (window as any)._draggedTaskId = task.id}
                          onDragOver={e => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            const draggedTaskId = (window as any)._draggedTaskId;
                            if (draggedTaskId && draggedTaskId !== task.id) {
                              handleReorderTask(draggedTaskId, group.id, index);
                            }
                            (window as any)._draggedTaskId = null;
                          }}
                          onClick={() => {
                            setEditingTask(task);
                            setIsModalOpen(true);
                          }}
                          className={`bg-white/[0.03] rounded-xl border border-white/5 group shadow-lg transition-all relative cursor-pointer active:scale-[0.98] hover:border-primary/30 hover:bg-white/[0.05] hover:-translate-y-0.5 hover:z-10 ${isCompact ? 'p-3' : 'p-4'} ${isExpired ? 'border-red-500/30' : ''}`}
                        >
                          {/* Priority Color Indicator */}
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
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all -mr-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTask(task);
                                  setIsModalOpen(true);
                                }}
                                className="size-7 flex items-center justify-center hover:bg-primary/10 rounded-lg text-slate-500 hover:text-primary transition-all bg-white/5 border border-white/10 shadow-sm"
                                title="Editar"
                              >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                              </button>
                            </div>
                          </div>

                          <h4 className={`text-white font-bold leading-relaxed tracking-tight ${isCompact ? 'text-[12px]' : 'text-[13px] mb-2'}`}>{task.title}</h4>

                          {!isCompact && task.description && (
                            <p className="text-[11px] text-slate-400 line-clamp-2 mb-4 leading-relaxed opacity-60 font-medium">{task.description}</p>
                          )}

                          <div className="flex items-center justify-between pt-3 border-t border-white/5">
                            <div className="flex items-center gap-2">
                              {/* User Avatar Initial & Email Label - ALWAYS VISIBLE NOW */}
                              <div className="flex items-center gap-1.5" title={`Dono do Quadro: ${(task as any).user_profiles?.email}`}>
                                <div className="size-6 rounded-lg bg-surface-dark border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-400 shadow-inner">
                                  {initials}
                                </div>
                                <span className="text-[9px] font-bold text-slate-500 truncate max-w-[80px]">
                                  {(task as any).user_profiles?.email?.split('@')[0]}
                                </span>
                              </div>

                              {/* Assignee Avatar */}
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
                              {/* Checklist Indicator */}
                              {(task as any).checklist_progress && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 text-[9px] font-bold text-slate-400" title="Checklist">
                                  <span className="material-symbols-outlined text-[12px]">check_box</span>
                                  <span>{(task as any).checklist_progress}</span>
                                </div>
                              )}

                              {task.file_url && (
                                <a href={task.file_url} target="_blank" rel="noreferrer" className="size-6 flex items-center justify-center bg-primary/10 border border-primary/20 rounded-lg text-primary hover:bg-primary/20 transition-all">
                                  <span className="material-symbols-outlined text-[14px]">attachment</span>
                                  <span>Ver Detalhes?</span>
                                  {/* Just attachment for now, but user asked for "Ver Detalhes" button in card. 
                                      Maybe the edit button assumes that role? 
                                      Or I should add a specific button. 
                                  */}
                                </a>
                              )}

                              <div className="flex gap-1">
                                {['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'].map(c => (
                                  <button
                                    key={c}
                                    onClick={(e) => { e.stopPropagation(); handleUpdateTaskColor(task.id, c); }}
                                    className={`w-2 h-2 rounded-full ${c} ${task.label_color === c ? 'ring-2 ring-white scale-110 shadow-lg shadow-black/40' : 'opacity-20 hover:opacity-100 transition-all hover:scale-125'}`}
                                  />
                                ))}
                              </div>

                              {/* Move Action (Quick Menu) - Simplified to just Edit triggers modal which allows move, 
                                  User asked for "change status" action in card.
                                  Let's add a small dropdown/popover or just a 'Move' button that cycles? 
                                  Or a small select? A select might be too cramped.
                                  Let's add a "Quick Move" button that opens a mini-menu or just relies on Drag/Drop/Edit.
                                  User specified: "trocar o status do cardo, ver os detalhes do card"
                                  "Status" usually maps to Column.
                                  "Ver Detalhes" maps to opening the modal.
                              */}
                              <div className="relative ml-1">
                                <button
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setOpenMenuTaskId(openMenuTaskId === task.id ? null : task.id);
                                  }}
                                  className={`size-6 flex items-center justify-center rounded-lg transition-all ${openMenuTaskId === task.id ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-slate-500 hover:text-white'}`}
                                >
                                  <span className="material-symbols-outlined text-[16px]">more_vert</span>
                                </button>
                                {/* Dropdown Menu */}
                                <div className={`absolute right-0 top-full mt-2 w-40 bg-surface-dark border border-white/10 rounded-xl shadow-2xl p-1 transition-all z-50 flex flex-col gap-1 ${openMenuTaskId === task.id ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'}`}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingTask(task);
                                      setIsModalOpen(true);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 rounded-lg text-[10px] font-bold text-slate-300 hover:text-white text-left uppercase tracking-wider"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">visibility</span>
                                    Ver Detalhes
                                  </button>

                                  {/* Convert to Project Action */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConvertToProject(task);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-white/5 rounded-lg text-[10px] font-bold text-slate-300 hover:text-emerald-400 text-left uppercase tracking-wider"
                                    title="Transformar esta tarefa em um novo projeto"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">engineering</span>
                                    Virar Projeto
                                  </button>

                                  <div className="h-px bg-white/5 my-0.5"></div>
                                  <span className="text-[9px] font-black text-slate-600 px-3 py-1 uppercase tracking-widest">Mover para:</span>
                                  {groups.filter(g => g.id !== group.id).map(g => (
                                    <button
                                      key={g.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUpdateTaskGroup(task.id, g.id);
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-white/5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-white text-left truncate"
                                    >
                                      <span className="size-2 rounded-full bg-slate-500"></span>
                                      {g.name}
                                    </button>
                                  ))}

                                  <div className="h-px bg-white/5 my-0.5"></div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(task.id);
                                      setOpenMenuTaskId(null);
                                    }}
                                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-red-500/10 rounded-lg text-[10px] font-bold text-red-400 hover:text-red-300 text-left uppercase tracking-wider"
                                    title="Excluir esta tarefa"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                    Excluir Tarefa
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-4 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-primary hover:bg-primary/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border-2 border-dashed border-white/5 hover:border-primary/20 transition-all group/btn"
                  >
                    <div className="size-8 rounded-full bg-white/5 flex items-center justify-center group-hover/btn:bg-primary/20 transition-all">
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </div>
                    Nova Tarefa
                  </button>
                </div>
              </div>
            );
          })}

          {/* Add Group Column Placeholder */}
          {selectedBoardId && selectedBoardId !== SYNC_BOARD_ID && (
            <div className={`${isCompact ? 'w-[260px]' : 'w-[320px]'} shrink-0 h-full flex flex-col items-center justify-center px-8 border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.01] transition-all hover:bg-white/[0.03] hover:border-primary/20 group`}>
              <button
                onClick={handleAddGroup}
                className="flex flex-col items-center gap-5 text-slate-600 group-hover:text-primary transition-all active:scale-95 text-center"
              >
                <div className="size-16 rounded-full bg-white/5 flex items-center justify-center border-2 border-white/5 shadow-xl group-hover:border-primary/30 group-hover:bg-primary/10 group-hover:shadow-primary/5 transition-all">
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
                    {users.filter(u => u.id).map(u => (
                      <option key={u.id} value={u.id}>{u.email} {u.professional_title ? `(${u.professional_title})` : ''}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-1">Se não selecionado, o quadro será seu.</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddBoardModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newBoardName}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-bold disabled:opacity-50"
                >
                  Criar Quadro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <NewTaskModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSuccess={() => fetchData()}
        defaultGroupId={groups[0]?.id}
        boardId={selectedBoardId}
        taskToEdit={editingTask}
      />
    </div>
  );
};

export default TasksView;
