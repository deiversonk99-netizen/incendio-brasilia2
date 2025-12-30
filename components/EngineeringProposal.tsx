import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { Project, Proposal } from '../types';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Add PaymentMethod interface
interface PaymentMethod {
  id: string;
  label: string;
}

// Add ExecutionSchedule interface
interface ExecutionSchedule {
  id: string;
  label: string;
}

const EngineeringProposal: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [executionSchedules, setExecutionSchedules] = useState<ExecutionSchedule[]>([]);

  // Proposal State
  const [proposal, setProposal] = useState<Partial<Proposal>>({
    bdi_percent: 25,
    profit_percent: 15,
    discount_type: 'FIXED',
    discount_value: 0,
    payment_conditions: '',
    execution_schedule: '', // Default empty
    validity_days: 10,
    cost_material_base: 0
  });

  useEffect(() => {
    fetchProjects();
    fetchPaymentMethods();
    fetchExecutionSchedules();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadProposalData(selectedProjectId);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const fetchPaymentMethods = async () => {
    const { data } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('active', true)
      .order('label', { ascending: true });

    if (data) setPaymentMethods(data);
  };

  const fetchExecutionSchedules = async () => {
    const { data } = await supabase
      .from('execution_schedules')
      .select('*')
      .eq('active', true)
      .order('label');

    if (data) setExecutionSchedules(data);
  };

  const loadProposalData = async (projectId: string) => {
    setLoading(true);

    // 1. Fetch Items Cost from Phase B
    const { data: budgetItemsData } = await supabase
      .from('budget_items')
      .select('name, quantity_final, unit_price')
      .eq('project_id', projectId);

    if (budgetItemsData) setBudgetItems(budgetItemsData);
    const totalCost = budgetItemsData?.reduce((acc, item) => acc + (item.quantity_final * item.unit_price), 0) || 0;

    // 2. Fetch Existing Proposal
    const { data: existingProposal } = await supabase
      .from('proposals')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (existingProposal) {
      setProposal({ ...existingProposal, cost_material_base: totalCost }); // Ensure cost is updated from Phase B always
    } else {
      setProposal(prev => ({ ...prev, project_id: projectId, cost_material_base: totalCost }));
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!selectedProjectId || !user) return;
    setSaving(true);
    try {
      const payload = {
        ...proposal,
        user_id: user.id
      };

      // Upsert based on project_id? No, proposal ID logic requires check first or UPSERT on conflict
      // Supabase upsert requires valid ID or constraint. We'll search by project_id for simplicity (1 proposal per project)
      const { data: existing } = await supabase.from('proposals').select('id').eq('project_id', selectedProjectId).single();

      if (existing) {
        await supabase.from('proposals').update(payload).eq('id', existing.id);
      } else {
        await supabase.from('proposals').insert({ ...payload, project_id: selectedProjectId });
      }

      // Sync project value with the final calculated global price
      const { final } = calculateValues();
      await supabase
        .from('projects')
        .update({ value: final })
        .eq('id', selectedProjectId);

      alert('Proposta salva com sucesso! O Valor Global do projeto foi atualizado.');
      fetchProjects(); // Refresh project list to reflect new value
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar proposta.');
    }
    setSaving(false);
  };

  const generatePDF = (mode: 'download' | 'preview' = 'download') => {
    try {
      const project = projects.find(p => p.id === selectedProjectId);
      if (!project || !proposal) {
        alert('Selecione um projeto e aguarde o carregamento dos dados.');
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // -- Header --
      doc.setFillColor(30, 41, 59); // surface-dark like color
      doc.rect(0, 0, pageWidth, 40, 'F');

      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text('PROPOSTA COMERCIAL', 20, 25);

      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text('Incêndio Brasília - Engenharia de Segurança', 20, 33);
      doc.text(`Data: ${new Date().toLocaleDateString()}`, pageWidth - 20, 25, { align: 'right' });

      // -- Client Info --
      doc.setFontSize(12);
      doc.setTextColor(40);
      doc.setFont('helvetica', 'bold');
      doc.text('DADOS DO CLIENTE', 20, 55);
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 57, 100, 57);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Cliente: ${project.client || 'N/A'}`, 20, 65);
      doc.text(`Referência: ${project.name || 'N/A'}`, 20, 71);
      doc.text(`Tipo de Obra: ${project.type || 'N/A'}`, 20, 77);
      doc.text(`Prazo Estimado: ${proposal.execution_schedule || 'N/A'}`, 20, 83);
      doc.text(`Validade da Proposta: ${proposal.validity_days || 10} dias`, 20, 89);

      // -- Items Table --
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DETALHAMENTO TÉCNICO', 20, 105);

      const tableBody = budgetItems.map(item => [
        item.name || 'Item',
        item.quantity_final || 0,
        `R$ ${Number(item.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        `R$ ${(Number(item.quantity_final || 0) * Number(item.unit_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
      ]);

      autoTable(doc, {
        startY: 108,
        head: [['Descrição', 'Qtd', 'Unit. (R$)', 'Total (R$)']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        styles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 100 },
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' }
        }
      });

      let yPos = (doc as any).lastAutoTable.finalY + 15;

      // -- Financial Summary --
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO FINANCEIRO', 20, yPos);
      doc.line(20, yPos + 2, 100, yPos + 2);

      const vals = calculateValues();
      autoTable(doc, {
        startY: yPos + 5,
        body: [
          ['Preço Base (Materiais/Mão de Obra)', `R$ ${vals.base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
          ['BDI e Encargos', `R$ ${vals.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
          ['Lucro Operacional', `R$ ${vals.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
          ['Descontos Aplicados', `- R$ ${vals.discountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
          [{ content: 'VALOR TOTAL FINAL', styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
          { content: `R$ ${vals.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }]
        ],
        theme: 'grid',
        styles: { fontSize: 10 },
        columnStyles: {
          1: { halign: 'right', cellWidth: 50 }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // -- Observations --
      if (proposal.observations) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('OBSERVAÇÕES E ESCOPO', 20, yPos);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const splitObs = doc.splitTextToSize(proposal.observations, pageWidth - 40);
        doc.text(splitObs, 20, yPos + 8);
        yPos += (splitObs.length * 5) + 15;
      }

      // -- Signatures --
      if (yPos > 240) { doc.addPage(); yPos = 30; }
      doc.setFontSize(10);
      doc.text('_________________________________', 20, yPos + 20);
      doc.text('Responsável Técnico', 20, yPos + 26);

      doc.text('_________________________________', pageWidth - 20, yPos + 20, { align: 'right' });
      doc.text('Aceite do Cliente', pageWidth - 20, yPos + 26, { align: 'right' });

      if (mode === 'preview') {
        const blobUrl = doc.output('bloburl');
        window.open(blobUrl, '_blank');
      } else {
        doc.save(`Proposta_${(project?.client || 'Cliente').replace(/\s+/g, '_')}.pdf`);
      }
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF: ' + error.message);
    }
  };

  const calculateValues = () => {
    const base = Number(proposal.cost_material_base) || 0;
    const bdiPct = Number(proposal.bdi_percent) || 0;
    const profitPct = Number(proposal.profit_percent) || 0;

    // Formula: Base * (1+BDI) * (1+Profit) - Discount ??
    // Or additive? Usually BDI is on Cost, Profit is on (Cost+BDI).
    const subtotal = base * (1 + (bdiPct / 100));
    const withProfit = subtotal * (1 + (profitPct / 100));

    let discountVal = 0;
    if (proposal.discount_type === 'FIXED') {
      discountVal = Number(proposal.discount_value) || 0;
    } else {
      discountVal = withProfit * ((Number(proposal.discount_value) || 0) / 100);
    }

    const final = withProfit - discountVal;

    return {
      base,
      bdiVal: subtotal - base,
      profitVal: withProfit - subtotal,
      discountVal,
      final
    };
  };

  const values = calculateValues();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Proposta Comercial"
        subtitle="Formação de preço e exportação de documentos"
        breadcrumbs={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Engenharia</span>
            <span className="material-symbols-outlined text-text-muted text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">Fase C - Proposta</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs font-bold uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              Em Elaboração
            </span>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">

          {/* Project Selection */}
          <div className="bg-surface-dark p-6 rounded-xl border border-white/5 shadow-sm">
            <label className="block text-sm font-medium text-slate-400 mb-2">Selecione o Projeto para Proposta</label>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="w-full md:w-1/2 bg-background-dark border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            >
              <option value="">Selecione...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} - {p.client}</option>
              ))}
            </select>
          </div>

          {selectedProjectId && (
            <>
              {/* Calculation Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface-dark p-5 rounded-xl border border-white/5">
                  <p className="text-slate-400 text-sm font-medium">Custo Material Base</p>
                  <p className="text-white text-2xl font-bold">R$ {values.base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-600 mt-1">Carregado da Fase B</p>
                </div>
                <div className="bg-surface-dark p-5 rounded-xl border border-white/5 group relative">
                  <p className="text-blue-400 text-sm font-medium mb-1">BDI (%)</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      className="w-20 bg-background-dark border border-white/10 rounded px-2 py-1 text-white text-lg font-bold outline-none focus:border-blue-500"
                      value={proposal.bdi_percent}
                      onChange={e => setProposal({ ...proposal, bdi_percent: Number(e.target.value) })}
                    />
                    <span className="text-slate-500 font-bold">+ R$ {values.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="bg-surface-dark p-5 rounded-xl border border-white/5">
                  <p className="text-green-400 text-sm font-medium mb-1">Lucro (%)</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      className="w-20 bg-background-dark border border-white/10 rounded px-2 py-1 text-white text-lg font-bold outline-none focus:border-green-500"
                      value={proposal.profit_percent}
                      onChange={e => setProposal({ ...proposal, profit_percent: Number(e.target.value) })}
                    />
                    <span className="text-slate-500 font-bold">+ R$ {values.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <div className="bg-primary/10 p-5 rounded-xl border border-primary/50 shadow-lg shadow-primary/5">
                  <p className="text-primary text-sm font-bold uppercase">Preço Global</p>
                  <p className="text-white text-3xl font-black">R$ {values.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>

                  {(values.discountVal > 0) && (
                    <p className="text-xs text-red-400 mt-1 font-bold">Desconto: - R$ {values.discountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <div className="bg-surface-dark border border-white/5 rounded-xl p-6">
                    <h3 className="text-white text-lg font-bold mb-6 flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400">gavel</span>
                      Termos e Condições
                    </h3>
                    <div className="space-y-6">
                      {/* Discount Section */}
                      <div className="grid grid-cols-2 gap-4 p-4 bg-background-dark/50 rounded-lg border border-white/5 border-l-4 border-l-red-500/50">
                        <div>
                          <label className="text-slate-400 text-xs font-bold uppercase block mb-2">Tipo Desconto</label>
                          <select
                            className="w-full bg-background-dark border border-white/10 rounded-lg py-2 px-3 text-white text-sm"
                            value={proposal.discount_type}
                            onChange={e => setProposal({ ...proposal, discount_type: e.target.value as any })}
                          >
                            <option value="FIXED">Valor Fixo (R$)</option>
                            <option value="PERCENTAGE">Percentual (%)</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs font-bold uppercase block mb-2">Valor Desconto</label>
                          <input
                            type="number"
                            className="w-full bg-background-dark border border-white/10 rounded-lg py-2 px-3 text-white text-sm"
                            value={proposal.discount_value}
                            onChange={e => setProposal({ ...proposal, discount_value: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-slate-400 text-sm font-medium block mb-2">Condições de Pagamento</label>
                        <select
                          className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 px-4 text-white focus:border-primary outline-none transition-colors"
                          value={proposal.payment_conditions}
                          onChange={e => setProposal({ ...proposal, payment_conditions: e.target.value })}
                        >
                          <option value="">Selecione...</option>
                          {paymentMethods.map(method => (
                            <option key={method.id} value={method.label}>{method.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="text-slate-400 text-sm font-medium block mb-2">Cronograma Estimado</label>
                          <select
                            className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 px-4 text-white focus:border-primary outline-none transition-colors"
                            value={proposal.execution_schedule}
                            onChange={e => setProposal({ ...proposal, execution_schedule: e.target.value })}
                          >
                            <option value="">Selecione...</option>
                            {executionSchedules.map(schedule => (
                              <option key={schedule.id} value={schedule.label}>{schedule.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-slate-400 text-sm font-medium block mb-2">Validade (Dias)</label>
                          <select
                            className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 px-4 text-white focus:border-primary outline-none transition-colors"
                            value={proposal.validity_days}
                            onChange={e => setProposal({ ...proposal, validity_days: Number(e.target.value) })}
                          >
                            <option value={5}>05 dias</option>
                            <option value={10}>10 dias</option>
                            <option value={15}>15 dias</option>
                            <option value={30}>30 dias</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-slate-400 text-sm font-medium block mb-2">Observações / Escopo</label>
                        <textarea
                          className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 px-4 text-white h-24 focus:border-primary outline-none transition-colors"
                          placeholder="Detalhes adicionais..."
                          value={proposal.observations || ''}
                          onChange={e => setProposal({ ...proposal, observations: e.target.value })}
                        ></textarea>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">save</span>
                    {saving ? 'Salvando...' : 'Salvar Proposta'}
                  </button>

                  <div className="bg-surface-dark border border-white/5 rounded-xl p-6 shadow-lg">
                    <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center mb-4">
                      <span className="material-symbols-outlined text-primary text-2xl">picture_as_pdf</span>
                    </div>
                    <h3 className="text-white font-bold">Proposta Formal</h3>
                    <p className="text-slate-400 text-sm mt-1 mb-4">Gera documento A4 completo com capa e termos técnicos.</p>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => generatePDF('preview')}
                        className="w-full bg-white/5 hover:bg-white/10 text-white font-bold py-3 rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                        Visualizar PDF
                      </button>
                      <button
                        onClick={() => generatePDF('download')}
                        className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">download</span>
                        Baixar PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default EngineeringProposal;
