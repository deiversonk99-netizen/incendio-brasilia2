import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import ProposalSections from './ProposalSections';
import { supabase } from '../lib/supabase';
import { Project, Proposal } from '../types';
import { useAuth } from '../contexts/AuthContext';
import NewProjectModal from './NewProjectModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';

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
    show_cost: true,
    show_cost_column: false, // New: Toggle Cost Price Column in PDF
    show_subtotal: true, // New
    show_bdi: true, // New
    show_profit: true, // New
    show_discount: true, // New

    show_total: true, // New
    visible_manual_items: [], // New: Array of item names to keep visible
    hide_product_values: false, // New: Hide values and correlate scope

    // Certificates
    show_cert_crq: true,
    cert_crq_file: null, // Base64 or URL. If null, try default
    show_cert_regularity: true,
    cert_regularity_file: null
  });
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [candidateItems, setCandidateItems] = useState<any[]>([]);
  const [tempVisibleItems, setTempVisibleItems] = useState<string[]>([]);
  const [sections, setSections] = useState<any[]>([]); // Dynamic Sections State

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
          show_subtotal: true,
          show_bdi: true,
          show_profit: true,
          show_discount: true,
          show_total: true,
          visible_manual_items: [],
          hide_product_values: false,
          show_cert_crq: true,
          show_cert_regularity: true,
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
          show_cost: true,
          show_cost_column: false,
          show_subtotal: true,
          show_bdi: true,
          show_profit: true,
          show_discount: true,

          show_total: true,
          visible_manual_items: [],
          hide_product_values: false,

          show_cert_crq: true,
          show_cert_regularity: true,
          cert_crq_file: null,
          cert_regularity_file: null
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

  const handleHideProductsToggle = (checked: boolean) => {
    if (!checked) {
      setProposal({ ...proposal, hide_products_pdf: false });
      return;
    }

    // Logic to find candidates: Standard Products are HIDDEN. We want to find "Gray Area" items (Manual or Service)
    // that the user might want to KEEP.
    const potentialCandidates = budgetItems.filter(item => {
      const isModel = item.name.includes('[MODELO:');
      const isInfra = item.name.includes('[INFRA:');
      if (isModel || isInfra) return false;

      // It's a candidate if it's NOT a standard catalog product (or if it's a Service)
      const isStandardProduct = catalogItems.some(p => p.name === item.name);

      // If it's a standard product, it will be hidden by "Hide Products". We don't ask about it.
      if (isStandardProduct) return false;

      // If it's NOT a standard product, it might be a Custom Item or a Service.
      // We offer the user the choice to keep it visible.
      return true;
    });

    if (potentialCandidates.length > 0) {
      setCandidateItems(potentialCandidates);
      // Default: Select all candidates to be visible initially (User unchecks what they don't want?)
      // User request: "choose which ... that appear". implying opt-in.
      // Let's pre-select all, as he usually wants them to appear.
      setTempVisibleItems(potentialCandidates.map(i => i.name));
      setShowVisibilityModal(true);
    } else {
      // No custom items found, just hide products
      setProposal({ ...proposal, hide_products_pdf: true });
    }
  };

  const confirmVisibilitySelection = () => {
    savePdfSettings({ ...pdfSettings, visible_manual_items: tempVisibleItems });
    setProposal({ ...proposal, hide_products_pdf: true });
    setShowVisibilityModal(false);
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

  const fetchSections = async (projectId: string) => {
    const { data } = await supabase
      .from('proposal_sections')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index');
    if (data) setSections(data);
  };

  useEffect(() => {
    if (selectedProjectId) {
      loadProposalData(selectedProjectId);
      loadPdfSettings(selectedProjectId);
      fetchSections(selectedProjectId);
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
      .select('id, name, quantity_final, unit_price, cost_price, origin, item_type')
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
      origin: 'MANUAL' as const,
      item_type: modalTab === 'service' ? 'SERVICE' : 'PRODUCT'
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

  const handleUpdateItem = async (id: string, field: 'unit_price' | 'cost_price', value: number) => {
    // Optimistic update
    setBudgetItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

    const { error } = await supabase
      .from('budget_items')
      .update({ [field]: value })
      .eq('id', id);

    if (error) {
      console.error('Error updating item:', error);
      alert('Erro ao atualizar item: ' + error.message);
    }
  };

  const generatePDF = async (mode: 'download' | 'preview' = 'download') => {
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

      // --- PAGE 2: SCOPE & OBJECTIVE (Dynamic) ---
      // We show this page if:
      // A. We have dynamic sections
      // OR
      // B. We are NOT hiding product values (Standard Mode)
      // OR
      // C. We ARE hiding product values BUT have observations (Old Mode)

      const hasDynamicSections = sections.some(s => s.is_active);
      const showStandardScope = !pdfSettings.hide_product_values;

      if (hasDynamicSections || showStandardScope) {
        doc.addPage();
        doc.setFillColor(0, 0, 0); // Black
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('ESCOPO TÉCNICO E OBJETIVO', 20, 25);

        let yPos = 60;

        if (hasDynamicSections) {
          // Render Dynamic Sections
          sections.filter(s => s.is_active).forEach(section => {
            // Check Page Break
            if (yPos > pageHeight - 40) { doc.addPage(); yPos = 30; }

            doc.setTextColor(40);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(section.title.toUpperCase(), 20, yPos);
            doc.setDrawColor(200);
            doc.line(20, yPos + 2, 100, yPos + 2);

            yPos += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const splitText = doc.splitTextToSize(section.content, pageWidth - 40);
            doc.text(splitText, 20, yPos);

            yPos += (splitText.length * 5) + 15;
          });
        } else {
          // Fallback to Standard Static Text
          doc.setTextColor(40);
          doc.setFontSize(12);
          doc.text('OBJETIVO DA PROPOSTA', 20, yPos);
          doc.setDrawColor(200);
          doc.line(20, yPos + 2, 80, yPos + 2);

          yPos += 10;

          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          const introText = `A presente proposta tem por objetivo apresentar os custos e condições técnicas para a execução dos serviços de engenharia de segurança contra incêndio no empreendimento "${project.name}", contemplando o fornecimento de materiais e mão de obra conforme detalhamento técnico a seguir.`;
          const splitIntro = doc.splitTextToSize(introText, pageWidth - 40);
          doc.text(splitIntro, 20, yPos);

          yPos += (splitIntro.length * 5) + 10;

          if (proposal.observations) {
            if (yPos > pageHeight - 40) { doc.addPage(); yPos = 30; }
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('OBSERVAÇÕES GERAIS', 20, yPos);
            doc.line(20, yPos + 2, 80, yPos + 2);

            yPos += 10;
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const splitObs = doc.splitTextToSize(proposal.observations, pageWidth - 40);
            doc.text(splitObs, 20, yPos);
          }
        }
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

      const centralItems = budgetItems.filter(item => {
        const isModel = item.name.includes('[MODELO:');
        const isInfra = item.name.includes('[INFRA:');
        if (isModel || isInfra) return false;

        const isService = item.item_type === 'SERVICE';
        const isStandardProduct = catalogItems.some(p => p.name === item.name);

        // 3. Apply Filters
        if (isService) {
          if (proposal.hide_services_pdf) return false;
        }

        if (proposal.hide_products_pdf) {
          // A. If it's a standard product -> ALWAYS HIDE
          if (isStandardProduct) return false;

          // B. If it's NOT a standard product (Manual Item OR Service) -> CHECK WHITELIST
          // We only apply this check if we are in "Hide Products" mode.
          if (pdfSettings.visible_manual_items) {
            return pdfSettings.visible_manual_items.includes(item.name);
          }
        }

        return true;


        return true;
      });

      const modelItems = budgetItems.filter(item => {
        if (!item.name.includes('[MODELO:')) return false;
        return true;
      });

      const infraItems = budgetItems.filter(item => {
        if (!item.name.includes('[INFRA:')) return false;
        if (proposal.hide_products_pdf) return false; // Infra is considered product-heavy
        return true;
      });

      const tableBody: any[] = [];

      // Add Central Items
      if (centralItems.length > 0) {
        let colSpan = 2;
        if (pdfSettings.show_cost) colSpan += 2;
        if (pdfSettings.show_cost_column) colSpan += 2;
        tableBody.push([{ content: 'ITENS DE COTAÇÃO CENTRAL', colSpan: colSpan, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
        centralItems.forEach(item => {
          const row = [item.name || 'Item', item.quantity_final || 0];
          if (pdfSettings.show_cost_column) {
            row.push(`R$ ${Number(item.cost_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            row.push(`R$ ${(Number(item.quantity_final || 0) * Number(item.cost_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
          }
          if (pdfSettings.show_cost) {
            row.push(`R$ ${Number(item.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            row.push(`R$ ${(Number(item.quantity_final || 0) * Number(item.unit_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
          }
          tableBody.push(row);
        });
      }

      // Add Model Items grouped by Model
      if (modelItems.length > 0) {
        const grouped = modelItems.reduce((acc, item) => {
          const modelName = item.name.match(/\[MODELO:(.+?)\]/)?.[1]?.trim() || 'Outros';
          if (!acc[modelName]) acc[modelName] = [];
          acc[modelName].push(item);
          return acc;
        }, {} as Record<string, any[]>);

        (Object.entries(grouped) as [string, any[]][]).forEach(([modelName, mItems]) => {
          // Filter items to display based on settings
          const visibleItems = mItems.filter(item => {
            const isLabor = item.item_type === 'SERVICE';

            if (isLabor) return !proposal.hide_services_pdf;
            // It's a product in the model
            return !proposal.hide_products_pdf;
          });

          if (visibleItems.length === 0) return;

          const modelTotal = mItems.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);

          // Header for Model
          let colSpan = 2;
          if (pdfSettings.show_cost) colSpan += 2;
          if (pdfSettings.show_cost_column) colSpan += 2;

          tableBody.push([{
            content: `MODELO DE SERVIÇO: ${modelName.toUpperCase()} ${pdfSettings.show_cost ? `(Total: R$ ${modelTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : ''}`,
            colSpan: colSpan,
            styles: { fillColor: [238, 242, 255], textColor: [67, 56, 202], fontStyle: 'bold' }
          }]);

          visibleItems.forEach(item => {
            const row = [item.name.includes('[MODELO:') ? item.name.split('] ')[1] : item.name, item.quantity_final || 0];

            if (pdfSettings.show_cost) {
              row.push(`R$ ${Number(item.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
              row.push(`R$ ${(Number(item.quantity_final || 0) * Number(item.unit_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            }
            tableBody.push(row);
          });
        });
      }

      // Add Infra Items grouped by kit
      if (infraItems.length > 0) {
        const grouped = infraItems.reduce((acc, item) => {
          const kitName = item.name.match(/\[INFRA:(.+?)\]/)?.[1] || 'Outros';
          if (!acc[kitName]) acc[kitName] = [];
          acc[kitName].push(item);
          return acc;
        }, {} as Record<string, any[]>);

        (Object.entries(grouped) as [string, any[]][]).forEach(([kitName, kitItems]) => {
          let colSpan = 2;
          if (pdfSettings.show_cost) colSpan += 2;
          if (pdfSettings.show_cost_column) colSpan += 2;
          tableBody.push([{ content: `INFRAESTRUTURA: ${kitName.toUpperCase()}`, colSpan: colSpan, styles: { fillColor: [255, 247, 237], textColor: [194, 65, 12], fontStyle: 'bold' } }]);
          kitItems.forEach(item => {
            const cleanName = item.name.includes('[INFRA:') ? item.name.split('[INFRA:')[0].trim() : item.name;
            const row = [cleanName, item.quantity_final || 0];
            if (pdfSettings.show_cost_column) {
              row.push(`R$ ${Number(item.cost_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
              row.push(`R$ ${(Number(item.quantity_final || 0) * Number(item.cost_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            }
            if (pdfSettings.show_cost) {
              row.push(`R$ ${Number(item.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
              row.push(`R$ ${(Number(item.quantity_final || 0) * Number(item.unit_price || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
            }
            tableBody.push(row);
          });
        });
      }

      const tableHead = ['Descrição', 'Qtd'];
      // Only show cost columns if global show_cost is true AND we are NOT hiding product values specifically
      const showCostsInTable = pdfSettings.show_cost && !pdfSettings.hide_product_values;

      if (pdfSettings.show_cost_column) {
        tableHead.push('Custo Unit.', 'Custo Total');
      }
      if (showCostsInTable) {
        tableHead.push('Venda Unit.', 'Venda Total');
      }

      autoTable(doc, {
        startY: pdfSettings.hide_product_values ? 60 : 60, // Keep same Y for simplicity
        head: [tableHead],
        body: tableBody.map(row => {
          // If hiding values, ensure we slice the row if it comes from our helper logic
          // Note towards 'tableBody' logic above: we pushed 4 items for valid rows.
          // We need to ensure we don't display them if showCostsInTable is false.
          // However, autoTable expects body rows to match head length usually?
          // Actually, our previous pushes respected 'pdfSettings.show_cost'.
          // We need to make sure the pushes ABOVE also respect 'hide_product_values'.
          // Let's rely on autoTable slicing or better yet, fix the pushes above?
          // To be safe, let's filter the row array here if needed.
          if (!Array.isArray(row)) return row; // It's a special row object (header)
          if (!showCostsInTable && row.length > 2) {
            return [row[0], row[1]];
          }
          return row;
        }),
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
        styles: { fontSize: 9 },
        columnStyles: showCostsInTable ? {
          0: { cellWidth: 100 },
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' }
        } : {
          0: { cellWidth: 140 },
          1: { halign: 'center' }
        },
        // IMPORTANT: For headers/special rows that use colSpan, we need to adjust colSpan
        didParseCell: (data) => {
          if (data.row.raw && (data.row.raw as any).content) {
            if (data.row.raw && (data.row.raw as any).content) {
              // It's a header row. colSpan is already set in tableBody generation.
            }
          }
        }
      });

      let yPos = (doc as any).lastAutoTable.finalY + 15;

      // --- SCOPE AFTER TABLE (If hiding product values) ---
      if (pdfSettings.hide_product_values && proposal.observations) {
        if (yPos > pageHeight - 60) { doc.addPage(); yPos = 30; }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40);
        doc.text('DETALHAMENTO DO ESCOPO / OBSERVAÇÕES', 20, yPos);
        doc.setDrawColor(200);
        doc.line(20, yPos + 2, 100, yPos + 2);

        yPos += 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitObs = doc.splitTextToSize(proposal.observations, pageWidth - 40);
        doc.text(splitObs, 20, yPos);

        // Update yPos based on height of text
        const lines = splitObs.length;
        yPos += (lines * 5) + 10;
      }

      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 30; }

      if (yPos > pageHeight - 60) { doc.addPage(); yPos = 30; }

      // --- FINANCIAL SUMMARY ---
      // We SHOW financial summary even if hiding product values, so client sees final total.
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO FINANCEIRO', 20, yPos);
      doc.line(20, yPos + 2, 80, yPos + 2);

      const financeBody = [];

      if (pdfSettings.show_subtotal !== false) {
        financeBody.push(['Subtotal de Materiais', `R$ ${vals.productsBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (pdfSettings.show_bdi !== false) {
        financeBody.push(['BDI (Bonificação e Despesas Indiretas)', `R$ ${vals.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (pdfSettings.show_profit !== false) {
        financeBody.push(['Margem de Lucro', `R$ ${vals.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (vals.servicesTotal > 0 && !proposal.hide_services_pdf) {
        financeBody.push(['Total de Mão de Obra / Serviços', `R$ ${vals.servicesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (pdfSettings.show_discount !== false && vals.discountVal > 0) {
        financeBody.push(['Descontos Aplicados', `- R$ ${vals.discountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (pdfSettings.show_total !== false) {
        financeBody.push([{ content: 'VALOR GLOBAL DO INVESTIMENTO', styles: { fontStyle: 'bold' as const, fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] } },
        { content: `R$ ${vals.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold' as const, fillColor: [0, 0, 0] as [number, number, number], textColor: [255, 255, 255] as [number, number, number] } }]);
      }

      // Render Financial Table ALWAYS (even if hiding product values, as requested)
      autoTable(doc, {
        startY: yPos + 6,
        body: financeBody,
        theme: 'grid',
        styles: { fontSize: 10 },
        columnStyles: { 1: { halign: 'right', cellWidth: 60 } }
      });

      yPos = (doc as any).lastAutoTable.finalY + 40;

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

      // --- MERGE CERTIFICATES (via pdf-lib) ---
      const reportPdfBytes = doc.output('arraybuffer');
      const pdfDoc = await PDFDocument.create();

      // 1. Embed Main Report
      const reportPdf = await PDFDocument.load(reportPdfBytes);
      const reportPages = await pdfDoc.copyPages(reportPdf, reportPdf.getPageIndices());
      reportPages.forEach((page) => pdfDoc.addPage(page));

      // 2. Helper to merge External PDF
      const mergeExternalPdf = async (source: string | ArrayBuffer) => {
        try {
          let buffer: ArrayBuffer;
          if (typeof source === 'string') {
            // Check if Base64
            if (source.startsWith('data:application/pdf;base64,')) {
              buffer = Uint8Array.from(atob(source.split(',')[1]), c => c.charCodeAt(0)).buffer;
            } else {
              // Should be a URL
              const res = await fetch(source);
              if (!res.ok) throw new Error(`Failed to load ${source}`);
              buffer = await res.arrayBuffer();
            }
          } else {
            buffer = source;
          }

          const extPdf = await PDFDocument.load(buffer);
          const extPages = await pdfDoc.copyPages(extPdf, extPdf.getPageIndices());
          extPages.forEach((page) => pdfDoc.addPage(page));
        } catch (err) {
          console.error('Error merging PDF:', err);
          // Don't block whole process, just warn
          alert('Aviso: Não foi possível anexar um dos certificados. Verifique se o arquivo existe.');
        }
      };

      // 3. Merge CRQ
      if (pdfSettings.show_cert_crq) {
        if (pdfSettings.cert_crq_file) {
          await mergeExternalPdf(pdfSettings.cert_crq_file);
        } else {
          // Default
          await mergeExternalPdf('/CRQ PJ CREA.pdf');
        }
      }

      // 4. Merge Regularity
      if (pdfSettings.show_cert_regularity) {
        if (pdfSettings.cert_regularity_file) {
          await mergeExternalPdf(pdfSettings.cert_regularity_file);
        } else {
          await mergeExternalPdf('/CRD Certificado de Credencimento até 10.7.26.pdf');
        }
      }

      const finalPdfBytes = await pdfDoc.save();
      const finalBlob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(finalBlob);

      if (mode === 'preview') {
        window.open(blobUrl, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Proposta_${project.name.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error: any) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF: ' + error.message);
    }
  };

  const calculateValues = () => {
    // Separate Items
    const products = budgetItems.filter(i => i.item_type !== 'SERVICE');
    const services = budgetItems.filter(i => i.item_type === 'SERVICE');

    const productsBase = products.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);
    const servicesTotal = services.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);

    const bdiPct = Number(proposal.bdi_percent) || 0;
    const profitPct = Number(proposal.profit_percent) || 0;

    // Apply BDI/Profit ONLY to productsBase
    const subtotal = productsBase * (1 + (bdiPct / 100));
    const productsWithMarkup = subtotal * (1 + (profitPct / 100));

    // Calculate Discount based on the WHOLE value (Products with Markup + Services) or just Products?
    // Usually discount is on the final price.
    const preDiscountTotal = productsWithMarkup + servicesTotal;

    let discountVal = 0;
    if (proposal.discount_type === 'FIXED') {
      discountVal = Number(proposal.discount_value) || 0;
    } else {
      discountVal = preDiscountTotal * ((Number(proposal.discount_value) || 0) / 100);
    }

    const final = preDiscountTotal - discountVal;

    return {
      productsBase,
      servicesTotal,
      bdiVal: subtotal - productsBase,
      profitVal: productsWithMarkup - subtotal,
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

                    <div className="flex flex-col gap-2 mt-auto">
                      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white uppercase">Ativar Finanças</span>
                          <span className="text-[10px] text-slate-400">Ativa seção financeira no PDF</span>
                        </div>
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-white/10 bg-background-dark text-primary focus:ring-primary"
                          checked={pdfSettings.show_cost}
                          onChange={(e) => savePdfSettings({ ...pdfSettings, show_cost: e.target.checked })}
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white uppercase">Coluna Custo</span>
                          <span className="text-[10px] text-slate-400">Exibir coluna de custo na tabela</span>
                        </div>
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-white/10 bg-background-dark text-primary focus:ring-primary"
                          checked={pdfSettings.show_cost_column || false}
                          onChange={(e) => savePdfSettings({ ...pdfSettings, show_cost_column: e.target.checked })}
                        />
                      </div>

                      {pdfSettings.show_cost && (
                        <div className="flex flex-col gap-2 p-3 bg-white/5 rounded-lg border border-white/10 animate-in slide-in-from-top-1">
                          <span className="text-xs font-bold text-slate-400 uppercase mb-1">Detalhamento Financeiro</span>

                          <label className="flex items-center justify-between text-xs text-white cursor-pointer hover:bg-white/5 p-1 rounded">
                            <span>Exibir Subtotal</span>
                            <input
                              type="checkbox"
                              checked={pdfSettings.show_subtotal !== false}
                              onChange={(e) => savePdfSettings({ ...pdfSettings, show_subtotal: e.target.checked })}
                            />
                          </label>

                          <label className="flex items-center justify-between text-xs text-white cursor-pointer hover:bg-white/5 p-1 rounded">
                            <span>Exibir BDI</span>
                            <input
                              type="checkbox"
                              checked={pdfSettings.show_bdi !== false}
                              onChange={(e) => savePdfSettings({ ...pdfSettings, show_bdi: e.target.checked })}
                            />
                          </label>

                          <label className="flex items-center justify-between text-xs text-white cursor-pointer hover:bg-white/5 p-1 rounded">
                            <span>Exibir Lucro</span>
                            <input
                              type="checkbox"
                              checked={pdfSettings.show_profit !== false}
                              onChange={(e) => savePdfSettings({ ...pdfSettings, show_profit: e.target.checked })}
                            />
                          </label>

                          <label className="flex items-center justify-between text-xs text-white cursor-pointer hover:bg-white/5 p-1 rounded">
                            <span>Exibir Descontos</span>
                            <input
                              type="checkbox"
                              checked={pdfSettings.show_discount !== false}
                              onChange={(e) => savePdfSettings({ ...pdfSettings, show_discount: e.target.checked })}
                            />
                          </label>

                          <label className="flex items-center justify-between text-xs text-white cursor-pointer hover:bg-white/5 p-1 rounded">
                            <span>Exibir Total Global</span>
                            <input
                              type="checkbox"
                              checked={pdfSettings.show_total !== false}
                              onChange={(e) => savePdfSettings({ ...pdfSettings, show_total: e.target.checked })}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Certificates Section */}
                  <div className="lg:col-span-3 border-t border-white/5 pt-6 mt-2">
                    <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">verified</span>
                      Certificados e Anexos
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* CRQ Certificate */}
                      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-bold text-white">Certificado CRQ PJ CREA</label>
                          <input
                            type="checkbox"
                            checked={pdfSettings.show_cert_crq}
                            onChange={(e) => savePdfSettings({ ...pdfSettings, show_cert_crq: e.target.checked })}
                            className="w-5 h-5 rounded border-white/10 bg-background-dark text-primary focus:ring-primary"
                          />
                        </div>
                        <p className="text-xs text-slate-400 mb-3">
                          Anexa o certificado CRQ ao final da proposta.
                          {pdfSettings.cert_crq_file ? ' (Arquivo Personalizado)' : ' (Arquivo Padrão)'}
                        </p>
                        <label className="flex items-center gap-2 px-3 py-2 bg-background-dark border border-white/10 rounded cursor-pointer hover:bg-white/5 transition-colors">
                          <span className="material-symbols-outlined text-slate-400 text-sm">upload_file</span>
                          <span className="text-xs text-slate-300">Substituir Arquivo (PDF)</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="application/pdf"
                            onChange={(e) => e.target.files?.[0] && handleImageUpload('cert_crq_file', e.target.files[0])}
                          />
                        </label>
                        {pdfSettings.cert_crq_file && (
                          <button
                            onClick={() => savePdfSettings({ ...pdfSettings, cert_crq_file: null })}
                            className="text-xs text-red-400 hover:text-red-300 mt-2 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                            Restaurar Padrão
                          </button>
                        )}
                      </div>

                      {/* Regularity Certificate */}
                      <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-bold text-white">Certificado de Regularidade</label>
                          <input
                            type="checkbox"
                            checked={pdfSettings.show_cert_regularity}
                            onChange={(e) => savePdfSettings({ ...pdfSettings, show_cert_regularity: e.target.checked })}
                            className="w-5 h-5 rounded border-white/10 bg-background-dark text-primary focus:ring-primary"
                          />
                        </div>
                        <p className="text-xs text-slate-400 mb-3">
                          Anexa o certificado de Regularidade/Credenciamento.
                          {pdfSettings.cert_regularity_file ? ' (Arquivo Personalizado)' : ' (Arquivo Padrão)'}
                        </p>
                        <label className="flex items-center gap-2 px-3 py-2 bg-background-dark border border-white/10 rounded cursor-pointer hover:bg-white/5 transition-colors">
                          <span className="material-symbols-outlined text-slate-400 text-sm">upload_file</span>
                          <span className="text-xs text-slate-300">Substituir Arquivo (PDF)</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="application/pdf"
                            onChange={(e) => e.target.files?.[0] && handleImageUpload('cert_regularity_file', e.target.files[0])}
                          />
                        </label>
                        {pdfSettings.cert_regularity_file && (
                          <button
                            onClick={() => savePdfSettings({ ...pdfSettings, cert_regularity_file: null })}
                            className="text-xs text-red-400 hover:text-red-300 mt-2 flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                            Restaurar Padrão
                          </button>
                        )}
                      </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="bg-surface-dark p-5 rounded-xl border border-white/5 border-l-4 border-l-rose-500/50 bg-rose-500/5">
                  <p className="text-rose-400 text-[11px] font-bold uppercase tracking-wider mb-1">Total Custo</p>
                  <p className="text-white text-xl font-bold">
                    R$ {budgetItems.filter(i => i.item_type !== 'SERVICE').reduce((acc, item) => acc + (item.quantity_final * (item.cost_price || 0)), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">Soma de custos</p>
                </div>
                <div className="bg-surface-dark p-5 rounded-xl border border-white/5 font-inter">
                  <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">Base Produtos</p>
                  <p className="text-white text-xl font-bold">R$ {values.productsBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-slate-600 mt-1">Soma de materiais</p>
                </div>

                <div className="bg-surface-dark p-5 rounded-xl border border-white/5 group relative border-l-4 border-l-blue-500/50">
                  <p className="text-blue-400 text-[11px] font-bold uppercase tracking-wider mb-1">BDI (%)</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      className="w-16 bg-background-dark border border-white/10 rounded px-2 py-1 text-white text-lg font-bold outline-none focus:border-blue-500"
                      value={proposal.bdi_percent}
                      onChange={e => setProposal({ ...proposal, bdi_percent: Number(e.target.value) })}
                    />
                    <span className="text-slate-500 text-xs font-bold">+R${values.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="bg-surface-dark p-5 rounded-xl border border-white/5 border-l-4 border-l-emerald-500/50">
                  <p className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider mb-1">Lucro (%)</p>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      className="w-16 bg-background-dark border border-white/10 rounded px-2 py-1 text-white text-lg font-bold outline-none focus:border-emerald-500"
                      value={proposal.profit_percent}
                      onChange={e => setProposal({ ...proposal, profit_percent: Number(e.target.value) })}
                    />
                    <span className="text-slate-500 text-xs font-bold">+R${values.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="bg-surface-dark p-5 rounded-xl border border-white/5 border-l-4 border-l-indigo-500/50">
                  <p className="text-indigo-400 text-[11px] font-bold uppercase tracking-wider mb-1">Total Serviços</p>
                  <p className="text-white text-xl font-bold">R$ {values.servicesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-slate-600 mt-1 underline decoration-indigo-500/30">Líquido de markup</p>
                </div>

                <div className="bg-primary/10 p-5 rounded-xl border border-primary/50 shadow-lg shadow-primary/5">
                  <p className="text-primary text-[11px] font-black uppercase tracking-widest mb-1">Investimento Total</p>
                  <p className="text-white text-2xl font-black">R$ {values.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>

                  {(values.discountVal > 0) && (
                    <p className="text-[10px] text-red-400 mt-1 font-bold">Desconto: - R$ {values.discountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
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
                        <th className="px-6 py-3 w-32">Custo Unit.</th>
                        <th className="px-6 py-3 w-32">Venda Unit.</th>
                        <th className="px-6 py-3 text-right">Total Venda</th>
                        <th className="px-6 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {budgetItems.map(item => (
                        <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {item.item_type === 'SERVICE' && (
                                <span className="p-1 rounded bg-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase">Serviço</span>
                              )}
                              <div className="text-white font-medium text-sm">{item.name}</div>
                            </div>
                            <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 ml-0">
                              {item.origin === 'CALCULATED' ? 'Extraído da Engenharia' : 'Adicionado na Proposta'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-300 font-bold">{item.quantity_final}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 bg-background-dark border border-white/10 rounded px-2 py-1.5 focus-within:border-primary transition-colors">
                              <span className="text-slate-500 text-xs text-rose-500/80">R$</span>
                              <input
                                type="number"
                                className="w-full bg-transparent text-white outline-none text-right font-mono text-xs"
                                value={item.cost_price || 0}
                                onChange={(e) => handleUpdateItem(item.id, 'cost_price', Number(e.target.value))}
                                step="any"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 bg-background-dark border border-white/10 rounded px-2 py-1.5 focus-within:border-primary transition-colors">
                              <span className="text-slate-500 text-xs">R$</span>
                              <input
                                type="number"
                                className="w-full bg-transparent text-white outline-none text-right font-mono text-xs font-bold"
                                value={item.unit_price}
                                onChange={(e) => handleUpdateItem(item.id, 'unit_price', Number(e.target.value))}
                                step="any"
                              />
                            </div>
                          </td>
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
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">
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
                  <div className="bg-surface-dark border border-white/5 rounded-xl p-6 mb-8">
                    <ProposalSections
                      projectId={selectedProjectId}
                      sections={sections}
                      onUpdate={() => fetchSections(selectedProjectId)}
                    />
                  </div>

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
                              onChange={e => handleHideProductsToggle(e.target.checked)}
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

                      {/* New Option: Hide Values / Scope Correlation */}
                      <div className="bg-background-dark/30 p-4 rounded-lg border border-white/5 mt-4">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${pdfSettings.hide_product_values ? 'bg-indigo-500 border-indigo-500' : 'bg-background-dark border-white/10 group-hover:border-white/20'}`}>
                            {pdfSettings.hide_product_values && <span className="material-symbols-outlined text-white text-[18px]">check</span>}
                          </div>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={pdfSettings.hide_product_values || false}
                            onChange={e => savePdfSettings({ ...pdfSettings, hide_product_values: e.target.checked })}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white">Ocultar Valores (Somente Texto)</span>
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Remove preços e correlaciona escopo abaixo dos itens</span>
                          </div>
                        </label>
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
      </main >

      {/* Modal for Selecting Visibility of Custom Items */}
      {
        showVisibilityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-surface-dark border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
              <div className="p-6 border-b border-white/10">
                <h3 className="text-xl font-bold text-white mb-2">Exibição de Itens Personalizados</h3>
                <p className="text-sm text-slate-400">
                  Você optou por <strong>Ocultar Produtos</strong>. Selecione quais destes itens manuais ou serviços você gostaria de <strong>MANTER VISÍVEIS</strong> no PDF.
                </p>
              </div>

              <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
                {candidateItems.map((item, idx) => {
                  const isSelected = tempVisibleItems.includes(item.name);
                  return (
                    <label key={idx} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-primary/20 border-primary' : 'bg-background-dark border-white/10 hover:border-white/20'}`}>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">{item.name}</span>
                        <span className="text-xs text-slate-400">
                          {item.origin === 'MANUAL' ? 'Item Manual' : 'Serviço Calculado'}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        className="w-5 h-5 rounded border-white/20 bg-background-dark checked:bg-primary"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTempVisibleItems(prev => [...prev, item.name]);
                          } else {
                            setTempVisibleItems(prev => prev.filter(n => n !== item.name));
                          }
                        }}
                      />
                    </label>
                  );
                })}
              </div>

              <div className="p-6 border-t border-white/10 bg-background-dark/50 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowVisibilityModal(false);
                    setProposal({ ...proposal, hide_products_pdf: false });
                  }}
                  className="px-4 py-2 text-slate-300 hover:text-white font-bold"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmVisibilitySelection}
                  className="px-6 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg font-bold shadow-lg shadow-primary/20"
                >
                  Confirmar Exibição
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Add Item Modal */}
      {
        isAddItemModalOpen && (
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
        )
      }
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
    </div >
  );
};

export default EngineeringProposal;
