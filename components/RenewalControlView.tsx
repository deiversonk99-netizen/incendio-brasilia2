
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Task } from '../types';
import PageHeader from './PageHeader';
import TaskDetailsModal from './TaskDetailsModal';
import { useAuth } from '../contexts/AuthContext';

const RenewalControlView: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isNewRenewalModalOpen, setIsNewRenewalModalOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [manualRenewals, setManualRenewals] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'calendar' | 'anticipation'>('calendar');

    const fetchRenewals = async () => {
        setLoading(true);
        const { data: tasksData } = await supabase
            .from('tasks')
            .select('*, projects(name, client_id, clients(name)), user_profiles(email)')
            .eq('is_annual', true)
            .not('expiration_date', 'is', null)
            .order('expiration_date', { ascending: true });

        const { data: manualData } = await supabase
            .from('contract_renewals')
            .select('*, projects(name), clients(name)')
            .order('end_date', { ascending: true });

        if (tasksData) setTasks(tasksData as any);
        if (manualData) setManualRenewals(manualData);
        setLoading(false);
    };

    useEffect(() => {
        fetchRenewals();
    }, []);

    const filteredTasks = useMemo(() => {
        return tasks.filter(t =>
            t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t as any).projects?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t as any).projects?.clients?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [tasks, searchTerm]);

    const anticipationTasks = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysAhead = new Date(today);
        thirtyDaysAhead.setDate(today.getDate() + 30);

        return tasks.filter(t => {
            if (!t.expiration_date) return false;
            // Parse date manually to avoid timezone issues with string dates
            const [year, month, day] = t.expiration_date.split('-').map(Number);
            const exp = new Date(year, month - 1, day);
            return exp <= thirtyDaysAhead;
        });
    }, [tasks]);

    const anticipationManuals = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysAhead = new Date(today);
        thirtyDaysAhead.setDate(today.getDate() + 30);

        return manualRenewals.filter(m => {
            if (!m.end_date) return false;
            const [year, month, day] = m.end_date.split('-').map(Number);
            const exp = new Date(year, month - 1, day);
            return exp <= thirtyDaysAhead;
        });
    }, [manualRenewals]);

    const calendarData = useMemo(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days = [];
        // Fill empty days before month start
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null);
        }
        // Fill month days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            days.push(new Date(year, month, i));
        }
        return days;
    }, [currentDate]);

    const changeMonth = (offset: number) => {
        const next = new Date(currentDate);
        next.setMonth(next.getMonth() + offset);
        setCurrentDate(next);
    };

    const monthName = currentDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden">
            <PageHeader
                title="Controle de Renovação"
                subtitle="Calendário anual de vencimentos e aditivos de contrato"
                actions={
                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors text-[20px]">search</span>
                            <input
                                className="bg-[#2d1b20] border border-[#46252c] text-white text-sm rounded-lg block w-64 pl-10 pr-3 py-2.5 outline-none focus:border-primary transition-all shadow-inner"
                                placeholder="Buscar projeto ou título..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex bg-black/30 p-1 rounded-xl border border-white/5 mr-2">
                            <button
                                onClick={() => setViewMode('calendar')}
                                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all ${viewMode === 'calendar' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-white'}`}
                            >
                                Calendário
                            </button>
                            <button
                                onClick={() => setViewMode('anticipation')}
                                className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${viewMode === 'anticipation' ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-white'}`}
                            >
                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                Antecipação (30d)
                                {(anticipationTasks.length + anticipationManuals.length) > 0 && (
                                    <span className="bg-white text-primary rounded-full size-4 flex items-center justify-center text-[10px]">
                                        {anticipationTasks.length + anticipationManuals.length}
                                    </span>
                                )}
                            </button>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedDate('');
                                setIsNewRenewalModalOpen(true);
                            }}
                            className="flex items-center justify-center gap-2 rounded-lg h-11 px-4 bg-primary hover:bg-red-600 text-white text-sm font-bold transition-all shadow-lg shadow-primary/20"
                        >
                            <span className="material-symbols-outlined">add_circle</span>
                            <span>Novo Aditivo</span>
                        </button>
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="bg-surface-dark border border-[#46252c]/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
                    {viewMode === 'calendar' ? (
                        <>
                            {/* Calendar Header */}
                            <div className="p-6 border-b border-[#46252c]/50 flex items-center justify-between bg-white/2">
                                <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">calendar_month</span>
                                    {monthName}
                                </h3>
                                <div className="flex items-center gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                                    <button onClick={() => changeMonth(-1)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                                        <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                                    </button>
                                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 text-xs font-black uppercase text-primary hover:bg-primary/10 rounded-lg transition-all">Hoje</button>
                                    <button onClick={() => changeMonth(1)} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all">
                                        <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                                    </button>
                                </div>
                            </div>
                            {/* Calendar Grid */}
                            <div className="p-4 bg-black/10">
                                <div className="grid grid-cols-7 gap-1">
                                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                                        <div key={day} className="text-center py-3 text-[10px] font-black uppercase text-slate-600 tracking-tighter">{day}</div>
                                    ))}
                                    {calendarData.map((day, idx) => {
                                        if (!day) return <div key={`empty-${idx}`} className="aspect-square bg-transparent border border-white/2 opacity-20 rounded-lg"></div>;
                                        const dayStr = day.toISOString().split('T')[0];
                                        const dayTasks = filteredTasks.filter(t => t.expiration_date?.startsWith(dayStr));
                                        const dayManuals = manualRenewals.filter(m => m.end_date === dayStr);
                                        const isToday = dayStr === new Date().toISOString().split('T')[0];
                                        return (
                                            <div
                                                key={idx}
                                                onClick={() => { setSelectedDate(dayStr); setIsNewRenewalModalOpen(true); }}
                                                className={`min-h-[140px] aspect-square p-2 border border-white/5 rounded-xl transition-all relative group cursor-pointer ${isToday ? 'bg-primary/5 ring-1 ring-primary/30 border-primary/20' : 'bg-black/20 hover:bg-white/2 hover:border-white/10'}`}
                                            >
                                                <span className={`text-xs font-black mb-2 block ${isToday ? 'text-primary' : 'text-slate-500'}`}>{day.getDate()}</span>
                                                <div className="space-y-1.5 overflow-y-auto max-h-[100px] scrollbar-hide">
                                                    {dayTasks.map(task => (
                                                        <div key={task.id} onClick={(e) => { e.stopPropagation(); setSelectedTask(task); setIsDetailsOpen(true); }} className={`p-1.5 rounded-lg border text-[9px] font-bold leading-tight transition-all shadow-sm hover:brightness-110 active:scale-95 ${task.label_color && task.label_color !== 'transparent' ? `border-white/10 ${task.label_color} text-white` : 'bg-surface-dark border-white/5 text-slate-300'}`}>
                                                            <div className="truncate opacity-75 text-[8px] uppercase font-black">{(task as any).projects?.name || 'Avulso'}</div>
                                                            <div className="line-clamp-2">{task.title}</div>
                                                        </div>
                                                    ))}
                                                    {dayManuals.map(manual => (
                                                        <div key={manual.id} className="p-1.5 rounded-lg border border-primary/20 bg-primary/10 text-[9px] font-bold leading-tight transition-all shadow-sm text-primary">
                                                            <div className="truncate opacity-75 text-[8px] uppercase font-black">{manual.projects?.name || manual.clients?.name || 'Avulso'}</div>
                                                            <div className="line-clamp-2">Aditivo: R$ {manual.value?.toLocaleString('pt-BR')}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="p-8 space-y-6">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">notification_important</span>
                                        Vencimentos nos próximos 30 dias
                                    </h3>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Envie o aditivo com antecedência</p>
                                </div>
                            </div>

                            {anticipationTasks.length === 0 && anticipationManuals.length === 0 ? (
                                <div className="py-20 flex flex-col items-center justify-center opacity-20 border-2 border-dashed border-white/5 rounded-3xl">
                                    <span className="material-symbols-outlined text-[60px]">check_circle</span>
                                    <span className="text-xs font-black uppercase mt-4">Nenhum vencimento crítico encontrado</span>
                                </div>
                            ) : (
                                <div className="grid gap-4">
                                    {[...anticipationTasks.map(t => ({ ...t, type: 'task' })), ...anticipationManuals.map(m => ({ ...m, type: 'manual' }))].sort((a, b) => {
                                        const dateA = new Date(a.expiration_date || a.end_date);
                                        const dateB = new Date(b.expiration_date || b.end_date);
                                        return dateA.getTime() - dateB.getTime();
                                    }).map((item: any) => {
                                        const date = new Date(item.expiration_date || item.end_date);
                                        const now = new Date();
                                        now.setHours(0, 0, 0, 0);
                                        const [itemYear, itemMonth, itemDay] = (item.expiration_date || item.end_date).split('-').map(Number);
                                        const itemDate = new Date(itemYear, itemMonth - 1, itemDay);

                                        const diff = Math.ceil((itemDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                                        const isExpired = diff < 0;
                                        const isDueToday = diff === 0;
                                        const isUrgent = diff <= 7;

                                        return (
                                            <div key={item.id} className="bg-white/[0.02] border border-white/5 rounded-2xl p-5 flex items-center justify-between hover:bg-white/[0.04] transition-all group">
                                                <div className="flex items-center gap-4">
                                                    <div className={`size-12 rounded-xl flex items-center justify-center border ${isUrgent || isExpired ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'}`}>
                                                        <span className="material-symbols-outlined text-[24px]">{isExpired ? 'error' : 'alarm_on'}</span>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-[#c7949f]">
                                                                {item.projects?.name || item.clients?.name || 'Avulso'}
                                                            </span>
                                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${isUrgent || isExpired ? 'bg-red-500/20 text-red-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                                                {isExpired ? `Vencido há ${Math.abs(diff)} dias` : isDueToday ? 'Vence hoje' : `Vence em ${diff} dias`}
                                                            </span>
                                                        </div>
                                                        <h4 className="text-sm font-bold text-white mb-1">{item.title || (item.value ? `Aditivo Financeiro - R$ ${item.value.toLocaleString('pt-BR')}` : 'Sem título')}</h4>
                                                        <p className="text-[10px] text-slate-500 font-medium">Data limite: {date.toLocaleDateString('pt-BR')}</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (item.type === 'task') { setSelectedTask(item); setIsDetailsOpen(true); }
                                                        else { /* handle manual detail? */ }
                                                    }}
                                                    className="px-6 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-lg shadow-primary/5"
                                                >
                                                    Tratar Agora
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Upcoming List */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredTasks.slice(0, 6).map(task => {
                        const date = task.expiration_date ? new Date(task.expiration_date) : null;
                        const isExpired = date && date < new Date();
                        return (
                            <div
                                key={task.id}
                                onClick={() => {
                                    setSelectedTask(task);
                                    setIsDetailsOpen(true);
                                }}
                                className={`p-4 rounded-2xl border transition-all hover:scale-[1.02] duration-300 group cursor-pointer
                                    ${isExpired ? 'bg-red-500/5 border-red-500/20' : 'bg-surface-dark border-[#46252c]/50'}
                            `}>
                                <div className="flex justify-between items-start mb-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-[#c7949f] opacity-75">
                                        {(task as any).projects?.name || 'Projeto Avulso'}
                                    </span>
                                    {date && (
                                        <div className={`px-2 py-1 rounded text-[10px] font-bold ${isExpired ? 'bg-red-500 text-white' : 'bg-primary/20 text-primary'}`}>
                                            {date.toLocaleDateString('pt-BR')}
                                        </div>
                                    )}
                                </div>
                                <h4 className="text-white font-bold text-sm mb-2 group-hover:text-primary transition-colors">{task.title}</h4>
                                <p className="text-slate-400 text-xs line-clamp-2 mb-4 h-8">{task.description}</p>
                                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">{task.category}</span>
                                    {task.file_url && (
                                        <a href={task.file_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-[10px] font-bold flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">attach_file</span>
                                            Ver Aditivo
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <TaskDetailsModal
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
                task={selectedTask}
            />

            {isNewRenewalModalOpen && (
                <NewRenewalModal
                    isOpen={isNewRenewalModalOpen}
                    onClose={() => setIsNewRenewalModalOpen(false)}
                    onSuccess={() => fetchRenewals()}
                    defaultDate={selectedDate}
                />
            )}
        </div>
    );
};

interface NewRenewalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultDate?: string;
}

const NewRenewalModal: React.FC<NewRenewalModalProps> = ({ isOpen, onClose, onSuccess, defaultDate }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [projects, setProjects] = useState<any[]>([]);
    const [clients, setClients] = useState<any[]>([]);
    const [linkType, setLinkType] = useState<'project' | 'client'>('project');
    const [formData, setFormData] = useState({
        project_id: '',
        client_id: '',
        start_date: defaultDate || '',
        end_date: defaultDate || '',
        value: 0,
        notes: ''
    });

    useEffect(() => {
        if (defaultDate) {
            setFormData(prev => ({
                ...prev,
                start_date: defaultDate,
                end_date: defaultDate
            }));
        }
    }, [defaultDate]);

    useEffect(() => {
        const fetchLinkedProjects = async () => {
            const [
                { data: pData },
                { data: fData },
                { data: bData },
                { data: prData },
                { data: cData }
            ] = await Promise.all([
                supabase.from('projects').select('id, name').order('name'),
                supabase.from('floors').select('project_id'),
                supabase.from('budget_items').select('project_id'),
                supabase.from('proposals').select('project_id'),
                supabase.from('clients').select('id, name').order('name')
            ]);

            if (pData) {
                const linkedProjectIds = new Set([
                    ...(fData || []).map(f => f.project_id),
                    ...(bData || []).map(b => b.project_id),
                    ...(prData || []).map(pr => pr.project_id)
                ]);

                // Filter and unique by name
                const filtered = pData.filter(p => linkedProjectIds.has(p.id));
                const unique: any[] = [];
                const seen = new Set();
                filtered.forEach(p => {
                    if (!seen.has(p.name)) {
                        unique.push(p);
                        seen.add(p.name);
                    }
                });
                setProjects(unique);
            }
            if (cData) setClients(cData);
        };

        fetchLinkedProjects();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.from('contract_renewals').insert({
            ...formData,
            project_id: linkType === 'project' ? formData.project_id : null,
            client_id: linkType === 'client' ? formData.client_id : null,
            user_id: user?.id
        });
        if (error) alert('Erro: ' + error.message);
        else {
            onSuccess();
            onClose();
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-[101] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
                <h3 className="text-lg font-bold text-white uppercase tracking-widest">Novo Aditivo / Renovação</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 mb-4">
                        <button
                            type="button"
                            onClick={() => setLinkType('project')}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${linkType === 'project' ? 'bg-primary text-white' : 'text-slate-500 hover:text-white'}`}
                        >
                            Por Projeto
                        </button>
                        <button
                            type="button"
                            onClick={() => setLinkType('client')}
                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${linkType === 'client' ? 'bg-primary text-white' : 'text-slate-500 hover:text-white'}`}
                        >
                            Por Cliente
                        </button>
                    </div>

                    {linkType === 'project' ? (
                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase mb-1">Vincular Projeto</label>
                            <select
                                required
                                className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-primary transition-all"
                                value={formData.project_id}
                                onChange={e => setFormData({ ...formData, project_id: e.target.value })}
                            >
                                <option value="">Selecione o projeto...</option>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                    ) : (
                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase mb-1">Vincular Cliente</label>
                            <select
                                required
                                className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-primary transition-all"
                                value={formData.client_id}
                                onChange={e => setFormData({ ...formData, client_id: e.target.value })}
                            >
                                <option value="">Selecione o cliente...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase mb-1">Início</label>
                            <input type="date" required className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-primary" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-500 uppercase mb-1">Término</label>
                            <input type="date" required className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-primary" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Valor do Contrato / Aditivo</label>
                        <input type="number" step="0.01" required className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-primary" value={formData.value} onChange={e => setFormData({ ...formData, value: Number(e.target.value) })} />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-500 uppercase mb-1">Observações</label>
                        <textarea className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-primary resize-none" rows={2} value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-white">Cancelar</button>
                        <button type="submit" disabled={loading} className="flex-1 bg-primary py-3 rounded-xl text-white font-black uppercase text-xs shadow-lg shadow-primary/20 hover:bg-red-600 transition-all">
                            {loading ? 'Salvando...' : 'Salvar Aditivo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RenewalControlView;
