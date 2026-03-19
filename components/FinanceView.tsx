
import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { supabase } from '../lib/supabase';
import { Project, Transaction } from '../types';
import NewTransactionModal from './NewTransactionModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReportFilterModal, { ReportFilters } from './ReportFilterModal';
import { Button, Card } from './ui';
import { useAuth } from '../contexts/AuthContext';

const FinanceView: React.FC = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialType, setModalInitialType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const canLaunch = useMemo(() => {
    const allowedIds = [
      '30c7f748-9e2e-4632-9950-4bff1311aa44', // incendiobrasilia@gmail.com
      'fccae473-8363-4d73-8a12-f4a295229a3e', // contato@incendiobrasilia.com.br
      'd0de3a9e-c949-4665-9101-298f4a11c314'  // cleodson.batata@gmail.com
    ];
    return user?.id && allowedIds.includes(user.id);
  }, [user]);

  // Advanced Filters State
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
  );
  const [filterType, setFilterType] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [showFilters, setShowFilters] = useState(false);

  // Forecasting State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(new Date().getMonth());

  const monthsList = useMemo(() => {
    return [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
  }, []);

  const activeMonthLabel = monthsList[selectedMonthIdx];

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
      setTransactions((prev: Transaction[]) => prev.map((t: Transaction) => t.id === id ? { ...t, status: newStatus } : t));
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
      setTransactions(prev => prev.filter((t: Transaction) => t.id !== id));
    }
  };

  const handleDuplicateTransaction = async (transaction: Transaction) => {
    try {
      const { id, created_at, ...duplicateData } = transaction as any;
      const { error } = await supabase
        .from('financial_transactions')
        .insert({
          ...duplicateData,
          description: `${duplicateData.description} (Cópia)`,
          status: 'PENDING', // Default to pending for safety
          date: new Date().toISOString().split('T')[0] // Default to today
        });

      if (error) throw error;
      alert('Transação duplicada com sucesso!');
      fetchData();
    } catch (e: any) {
      console.error('Error duplicating transaction:', e);
      alert('Erro ao duplicar transação: ' + e.message);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Sync Start/End dates when Month/Year preset changes
  useEffect(() => {
    const start = new Date(selectedYear, selectedMonthIdx, 1);
    const end = new Date(selectedYear, selectedMonthIdx + 1, 0);
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, [selectedMonthIdx, selectedYear]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t: Transaction) => {
      const tDateStr = t.date;
      const isWithinDateRange = tDateStr >= startDate && tDateStr <= endDate;

      if (!isWithinDateRange) return false;

      const matchesType = filterType === 'ALL' || t.type === filterType;
      if (!matchesType) return false;

      const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus;
      if (!matchesStatus) return false;

      if (!searchTerm) return true;

      const search = searchTerm.toLowerCase();
      return (
        t.description?.toLowerCase().includes(search) ||
        t.entity?.toLowerCase().includes(search) ||
        t.category?.toLowerCase().includes(search)
      );
    });
  }, [transactions, startDate, endDate, filterType, filterStatus, searchTerm]);

  const generateFinancialReport = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO FINANCEIRO', 20, 25);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 32);

    // Filter Info
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.text(`Período: ${new Date(startDate).toLocaleDateString('pt-BR')} até ${new Date(endDate).toLocaleDateString('pt-BR')}`, 20, 50);
    doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 20, 50, { align: 'right' });

    // Summary Section
    doc.setDrawColor(230);
    doc.line(20, 55, pageWidth - 20, 55);

    const sIncome = filteredTransactions.filter((t: Transaction) => t.type === 'INCOME').reduce((acc: number, t: Transaction) => acc + t.value, 0);
    const sExpense = filteredTransactions.filter((t: Transaction) => t.type === 'EXPENSE').reduce((acc: number, t: Transaction) => acc + t.value, 0);
    const sNet = sIncome - sExpense;

    autoTable(doc, {
      startY: 60,
      head: [['Resumo Financeiro do Período', '']],
      body: [
        ['Total de Receitas', `R$ ${sIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Total de Despesas', `R$ ${sExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Saldo Líquido', `R$ ${sNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ],
      theme: 'plain',
      styles: { fontSize: 11, cellPadding: 2 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 2) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = sNet >= 0 ? [16, 185, 129] : [226, 29, 72];
        }
      }
    });

    // Transactions Table
    const tableBody = filteredTransactions.map((t: Transaction) => [
      new Date(t.date).toLocaleDateString('pt-BR'),
      t.description,
      t.entity,
      t.type === 'INCOME' ? 'Receita' : 'Despesa',
      t.status === 'PAID' ? 'Pago' : 'Pendente',
      `R$ ${t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Data', 'Descrição', 'Entidade', 'Tipo', 'Status', 'Valor']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 'auto' },
        5: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`Relatorio_Financeiro_${startDate}_${endDate}.pdf`);
  };

  const handleGenerateReport = async (filters: ReportFilters) => {
    setIsGeneratingReport(true);
    try {
      let query = supabase.from('financial_transactions').select('*');

      if (filters.startDate) query = query.gte('date', filters.startDate);
      if (filters.endDate) query = query.lte('date', filters.endDate);
      if (filters.category !== 'ALL') query = query.eq('category', filters.category);
      if (filters.status !== 'ALL') query = query.eq('status', filters.status);

      const { data, error } = await query.order('date', { ascending: false });

      if (error) throw error;

      const reportData = data as Transaction[];

      // Filter by search (case insensitive) if provided
      const finalData = filters.search
        ? reportData.filter(t =>
          t.description?.toLowerCase().includes(filters.search.toLowerCase()) ||
          t.entity?.toLowerCase().includes(filters.search.toLowerCase()) ||
          t.category?.toLowerCase().includes(filters.search.toLowerCase())
        )
        : reportData;

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header
      doc.setFillColor(0, 0, 0);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('RELATÓRIO FINANCEIRO', 20, 25);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 32);

      // Filter Info
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      const periodLabel = `Período: ${new Date(filters.startDate).toLocaleDateString('pt-BR')} até ${new Date(filters.endDate).toLocaleDateString('pt-BR')}`;
      doc.text(periodLabel, 20, 50);
      doc.text(`Emissão: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 20, 50, { align: 'right' });

      // Summary Section
      doc.setDrawColor(230);
      doc.line(20, 55, pageWidth - 20, 55);

      const sIncome = finalData.filter((t: Transaction) => t.type === 'INCOME').reduce((acc: number, t: Transaction) => acc + t.value, 0);
      const sExpense = finalData.filter((t: Transaction) => t.type === 'EXPENSE').reduce((acc: number, t: Transaction) => acc + t.value, 0);
      const sNet = sIncome - sExpense;

      autoTable(doc, {
        startY: 60,
        head: [['Resumo Financeiro do Período', '']],
        body: [
          ['Total de Receitas', `R$ ${sIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
          ['Total de Despesas', `R$ ${sExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
          ['Saldo Líquido', `R$ ${sNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ],
        theme: 'plain',
        styles: { fontSize: 11, cellPadding: 2 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 }, 1: { halign: 'right' } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.row.index === 2) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = sNet >= 0 ? [16, 185, 129] : [226, 29, 72];
          }
        }
      });

      // Transactions Table
      const tableBody = finalData.map((t: Transaction) => [
        new Date(t.date).toLocaleDateString('pt-BR'),
        t.description,
        t.entity,
        t.type === 'INCOME' ? 'Receita' : 'Despesa',
        t.status === 'PAID' ? 'Pago' : 'Pendente',
        `R$ ${t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 15,
        head: [['Data', 'Descrição', 'Entidade', 'Tipo', 'Status', 'Valor']],
        body: tableBody,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 'auto' },
          5: { halign: 'right', fontStyle: 'bold' }
        }
      });

      doc.save(`Relatorio_Financeiro_${filters.startDate}_${filters.endDate}.pdf`);
      setIsReportModalOpen(false);
    } catch (e: any) {
      console.error('Error generating report:', e);
      alert('Erro ao gerar relatório: ' + e.message);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const stats = useMemo(() => {
    const income = filteredTransactions.filter((t: Transaction) => t.type === 'INCOME');
    const expense = filteredTransactions.filter((t: Transaction) => t.type === 'EXPENSE');

    const totalIncome = income.reduce((acc: number, t: Transaction) => acc + t.value, 0);
    const totalExpense = expense.reduce((acc: number, t: Transaction) => acc + t.value, 0);
    const pendingCount = filteredTransactions.filter((t: Transaction) => t.status === 'PENDING').length;

    return {
      totalIncome,
      totalExpense,
      netProfit: totalIncome - totalExpense,
      pendingCount
    };
  }, [filteredTransactions]);

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
    transactions.forEach((t: Transaction) => {
      const tDate = new Date(t.date);
      const tMonth = tDate.getMonth();
      const dataPoint = last6Months.find((d: any) => d.monthIdx === tMonth);
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
    projects.forEach((p: Project) => {
      if (p.status === 'DONE') return;
      // Projects usually have deadline like "15 Out" or ISO. 
      // We try to parse it. If it fails, we ignore for chart or use created_at.
      const pDate = new Date(p.deadline);
      if (isNaN(pDate.getTime())) return;

      const pMonth = pDate.getMonth();
      const dataPoint = last6Months.find((d: any) => d.monthIdx === pMonth);
      if (dataPoint) {
        dataPoint.previsto += p.value;
      }
    });

    return last6Months;
  }, [transactions, projects]);

  const recentSuppliers = useMemo(() => {
    const suppliersMap: Record<string, { name: string, cat: string, count: number }> = {};
    transactions.filter((t: Transaction) => t.type === 'EXPENSE').forEach((t: Transaction) => {
      if (!suppliersMap[t.entity]) {
        suppliersMap[t.entity] = { name: t.entity, cat: t.category || 'Geral', count: 0 };
      }
      suppliersMap[t.entity].count += 1;
    });
    return Object.values(suppliersMap).sort((a: any, b: any) => b.count - a.count).slice(0, 3);
  }, [transactions]);

  const openModal = (type: 'INCOME' | 'EXPENSE', transaction: Transaction | null = null) => {
    setModalInitialType(type);
    setEditingTransaction(transaction);
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
            <Button
              variant={showFilters ? 'primary' : 'secondary'}
              onClick={() => setShowFilters(!showFilters)}
            >
              <span className="material-symbols-outlined mr-2">{showFilters ? 'filter_list_off' : 'filter_list'}</span>
              Filtros Avançados
            </Button>

            <Button
              variant="secondary"
              onClick={() => setIsReportModalOpen(true)}
            >
              <span className="material-symbols-outlined mr-2 text-sky-400">picture_as_pdf</span>
              Gerar Relatório
            </Button>

            {canLaunch && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => openModal('EXPENSE')}
                >
                  <span className="material-symbols-outlined mr-2 text-primary">remove_circle</span>
                  Nova Despesa
                </Button>

                <Button
                  onClick={() => openModal('INCOME')}
                  className="bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20"
                >
                  <span className="material-symbols-outlined mr-2">add_circle</span>
                  Nova Venda
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'Receita Total', val: stats.totalIncome, change: '+12%', color: 'emerald', icon: 'trending_up' },
            { label: 'Despesas Totais', val: stats.totalExpense, change: '+5%', color: 'primary', icon: 'trending_down' },
            { label: 'Lucro Líquido', val: stats.netProfit, change: '+8%', color: 'sky', icon: 'payments' },
            { label: 'Pagamentos Pendentes', val: stats.pendingCount, change: 'Atenção', color: 'orange', icon: 'pending_actions', isCount: true },
          ].map((card, i) => (
            <div key={i} className="ds-card p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <span className="material-symbols-outlined text-[64px]">{card.icon}</span>
              </div>
              <div className="flex justify-between items-start relative z-10">
                <p className="ds-label">{card.label}</p>
                <span className={`bg-${card.color}-500/10 text-${card.color}-500 text-[10px] px-2 py-0.5 rounded-full font-bold border border-${card.color}-500/20`}>
                  {card.change}
                </span>
              </div>
              <p className="text-3xl font-black text-white tracking-tight mt-2 relative z-10">
                {card.isCount ? card.val : `R$ ${card.val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              </p>
              <p className="text-[10px] text-slate-500 mt-2 font-medium">
                {monthsList[selectedMonthIdx]} de {selectedYear}
              </p>
            </div>
          ))}
        </div>

        {showFilters && (
          <div className="bg-surface-dark border border-indigo-500/30 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-top-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Inicial</label>
                <input
                  type="date"
                  className="bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-primary"
                  value={startDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Final</label>
                <input
                  type="date"
                  className="bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-primary"
                  value={endDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo de Lançamento</label>
                <select
                  className="bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-primary"
                  value={filterType}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterType(e.target.value as any)}
                >
                  <option value="ALL">Todos os Tipos</option>
                  <option value="INCOME">Somente Receitas</option>
                  <option value="EXPENSE">Somente Despesas</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</label>
                <select
                  className="bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-primary"
                  value={filterStatus}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterStatus(e.target.value as any)}
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PAID">Pago / Recebido</option>
                  <option value="PENDING">Pendente</option>
                </select>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-white/5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setFilterType('ALL');
                  setFilterStatus('ALL');
                  setSearchTerm('');
                  const start = new Date(selectedYear, selectedMonthIdx, 1);
                  const end = new Date(selectedYear, selectedMonthIdx + 1, 0);
                  setStartDate(start.toISOString().split('T')[0]);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                className="text-xs text-slate-500 hover:text-white font-bold uppercase tracking-wider transition-colors"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Card
            className="lg:col-span-2"
            title="Lucro Real vs. Valor Global"
            description="Acompanhamento de fluxo de caixa realizado vs. previsto"
          >
            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="var(--color-neutral-500)"
                    fontSize={10}
                    fontWeight="bold"
                    axisLine={false}
                    tickLine={false}
                    tick={{ dy: 10 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '12px'
                    }}
                    itemStyle={{ fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="previsto" stroke="var(--color-success)" strokeWidth={2} strokeDasharray="5 5" fill="transparent" />
                  <Area type="monotone" dataKey="real" stroke="var(--color-primary)" strokeWidth={4} fillOpacity={1} fill="url(#colorReal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Entidades Frequentes"
            description="Maiores parceiros comerciais no mês"
            className="flex flex-col"
          >
            <div className="flex-1 flex flex-col gap-4">
              {recentSuppliers.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 italic text-sm text-center py-10">
                  <span className="material-symbols-outlined text-[48px] mb-2 opacity-20">inventory_2</span>
                  Nenhuma transação registrada
                </div>
              ) : (
                recentSuppliers.slice(0, 5).map((s: any, idx: number) => (
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
            <Button variant="ghost" size="sm" className="mt-6 w-full opacity-60 hover:opacity-100">
              Gerenciar Entidades
            </Button>
          </Card>
        </div>

        <Card
          title="Fluxo de Caixa"
          description={`Detalhamento de lançamentos para ${activeMonthLabel} / ${selectedYear}`}
        >
          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                <input
                  type="text"
                  placeholder="Pesquisar por descrição, entidade ou categoria..."
                  className="w-full bg-background-dark border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-primary outline-none transition-all placeholder:text-slate-600"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <select
                  className="bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-primary outline-none"
                  value={filterType}
                  onChange={(e: any) => setFilterType(e.target.value)}
                >
                  <option value="ALL">Todas Lançamentos</option>
                  <option value="INCOME">Somente Entradas</option>
                  <option value="EXPENSE">Somente Saídas</option>
                </select>
                <select
                   className="bg-background-dark border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-primary outline-none"
                   value={filterStatus}
                   onChange={(e: any) => setFilterStatus(e.target.value)}
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="PAID">Pago/Recebido</option>
                  <option value="PENDING">Pendente</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 bg-background-dark/50 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-3">
                   <div className="flex flex-col">
                     <span className="text-[10px] text-slate-500 uppercase font-bold px-1 mb-1">Data Inicial</span>
                     <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-background-dark border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-primary" />
                   </div>
                   <div className="flex flex-col">
                     <span className="text-[10px] text-slate-500 uppercase font-bold px-1 mb-1">Data Final</span>
                     <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-background-dark border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-primary" />
                   </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-background-dark p-1 rounded-lg border border-white/10">
                    <button onClick={() => setSelectedYear((y: number) => y - 1)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-white/5"><span className="material-symbols-outlined text-[16px]">chevron_left</span></button>
                    <span className="text-xs font-black text-white px-2 italic">{selectedYear}</span>
                    <button onClick={() => setSelectedYear((y: number) => y + 1)} className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-white/5"><span className="material-symbols-outlined text-[16px]">chevron_right</span></button>
                  </div>
                  <div className="flex flex-wrap gap-1 bg-background-dark p-1 rounded-lg border border-white/10">
                    {monthsList.map((m, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedMonthIdx(idx)}
                        className={`px-2 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all ${selectedMonthIdx === idx ? 'bg-primary text-white shadow-lg' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                      >
                        {m.substring(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>
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
                      <td colSpan={6} className="px-8 py-4 h-16 bg-white/5"></td>
                    </tr>
                  ))
                ) : filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-20 text-center text-slate-600 italic">Nenhum lançamento encontrado para este período</td>
                  </tr>
                ) : (
                  filteredTransactions.map((t: Transaction, idx: number) => (
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
                      <td className="px-8 py-5 whitespace-nowrap text-right font-black text-base">
                        <div className="flex flex-col items-end">
                          <span className={t.type === 'INCOME' ? 'text-emerald-400' : 'text-primary'}>
                            {t.type === 'INCOME' ? '+' : '-'} R$ {t.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          {t.installment_number && (
                            <span className="text-[9px] text-slate-600 font-bold uppercase tracking-tighter">
                              Parcela {t.installment_number} de {t.total_installments}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5 whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openModal(t.type, t)}
                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white flex items-center justify-center transition-all border border-white/5"
                            title="Editar Transação"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button
                            onClick={() => handleDuplicateTransaction(t)}
                            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-blue-500/10 text-slate-500 hover:text-blue-400 flex items-center justify-center transition-all border border-white/5 hover:border-blue-500/20"
                            title="Duplicar Transação"
                          >
                            <span className="material-symbols-outlined text-[18px]">content_copy</span>
                          </button>
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
        </Card>
      </div >

      <NewTransactionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(null);
        }}
        onSuccess={() => fetchData()}
        initialType={modalInitialType}
        editingTransaction={editingTransaction}
      />

      <ReportFilterModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onGenerate={handleGenerateReport}
        isLoading={isGeneratingReport}
      />
    </div >
  );
};

export default FinanceView;
