
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import PageHeader from './PageHeader';
import NewProjectModal from './NewProjectModal';
import ProjectDetailsModal from './ProjectDetailsModal';
import ManageColumnsModal from './ManageColumnsModal';
import { supabase } from '../lib/supabase';
import { Project, AppView } from '../types';
import { Button, Card } from './ui';
import { useAuth } from '../contexts/AuthContext';
import { getClientDisplayName } from '../lib/formatters';
import { canDelegateTask } from '../lib/permissions';


interface Task {
  id: string;
  title: string;
  completed: boolean;
}

export interface StatusColumn {
  id: string;
  label: string;
  color: string;
  shadow_class: string;
  order_index: number;
  project_types?: string[];
  allowed_labels?: string[];
  allowed_clients?: string[];
}

interface DashboardViewProps {
  onViewChange: (view: AppView) => void;
  onSelectProject: (id: string) => void;
}

const DashboardView: React.FC<DashboardViewProps> = ({ onViewChange, onSelectProject }) => {
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterClient, setFilterClient] = useState('ALL');
  const [viewMode, setViewMode] = useState<'STATUS' | 'PHASE'>('STATUS');
  const [statusColumns, setStatusColumns] = useState<StatusColumn[]>([]);
  const [isManageColumnsModalOpen, setIsManageColumnsModalOpen] = useState(false);
  const [clients, setClients] = useState<any[]>([]);


  // Real Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [chartData, setChartData] = useState<{ name: string, real: number }[]>([]);
  const [projectsWithProposals, setProjectsWithProposals] = useState<Set<string>>(new Set());
  const [projectsWithFloors, setProjectsWithFloors] = useState<Set<string>>(new Set());
  const [projectsWithCalculatedItems, setProjectsWithCalculatedItems] = useState<Set<string>>(new Set());

  // Color Label States
  const [labelDefinitions, setLabelDefinitions] = useState<{ color: string, label: string }[]>([]);
  const [showLabelSettings, setShowLabelSettings] = useState(false);
  const [editingLabels, setEditingLabels] = useState<{ color: string, label: string }[]>([]);

  // Task Assignment States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [projectForTask, setProjectForTask] = useState<Project | null>(null);
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [projectForColor, setProjectForColor] = useState<Project | null>(null);
  const [allProfiles, setAllProfiles] = useState<{ id: string, email: string, role: string }[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

  const { user, profile, session } = useAuth();
  const canDelegate = canDelegateTask(profile);

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

    try {
      // 1. Projects — global, no user filter needed (RLS disabled)
      const { data: projData, error: projError } = await supabase.from('projects').select('*').order('created_at', { ascending: false });

      if (projError) {
        setErrorMsg('Supabase Error: ' + projError.message);
      }

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

      // 2. Clients (for fantasy name mapping)
      const { data: clientsData } = await supabase.from('clients').select('name, fantasy_name');
      if (clientsData) setClients(clientsData);

      // 3. Proposals (to check which projects have them)
      const { data: proposalData } = await supabase.from('proposals').select('project_id');
      if (proposalData) {
        setProjectsWithProposals(new Set(proposalData.map(p => p.project_id)));
      }

      // 4. Floors (Phase A)
      const { data: floorsData } = await supabase.from('floors').select('project_id');
      if (floorsData) {
        setProjectsWithFloors(new Set(floorsData.map(f => f.project_id)));
      }


      // 5. Calculated Items (Phase B)
      const { data: itemsData } = await supabase.from('budget_items').select('project_id').eq('origin', 'CALCULATED');
      if (itemsData) {
        setProjectsWithCalculatedItems(new Set(itemsData.map(i => i.project_id)));
      }

      // 6. Label Definitions (Global/Admin-based)
      // We fetch from the 'contato@incendiobrasilia.com.br' or first admin to act as global central legend
      const { data: adminProfiles } = await supabase.from('user_profiles').select('id').eq('role', 'ADMIN').limit(1);
      const adminProfile = adminProfiles && adminProfiles.length > 0 ? adminProfiles[0] : null;

      if (adminProfile) {
        const { data: labelData } = await supabase.from('project_label_definitions').select('*').limit(10);
        if (labelData && labelData.length > 0) {
          setLabelDefinitions(labelData);
        } else {
          // Default definitions
          setLabelDefinitions([
            { color: 'bg-red-500', label: 'Crítico' },
            { color: 'bg-orange-500', label: 'Urgente' },
            { color: 'bg-yellow-500', label: 'Atenção' },
            { color: 'bg-green-500', label: 'Normal' },
            { color: 'bg-blue-500', label: 'Baixa Prioridade' },
            { color: 'bg-purple-500', label: 'Aguardando' },
          ]);
        }
      }

      // Somente gestores podem carregar a lista de pessoas para delegação.
      if (canDelegate) {
        const { data: profilesData } = await supabase.from('user_profiles').select('id, email, role, status');
        if (profilesData) setAllProfiles(profilesData.filter(item => !item.status || item.status === 'ACTIVE'));
      } else {
        setAllProfiles(user ? [{ id: user.id, email: user.email || '', role: profile?.role || 'USER' }] : []);
      }

      // 7. Tarefas rápidas atribuídas ao usuário atual, independentemente da coluna.
      const { data: quickTasksData } = await supabase
        .from('tasks')
        .select('*')
        .or(`assignee.eq.${user?.id || ''},and(assignee.is.null,user_id.eq.${user?.id || ''})`)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      if (quickTasksData) {
        setTasks(quickTasksData);
      }

      // 8. Custom Status Columns & Migration
      // Fetch ALL status columns (shared dashboard)
      const { data: colsData, error: colsError } = await supabase
        .from('project_status_columns')
        .select('*')
        .order('order_index', { ascending: true });

      console.log('Columns Data:', colsData);
      console.log('Columns Error:', colsError);

      let currentCols = colsData || [];

      if (currentCols.length === 0) {
        // First time initialization (only if NO columns exist at all)
        // If user is null, we can just use a dummy id or wait. Since we removed strict validation,
        // we can just use the user's ID if available, or a fallback if required by DB.
        const defaultCols = [
          { user_id: user?.id || null, label: 'Em Análise', color: 'bg-blue-400', shadow_class: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]', order_index: 0, project_types: ['business', 'factory', 'store', 'residential'] },
          { user_id: user?.id || null, label: 'Aprovado', color: 'bg-yellow-400', shadow_class: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]', order_index: 1, project_types: ['business', 'factory', 'store', 'residential'] },
          { user_id: user?.id || null, label: 'Execução', color: 'bg-primary', shadow_class: 'shadow-[0_0_8px_rgba(226,29,72,0.6)]', order_index: 2, project_types: ['business', 'factory', 'store', 'residential'] },
          { user_id: user?.id || null, label: 'Concluído', color: 'bg-emerald-400', shadow_class: 'shadow-[0_0_8px_rgba(52,211,153,0.6)]', order_index: 3, project_types: ['business', 'factory', 'store', 'residential'] },
        ];

        const { data: insertedCols, error: insertError } = await supabase.from('project_status_columns').insert(defaultCols).select();
        console.log('Inserted Columns:', insertedCols);
        console.log('Insert Error:', insertError);
        
        if (insertedCols) {
          currentCols = insertedCols.sort((a, b) => a.order_index - b.order_index);
        }
      }

      if (currentCols.length > 0) {
        setStatusColumns(currentCols);

        // Universal Migration: Ensure all projects use UUIDs instead of legacy strings
        const colMap: Record<string, string> = {
          'ANALYSIS': currentCols.find(c => c.label === 'Em Análise')?.id || currentCols[0].id,
          'APPROVED': currentCols.find(c => c.label === 'Aprovado')?.id || currentCols[Math.min(1, currentCols.length - 1)].id,
          'EXECUTION': currentCols.find(c => c.label === 'Execução')?.id || currentCols[Math.min(2, currentCols.length - 1)].id,
          'DONE': currentCols.find(c => c.label === 'Concluído')?.id || currentCols[currentCols.length - 1].id
        };

        // Check if any project still has a legacy status
        const legacyStatuses = ['ANALYSIS', 'APPROVED', 'EXECUTION', 'DONE'];
        const needsMigration = projData?.some((p: any) => legacyStatuses.includes(p.status));

        if (needsMigration && user) {
          console.log("Migrating legacy project statuses to UUIDs...");
          for (const [oldStatus, newId] of Object.entries(colMap)) {
            await supabase.from('projects')
              .update({ status: newId })
              .eq('status', oldStatus);
            // No user_id filter here to catch everyone's legacy projects during migration
          }

          // Update local state is handled below when setting projects
        }
      }

    } catch (err: any) {
      console.error('fetchData error:', err);
      setErrorMsg('Catch Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load all data on mount — data is global (RLS disabled)
    fetchData();
  }, []);

  const handleTaskToggle = async (id: string, currentStatus: boolean) => {
    // Optimistic
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !currentStatus } : t));
    const { error } = await supabase
      .from('tasks')
      .update({ completed: !currentStatus, status: currentStatus ? 'PENDING' : 'DONE' })
      .eq('id', id);
    if (error) {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: currentStatus } : t));
      alert('Erro ao atualizar tarefa: ' + error.message);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim() || !user) return;

    let targetGroupId = null;
    const { data: group } = await supabase
      .from('task_groups')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', '%Pendentes%')
      .limit(1)
      .single();
    
    if (group) targetGroupId = group.id;
    if (!targetGroupId) {
      const { data: anyGroup } = await supabase.from('task_groups').select('id').eq('user_id', user.id).limit(1).single();
      if (anyGroup) targetGroupId = anyGroup.id;
    }

    if (!targetGroupId) {
       alert("Você precisa criar pelo menos um Quadro de Tarefas antes de criar tarefas rápidas.");
       return;
    }

    const { data, error } = await supabase.from('tasks').insert({
      title: newTaskTitle,
      user_id: user.id,
      assignee: user.id,
      group_id: targetGroupId,
      status: 'PENDING'
    }).select();

    if (error) {
      alert('Erro ao criar tarefa: ' + error.message);
      return;
    }
    if (data) {
      setTasks(prev => [data[0], ...prev]);
      setNewTaskTitle('');
    }
  };

  const handleDeleteTask = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from('tasks').delete().eq('id', id);
  }

  const handleSendToPending = async (project: Project) => {
    if (!user) return;

    if (!confirm(`Deseja enviar o projeto "${project.name}" para a lista de tarefas pendentes?`)) return;

    // Nunca usa coluna de outro usuário como fallback.
    const { data: pendingGroup } = await supabase
      .from('task_groups')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', '%Pendentes%')
      .limit(1)
      .maybeSingle();
    let groupIdToUse = pendingGroup?.id || null;

    if (!groupIdToUse) {
      const { data: ownGroup } = await supabase
        .from('task_groups')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      groupIdToUse = ownGroup?.id || null;
    }

    if (!groupIdToUse) {
      alert('Não foi possível encontrar uma coluna "Pendentes" para enviar a tarefa. Crie uma coluna "Pendentes" no módulo de Tarefas primeiro.');
      return;
    }

    const { error } = await supabase.from('tasks').insert({
      title: `Projeto: ${project.name}`,
      description: `Cliente: ${project.client}\nValor: R$ ${project.value}\nGerado a partir do Dashboard via "Enviar para Pendentes".`,
      group_id: groupIdToUse,
      user_id: user.id,
      assignee: user.id,
      project_id: project.id,
      status: 'PENDING'
    });

    if (error) {
      console.error('Error creating task:', error);
      alert('Erro ao criar tarefa: ' + error.message);
    } else {
      alert('Projeto enviado para a lista de tarefas pendentes com sucesso!');
    }
  };

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project);
    setIsDetailsModalOpen(true);
  };

  const handleUpdateProjectColor = async (projectId: string, color: string) => {
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, label_color: color } as Project : p));
    // Persist to database
    await supabase.from('projects').update({ label_color: color }).eq('id', projectId);
  };

  const handleSaveLabelDefinitions = async () => {
    if (!user) return;

    try {
      // Find the admin representing global settings
      const { data: adminProfiles } = await supabase.from('user_profiles').select('id').eq('role', 'ADMIN').limit(1);
      const adminProfile = adminProfiles && adminProfiles.length > 0 ? adminProfiles[0] : null;
      const targetUserId = adminProfile ? adminProfile.id : user.id;

      // Delete existing definitions for target
      await supabase.from('project_label_definitions').delete().eq('user_id', targetUserId);

      // Insert new definitions
      const inserts = editingLabels.map(d => ({ ...d, user_id: targetUserId }));
      await supabase.from('project_label_definitions').insert(inserts);

      setLabelDefinitions(editingLabels);
      setShowLabelSettings(false);
      alert('Configurações de sinalização salvas globalmente!');
    } catch (error: any) {
      console.error('Error saving label definitions:', error);
      alert('Erro ao salvar configurações: ' + error.message);
    }
  };

  const handleCreateTaskForUser = async () => {
    if (!projectForTask || !selectedAssignee) return;
    if (!canDelegate) {
      alert('Seu perfil não pode delegar tarefas.');
      return;
    }

    try {
      // Find the "Pendentes" group ID for the selected user.
      const { data: group } = await supabase
        .from('task_groups')
        .select('id')
        .eq('user_id', selectedAssignee)
        .ilike('name', '%Pendentes%')
        .limit(1)
        .single();

      let targetGroupId = group?.id;

      // Fallback: procurar outra coluna, sempre do mesmo usuário.
      if (!targetGroupId) {
        const { data: anyGroup } = await supabase
          .from('task_groups')
          .select('id')
          .eq('user_id', selectedAssignee)
          .limit(1)
          .single();
        targetGroupId = anyGroup?.id;
      }

      if (!targetGroupId) {
        alert('O usuário selecionado ainda não possui um quadro com colunas.');
        return;
      }

      const { error } = await supabase.from('tasks').insert({
        title: `Projeto: ${projectForTask.name}`,
        description: `Cliente: ${projectForTask.client}\nValor: R$ ${projectForTask.value}\nGerado a partir do Dashboard.`,
        group_id: targetGroupId,
        user_id: selectedAssignee,
        assignee: selectedAssignee,
        project_id: projectForTask.id,
        status: 'PENDING'
      });

      if (error) throw error;

      alert('Tarefa criada com sucesso para o usuário!');
      setIsTaskModalOpen(false);
      setProjectForTask(null);
      setSelectedAssignee('');
    } catch (error: any) {
      console.error('Error creating task:', error);
      alert('Erro ao criar tarefa: ' + error.message);
    }
  };

  // KPI Calculations
  const analysisColId = statusColumns.find(c => c.label === 'Em Análise')?.id || 'ANALYSIS';
  const executionColId = statusColumns.find(c => c.label === 'Execução')?.id || 'EXECUTION';

  const activeProjects = projects.filter(p => {
    const col = statusColumns.find(c => c.id === p.status);
    return col ? col.label !== 'Concluído' : true;
  }).length;
  const pendingQuotes = projects.filter(p => p.status === analysisColId).length;
  const totalValue = projects.reduce((acc, curr) => acc + Number(curr.value || 0), 0);

  const uniqueClients = Array.from(new Set(projects.map(p => p.client))).sort();

  const phaseColumns = [
    { id: 'PHASE_A', label: 'Levantamento (A)', color: 'bg-blue-400', shadow: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]' },
    { id: 'PHASE_B', label: 'Composição (B)', color: 'bg-yellow-400', shadow: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]' },
    { id: 'PHASE_C', label: 'Proposta (C)', color: 'bg-primary', shadow: 'shadow-[0_0_8px_rgba(226,29,72,0.6)]' },
    { id: 'NEW', label: 'Não Iniciado', color: 'bg-slate-400', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.6)]' },
  ];

  const getProjectPhase = (p: Project) => {
    if (projectsWithProposals.has(p.id)) return 'PHASE_C';
    if (projectsWithCalculatedItems.has(p.id)) return 'PHASE_B';
    if (projectsWithFloors.has(p.id)) return 'PHASE_A';
    return 'NEW';
  };

  const dynamicColumnsMapped = statusColumns.map(c => ({
    id: c.id,
    label: c.label,
    color: c.color,
    shadow: c.shadow_class,
    project_types: c.project_types,
    allowed_labels: c.allowed_labels,
    allowed_clients: c.allowed_clients
  }));
  const activeColumns = viewMode === 'STATUS' ? dynamicColumnsMapped : phaseColumns;

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-[1600px] flex flex-col gap-8">
          <PageHeader
            title="Visão Geral"
            subtitle="Métricas e andamento de todos os projetos ativos."
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
          <div className="flex-1 flex flex-col pb-4">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-4 px-1 gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-white">Gestão de Projetos</h3>
                {/* Horizontal Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {labelDefinitions.map(def => (
                    <div key={def.color} className="flex items-center gap-1.5">
                      <div className={`size-2 rounded-full ${def.color} shadow-sm`}></div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{def.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
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

                <div className="flex bg-surface-dark border border-white/10 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setViewMode('STATUS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'STATUS' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                    Status
                  </button>
                  <button
                    onClick={() => setViewMode('PHASE')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'PHASE' ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                  >
                    Fases
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      className="appearance-none bg-[#1a1315] border border-white/10 rounded-xl py-2 pl-4 pr-10 text-sm text-white focus:border-primary outline-none transition-all cursor-pointer min-w-[140px]"
                    >
                      <option value="ALL" className="bg-[#1a1315] text-white">Todos os Tipos</option>
                      <option value="business" className="bg-[#1a1315] text-white">Comercial</option>
                      <option value="factory" className="bg-[#1a1315] text-white">Industrial</option>
                      <option value="residential" className="bg-[#1a1315] text-white">Residencial</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[18px]">expand_more</span>
                  </div>

                  <div className="relative">
                    <select
                      value={filterClient}
                      onChange={(e) => setFilterClient(e.target.value)}
                      className="appearance-none bg-[#1a1315] border border-white/10 rounded-xl py-2 pl-4 pr-10 text-sm text-white focus:border-primary outline-none transition-all cursor-pointer max-w-[200px]"
                    >
                      <option value="ALL" className="bg-[#1a1315] text-white">Todos os Clientes</option>
                      {uniqueClients.map(client => (
                        <option key={client} value={client} className="bg-[#1a1315] text-white">{client}</option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-[18px]">expand_more</span>
                  </div>

                  <div className="flex bg-surface-dark border border-white/10 rounded-xl p-1 gap-1">
                    <button
                      onClick={() => {
                        console.log("Opening Manage Columns Modal");
                        setIsManageColumnsModalOpen(true);
                      }}
                      className="flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-all w-8 h-8"
                      title="Gerenciar Colunas de Status"
                    >
                      <span className="material-symbols-outlined text-[18px]">settings</span>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setEditingLabels([...labelDefinitions]);
                      setShowLabelSettings(true);
                    }}
                    className="flex items-center gap-2 bg-surface-dark border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white hover:border-primary/30 transition-all"
                    title="Configurar Sinalização Visual"
                  >
                    <span className="material-symbols-outlined text-[18px]">palette</span>
                    <span className="hidden lg:inline">Sinalização</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-hidden custom-scrollbar pb-4 scroll-smooth">
              <div className="flex h-[500px] gap-6 min-w-[1200px]">
                {activeColumns.map(col => (
                  <div key={col.id} className="flex-1 flex flex-col min-w-[300px] h-full bg-surface-dark/50 rounded-xl border border-white/5 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${col.color} ${col.shadow}`}></span>
                        <h3 className="text-white font-bold text-sm uppercase tracking-wider">{col.label}</h3>
                        <span className="bg-[#46252c] text-text-muted text-xs font-bold px-2 py-0.5 rounded-full">
                          {projects.filter(p => {
                            const matchesView = viewMode === 'STATUS' ? p.status === col.id : getProjectPhase(p) === col.id;
                            if (!matchesView) return false;
                            if (viewMode === 'STATUS' && col.project_types) {
                              if (!col.project_types.includes(p.type)) return false;
                            }

                            // Label Filter
                            if (viewMode === 'STATUS' && col.allowed_labels && col.allowed_labels.length > 0) {
                              if (!col.allowed_labels.includes(p.label_color || 'transparent')) return false;
                            }

                            // Client Filter
                            if (viewMode === 'STATUS' && col.allowed_clients && col.allowed_clients.length > 0) {
                              if (!col.allowed_clients.includes(p.client)) return false;
                            }

                            return true;
                          }).length}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                      {loading ? (
                        <div className="text-center text-slate-500 text-xs py-4">Carregando...</div>
                      ) : (
                        projects
                          .filter(p => {
                            // Prevent projects from vanishing if their status doesn't match any existing column
                            // If status doesn't match ANY column, force it to show up in the very first column.
                            const isValidStatus = statusColumns.some(c => c.id === p.status);
                            const matchesView = viewMode === 'STATUS'
                              ? (p.status === col.id || (!isValidStatus && col.id === statusColumns[0]?.id))
                              : getProjectPhase(p) === col.id;

                            if (!matchesView) return false;
                            if (viewMode === 'STATUS' && col.project_types) {
                              if (!col.project_types.includes(p.type || 'business')) return false;
                            }

                            // Label Filter
                            if (viewMode === 'STATUS' && col.allowed_labels && col.allowed_labels.length > 0) {
                              if (!col.allowed_labels.includes(p.label_color || 'transparent')) return false;
                            }

                            // Client Filter
                            if (viewMode === 'STATUS' && col.allowed_clients && col.allowed_clients.length > 0) {
                              if (!col.allowed_clients.includes(p.client)) return false;
                            }
                            return true;
                          })
                          .filter(p => {
                            // Filter by Type
                            if (filterType !== 'ALL' && p.type !== filterType) return false;

                            // Filter by Client
                            if (filterClient !== 'ALL' && p.client !== filterClient) return false;

                            // Search filter
                            const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                            if (searchWords.length === 0) return true;
                            const projectTypeLabel = p.type === 'business' ? 'comercial' : p.type === 'factory' ? 'industrial' : 'residencial';
                            return searchWords.every(word => {
                              const projNumStr = p.project_number ? String(p.project_number) : '';
                              const projNumPadded = p.project_number ? String(p.project_number).padStart(3, '0') : '';
                              const prFormatted = p.project_number ? `pr${projNumPadded}` : '';

                              const cleanWordNumber = word.replace(/^0+/, '') || '0';
                              const wordBeforeSlash = word.split('/')[0].replace(/^0+/, '') || '0';
                              const wordNumbersOnly = word.replace(/\D/g, '');

                              return (p.name?.toLowerCase() || '').includes(word) ||
                                (p.client?.toLowerCase() || '').includes(word) ||
                                (projNumStr && projNumStr === cleanWordNumber) ||
                                (projNumStr && projNumStr === wordBeforeSlash) ||
                                (projNumStr && projNumStr === wordNumbersOnly) ||
                                (projNumPadded && projNumPadded.includes(word)) ||
                                (prFormatted && prFormatted.includes(word)) ||
                                projectTypeLabel.includes(word);
                            });
                          })
                          .map(proj => (
                            <div
                              key={proj.id}
                              onClick={() => handleProjectClick(proj)}
                              className="bg-card-dark rounded-xl p-4 border border-[#64353f] hover:border-primary/50 cursor-pointer group shadow-sm transition-all hover:translate-y-[-2px] active:scale-[0.98] relative overflow-hidden flex flex-col min-h-[170px]"
                              style={{
                                backgroundColor: proj.label_color && proj.label_color !== 'transparent'
                                  ? `rgba(${proj.label_color.includes('red') ? '239, 68, 68' :
                                    proj.label_color.includes('orange') ? '249, 115, 22' :
                                      proj.label_color.includes('yellow') ? '234, 179, 8' :
                                        proj.label_color.includes('green') ? '34, 197, 94' :
                                          proj.label_color.includes('blue') ? '59, 130, 246' :
                                            proj.label_color.includes('purple') ? '168, 85, 247' : '0, 0, 0'}, 0.08)`
                                  : undefined
                              }}
                            >
                              {/* Color Label Indicator */}
                              {proj.label_color && proj.label_color !== 'transparent' && (
                                <div
                                  className={`absolute top-0 right-0 w-1.5 h-full ${proj.label_color} rounded-r-xl`}
                                  title={labelDefinitions.find(l => l.color === proj.label_color)?.label || ''}
                                ></div>
                              )}

                              <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-1.5">
                                  {proj.project_number && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-primary text-white border border-primary/20 leading-none">
                                      PR{String(proj.project_number).padStart(3, '0')}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5 leading-none uppercase tracking-wider">
                                    {proj.created_at ? new Date(proj.created_at).toLocaleDateString('pt-BR') : 'Sem data'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2">
                                  {/* Send to Pending Button */}
                                  {canDelegate && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setProjectForTask(proj);
                                        setIsTaskModalOpen(true);
                                      }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 hover:text-indigo-300 transition-all border border-indigo-500/30"
                                      title="Transformar em Tarefa"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">assignment_turned_in</span>
                                      <span className="text-[9px] font-black uppercase tracking-tight">Tarefa</span>
                                    </button>
                                  )}

                                  {/* Color Label Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setProjectForColor(proj);
                                      setIsColorModalOpen(true);
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/10"
                                    title="Sinalizar Projeto"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">palette</span>
                                    <span className="text-[9px] font-black uppercase tracking-tight">Sinal</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <h4 className="text-white font-bold text-sm mb-0.5 mt-1 truncate flex items-center gap-2">
                                  {highlightText(proj.name, searchTerm)}
                                  {proj.internal_observations && (
                                    <span className="material-symbols-outlined text-amber-500 text-[14px]" title="Dica: Possui observações internas">info</span>
                                  )}
                                </h4>

                                <p className="text-[9px] text-amber-500/90 italic mb-1 line-clamp-1 border-l border-amber-500/30 pl-2 leading-tight h-3 overflow-hidden">
                                  {proj.internal_observations || ""}
                                </p>

                                <div className="flex items-center gap-1.5 mb-2 h-4">
                                  <span className="material-symbols-outlined text-slate-500 text-[14px]">apartment</span>
                                  <p className="text-slate-400 text-[11px] font-medium truncate">
                                    {highlightText(
                                      getClientDisplayName(
                                        clients.find(c => c.name === proj.client) || { name: proj.client },
                                        'ui'
                                      ),
                                      searchTerm
                                    )}
                                  </p>
                                </div>
                              </div>

                              <div className="h-px bg-white/5 w-full mb-2"></div>
                              <div className="flex justify-between items-center mt-auto">
                                <div className="text-right w-full flex justify-between items-center">
                                  <div className="text-left">
                                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-0">Valor Global</p>
                                    <p className="text-white text-[13px] font-bold">R$ {Number(proj.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    <p className="text-slate-500 text-[9px] uppercase font-bold tracking-tight">Vence em {proj.deadline}</p>
                                  </div>
                                  {projectsWithProposals.has(proj.id) && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectProject(proj.id);
                                        onViewChange(AppView.ENGINEERING_PHASE_C);
                                      }}
                                      className="flex items-center gap-1 bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-all text-[9px] font-black uppercase"
                                      title="Ir para a Proposta"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">description</span>
                                      Proposta
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                      )}
                      {!loading && projects.filter(p => {
                        const matchesView = viewMode === 'STATUS' ? p.status === col.id : getProjectPhase(p) === col.id;
                        if (!matchesView) return false;
                        if (viewMode === 'STATUS' && col.project_types) {
                          if (!col.project_types.includes(p.type)) return false;
                        }

                        // Label Filter
                        if (viewMode === 'STATUS' && col.allowed_labels && col.allowed_labels.length > 0) {
                          if (!col.allowed_labels.includes(p.label_color || 'transparent')) return false;
                        }

                        // Client Filter
                        if (viewMode === 'STATUS' && col.allowed_clients && col.allowed_clients.length > 0) {
                          if (!col.allowed_clients.includes(p.client)) return false;
                        }
                        return true;
                      }).length > 0 &&
                        projects.filter(p => {
                          const matchesView = viewMode === 'STATUS' ? p.status === col.id : getProjectPhase(p) === col.id;
                          if (!matchesView) return false;
                          if (viewMode === 'STATUS' && col.project_types) {
                            if (!col.project_types.includes(p.type)) return false;
                          }

                          // Label Filter
                          if (viewMode === 'STATUS' && col.allowed_labels && col.allowed_labels.length > 0) {
                            if (!col.allowed_labels.includes(p.label_color || 'transparent')) return false;
                          }

                          // Client Filter
                          if (viewMode === 'STATUS' && col.allowed_clients && col.allowed_clients.length > 0) {
                            if (!col.allowed_clients.includes(p.client)) return false;
                          }

                          return true;
                        }).filter(p => {
                          if (filterType !== 'ALL' && p.type !== filterType) return false;
                          if (filterClient !== 'ALL' && p.client !== filterClient) return false;

                          const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length > 0);
                          return searchWords.every(word => {
                            const projNumStr = p.project_number ? String(p.project_number) : '';
                            const projNumPadded = p.project_number ? String(p.project_number).padStart(3, '0') : '';
                            const prFormatted = p.project_number ? `pr${projNumPadded}` : '';

                            const cleanWordNumber = word.replace(/^0+/, '') || '0';
                            const wordBeforeSlash = word.split('/')[0].replace(/^0+/, '') || '0';
                            const wordNumbersOnly = word.replace(/\D/g, '');
                            const projectTypeLabel = p.type === 'business' ? 'comercial' : p.type === 'factory' ? 'industrial' : 'residencial';

                            return p.name.toLowerCase().includes(word) ||
                              p.client.toLowerCase().includes(word) ||
                              (projNumStr && projNumStr === cleanWordNumber) ||
                              (projNumStr && projNumStr === wordBeforeSlash) ||
                              (projNumStr && projNumStr === wordNumbersOnly) ||
                              (projNumPadded && projNumPadded.includes(word)) ||
                              (prFormatted && prFormatted.includes(word)) ||
                              projectTypeLabel.includes(word);
                          });
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
      </div>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => {
          setIsNewProjectModalOpen(false);
          setProjectToEdit(null);
        }}
        onSuccess={() => {
          fetchData();
          setIsNewProjectModalOpen(false);
          setProjectToEdit(null);
        }}
        projectToEdit={projectToEdit}
      />

      <ProjectDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        project={selectedProject}
        onUpdate={() => fetchData()}
        onViewChange={onViewChange}
        onSelectProject={onSelectProject}
        hasProposal={selectedProject ? projectsWithProposals.has(selectedProject.id) : false}
        onEdit={(project) => {
          setProjectToEdit(project);
          setIsNewProjectModalOpen(true);
          setIsDetailsModalOpen(false);
        }}
        statusColumns={statusColumns}
      />

      {/* Label Settings Modal */}
      {showLabelSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-dark border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-[24px]">palette</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Sinalização Visual</h3>
                  <p className="text-xs text-slate-500">Personalize o significado das cores</p>
                </div>
              </div>
              <button
                onClick={() => setShowLabelSettings(false)}
                className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-3 mb-6">
              {editingLabels.map((def, index) => (
                <div key={def.color} className="flex items-center gap-3">
                  <div className={`size-6 rounded-full ${def.color} shrink-0 shadow-lg`}></div>
                  <input
                    type="text"
                    value={def.label}
                    onChange={(e) => {
                      const newLabels = [...editingLabels];
                      newLabels[index].label = e.target.value;
                      setEditingLabels(newLabels);
                    }}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary outline-none transition-all"
                    placeholder="Ex: Crítico / Urgente"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLabelSettings(false)}
                className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveLabelDefinitions}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-red-600 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-primary/20"
              >
                Salvar Configurações
              </button>
            </div>
          </div>
        </div>
      )}

      {isManageColumnsModalOpen && (
        <ManageColumnsModal
          isOpen={isManageColumnsModalOpen}
          onClose={() => setIsManageColumnsModalOpen(false)}
          currentColumns={statusColumns}
          onSaved={(newCols) => {
            setStatusColumns(newCols);
            fetchData();
          }}
          availableLabels={labelDefinitions}
          availableClients={Array.from(new Set(projects.map(p => p.client))).filter((client): client is string => Boolean(client)).sort()}
        />
      )}

      {/* Task Assignment Modal */}
      {isTaskModalOpen && projectForTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface-dark border border-white/10 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                  <span className="material-symbols-outlined text-indigo-500 text-[24px]">assignment_add</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-tight">Delegar Tarefa</h3>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{projectForTask.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Selecionar Usuário / Quadro</label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full bg-[#1a1315] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary outline-none transition-all cursor-pointer"
                >
                  <option value="" className="bg-[#1a1315] text-white">Escolha um usuário...</option>
                  {allProfiles.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#1a1315] text-white">
                      {p.email} ({p.role})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-2 italic">* A tarefa será enviada para a coluna "Pendentes" do usuário selecionado.</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsTaskModalOpen(false)}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTaskForUser}
                disabled={!selectedAssignee}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold text-white transition-all shadow-lg shadow-indigo-900/20 uppercase"
              >
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Color Selection Modal */}
      {isColorModalOpen && projectForColor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-surface-dark border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <span className="material-symbols-outlined text-primary text-[24px]">palette</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white uppercase tracking-tight">Sinalização</h3>
                  <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{projectForColor.name}</p>
                </div>
              </div>
              <button
                onClick={() => setIsColorModalOpen(false)}
                className="size-8 flex items-center justify-center hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              <button
                onClick={() => {
                  handleUpdateProjectColor(projectForColor.id, 'transparent');
                  setIsColorModalOpen(false);
                }}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${!projectForColor.label_color || projectForColor.label_color === 'transparent' ? 'bg-white/10 border-white/30 text-white' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`}
              >
                <div className="size-4 rounded-full border border-white/20"></div>
                <span className="text-[11px] font-bold uppercase tracking-wider">Nenhuma</span>
              </button>
              {labelDefinitions.map(def => (
                <button
                  key={def.color}
                  onClick={() => {
                    handleUpdateProjectColor(projectForColor.id, def.color);
                    setIsColorModalOpen(false);
                  }}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${projectForColor.label_color === def.color ? 'bg-white/10 border-white/30 text-white shadow-lg' : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10'}`}
                >
                  <div className={`size-4 rounded-full ${def.color} shadow-sm`}></div>
                  <span className="text-[11px] font-bold uppercase tracking-wider truncate">{def.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setIsColorModalOpen(false)}
              className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all uppercase"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default DashboardView;
