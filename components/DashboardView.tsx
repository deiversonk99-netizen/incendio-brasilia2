
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageHeader from './PageHeader';
import NewProjectModal from './NewProjectModal';
import ProjectDetailsModal from './ProjectDetailsModal';
import { supabase } from '../lib/supabase';
import { Project, AppView } from '../types';
import { Button, Card } from './ui';

interface Task {
  id: string;
  title: string;
  completed: boolean;
}

interface DashboardViewProps {
  onViewChange: (view: AppView) => void;
  onSelectProject: (id: string) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ onViewChange, onSelectProject }) => {
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterClient, setFilterClient] = useState('ALL');

  // Real Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [chartData, setChartData] = useState<{ name: string, real: number }[]>([]);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight.trim()) return <span>{text}</span>;
    const words = highlight.split(/\s+/).filter(w => w.length > 0);
    const regex = new RegExp(`(${words.join('|')})`, 'gi');
    const parts = text.split(regex);
    return (
      <span>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-primary/30 text-white rounded px-0.5 border-b border-primary/50 font-bold">{part}</mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  const fetchData = async () => {
    setLoading(true);

    // 1. Projects
    const { data: projData } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (projData) {
      setProjects(projData as Project[]);

      // Calculate Chart Data
      const monthlyData: Record<string, number> = {};
      const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

      // Initialize months
      months.forEach(m => monthlyData[m] = 0);

      projData.forEach((p: any) => {
        if (p.created_at) {
          const date = new Date(p.created_at);
          const monthName = months[date.getMonth()];
          monthlyData[monthName] += Number(p.value || 0);
        }
      });

      const formattedChartData = months.map(m => ({
        name: m,
        real: monthlyData[m]
      }));
      setChartData(formattedChartData);
    }

    // 2. Tasks
    const { data: taskData } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
    if (taskData) setTasks(taskData);
    else {
      // Fallback/Seed if table empty/not exists yet just for UI stability initially? 
      // No, let's assume migration ran. If not, array is empty.
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleTaskToggle = async (id: string, currentStatus: boolean) => {
    // Optimistic
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !currentStatus } : t));
    await supabase.from('tasks').update({ completed: !currentStatus }).eq('id', id);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const { data } = await supabase.from('tasks').insert({ title: newTaskTitle }).select();
    if (data) {
      setTasks(prev => [data[0], ...prev]);
      setNewTaskTitle('');
    }
  };

  const handleDeleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  }

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setIsDetailsModalOpen(true);
  };

  // KPI Calculations
  const activeProjects = projects.filter(p => p.status === 'EXECUTION' || p.status === 'ANALYSIS').length;
  const pendingQuotes = projects.filter(p => p.status === 'ANALYSIS').length;
  const totalValue = projects.reduce((acc, curr) => acc + Number(curr.value || 0), 0);

  const columns = [
    { id: 'ANALYSIS', label: 'Em Análise', color: 'bg-blue-400', shadow: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]' },
    { id: 'APPROVED', label: 'Aprovado', color: 'bg-yellow-400', shadow: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]' },
    { id: 'EXECUTION', label: 'Execução', color: 'bg-primary', shadow: 'shadow-[0_0_8px_rgba(226,29,72,0.6)]' },
    { id: 'DONE', label: 'Concluído', color: 'bg-emerald-400', shadow: 'shadow-[0_0_8px_rgba(52,211,153,0.6)]' },
  ];

  const uniqueClients = Array.from(new Set(projects.map(p => p.client))).sort();

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="mx-auto max-w-[1600px] flex flex-col gap-8">
          <PageHeader
            title="Visão Geral"
            subtitle="Resumo de operações e desempenho da Incêndio Brasília"
            actions={
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => onViewChange(AppView.ENGINEERING_PHASE_C)}
                >
                  <span className="material-symbols-outlined mr-2 text-sky-400">description</span>
                  Fase C - Proposta
                </Button>
                <Button
                  onClick={() => setIsNewProjectModalOpen(true)}
                >
                  <span className="material-symbols-outlined mr-2">add</span>
                  Novo Projeto
                </Button>
              </div>
            }
          />

          {/* KPI Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Projetos Ativos', val: activeProjects.toString(), trend: 'Atualizado agora', icon: 'engineering', color: 'emerald' },
              { label: 'Cotações Pendentes', val: pendingQuotes.toString(), trend: 'Prioridade alta', icon: 'pending_actions', color: 'slate' },
              { label: 'Valor Global', val: `R$ ${(totalValue / 1000).toFixed(1)}k`, trend: 'Total Acumulado', icon: 'payments', color: 'emerald' },
              { label: 'Lucro Projetado', val: 'R$ --', trend: 'Requer dados fin.', icon: 'insights', color: 'orange' },
            ].map((kpi, idx) => (
              <div key={idx} className="ds-card p-6 relative overflow-hidden group">
                <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-primary">
                    <span className="material-symbols-outlined">{kpi.icon}</span>
                  </div>
                </div>
                <dt className="ds-label">{kpi.label}</dt>
                <dd className="mt-2 text-3xl font-black text-white tracking-tight">{kpi.val}</dd>
                <div className={`mt-2 flex items-center text-[10px] font-bold uppercase tracking-wider ${kpi.trend.includes('total') ? 'text-slate-400' : 'text-emerald-500'}`}>
                  {kpi.trend}
                </div>
              </div>
            ))}
          </div>

          {/* Charts and Tasks Row */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <Card
              className="lg:col-span-2"
              title="Valor Global de Projetos (YTD)"
              description="Total acumulado de projetos criados por mês"
            >
              <div className="h-64 w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" stroke="var(--color-neutral-500)" fontSize={11} fontWeight="bold" tickLine={false} axisLine={false} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255, 255, 255, 0.05)" />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                      itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                    />
                    <Area type="monotone" dataKey="real" stroke="var(--color-primary)" fillOpacity={1} fill="url(#colorReal)" strokeWidth={4} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Micro Tasks - Functional */}
            <Card
              title="Tarefas Rápidas"
              description={`${tasks.filter(t => !t.completed).length} pendentes`}
              className="flex flex-col"
            >
              <form onSubmit={handleAddTask} className="flex gap-2 mb-6 mt-4">
                <input
                  className="ds-input flex-1 py-2"
                  placeholder="Adicionar tarefa..."
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                />
                <Button type="submit" size="sm" className="px-3">
                  <span className="material-symbols-outlined">add</span>
                </Button>
              </form>

              <div className="flex-1 space-y-3 overflow-y-auto max-h-[200px] custom-scrollbar pr-2">
                {tasks.length === 0 && <p className="text-slate-500 text-[10px] uppercase font-bold italic text-center py-4">Nenhuma tarefa</p>}
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 group relative bg-white/[0.02] p-2 rounded-lg border border-white/5 hover:border-white/10 transition-all">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => handleTaskToggle(task.id, task.completed)}
                      className="h-4 w-4 rounded border-slate-600 bg-white/5 text-primary accent-primary cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold text-white truncate transition-all ${task.completed ? 'line-through opacity-30 italic' : ''}`}>
                        {task.title}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-500 transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Kanban Board */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 px-1 gap-4">
              <h3 className="text-lg font-bold text-white">Gestão de Projetos</h3>

              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1 min-w-[200px] md:max-w-[300px]">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                  <input
                    type="text"
                    placeholder="Procurar projeto ou cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-surface-dark border border-white/10 rounded-xl py-2 pl-10 pr-10 text-sm text-white placeholder:text-slate-600 focus:border-primary outline-none transition-all shadow-sm"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="appearance-none bg-surface-dark border border-white/10 rounded-xl py-2 pl-4 pr-10 text-sm text-white focus:border-primary outline-none transition-all cursor-pointer min-w-[140px]"
                    >
                      <option value="ALL">Todos os Tipos</option>
                      <option value="business">Comercial</option>
                      <option value="factory">Industrial</option>
                      <option value="residential">Residencial</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[18px]">expand_more</span>
                  </div>

                  <div className="relative">
                    <select
                      value={filterClient}
                      onChange={(e) => setFilterClient(e.target.value)}
                      className="appearance-none bg-surface-dark border border-white/10 rounded-xl py-2 pl-4 pr-10 text-sm text-white focus:border-primary outline-none transition-all cursor-pointer max-w-[200px]"
                    >
                      <option value="ALL">Todos os Clientes</option>
                      {uniqueClients.map(client => (
                        <option key={client} value={client}>{client}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[18px]">expand_more</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex h-[500px] gap-6 min-w-[1200px]">
              {columns.map(col => (
                <div key={col.id} className="flex-1 flex flex-col min-w-[300px] h-full bg-surface-dark/50 rounded-xl border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.color} ${col.shadow}`}></span>
                      <h3 className="text-white font-bold text-sm uppercase tracking-wider">{col.label}</h3>
                      <span className="bg-[#46252c] text-text-muted text-xs font-bold px-2 py-0.5 rounded-full">
                        {projects.filter(p => p.status === col.id).length}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                    {loading ? (
                      <div className="text-center text-slate-500 text-xs py-4">Carregando...</div>
                    ) : (
                      projects
                        .filter(p => p.status === col.id)
                        .filter(p => {
                          // Filter by Type
                          if (filterType !== 'ALL' && p.type !== filterType) return false;

                          // Filter by Client
                          if (filterClient !== 'ALL' && p.client !== filterClient) return false;

                          // Search filter
                          const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                          if (searchWords.length === 0) return true;
                          const projectTypeLabel = p.type === 'business' ? 'comercial' : p.type === 'factory' ? 'industrial' : 'residencial';
                          return searchWords.every(word =>
                            p.name.toLowerCase().includes(word) ||
                            p.client.toLowerCase().includes(word) ||
                            projectTypeLabel.includes(word)
                          );
                        })
                        .map(proj => (
                          <div
                            key={proj.id}
                            onClick={() => handleProjectClick(proj)}
                            className="bg-card-dark rounded-xl p-4 border border-[#64353f] hover:border-primary/50 cursor-pointer group shadow-sm transition-all hover:translate-y-[-2px] active:scale-[0.98]"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-slate-400 border border-white/5">
                                {proj.type === 'business' ? 'Comercial' : proj.type === 'factory' ? 'Industrial' : 'Residencial'}
                              </span>
                            </div>
                            <h4 className="text-white font-bold text-base mb-1 truncate">
                              {highlightText(proj.name, searchTerm)}
                            </h4>
                            <div className="flex items-center gap-1.5 mb-3">
                              <span className="material-symbols-outlined text-text-muted text-[14px]">apartment</span>
                              <p className="text-text-muted text-xs font-medium truncate">
                                {highlightText(proj.client, searchTerm)}
                              </p>
                            </div>
                            <div className="h-px bg-[#64353f]/50 w-full mb-3"></div>
                            <div className="flex justify-between items-center">
                              <div className="text-right w-full">
                                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-0.5">Valor Global</p>
                                <p className="text-white text-sm font-bold">R$ {Number(proj.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                <p className="text-text-muted text-[10px]">Vence em {proj.deadline}</p>
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                    {!loading && projects.filter(p => p.status === col.id).length > 0 &&
                      projects.filter(p => p.status === col.id).filter(p => {
                        if (filterType !== 'ALL' && p.type !== filterType) return false;
                        if (filterClient !== 'ALL' && p.client !== filterClient) return false;

                        const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                        return searchWords.every(word =>
                          p.name.toLowerCase().includes(word) ||
                          p.client.toLowerCase().includes(word) ||
                          (p.type === 'business' ? 'comercial' : p.type === 'factory' ? 'industrial' : 'residencial').includes(word)
                        );
                      }).length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                          <span className="material-symbols-outlined text-slate-600 text-[32px] mb-2">search_off</span>
                          <p className="text-slate-500 text-xs italic">Nenhum projeto corresponde aos filtros nesta coluna.</p>
                        </div>
                      )
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSuccess={() => fetchData()}
      />

      <ProjectDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        project={selectedProject}
        onUpdate={() => fetchData()}
        onViewChange={onViewChange}
        onSelectProject={onSelectProject}
      />
    </>
  );
};

export default DashboardView;
