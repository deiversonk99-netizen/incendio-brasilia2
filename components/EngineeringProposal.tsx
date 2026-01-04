import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { Project, Proposal } from '../types';
import { useAuth } from '../contexts/AuthContext';
import NewProjectModal from './NewProjectModal';
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

interface EngineeringProposalProps {
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}

const EngineeringProposal: React.FC<EngineeringProposalProps> = ({ selectedProjectId, onSelectProject }) => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  // selectedProjectId is now a prop
  const [loading, setLoading] = useState(false);
  const [pdfSettings, setPdfSettings] = useState<any>({
    show_assinatura: true,
    assinatura: '',
    show_crq: true,
    crq: '',
    show_credentials: true,
    credentials: '',
    credentials_img: '',
    show_referencias: true,
    referencias: '',
    show_carimbo: true,
    carimbo: '',
    carimbo_img: '',
    validade: '10',
    show_cost: true
  });
  const [showPdfSettings, setShowPdfSettings] = useState(false);

  const loadPdfSettings = async (projectId: string) => {
    try {
      const { data } = await supabase
        .from('pdf_settings')
        .select('variables')
        .eq('project_id', projectId)
        .eq('phase', 'ENG_C')
        .single();

      if (data) {
        setPdfSettings({
          show_assinatura: true,
          show_crq: true,
          show_credentials: true,
          show_referencias: true,
          show_carimbo: true,
          show_cost: true,
          ...data.variables
        });
      } else {
        setPdfSettings({
          show_assinatura: true,
          assinatura: '',
          show_crq: true,
          crq: '',
          show_credentials: true,
          credentials: '',
          credentials_img: '',
          show_referencias: true,
          referencias: '',
          show_carimbo: true,
          carimbo: '',
          carimbo_img: '',
          validade: '10',
          show_cost: true
        });
      }
    } catch (e) {
      console.warn('PDF settings load error:', e);
    }
  };

  const handleImageUpload = (field: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      savePdfSettings({ ...pdfSettings, [field]: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const savePdfSettings = async (newSettings: any) => {
    setPdfSettings(newSettings);
    if (!selectedProjectId) return;

    try {
      await supabase
        .from('pdf_settings')
        .upsert({
          project_id: selectedProjectId,
          phase: 'ENG_C',
          variables: newSettings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'project_id, phase' });
    } catch (e) {
      console.error('Error saving PDF settings:', e);
    }
  };
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
    cost_material_base: 0,
    hide_services_pdf: false,
    hide_products_pdf: false
  });

  // Modal State
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [modalTab, setModalTab] = useState<'product' | 'service' | 'custom'>('product');
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<any[]>([]);
  const [newItem, setNewItem] = useState({ name: '', quantity: 1, price: 0 });

  useEffect(() => {
    fetchProjects();
    fetchPaymentMethods();
    fetchExecutionSchedules();
    fetchCatalogs();
  }, []);

  const fetchCatalogs = async () => {
    const { data: products } = await supabase.from('product_catalog').select('name, price').order('name');
    const { data: services } = await supabase.from('services_catalog').select('name, description').order('name');
    if (products) setCatalogItems(products);
    if (services) setServiceCatalog(services);
  };

  useEffect(() => {
    if (selectedProjectId) {
      loadProposalData(selectedProjectId);
      loadPdfSettings(selectedProjectId);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    const project = projects.find(p => p.id === selectedProjectId);
    if (!confirm(`Deseja realmente excluir o projeto "${project?.name}"? Esta ação removerá todos os dados vinculados.`)) return;

    try {
      const { error } = await supabase.from('projects').delete().eq('id', selectedProjectId);
      if (error) throw error;
      onSelectProject('');
      fetchProjects();
    } catch (e) {
      console.error('Error deleting project:', e);
      alert('Erro ao excluir projeto');
    }
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
      .select('id, name, quantity_final, unit_price, origin')
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
      setProposal({
        ...existingProposal,
        cost_material_base: totalCost,
        hide_services_pdf: existingProposal.hide_services_pdf ?? false,
        hide_products_pdf: existingProposal.hide_products_pdf ?? false
      }); // Ensure cost is updated from Phase B always
    } else {
      setProposal(prev => ({
        ...prev,
        project_id: projectId,
        cost_material_base: totalCost,
        hide_services_pdf: false,
        hide_products_pdf: false
      }));
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

  const handleAddItem = async () => {
    if (!selectedProjectId || !user) return;
    setLoading(true);

    const newItemData = {
      project_id: selectedProjectId,
      name: newItem.name,
      quantity_calculated: 0,
      quantity_final: newItem.quantity,
      unit_price: newItem.price,
      origin: 'MANUAL' as const
    };

    const { data, error } = await supabase.from('budget_items').insert(newItemData).select();

    if (error) {
      alert('Erro ao adicionar item: ' + error.message);
    } else {
      setBudgetItems(prev => [...prev, data?.[0]]);
      setIsAddItemModalOpen(false);
      setNewItem({ name: '', quantity: 1, price: 0 });
    }
    setLoading(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este item da proposta?')) return;
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else setBudgetItems(prev => prev.filter(i => i.id !== id));
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
      const pageHeight = doc.internal.pageSize.getHeight();
      const vals = calculateValues();

      // Utility for adding footer
      const addFooter = (doc: any, pageNum: number, totalPages: number) => {
        doc.setFontSize(8);
        doc.setTextColor(150);
        const footerText = `Proposta Comercial - ${project.name} | Página ${pageNum} de ${totalPages}`;
        doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
      };

      // --- PAGE 1: COVER ---
      doc.setFillColor(0, 0, 0); // Black Cover
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Logo Placeholder or Design Element
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(1);
      doc.line(20, 40, 60, 40);

      doc.setFontSize(40);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('PROPOSTA', 20, 80);
      doc.text('COMERCIAL', 20, 100);

      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 200, 200);
      doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 115);

      doc.setFillColor(239, 68, 68); // Red Accent
      doc.rect(0, 140, pageWidth * 0.4, 2, 'F');

      // Project Info on cover
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('PREPARADO PARA:', 20, 200);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(230, 230, 230);
      doc.text(project.client || 'N/A', 20, 208);
      doc.text(project.name, 20, 215);

      doc.setFontSize(10);
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 20, pageHeight - 20);
      doc.text(`Validade: ${proposal.validity_days || 10} dias`, pageWidth - 20, pageHeight - 20, { align: 'right' });

      // --- PAGE 2: SCOPE & OBJECTIVE ---
      doc.addPage();
      doc.setFillColor(0, 0, 0); // Black
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('ESCOPO E OBJETIVO', 20, 25);

      doc.setTextColor(40);
      doc.setFontSize(12);
      doc.text('OBJETIVO DA PROPOSTA', 20, 60);
      doc.setDrawColor(200);
      doc.line(20, 62, 80, 62);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const introText = `A presente proposta tem por objetivo apresentar os custos e condições técnicas para a execução dos serviços de engenharia de segurança contra incêndio no empreendimento "${project.name}", contemplando o fornecimento de materiais e mão de obra conforme detalhamento técnico a seguir.`;
      const splitIntro = doc.splitTextToSize(introText, pageWidth - 40);
      doc.text(splitIntro, 20, 72);

      if (proposal.observations) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('DETALHAMENTO DO ESCOPO', 20, 110);
        doc.line(20, 112, 80, 112);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitObs = doc.splitTextToSize(proposal.observations, pageWidth - 40);
        doc.text(splitObs, 20, 122);
      }

      // --- PAGE 3: INVESTMENT DETAIL ---
      doc.addPage();
      doc.setFillColor(0, 0, 0); // Black
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('DETALHAMENTO DO INVESTIMENTO', 20, 25);

      doc.setTextColor(40);
      doc.setFontSize(11);
      doc.text('ITENS E EQUIPAMENTOS', 20, 55);

      const tableBody = budgetItems
        .filter(item => {
          const isService = serviceCatalog.some(s => s.name === item.name);
          if (isService && proposal.hide_services_pdf) return false;
          if (!isService && proposal.hide_products_pdf) return false;
          return true;
        })
        .map(item => {
          const row = [item.name || 'Item', item.quantity_final || 0];
          if (pdfSettings.show_cost) {
            row.push(`R$ ${Number(item.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            row.push(`R$ ${(Number(item.quantity_final || 0) * Number(item.unit_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
          }
          return row;
        });

      const tableHead = ['Descrição', 'Qtd'];
      if (pdfSettings.show_cost) {
        tableHead.push('Unit. (R$)', 'Total (R$)');
      }

      autoTable(doc, {
        startY: 60,
        head: [tableHead],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 9 },
        columnStyles: pdfSettings.show_cost ? {
          0: { cellWidth: 100 },
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' }
        } : {
          0: { cellWidth: 140 },
          1: { halign: 'center' }
        }
      });

      let yPos = (doc as any).lastAutoTable.finalY + 15;
      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 30; }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO FINANCEIRO', 20, yPos);
      doc.line(20, yPos + 2, 80, yPos + 2);

      const financeBody = pdfSettings.show_cost ? [
        ['Subtotal de Itens', `R$ ${vals.base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['BDI e Taxas Operacionais', `R$ ${vals.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Lucro e Encargos', `R$ ${vals.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Descontos Aplicados', `- R$ ${vals.discountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        [{ content: 'VALOR GLOBAL DO INVESTIMENTO', styles: { fontStyle: 'bold' as const, fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] } },
        { content: `R$ ${vals.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold' as const, fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] } }]
      ] : [
        [{ content: 'VALOR GLOBAL DO INVESTIMENTO', styles: { fontStyle: 'bold' as const, fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] } },
        { content: `R$ ${vals.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold' as const, fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] } }]
      ];

      autoTable(doc, {
        startY: yPos + 6,
        body: financeBody,
        theme: 'grid',
        styles: { fontSize: 10 },
        columnStyles: { 1: { halign: 'right', cellWidth: 60 } }
      });

      // --- PAGE 4: COMMERCIAL TERMS & SIGNATURES ---
      doc.addPage();
      doc.setFillColor(0, 0, 0); // Black
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('CONDIÇÕES COMERCIAIS', 20, 25);

      doc.setTextColor(40);
      autoTable(doc, {
        startY: 60,
        body: [
          ['Cronograma de Execução', proposal.execution_schedule || 'A combinar'],
          ['Condições de Pagamento', proposal.payment_conditions || 'A combinar'],
          ['Validade da Proposta', `${proposal.validity_days || 10} dias a partir desta data`]
        ],
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, fillColor: [248, 250, 252] } }
      });

      yPos = (doc as any).lastAutoTable.finalY + 40;

      // Signatures
      doc.setDrawColor(200);
      let sigYPos = yPos;

      if (pdfSettings.show_assinatura) {
        doc.line(30, sigYPos, 90, sigYPos);
        doc.setFontSize(10);
        doc.text(pdfSettings.assinatura || 'INCÊNDIO BRASÍLIA ENGENHARIA', 60, sigYPos + 6, { align: 'center' });
        if (pdfSettings.show_crq) {
          doc.setFontSize(8);
          doc.text(pdfSettings.crq || 'Responsável Técnico', 60, sigYPos + 12, { align: 'center' });
        }
      }

      // Other stamps/credentials as images or text if toggled
      let otherY = sigYPos + 25;
      if (pdfSettings.show_credentials) {
        if (pdfSettings.credentials_img) {
          doc.addImage(pdfSettings.credentials_img, 'PNG', 30, otherY, 40, 20);
          otherY += 25;
        } else if (pdfSettings.credentials) {
          doc.setFontSize(8);
          doc.text(pdfSettings.credentials, 30, otherY);
          otherY += 10;
        }
      }

      if (pdfSettings.show_carimbo) {
        if (pdfSettings.carimbo_img) {
          doc.addImage(pdfSettings.carimbo_img, 'PNG', 30, otherY, 40, 20);
          otherY += 25;
        } else if (pdfSettings.carimbo) {
          doc.setFontSize(8);
          doc.text(pdfSettings.carimbo, 30, otherY);
          otherY += 10;
        }
      }

      if (pdfSettings.validade) {
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Proposta válida por: ${pdfSettings.validade} dias`, 20, pageHeight - 20);
      }

      // Client signature area removed as requested

      // Add page numbers to all pages except cover? Or all.
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        if (i > 1) { // Skip footer on cover
          addFooter(doc, i, totalPages);
        }
      }

      if (mode === 'preview') {
        const blobUrl = doc.output('bloburl');
        window.open(blobUrl, '_blank');
      } else {
        doc.save(`Proposta_${project.name.replace(/\s+/g, '_')}.pdf`);
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
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-xs font-bold uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
              Em Elaboração
            </span>
            <button
              onClick={() => setIsAddItemModalOpen(true)}
              disabled={!selectedProjectId}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all font-bold text-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Adicionar Item
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">

          {/* PDF Customization Toggle */}
          {selectedProjectId && (
            <div className="bg-surface-dark rounded-xl border border-white/5 overflow-hidden shadow-sm mb-8">
              <button
                onClick={() => setShowPdfSettings(!showPdfSettings)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">settings_applications</span>
                  <span className="font-bold text-white">Configurações do PDF (Engenharia de Segurança)</span>
                </div>
                <span className="material-symbols-outlined text-slate-500">
                  {showPdfSettings ? 'expand_less' : 'expand_more'}
                </span>
              </button>

              {showPdfSettings && (
                <div className="p-6 border-t border-white/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase">Responsável / Assinatura</label>
                      <input
                        type="checkbox"
                        checked={pdfSettings.show_assinatura}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, show_assinatura: e.target.checked })}
                      />
                    </div>
                    <input
                      type="text"
                      disabled={!pdfSettings.show_assinatura}
                      className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none disabled:opacity-50"
                      value={pdfSettings.assinatura}
                      onChange={(e) => savePdfSettings({ ...pdfSettings, assinatura: e.target.value })}
                      placeholder="Nome do engenheiro"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase">CRQ / Registro Profissional</label>
                      <input
                        type="checkbox"
                        checked={pdfSettings.show_crq}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, show_crq: e.target.checked })}
                      />
                    </div>
                    <input
                      type="text"
                      disabled={!pdfSettings.show_crq}
                      className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none disabled:opacity-50"
                      value={pdfSettings.crq}
                      onChange={(e) => savePdfSettings({ ...pdfSettings, crq: e.target.value })}
                      placeholder="Ex: 000.000-D/DF"
                    />
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase">Credenciais da Empresa</label>
                      <input
                        type="checkbox"
                        checked={pdfSettings.show_credentials}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, show_credentials: e.target.checked })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={!pdfSettings.show_credentials}
                        className="flex-1 bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none disabled:opacity-50"
                        value={pdfSettings.credentials}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, credentials: e.target.value })}
                        placeholder="Ex: CNPJ..."
                      />
                      <label className={`p-2 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer flex items-center justify-center ${!pdfSettings.show_credentials ? 'opacity-50 pointer-events-none' : ''}`}>
                        <span className="material-symbols-outlined text-[18px]">image</span>
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload('credentials_img', e.target.files[0])} />
                      </label>
                    </div>
                  </div>

                  <div className="lg:col-span-2 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-400 uppercase">Referências / Observações PDF</label>
                      <input
                        type="checkbox"
                        checked={pdfSettings.show_referencias}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, show_referencias: e.target.checked })}
                      />
                    </div>
                    <textarea
                      disabled={!pdfSettings.show_referencias}
                      className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none h-20 resize-none disabled:opacity-50"
                      value={pdfSettings.referencias}
                      onChange={(e) => savePdfSettings({ ...pdfSettings, referencias: e.target.value })}
                      placeholder="Citações, normas técnicas..."
                    />
                  </div>

                  <div className="flex flex-col gap-8">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase">Carimbo Especial</label>
                        <input
                          type="checkbox"
                          checked={pdfSettings.show_carimbo}
                          onChange={(e) => savePdfSettings({ ...pdfSettings, show_carimbo: e.target.checked })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          disabled={!pdfSettings.show_carimbo}
                          className="flex-1 bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none disabled:opacity-50"
                          value={pdfSettings.carimbo}
                          onChange={(e) => savePdfSettings({ ...pdfSettings, carimbo: e.target.value })}
                          placeholder="Texto..."
                        />
                        <label className={`p-2 rounded-lg border border-white/10 hover:bg-white/5 cursor-pointer flex items-center justify-center ${!pdfSettings.show_carimbo ? 'opacity-50 pointer-events-none' : ''}`}>
                          <span className="material-symbols-outlined text-[18px]">image</span>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload('carimbo_img', e.target.files[0])} />
                        </label>
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="text-xs font-bold text-slate-400 uppercase">Validade (dias)</label>
                      <input
                        type="number"
                        className="w-full bg-background-dark border border-white/10 rounded-lg px-3 py-2 text-white focus:border-primary outline-none"
                        value={pdfSettings.validade}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, validade: e.target.value })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 mt-auto">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white uppercase">Preços de Custo</span>
                        <span className="text-[10px] text-slate-400">Exibir valores e detalhamento financeiro no PDF</span>
                      </div>
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-white/10 bg-background-dark text-primary focus:ring-primary"
                        checked={pdfSettings.show_cost}
                        onChange={(e) => savePdfSettings({ ...pdfSettings, show_cost: e.target.checked })}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Project Selection */}
          <div className="bg-surface-dark p-6 rounded-xl border border-white/5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-400 mb-2">Selecione o Projeto para Proposta</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => onSelectProject(e.target.value)}
                  className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                >
                  <option value="">Selecione...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} - {p.client}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 h-11 shrink-0">
                {selectedProjectId && (
                  <>
                    <button
                      onClick={() => {
                        const project = projects.find(p => p.id === selectedProjectId);
                        if (project) {
                          setProjectToEdit(project);
                          setIsNewProjectModalOpen(true);
                        }
                      }}
                      className="flex items-center justify-center w-11 h-11 rounded-lg bg-surface-dark border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                      title="Editar Projeto"
                    >
                      <span className="material-symbols-outlined text-[20px]">edit</span>
                    </button>
                    <button
                      onClick={handleDeleteProject}
                      className="flex items-center justify-center w-11 h-11 rounded-lg bg-surface-dark border border-white/10 text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-all"
                      title="Excluir Projeto"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setProjectToEdit(null);
                    setIsNewProjectModalOpen(true);
                  }}
                  className="flex items-center gap-2 h-11 px-4 rounded-lg bg-surface-dark border border-white/10 text-white hover:bg-white/5 transition-all text-sm font-medium"
                >
                  <span className="material-symbols-outlined text-[20px] text-primary">add</span>
                  Novo Projeto
                </button>
              </div>
            </div>
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

              {/* Items Table */}
              <div className="bg-surface-dark border border-white/5 rounded-xl overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-black/10">
                  <h3 className="text-white font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
                    <span className="material-symbols-outlined text-primary text-[20px]">list_alt</span>
                    Itens da Proposta
                  </h3>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">{budgetItems.length} Itens</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-slate-400 font-medium uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Descrição</th>
                        <th className="px-6 py-3 text-center">Qtd</th>
                        <th className="px-6 py-3 text-right">Unitário</th>
                        <th className="px-6 py-3 text-right">Total</th>
                        <th className="px-6 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {budgetItems.map(item => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="text-white font-medium text-sm">{item.name}</div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                              {item.origin === 'CALCULATED' ? 'Extraído da Engenharia' : 'Adicionado na Proposta'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-300 font-bold">{item.quantity_final}</td>
                          <td className="px-6 py-4 text-right text-slate-400">R$ {Number(item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 text-right text-white font-bold">R$ {(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 text-right">
                            {item.origin === 'MANUAL' && (
                              <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 hover:bg-rose-500/10 rounded-lg text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {budgetItems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                            Nenhum item na proposta. Adicione itens acima ou finalize a composição na Fase B.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
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
                        <label className="text-slate-400 text-sm font-medium block mb-3">Opções de Exibição (PDF)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <label className="flex items-center gap-3 cursor-pointer group bg-background-dark/50 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all">
                            <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${proposal.hide_products_pdf ? 'bg-primary border-primary' : 'bg-background-dark border-white/10 group-hover:border-white/20'}`}>
                              {proposal.hide_products_pdf && <span className="material-symbols-outlined text-white text-[18px]">check</span>}
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={proposal.hide_products_pdf || false}
                              onChange={e => setProposal({ ...proposal, hide_products_pdf: e.target.checked })}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-white">Ocultar Produtos</span>
                              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Não listar materiais</span>
                            </div>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer group bg-background-dark/50 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all">
                            <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${proposal.hide_services_pdf ? 'bg-primary border-primary' : 'bg-background-dark border-white/10 group-hover:border-white/20'}`}>
                              {proposal.hide_services_pdf && <span className="material-symbols-outlined text-white text-[18px]">check</span>}
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={proposal.hide_services_pdf || false}
                              onChange={e => setProposal({ ...proposal, hide_services_pdf: e.target.checked })}
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-white">Ocultar Serviços</span>
                              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Não listar mão de obra</span>
                            </div>
                          </label>
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

      {/* Add Item Modal */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-6">Adicionar à Proposta</h3>

            {/* Tabs */}
            <div className="flex bg-background-dark p-1 rounded-lg mb-6 border border-white/5">
              {(['product', 'service', 'custom'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => {
                    setModalTab(tab);
                    setNewItem({ name: '', quantity: 1, price: 0 });
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all uppercase ${modalTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {tab === 'product' ? 'Produto' : tab === 'service' ? 'Serviço' : 'Personalizado'}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {modalTab === 'product' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Selecionar Produto</label>
                  <select
                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                    onChange={e => {
                      const p = catalogItems.find(x => x.name === e.target.value);
                      if (p) setNewItem({ ...newItem, name: p.name, price: p.price });
                    }}
                  >
                    <option value="">Selecione...</option>
                    {catalogItems.map(p => <option key={p.name} value={p.name}>{p.name} - R${p.price}</option>)}
                  </select>
                </div>
              )}

              {modalTab === 'service' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Selecionar Serviço</label>
                  <select
                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                    onChange={e => {
                      const s = serviceCatalog.find(x => x.name === e.target.value);
                      // In a real scenario, services might have prices. For now using 0 or descriptive.
                      if (s) setNewItem({ ...newItem, name: s.name, price: 0 });
                    }}
                  >
                    <option value="">Selecione...</option>
                    {serviceCatalog.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {modalTab === 'custom' && (
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Descrição da Proposta (Subjetiva)</label>
                  <textarea
                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 h-24 resize-none"
                    placeholder="Ex: Fornecimento de uma ampliação de uma tubulação enterrada..."
                    value={newItem.name}
                    onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                    value={newItem.quantity}
                    onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Preço Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                    value={newItem.price}
                    onChange={e => setNewItem({ ...newItem, price: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddItem}
                disabled={!newItem.name || loading}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold shadow-lg shadow-indigo-900/20 disabled:opacity-50 transition-all"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => {
          setIsNewProjectModalOpen(false);
          setProjectToEdit(null);
        }}
        projectToEdit={projectToEdit}
        onSuccess={(id) => {
          fetchProjects();
          onSelectProject(id);
        }}
      />
    </div>
  );
};

export default EngineeringProposal;
