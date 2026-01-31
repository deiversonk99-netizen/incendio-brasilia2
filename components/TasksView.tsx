
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NewTaskModal from './NewTaskModal';
import { useAuth } from '../contexts/AuthContext';
import { isTaskCentralUser } from '../lib/permissions';

const SYNC_BOARD_ID = 'central-sync';

interface TaskBoard {
  id: string;
  name: string;
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
}

const TasksView: React.FC = () => {
  const { user } = useAuth();
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCompact, setIsCompact] = useState(false);

  const isCentral = isTaskCentralUser(user?.email);

  const fetchData = async () => {
    setLoading(true);

    // 1. Fetch Boards
    const { data: boardsData } = await supabase
      .from('task_boards')
      .select('*')
      .order('name');

    if (boardsData) {
      let finalBoards = [...boardsData];
      if (isCentral) {
        finalBoards.push({ id: SYNC_BOARD_ID, name: '🔄 Sincronização - Todos os Usuários' });
      }
      setBoards(finalBoards);

      // If no board is selected, pick the first one
      if (!selectedBoardId && finalBoards.length > 0) {
        setSelectedBoardId(finalBoards[0].id);
        setLoading(false);
        return;
      }
    }

    if (!selectedBoardId) {
      setLoading(false);
      return;
    }

    // Special Sync Board Handling
    if (selectedBoardId === SYNC_BOARD_ID) {
      const { data: syncData } = await supabase
        .from('tasks')
        .select(`
          *, 
          projects(name), 
          user_profiles:user_id(email)
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (syncData) setTasks(syncData as any);

      setGroups([{
        id: 'sync-group-all',
        name: 'Pendentes (Geral)',
        color: 'bg-primary',
        order_index: 0,
        board_id: SYNC_BOARD_ID
      }]);

      setLoading(false);
      return;
    }

    // 2. Fetch Groups for Selected Board
    const { data: groupsData } = await supabase
      .from('task_groups')
      .select('*')
      .eq('board_id', selectedBoardId)
      .order('order_index', { ascending: true });

    console.log('Groups Data:', groupsData);

    if (groupsData) setGroups(groupsData);

    // 3. Fetch Tasks
    const groupIds = groupsData?.map(g => g.id) || [];
    console.log('Group IDs:', groupIds);

    let query = supabase
      .from('tasks')
      .select('*, projects(name), user_profiles:user_id(email)')
      .in('group_id', groupIds) // Only tasks in current board columns
      .order('order_index', { ascending: true });

    const { data: tasksData, error: tasksError } = await query;

    if (tasksError) console.error('Tasks Fetch Error:', tasksError);
    console.log('Tasks Data:', tasksData);

    if (tasksData) setTasks(tasksData as any);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user, selectedBoardId]);

  const handleUpdateTaskGroup = async (taskId: string, groupId: string) => {
    // Optimistic
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, group_id: groupId } : t));
    await supabase.from('tasks').update({ group_id: groupId }).eq('id', taskId);
  };

  const handleUpdateTaskColor = async (taskId: string, color: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, label_color: color } : t));
    await supabase.from('tasks').update({ label_color: color }).eq('id', taskId);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Deseja excluir este grupo e todas as suas tarefas?')) return;
    setGroups(prev => prev.filter(g => g.id !== groupId));
    await supabase.from('tasks').delete().eq('group_id', groupId);
    await supabase.from('task_groups').delete().eq('id', groupId);
  };

  const handleRenameGroup = async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    const newName = prompt('Novo nome do grupo:', group?.name);
    if (!newName || newName === group?.name) return;

    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g));
    await supabase.from('task_groups').update({ name: newName }).eq('id', groupId);
  };

  const handleRenameBoard = async () => {
    if (!selectedBoardId || selectedBoardId === SYNC_BOARD_ID) return;
    const board = boards.find(b => b.id === selectedBoardId);
    const newName = prompt('Novo nome do quadro:', board?.name);
    if (!newName || newName === board?.name) return;

    setBoards(prev => prev.map(b => b.id === selectedBoardId ? { ...b, name: newName } : b));
    await supabase.from('task_boards').update({ name: newName }).eq('id', selectedBoardId);
  };

  const handleDeleteBoard = async () => {
    if (!selectedBoardId || selectedBoardId === SYNC_BOARD_ID) return;
    if (!confirm('Deseja excluir este QUADRO INTEIRO? Esta ação não pode ser desfeita.')) return;

    setLoading(true);
    await supabase.from('tasks').delete().in('group_id', groups.map(g => g.id));
    await supabase.from('task_groups').delete().eq('board_id', selectedBoardId);
    await supabase.from('task_boards').delete().eq('id', selectedBoardId);

    setBoards(prev => prev.filter(b => b.id !== selectedBoardId));
    setSelectedBoardId('');
    setLoading(false);
  };

  const handleReorderTask = async (taskId: string, targetGroupId: string, targetIndex: number) => {
    const taskToMove = tasks.find(t => t.id === taskId);
    if (!taskToMove) return;

    const otherTasks = tasks.filter(t => t.id !== taskId);

    // Add to the new group at specific index
    const groupTasks = otherTasks.filter(t => t.group_id === targetGroupId);
    groupTasks.splice(targetIndex, 0, { ...taskToMove, group_id: targetGroupId });

    // Update indexes for all in this group
    const updatedGroupTasks = groupTasks.map((t, idx) => ({ ...t, order_index: idx }));

    const finalTasks = [
      ...otherTasks.filter(t => t.group_id !== targetGroupId),
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

  const handleAddBoard = async () => {
    const name = prompt('Nome do novo Quadro (Workflow):');
    if (!name) return;

    try {
      const { data: boardData, error: boardError } = await supabase.from('task_boards').insert({
        name,
        user_id: user?.id
      }).select().single();

      if (boardError) throw boardError;

      if (boardData) {
        // Create a default column for the new board
        await supabase.from('task_groups').insert({
          name: 'Pendentes',
          color: 'bg-primary',
          order_index: 0,
          board_id: boardData.id,
          user_id: user?.id
        });

        setBoards([...boards, boardData]);
        setSelectedBoardId(boardData.id);
      }
    } catch (error: any) {
      console.error('Error adding board:', error);
      alert('Erro ao criar quadro: ' + error.message);
    }
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.projects?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="relative z-10 px-8 py-6 flex flex-col gap-6 border-b border-white/5 bg-background-dark/40 backdrop-blur-md">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <span className="material-symbols-outlined text-primary text-[24px]">task_alt</span>
              </div>
              Gestão de Tarefas
            </h2>
            <div className="flex items-center gap-3">
              <div className="relative group">
                <select
                  className="appearance-none bg-white/5 hover:bg-white/10 text-primary text-[10px] font-black border border-white/5 rounded-full px-4 py-1.5 outline-none cursor-pointer transition-all uppercase tracking-widest pl-4 pr-8"
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                >
                  {boards.map(b => (
                    <option key={b.id} value={b.id} className="bg-surface-dark text-white uppercase text-[10px] font-black">{b.name}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[14px] text-primary/60 pointer-events-none group-hover:text-primary transition-colors">expand_more</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-white/10"></span>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.15em] hidden sm:inline">Controle de fluxos e processos</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Board Management Tools */}
            {isCentral && selectedBoardId !== SYNC_BOARD_ID && (
              <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
                <button
                  onClick={handleRenameBoard}
                  className="flex items-center justify-center rounded-lg w-9 h-9 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                  title="Renomear Quadro"
                >
                  <span className="material-symbols-outlined text-[20px]">edit_note</span>
                </button>
                <button
                  onClick={handleDeleteBoard}
                  className="flex items-center justify-center rounded-lg w-9 h-9 hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-all"
                  title="Excluir Quadro"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            )}

            {/* View Controls */}
            <div className="flex items-center gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
              <button
                onClick={() => setIsCompact(!isCompact)}
                className={`flex items-center justify-center gap-2 rounded-lg h-9 px-4 transition-all text-[10px] font-black uppercase tracking-widest ${isCompact ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
              >
                <span className="material-symbols-outlined text-[18px]">{isCompact ? 'view_kanban' : 'view_headline'}</span>
                <span>{isCompact ? 'Ver Padrão' : 'Ver Compacto'}</span>
              </button>
              {isCentral && (
                <button
                  onClick={handleAddBoard}
                  className="flex items-center justify-center gap-2 rounded-lg h-9 px-4 transition-all text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5"
                >
                  <span className="material-symbols-outlined text-[18px]">add_box</span>
                  <span>Novo Quadro</span>
                </button>
              )}
            </div>

            {/* Search & Action */}
            <div className="flex items-center gap-3">
              <div className="relative group">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-500 group-focus-within:text-primary transition-colors">search</span>
                <input
                  className="bg-white/5 border border-white/5 text-white text-[11px] font-medium rounded-xl block w-56 pl-10 pr-4 py-2.5 outline-none focus:border-primary/50 focus:bg-white/10 transition-all shadow-inner"
                  placeholder="Buscar tarefa ou projeto..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center justify-center gap-2 rounded-xl h-10 px-6 bg-primary hover:bg-red-600 text-white text-[11px] font-black uppercase tracking-[0.15em] transition-all shadow-xl shadow-primary/20 active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">add</span>
                <span>Nova Tarefa</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4 z-10">
        <div className="flex h-full gap-6 min-w-max pb-3 px-4">
          {groups.map(group => {
            const groupTasks = filteredTasks.filter(t => selectedBoardId === SYNC_BOARD_ID ? true : t.group_id === group.id);
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
                      <h3 className="font-black text-white text-[11px] uppercase tracking-[0.1em]">{group.name}</h3>
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
                          className={`bg-white/[0.03] rounded-xl border border-white/5 group shadow-lg transition-all relative overflow-hidden cursor-grab active:cursor-grabbing hover:border-primary/30 hover:bg-white/[0.05] hover:-translate-y-0.5 ${isCompact ? 'p-3' : 'p-4'} ${isExpired ? 'border-red-500/30' : ''}`}
                        >
                          {/* Priority Color Indicator */}
                          {task.label_color && task.label_color !== 'transparent' && (
                            <div className={`absolute top-0 right-0 w-1.5 h-full ${task.label_color}`}></div>
                          )}

                          {isExpired && (
                            <div className="absolute top-0 left-0 w-full h-[3px] bg-red-500 animate-pulse"></div>
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
                                className="size-7 flex items-center justify-center hover:bg-primary/10 rounded-lg text-slate-500 hover:text-primary transition-all"
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
                              {/* User Avatar Initial */}
                              <div className="size-6 rounded-lg bg-surface-dark border border-white/10 flex items-center justify-center text-[10px] font-black text-slate-400 shadow-inner" title={(task as any).user_profiles?.email}>
                                {initials}
                              </div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#c7949f] opacity-40">
                                {task.category}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              {task.file_url && (
                                <a href={task.file_url} target="_blank" rel="noreferrer" className="size-6 flex items-center justify-center bg-primary/10 border border-primary/20 rounded-lg text-primary hover:bg-primary/20 transition-all">
                                  <span className="material-symbols-outlined text-[14px]">attachment</span>
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
          {isCentral && selectedBoardId && selectedBoardId !== SYNC_BOARD_ID && (
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
      </div>

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
