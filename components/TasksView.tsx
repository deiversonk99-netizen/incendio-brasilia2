
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import NewTaskModal from './NewTaskModal';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'PENDING' | 'BUYING' | 'INSTALLATION' | 'DONE';
  category: string;
  file_url: string;
  project_id: string;
  projects?: { name: string };
}

const TasksView: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchTasks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('*, projects(name)')
      .order('created_at', { ascending: false });

    if (data) setTasks(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    // Optimistic
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t));
    await supabase.from('tasks').update({ status: newStatus }).eq('id', id);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  }

  const columns = [
    { id: 'PENDING', label: 'Pendente', color: 'bg-slate-400' },
    { id: 'BUYING', label: 'Em Compra', color: 'bg-yellow-500' },
    { id: 'INSTALLATION', label: 'Instalação', color: 'bg-primary' },
    { id: 'DONE', label: 'Concluído', color: 'bg-green-500' },
  ];

  const filteredTasks = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.projects?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="relative z-10 px-8 py-6 flex flex-col gap-4 border-b border-[#46252c] bg-background-dark/80 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Gestão de Tarefas</h2>
            <p className="text-[#c7949f] text-sm mt-1">Acompanhe o fluxo de trabalho da equipe de engenharia e instalação.</p>
          </div>
          <div className="flex items-center gap-3">
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
        <div className="flex h-full gap-6 min-w-[1200px]">
          {columns.map(col => (
            <div key={col.id} className="flex flex-col w-80 shrink-0 h-full rounded-xl bg-surface-dark border border-[#46252c]/50 overflow-hidden">
              <div className="p-4 flex items-center justify-between border-b border-[#46252c]/50 bg-white/2">
                <div className="flex items-center gap-2">
                  <span className={`size-3 rounded-full ${col.color}`}></span>
                  <h3 className="font-bold text-white text-sm uppercase tracking-wide">{col.label}</h3>
                  <span className="bg-[#211115] text-[#c7949f] text-xs font-bold px-2 py-0.5 rounded-full">
                    {filteredTasks.filter(t => t.status === col.id).length}
                  </span>
                </div>
              </div>

              <div className="p-3 flex-1 overflow-y-auto space-y-3 bg-black/10">
                {loading ? (
                  <div className="text-center text-slate-500 py-10 text-xs">Carregando...</div>
                ) : filteredTasks.filter(t => t.status === col.id).length === 0 ? (
                  <div className="text-center text-slate-600 py-10 text-xs italic">Sem tarefas</div>
                ) : (
                  filteredTasks.filter(t => t.status === col.id).map(task => (
                    <div key={task.id} className="bg-card-dark p-4 rounded-xl border border-[#46252c] group shadow-sm hover:border-primary/40 transition-all">
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

                      <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/5">
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
                        <select
                          className="bg-transparent text-[10px] text-slate-500 outline-none cursor-pointer hover:text-white"
                          value={task.status}
                          onChange={(e) => handleUpdateStatus(task.id, e.target.value)}
                        >
                          {columns.map(c => <option key={c.id} value={c.id} className="bg-surface-dark">{c.label}</option>)}
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
                  Adicionar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <NewTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchTasks()}
      />
    </div>
  );
};

export default TasksView;
