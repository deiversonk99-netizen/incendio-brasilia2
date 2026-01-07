
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NewTaskModal from './NewTaskModal';
import { useAuth } from '../contexts/AuthContext';
import { isTaskCentralUser } from '../lib/permissions';

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
  projects?: { name: string };
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

  const isCentral = isTaskCentralUser(user?.email);

  const fetchData = async () => {
    setLoading(true);

    // 1. Fetch Boards
    const { data: boardsData } = await supabase
      .from('task_boards')
      .select('*')
      .order('name');

    if (boardsData) {
      setBoards(boardsData);
      // If no board is selected, pick the first one (usually 'Quadro Geral' based on migration)
      if (!selectedBoardId && boardsData.length > 0) {
        setSelectedBoardId(boardsData[0].id);
        // We'll let the useEffect handle the groups/tasks fetch on selectedBoardId change
        setLoading(false);
        return;
      }
    }

    if (!selectedBoardId) {
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
      .select('*, projects(name)')
      .in('group_id', groupIds) // Only tasks in current board columns
      .order('created_at', { ascending: false });

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
      <header className="relative z-10 px-8 py-6 flex flex-col gap-4 border-b border-[#46252c] bg-background-dark/80 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-white tracking-tight">Gestão de Tarefas</h2>
            <div className="flex items-center gap-2 mt-1">
              <select
                className="bg-transparent text-primary text-sm font-bold border-none outline-none cursor-pointer hover:bg-white/5 rounded px-1 -ml-1"
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
              >
                {boards.map(b => (
                  <option key={b.id} value={b.id} className="bg-surface-dark text-white">{b.name}</option>
                ))}
              </select>
              <div className="w-1 h-1 rounded-full bg-white/20"></div>
              <p className="text-[#c7949f] text-sm">Gerencie seus fluxos de trabalho e processos.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isCentral && (
              <button
                onClick={handleAddBoard}
                className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">view_kanban</span>
                <span>Novo Quadro</span>
              </button>
            )}
            <input
              className="bg-[#2d1b20] border border-[#46252c] text-white text-sm rounded-lg block w-64 p-2.5 outline-none focus:border-primary transition-colors"
              placeholder="Buscar tarefas..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-primary hover:bg-red-600 text-white text-sm font-bold transition-all shadow-lg shadow-primary/20"
            >
              <span className="material-symbols-outlined">add</span>
              <span>Nova Tarefa</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-x-auto p-6 z-10">
        <div className="flex h-full gap-6 min-w-max pb-4">
          {groups.map(group => (
            <div key={group.id} className="flex flex-col w-80 shrink-0 h-full rounded-xl bg-surface-dark border border-[#46252c]/50 overflow-hidden shadow-xl">
              <div className="p-4 flex items-center justify-between border-b border-[#46252c]/50 bg-white/2">
                <div className="flex items-center gap-2">
                  <span className={`size-3 rounded-full ${group.color || 'bg-slate-500'}`}></span>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">{group.name}</h3>
                  <span className="bg-[#211115] text-[#c7949f] text-xs font-bold px-2 py-0.5 rounded-full">
                    {filteredTasks.filter(t => t.group_id === group.id).length}
                  </span>
                </div>
              </div>

              <div className="p-3 flex-1 overflow-y-auto space-y-3 bg-black/10 scrollbar-hide">
                {loading ? (
                  <div className="text-center text-slate-500 py-10 text-xs">Carregando...</div>
                ) : filteredTasks.filter(t => t.group_id === group.id).length === 0 ? (
                  <div className="text-center text-slate-600 py-10 text-xs italic">Sem tarefas</div>
                ) : (
                  filteredTasks.filter(t => t.group_id === group.id).map(task => (
                    <div
                      key={task.id}
                      className={`bg-card-dark p-4 rounded-xl border border-[#46252c] group shadow-sm hover:border-primary/40 transition-all relative overflow-hidden`}
                    >
                      {/* Color Tag Indicator */}
                      {task.label_color && task.label_color !== 'transparent' && (
                        <div className={`absolute top-0 right-0 w-2 h-full ${task.label_color}`}></div>
                      )}

                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded truncate max-w-[120px]">
                          {task.projects?.name || 'Projeto Avulso'}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleDelete(task.id)} className="text-slate-500 hover:text-red-400">
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <h4 className="text-white text-sm font-semibold mb-2 leading-snug">{task.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3">{task.description}</p>

                      <div className="flex flex-col gap-3 mt-2 pt-3 border-t border-white/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-[#211115] text-[#c7949f] text-[10px] px-2 py-0.5 rounded border border-[#46252c]">
                              {task.category}
                            </span>
                            {task.file_url && (
                              <a href={task.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[10px] flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">attach_file</span>
                                Anexo
                              </a>
                            )}
                          </div>

                          {/* Color Selector Mini */}
                          <div className="flex gap-1">
                            {['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'].map(c => (
                              <button
                                key={c}
                                onClick={() => handleUpdateTaskColor(task.id, c)}
                                className={`w-2 h-2 rounded-full ${c} ${task.label_color === c ? 'ring-1 ring-white' : 'opacity-40 hover:opacity-100'}`}
                              />
                            ))}
                            <button
                              onClick={() => handleUpdateTaskColor(task.id, 'transparent')}
                              className={`w-2 h-2 rounded-full border border-white/20 ${!task.label_color || task.label_color === 'transparent' ? 'bg-white/40' : 'opacity-40'}`}
                            />
                          </div>
                        </div>

                        <select
                          className="bg-surface-dark border border-white/5 text-[10px] text-slate-300 rounded px-2 py-1 outline-none cursor-pointer hover:border-primary transition-all"
                          value={task.group_id || ''}
                          onChange={(e) => handleUpdateTaskGroup(task.id, e.target.value)}
                        >
                          <option value="" disabled>Mover para...</option>
                          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                      </div>
                    </div>
                  ))
                )}

                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-full py-3 flex items-center justify-center gap-2 text-[#c7949f] hover:text-white hover:bg-[#211115] rounded-xl text-sm font-medium border border-dashed border-[#46252c] transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Adicionar Tarefa
                </button>
              </div>
            </div>
          ))}

          {/* New Group Column */}
          {isCentral && (
            <button
              onClick={handleAddGroup}
              className="w-80 shrink-0 h-full rounded-xl border-2 border-dashed border-[#46252c] hover:border-primary/40 hover:bg-white/2 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-primary transition-all group"
            >
              <span className="material-symbols-outlined text-[32px] group-hover:scale-110 transition-transform">add_circle</span>
              <span className="font-bold uppercase tracking-wider text-xs">Adicionar Grupo</span>
            </button>
          )}
        </div>
      </div>

      <NewTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchData()}
        defaultGroupId={groups[0]?.id}
        boardId={selectedBoardId}
      />
    </div>
  );
};

export default TasksView;
