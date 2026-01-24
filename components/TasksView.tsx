
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

    if (groupsData) setGroups(groupsData);

    // 3. Fetch Tasks
    const groupIds = groupsData?.map(g => g.id) || [];

    let query = supabase
      .from('tasks')
      .select('*, projects(name), user_profiles:user_id(email)')
      .in('group_id', groupIds) // Only tasks in current board columns
      .order('order_index', { ascending: true });

    const { data: tasksData } = await query;
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
    if (!selectedBoardId) return;
    const name = prompt('Nome do novo grupo:');
    if (!name) return;

    const { data, error } = await supabase.from('task_groups').insert({
      name,
      color: 'bg-slate-400',
      order_index: groups.length,
      board_id: selectedBoardId,
      user_id: user?.id
    }).select().single();

    if (data) setGroups([...groups, data]);
  };

  const handleAddBoard = async () => {
    const name = prompt('Nome do novo Quadro (Workflow):');
    if (!name) return;

    const { data, error } = await supabase.from('task_boards').insert({
      name,
      user_id: user?.id
    }).select().single();

    if (data) {
      setBoards([...boards, data]);
      setSelectedBoardId(data.id);
    }
  };

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.projects?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="relative z-10 px-6 py-4 flex flex-col gap-3 border-b border-[#46252c] bg-background-dark/80 backdrop-blur-sm">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">task_alt</span>
              Gestão de Tarefas
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                className="bg-transparent text-primary text-xs font-black border-none outline-none cursor-pointer hover:bg-white/5 rounded px-1 -ml-1 uppercase tracking-tighter"
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
              >
                {boards.map(b => (
                  <option key={b.id} value={b.id} className="bg-surface-dark text-white uppercase text-xs font-black">{b.name}</option>
                ))}
              </select>
              <div className="w-1 h-1 rounded-full bg-white/20"></div>
              <p className="text-[#c7949f] text-[11px] font-medium opacity-60 hidden sm:inline">Controle de fluxos e processos</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isCentral && selectedBoardId !== SYNC_BOARD_ID && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleRenameBoard}
                  className="flex items-center justify-center rounded-lg w-10 h-10 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
                  title="Renomear Quadro"
                >
                  <span className="material-symbols-outlined text-[20px]">edit_note</span>
                </button>
                <button
                  onClick={handleDeleteBoard}
                  className="flex items-center justify-center rounded-lg w-10 h-10 bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-all ml-1"
                  title="Excluir Quadro Atual"
                >
                  <span className="material-symbols-outlined text-[20px]">delete</span>
                </button>
              </div>
            )}
            <button
              onClick={() => setIsCompact(!isCompact)}
              className={`flex items-center justify-center gap-2 rounded-lg h-9 px-3 transition-all text-[11px] font-black uppercase tracking-widest ${isCompact ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/5 text-slate-400 hover:text-white'}`}
            >
              <span className="material-symbols-outlined text-[18px]">{isCompact ? 'density_medium' : 'density_small'}</span>
              <span>{isCompact ? 'Normal' : 'Compacta'}</span>
            </button>
            {isCentral && (
              <button
                onClick={handleAddBoard}
                className="flex items-center justify-center gap-2 rounded-lg h-9 px-3 bg-white/2 border border-white/5 hover:bg-white/10 text-white text-[11px] font-black uppercase tracking-widest transition-all"
              >
                <span className="material-symbols-outlined text-[18px]">view_kanban</span>
                <span>Novo Quadro</span>
              </button>
            )}
            <input
              className="bg-[#2d1b20]/50 border border-[#46252c] text-white text-xs rounded-lg block w-48 p-2.5 outline-none focus:border-primary transition-all shadow-inner"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg h-9 px-4 bg-primary hover:bg-red-600 text-white text-[11px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Nova</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-4 z-10">
        <div className="flex h-full gap-4 min-w-max pb-3">
          {groups.map(group => {
            const groupTasks = filteredTasks.filter(t => selectedBoardId === SYNC_BOARD_ID ? true : t.group_id === group.id);
            return (
              <div key={group.id} className="flex flex-col w-72 shrink-0 h-full rounded-xl bg-surface-dark border border-[#46252c]/50 overflow-hidden shadow-xl">
                <div className="p-3.5 flex items-center justify-between border-b border-[#46252c]/50 bg-white/2">
                  <div className="flex items-center gap-1.5">
                    <span className={`size-2 rounded-full ${group.color || 'bg-slate-500'} shadow-sm`}></span>
                    <h3 className="font-black text-white text-[10px] uppercase tracking-widest">{group.name}</h3>
                    <span className="bg-black/30 border border-white/5 text-primary text-[9px] font-black px-1.5 py-0.5 rounded ml-1 min-w-[20px] text-center">
                      {groupTasks.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleRenameGroup(group.id)} className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-white transition-all">
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button onClick={() => handleDeleteGroup(group.id)} className="p-1 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-500 transition-all">
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                </div>

                <div
                  className="p-2 flex-1 overflow-y-auto space-y-2 bg-black/10 scrollbar-hide min-h-[100px]"
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    const draggedTaskId = (window as any)._draggedTaskId;
                    if (draggedTaskId) handleReorderTask(draggedTaskId, group.id, groupTasks.length);
                    (window as any)._draggedTaskId = null;
                  }}
                >
                  {loading ? (
                    <div className="text-center text-slate-500 py-10 text-[10px] font-black uppercase tracking-tighter animate-pulse">Carregando...</div>
                  ) : groupTasks.length === 0 ? (
                    <div className="text-center text-slate-600/40 py-10 text-[10px] font-black uppercase tracking-widest italic">Sem tarefas</div>
                  ) : (
                    groupTasks.map((task, index) => {
                      const isExpired = task.expiration_date && new Date(task.expiration_date) < new Date();
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
                          className={`bg-[#2c1a1e] rounded-lg border border-[#46252c] group shadow-sm transition-all relative overflow-hidden cursor-grab active:cursor-grabbing hover:border-primary/40 ${isCompact ? 'p-2' : 'p-2.5'} ${isExpired ? 'border-red-500/30' : ''}`}
                        >
                          {/* Priority Color Indicator */}
                          {task.label_color && task.label_color !== 'transparent' && (
                            <div className={`absolute top-0 right-0 w-1 h-full ${task.label_color}`}></div>
                          )}

                          {isExpired && (
                            <div className="absolute top-0 left-0 w-full h-[2px] bg-red-500 animate-pulse"></div>
                          )}

                          <div className="flex justify-between items-start mb-1">
                            {!isCompact && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#c7949f] opacity-40 truncate flex-1">
                                {task.projects?.name || 'Avulso'}
                              </span>
                            )}
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTask(task);
                                  setIsModalOpen(true);
                                }}
                                className="size-5 flex items-center justify-center hover:bg-primary/10 rounded text-slate-500 hover:text-primary transition-all"
                                title="Editar"
                              >
                                <span className="material-symbols-outlined text-[14px]">edit</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(task.id);
                                }}
                                className="size-5 flex items-center justify-center hover:bg-red-500/10 rounded text-slate-500 hover:text-red-500 transition-all"
                                title="Excluir"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </div>
                          </div>

                          <h4 className={`text-white font-bold leading-tight tracking-tight ${isCompact ? 'text-[11px]' : 'text-xs mb-1'}`}>{task.title}</h4>

                          {!isCompact && task.description && (
                            <p className="text-[10px] text-slate-400 line-clamp-1 mb-2 leading-tight opacity-60 italic">{task.description}</p>
                          )}

                          {!isCompact && (
                            <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-white/5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="bg-black/40 text-[#c7949f] text-[8px] font-black px-1.5 py-0.5 rounded border border-white/5 uppercase tracking-tighter">
                                    {task.category}
                                  </span>
                                  {task.file_url && (
                                    <a href={task.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[8px] font-black uppercase flex items-center gap-0.5">
                                      <span className="material-symbols-outlined text-[12px]">attach_file</span>
                                      Doc
                                    </a>
                                  )}
                                </div>

                                <div className="flex gap-0.5">
                                  {['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'].map(c => (
                                    <button
                                      key={c}
                                      onClick={(e) => { e.stopPropagation(); handleUpdateTaskColor(task.id, c); }}
                                      className={`w-1.5 h-1.5 rounded-full ${c} ${task.label_color === c ? 'ring-1 ring-white' : 'opacity-20 hover:opacity-100'}`}
                                    />
                                  ))}
                                </div>
                              </div>

                              {(task as any).user_profiles?.email && (
                                <div className="flex items-center gap-1 text-[8px] font-black text-slate-600 uppercase tracking-widest mt-0.5">
                                  <span className="material-symbols-outlined text-[12px] opacity-40">person</span>
                                  <span>{(task as any).user_profiles.email.split('@')[0]}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-2 flex items-center justify-center gap-2 text-slate-500 hover:text-white hover:bg-white/2 rounded-lg text-[9px] font-black uppercase tracking-widest border border-dashed border-[#46252c]/50 transition-all opacity-40 hover:opacity-100"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Novo Card
                  </button>
                </div>
              </div>
            );
          })}
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
