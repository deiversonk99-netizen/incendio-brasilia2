
import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import { Project, Transaction } from '../types';
import NewTransactionModal from './NewTransactionModal';

const FinanceView: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialType, setModalInitialType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');

  const fetchData = async () => {
    setLoading(true);
    const [transRes, projRes] = await Promise.all([
      supabase.from('financial_transactions').select('*').order('date', { ascending: false }),
      supabase.from('projects').select('*')
    ]);

    if (transRes.data) setTransactions(transRes.data as Transaction[]);
    if (projRes.data) setProjects(projRes.data as Project[]);
    setLoading(false);
  };

  const handleStatusUpdate = async (id: string, newStatus: 'PAID' | 'PENDING') => {
    const { error } = await supabase
      .from('financial_transactions')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      console.error('Error updating status:', error);
      alert('Erro ao atualizar status.');
    } else {
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) return;
    const { error } = await supabase
      .from('financial_transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting transaction:', error);
      alert('Erro ao excluir transação.');
    } else {
      setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'INCOME');
    const expense = transactions.filter(t => t.type === 'EXPENSE');

    const totalIncome = income.reduce((acc, t) => acc + t.value, 0);
    const totalExpense = expense.reduce((acc, t) => acc + t.value, 0);
    const pendingCount = transactions.filter(t => t.status === 'PENDING').length;

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      pendingCount
    };
  }, [transactions]);

  const chartData = useMemo(() => {
    const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const currentMonth = new Date().getMonth();
    const last6Months = [];

    for (let i = 5; i >= 0; i--) {
      const m = (currentMonth - i + 12) % 12;
      last6Months.push({
        name: months[m],
        monthIdx: m,
        real: 0,
        previsto: 0
      });
    }

    // Calculate real (Paid Income)
    transactions.forEach(t => {
      const tDate = new Date(t.date);
      const tMonth = tDate.getMonth();
      const dataPoint = last6Months.find(d => d.monthIdx === tMonth);
      if (dataPoint) {
        if (t.type === 'INCOME' && t.status === 'PAID') {
          dataPoint.real += t.value;
        }
        if (t.type === 'INCOME') {
          dataPoint.previsto += t.value;
        }
      }
    });

    // Add projects to previsto (if not DONE)
    projects.forEach(p => {
      if (p.status === 'DONE') return;
      // Projects usually have deadline like "15 Out" or ISO. 
      // We try to parse it. If it fails, we ignore for chart or use created_at.
      const pDate = new Date(p.deadline);
      if (isNaN(pDate.getTime())) return;

      const pMonth = pDate.getMonth();
      const dataPoint = last6Months.find(d => d.monthIdx === pMonth);
      if (dataPoint) {
        dataPoint.previsto += p.value;
      }
    });

    return last6Months;
  }, [transactions, projects]);

  const recentSuppliers = useMemo(() => {
    const suppliersMap: Record<string, { name: string, cat: string, count: number }> = {};
    transactions.filter(t => t.type === 'EXPENSE').forEach(t => {
      if (!suppliersMap[t.entity]) {
        suppliersMap[t.entity] = { name: t.entity, cat: t.category || 'Geral', count: 0 };
      }
      suppliersMap[t.entity].count += 1;
    });
    return Object.values(suppliersMap).sort((a, b) => b.count - a.count).slice(0, 3);
  }, [transactions]);

  const openModal = (type: 'INCOME' | 'EXPENSE') => {
    setModalInitialType(type);
    setIsModalOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-8 pb-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-4xl font-black tracking-tight text-white italic">Financeiro</h1>
            <p className="text-slate-400 text-base">Gestão de receitas, despesas e fluxo de caixa real</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openModal('EXPENSE')}
              className="flex items-center gap-2 px-6 py-3 bg-surface-dark border border-white/10 hover:bg-white/5 text-white rounded-xl transition-all text-sm font-bold shadow-lg"
            >
              <span className="material-symbols-outlined text-[20px] text-primary">remove_circle</span>
              <span>Nova Despesa</span>
            </button>
            <button
              onClick={() => openModal('INCOME')}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl transition-all text-sm font-bold shadow-lg shadow-emerald-500/20"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span>Nova Venda</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Receita Total', val: stats.totalIncome, change: '+12%', color: 'emerald', icon: 'trending_up' },
            { label: 'Despesas Totais', val: stats.totalExpense, change: '+5%', color: 'primary', icon: 'trending_down' },
            { label: 'Lucro Líquido', val: stats.netProfit, change: '+8%', color: 'sky', icon: 'payments' },
            { label: 'Pagamentos Pendentes', val: stats.pendingCount, change: 'Atenção', color: 'orange', icon: 'pending_actions', isCount: true },
          ].map((card, i) => (
            <div key={i} className="bg-surface-dark border border-white/5 rounded-2xl p-6 flex flex-col gap-1 shadow-xl hover:border-white/10 transition-all relative overflow-hidden group">
              <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                <span className="material-symbols-outlined text-[64px]">{card.icon}</span>
              </div>
              <div className="flex justify-between items-start relative z-10">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{card.label}</p>
                <span className={`bg-${card.color}-500/10 text-${card.color}-500 text-[10px] px-2 py-0.5 rounded-full font-bold border border-${card.color}-500/20`}>{card.change}</span>
              </div>
              <p className="text-3xl font-black text-white tracking-tight mt-2 relative z-10">
                {card.isCount ? card.val : `R$ ${card.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </p>
              <p className="text-[10px] text-slate-500 mt-2 font-medium">Mês atual</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-surface-dark border border-white/5 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-white italic">Lucro Real vs. Previsto</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Realizado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500/30 border border-emerald-500"></div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Previsto</span>
                </div>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e21d48" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#e21d48" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={10}
                    fontWeight="bold"
                    axisLine={false}
                    tickLine={false}
                    tick={{ dy: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a0b0e', border: '1px solid #46252c', borderRadius: '12px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="previsto" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
                  <Area type="monotone" dataKey="real" stroke="#e21d48" strokeWidth={4} fillOpacity={1} fill="url(#colorReal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-1 bg-surface-dark border border-white/5 rounded-2xl p-8 shadow-2xl flex flex-col">
            <h3 className="text-xl font-black text-white italic mb-6">Entidades Frequentes</h3>
            <div className="flex-1 flex flex-col gap-4">
              {recentSuppliers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 italic text-sm text-center">
                  <span className="material-symbols-outlined text-[48px] mb-2 opacity-20">inventory_2</span>
                  Nenhuma transação registrada
                </div>
              ) : (
                recentSuppliers.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-background-dark/50 border border-white/5 hover:border-primary/30 transition-all cursor-pointer group">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black text-lg group-hover:bg-primary group-hover:text-white transition-all">
                      {s.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{s.name}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">{s.cat}</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-600 group-hover:text-white transition-colors">arrow_forward</span>
                  </div>
                ))
              )}
            </div>
            <button className="mt-8 py-3 w-full rounded-xl border border-white/5 text-xs text-primary font-bold uppercase tracking-widest hover:bg-white/5 transition-all">
              Gerenciar Entidades
            </button>
          </div>
        </div>

        <div className="bg-surface-dark border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-xl font-black text-white italic">Transações Recentes</h3>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-background-dark rounded-lg border border-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Mostrando {transactions.length} registros
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background-dark/50">
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Descrição</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Entidade</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Valor</th>
                  <th className="px-8 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  Array(3).fill(0).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-8 py-4 h-16 bg-white/5"></td>
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-slate-600 italic">Nenhum lançamento encontrado</td>
                  </tr>
                ) : (
                  transactions.map((t, idx) => (
                    <tr key={idx} className="group hover:bg-white/5 transition-all">
                      <td className="px-8 py-5 whitespace-nowrap text-sm text-slate-400 font-medium">
                        {new Date(t.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{t.description}</span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t.category}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5 text-sm text-slate-300 font-medium">{t.entity}</td>
                      <td className="px-8 py-5 whitespace-nowrap text-center">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${t.status === 'PAID'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                          }`}>
                          {t.status === 'PAID' ? 'Pago' : 'Pendente'}
                        </span>
                      </td>
                      <td className={`px-8 py-5 whitespace-nowrap text-right font-black text-base ${t.type === 'INCOME' ? 'text-emerald-400' : 'text-primary'}`}>
                        {t.type === 'INCOME' ? '+' : '-'} R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          {t.status === 'PENDING' && (
                            <button
                              onClick={() => handleStatusUpdate(t.id, 'PAID')}
                              className="w-8 h-8 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 flex items-center justify-center transition-all border border-emerald-500/10"
                              title="Marcar como Pago"
                            >
                              <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTransaction(t.id)}
                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/10 text-slate-500 hover:text-red-500 flex items-center justify-center transition-all border border-white/5 hover:border-red-500/20"
                            title="Excluir Transação"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <NewTransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => fetchData()}
        initialType={modalInitialType}
      />
    </div>
  );
};

export default FinanceView;
