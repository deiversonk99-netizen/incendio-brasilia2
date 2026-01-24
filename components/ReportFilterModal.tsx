import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { supabase } from '../lib/supabase';

interface ReportFilterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onGenerate: (filters: ReportFilters) => void;
    isLoading?: boolean;
}

export interface ReportFilters {
    startDate: string;
    endDate: string;
    category: string;
    status: 'ALL' | 'PAID' | 'PENDING';
    search: string;
}

const ReportFilterModal: React.FC<ReportFilterModalProps> = ({
    isOpen,
    onClose,
    onGenerate,
    isLoading = false
}) => {
    const [filters, setFilters] = useState<ReportFilters>({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
        endDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0],
        category: 'ALL',
        status: 'ALL',
        search: ''
    });

    const [categories, setCategories] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    const fetchCategories = async () => {
        const { data } = await supabase.from('financial_transactions').select('category');
        if (data) {
            const uniqueCats = Array.from(new Set(data.map((item: { category: string }) => item.category).filter(Boolean)));
            setCategories(uniqueCats as string[]);
        }
    };

    const handlePreset = (type: 'thisMonth' | 'lastMonth' | 'last90') => {
        const now = new Date();
        let start = new Date();
        let end = new Date();

        if (type === 'thisMonth') {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        } else if (type === 'lastMonth') {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            end = new Date(now.getFullYear(), now.getMonth(), 0);
        } else if (type === 'last90') {
            start = new Date();
            start.setDate(now.getDate() - 90);
            end = now;
        }

        setFilters((prev: ReportFilters) => ({
            ...prev,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        }));
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (filters.endDate < filters.startDate) {
            setError('A data final não pode ser anterior à data inicial.');
            return;
        }
        setError(null);
        onGenerate(filters);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-lg rounded-2xl bg-surface-dark border border-white/10 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300">
                <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/5">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-sky-400">filter_list</span>
                        <h2 className="text-xl font-black text-white italic tracking-tight">Configurar Relatório</h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto flex-1">
                    <div className="space-y-4">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-widest">Período de Referência</label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <span className="text-[10px] text-slate-400 font-medium">De:</span>
                                <input
                                    type="date"
                                    required
                                    value={filters.startDate}
                                    onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                                    className="w-full rounded-xl bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-sky-500 outline-none text-sm transition-all"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <span className="text-[10px] text-slate-400 font-medium">Até:</span>
                                <input
                                    type="date"
                                    required
                                    value={filters.endDate}
                                    onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                                    className="w-full rounded-xl bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-sky-500 outline-none text-sm transition-all"
                                />
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => handlePreset('thisMonth')}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-slate-400 hover:text-white border border-white/5 transition-all"
                            >
                                Este Mês
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePreset('lastMonth')}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-slate-400 hover:text-white border border-white/5 transition-all"
                            >
                                Mês Passado
                            </button>
                            <button
                                type="button"
                                onClick={() => handlePreset('last90')}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-slate-400 hover:text-white border border-white/5 transition-all"
                            >
                                Últimos 90 dias
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-widest">Categoria</label>
                            <select
                                value={filters.category}
                                onChange={e => setFilters({ ...filters, category: e.target.value })}
                                className="w-full rounded-xl bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-sky-500 outline-none text-sm transition-all appearance-none cursor-pointer"
                            >
                                <option value="ALL">Todas as Categorias</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-widest">Status</label>
                            <select
                                value={filters.status}
                                onChange={e => setFilters({ ...filters, status: e.target.value as any })}
                                className="w-full rounded-xl bg-background-dark border border-white/10 px-4 py-3 text-white focus:border-sky-500 outline-none text-sm transition-all appearance-none cursor-pointer"
                            >
                                <option value="ALL">Todos os Status</option>
                                <option value="PAID">Pago / Recebido</option>
                                <option value="PENDING">Pendente</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 tracking-widest">Projeto / Cliente</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                            <input
                                type="text"
                                value={filters.search}
                                onChange={e => setFilters({ ...filters, search: e.target.value })}
                                className="w-full rounded-xl bg-background-dark border border-white/10 pl-12 pr-4 py-3 text-white focus:border-sky-500 outline-none text-sm transition-all"
                                placeholder="Buscar por nome ou projeto..."
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                            <span className="material-symbols-outlined text-red-500">warning</span>
                            <p className="text-xs text-red-400 font-bold">{error}</p>
                        </div>
                    )}

                    <div className="pt-6 flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-xl border border-white/10 py-4 font-black text-[11px] uppercase tracking-[2px] text-slate-400 hover:bg-white/5 hover:text-white transition-all shadow-lg"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 rounded-xl bg-sky-600 py-4 font-black text-[11px] uppercase tracking-[2px] text-white shadow-xl shadow-sky-600/20 hover:bg-sky-500 disabled:opacity-50 transition-all flex items-center justify-center gap-3 group"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <span>Processando...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">picture_as_pdf</span>
                                    <span>Gerar PDF</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReportFilterModal;
