
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Task } from '../types';
import PageHeader from './PageHeader';
import TaskDetailsModal from './TaskDetailsModal';

const RenewalControlView: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    const fetchRenewals = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('tasks')
            .select('*, projects(name), user_profiles(email)')
            .eq('is_annual', true)
            .not('expiration_date', 'is', null)
            .order('expiration_date', { ascending: true });

        if (data) setTasks(data as any);
        setLoading(false);
    };

    useEffect(() => {
        fetchRenewals();
    }, []);

    const filteredTasks = useMemo(() => {
        return tasks.filter(t =>
            t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (t as any).projects?.name?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [tasks, searchTerm]);

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
                    </div>
                }
            />

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="bg-surface-dark border border-[#46252c]/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
                    {/* Calendar Header */}
                    <div className="p-6 border-b border-[#46252c]/50 flex items-center justify-between bg-white/2">
                        <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-3">
                            <span className="material-symbols-outlined text-primary">calendar_month</span>
                            {monthName}
                        </h3>
                        <div className="flex items-center gap-2 bg-black/30 p-1.5 rounded-xl border border-white/5">
                            <button
                                onClick={() => changeMonth(-1)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                            >
                                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                            </button>
                            <button
                                onClick={() => setCurrentDate(new Date())}
                                className="px-4 py-2 text-xs font-black uppercase text-primary hover:bg-primary/10 rounded-lg transition-all"
                            >
                                Hoje
                            </button>
                            <button
                                onClick={() => changeMonth(1)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-all"
                            >
                                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
                            </button>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="p-4 bg-black/10">
                        <div className="grid grid-cols-7 gap-1">
                            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                                <div key={day} className="text-center py-3 text-[10px] font-black uppercase text-slate-600 tracking-tighter">
                                    {day}
                                </div>
                            ))}

                            {calendarData.map((day, idx) => {
                                if (!day) return <div key={`empty-${idx}`} className="aspect-square bg-transparent border border-white/2 opacity-20 rounded-lg"></div>;

                                const dayStr = day.toISOString().split('T')[0];
                                const dayTasks = filteredTasks.filter(t => t.expiration_date?.startsWith(dayStr));
                                const isToday = dayStr === new Date().toISOString().split('T')[0];

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => {
                                            if (dayTasks.length === 1) {
                                                setSelectedTask(dayTasks[0]);
                                                setIsDetailsOpen(true);
                                            }
                                        }}
                                        className={`min-h-[140px] aspect-square p-2 border border-white/5 rounded-xl transition-all relative group cursor-pointer
                                            ${isToday ? 'bg-primary/5 ring-1 ring-primary/30 border-primary/20' : 'bg-black/20 hover:bg-white/2 hover:border-white/10'}
                                        `}
                                    >
                                        <span className={`text-xs font-black mb-2 block ${isToday ? 'text-primary' : 'text-slate-500'}`}>
                                            {day.getDate()}
                                        </span>

                                        <div className="space-y-1.5 overflow-y-auto max-h-[100px] scrollbar-hide">
                                            {dayTasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedTask(task);
                                                        setIsDetailsOpen(true);
                                                    }}
                                                    className={`p-1.5 rounded-lg border text-[9px] font-bold leading-tight transition-all shadow-sm hover:brightness-110 active:scale-95
                                                        ${task.label_color && task.label_color !== 'transparent'
                                                            ? `border-white/10 ${task.label_color} text-white`
                                                            : 'bg-surface-dark border-white/5 text-slate-300'}
                                                    `}
                                                >
                                                    <div className="truncate opacity-75 text-[8px] uppercase font-black">
                                                        {(task as any).projects?.name || 'Avulso'}
                                                    </div>
                                                    <div className="line-clamp-2">{task.title}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
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
        </div>
    );
};

export default RenewalControlView;
