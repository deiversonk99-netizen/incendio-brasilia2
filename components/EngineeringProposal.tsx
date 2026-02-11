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
  const [itemDescriptions, setItemDescriptions] = useState<Record<string, string>>({}); // Description lookup map

  const loadPdfSettings = async (projectId: string) => {
    try {
      // 1. Load project-specific settings
      const { data } = await supabase
        .from('pdf_settings')
        .select('variables')
        .eq('project_id', projectId)
        .eq('phase', 'ENG_C')
        .single();

      // 2. Load Global User Profile Defaults
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('assinatura, crq, credentials, credentials_img, carimbo, carimbo_img')
        .eq('user_id', user?.id)
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
          ...data.variables,
          // Fallback individual fields if they are missing/empty in variables
          assinatura: data.variables.assinatura || profile?.assinatura || '',
          crq: data.variables.crq || profile?.crq || '',
          credentials: data.variables.credentials || profile?.credentials || '',
          credentials_img: data.variables.credentials_img || profile?.credentials_img || '',
          carimbo: data.variables.carimbo || profile?.carimbo || '',
          carimbo_img: data.variables.carimbo_img || profile?.carimbo_img || ''
        });
      } else {
        setPdfSettings({
          show_assinatura: true,
          assinatura: profile?.assinatura || '',
          show_crq: true,
          crq: profile?.crq || '',
          show_credentials: true,
          credentials: profile?.credentials || '',
          credentials_img: profile?.credentials_img || '',
          show_referencias: true,
          referencias: '',
          show_carimbo: true,
          carimbo: profile?.carimbo || '',
          carimbo_img: profile?.carimbo_img || '',
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
          cert_regularity_file: null,
          project_name_pdf: ''
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
    if (!selectedProjectId || !user) return;

    try {
      // 1. Save to project-specific settings
      await supabase
        .from('pdf_settings')
        .upsert({
          project_id: selectedProjectId,
          phase: 'ENG_C',
          variables: newSettings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'project_id, phase' });

      // 2. Save global defaults to user profile (signature, CRQ, credentials, stamps)
      const globalFields = {
        assinatura: newSettings.assinatura,
        crq: newSettings.crq,
        credentials: newSettings.credentials,
        credentials_img: newSettings.credentials_img,
        carimbo: newSettings.carimbo,
        carimbo_img: newSettings.carimbo_img,
        updated_at: new Date().toISOString()
      };

      await supabase
        .from('user_profiles')
        .update(globalFields)
        .eq('id', user.id);

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
  const [newItem, setNewItem] = useState({ name: '', quantity: 1, price: 0, cost_price: 0 });
  const [modalSearchTerm, setModalSearchTerm] = useState('');
  const [showSearchList, setShowSearchList] = useState(false);
  const [itemToReplace, setItemToReplace] = useState<any | null>(null);
  const [itemToEdit, setItemToEdit] = useState<any | null>(null);
  const [clientDetails, setClientDetails] = useState<any>(null);

  useEffect(() => {
    fetchProjects();
    fetchPaymentMethods();
    fetchExecutionSchedules();
    fetchCatalogs();
  }, []);

  const fetchCatalogs = async () => {
    const { data: products } = await supabase.from('product_catalog').select('name, price, cost_price, observation').order('name');
    const { data: services } = await supabase.from('services_catalog').select('name, description').order('name');

    if (products) setCatalogItems(products);
    if (services) setServiceCatalog(services);

    // Build descriptions map
    const map: Record<string, string> = {};
    if (products) {
      products.forEach((p: any) => {
        if (p.observation) map[p.name] = p.observation;
      });
    }
    if (services) {
      services.forEach((s: any) => {
        if (s.description) map[s.name] = s.description;
      });
    }
    setItemDescriptions(map);
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
      fetchClientDetails();
    } else {
      setClientDetails(null);
    }
  }, [selectedProjectId]);

  const fetchClientDetails = async () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project || !project.client) return;

    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('name', project.client)
      .single();

    if (data) setClientDetails(data);
  };

  const [searchTerm, setSearchTerm] = useState('');

  // Auto-recalculate prices when BDI or Profit changes
  useEffect(() => {
    if (!budgetItems.length) return;

    // We only auto-recalculate if explicitly enabled or if standard behavior
    // User requested: "must recalculate automatically"
    const bdiPct = Number(proposal.bdi_percent) || 0;
    const profitPct = Number(proposal.profit_percent) || 0;
    const bdiFactor = 1 + (bdiPct / 100);
    const profitFactor = 1 + (profitPct / 100);

    setBudgetItems(prev => prev.map(item => {
      if (item.cost_price > 0) {
        return {
          ...item,
          unit_price: item.cost_price * bdiFactor * profitFactor
        };
      }
      return item;
    }));
  }, [proposal.bdi_percent, proposal.profit_percent]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.client && p.client.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDuplicateProposal = async (project: Project) => {
    const newName = prompt('Nome para a cópia do projeto:', `${project.name} (Cópia)`);
    if (!newName) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('clone_project_data', {
        source_project_id: project.id,
        new_name: newName
      });

      if (error) throw error;

      alert('Projeto e proposta duplicados com sucesso!');
      await fetchProjects();
      if (data) onSelectProject(data); // Select the new project
    } catch (e: any) {
      console.error('Error duplicating:', e);
      alert('Erro ao duplicar: ' + e.message);
    } finally {
      setLoading(false);
    }
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

    let processedItems: any[] = [];
    if (budgetItemsData) {
      // Heal items with missing cost_price (e.g. Services or Manual items where cost wasn't set)
      // If Cost is 0, we assume the current Unit Price IS the base cost for markups.
      processedItems = budgetItemsData.map(item => {
        if ((!item.cost_price || item.cost_price <= 0) && item.unit_price > 0) {
          return { ...item, cost_price: item.unit_price };
        }
        return item;
      });
      setBudgetItems(processedItems);
    }

    // Correct totalCost to use COST_PRICE for base material cost
    // Requirement: "Custo Unitário deve vir do banco" -> Base Cost for BDI calculation.
    const totalCost = processedItems.reduce((acc, item) => {
      // Exclude Services from Material Base Cost ?? 
      // User complaint: "Service didn't change". If we exclude service from base, BDI won't apply to it in the summary?
      // Actually BDI applies to EVERYTHING in the summary (Total Cost Base).
      // The breakdown separates MaterialBase vs ServiceTotal.
      // But for the "Base Cost" stored in proposal (historical?), we might keep just materials.
      // However, for the live calculation, we use the items directly.
      if (item.item_type === 'SERVICE') return acc;
      return acc + (item.quantity_final * (item.cost_price || 0));
    }, 0) || 0;

    // 2. Fetch Existing Proposal
    const { data: existingProposal } = await supabase
      .from('proposals')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (existingProposal) {
      setProposal({
        ...existingProposal,
        cost_material_base: totalCost, // Always refresh cost base from items
        hide_services_pdf: existingProposal.hide_services_pdf ?? false,
        hide_products_pdf: existingProposal.hide_products_pdf ?? false,
        proposal_number: existingProposal.proposal_number // Load number
      });
    } else {
      setProposal(prev => ({
        ...prev,
        project_id: projectId,
        cost_material_base: totalCost,
        hide_services_pdf: false,
        hide_products_pdf: false,
        proposal_number: undefined
      }));
    }

    setLoading(false);
  };

  const calculateValues = () => {
    const bdiPct = Number(proposal.bdi_percent) || 0;
    const profitPct = Number(proposal.profit_percent) || 0;

    const bdiFactor = 1 + (bdiPct / 100);
    const profitFactor = 1 + (profitPct / 100);
    const combinedFactor = bdiFactor * profitFactor;

    let totalProductsCost = 0;
    let totalServicesCost = 0;
    let predictedVendaGlobal = 0;
    let actualVendaGlobal = 0;

    budgetItems.forEach(item => {
      const q = Number(item.quantity_final || 0);
      let cost = Number(item.cost_price || 0);
      const currentSale = Number(item.unit_price || 0);

      // FALLBACK: If cost is 0, we try to LOOKUP from catalog first instead of back-calculating
      if (cost <= 0) {
        const cleanName = item.name.includes('[') && item.name.includes(']')
          ? item.name.split(']')[1]?.trim() || item.name
          : item.name.trim();

        const catalogItem = catalogItems.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
        if (catalogItem && catalogItem.cost_price > 0) {
          cost = catalogItem.cost_price;
        } else if (currentSale > 0) {
          // Absolute last resort: back-calculate from currentSale
          // BUT we use a fixed factor of 1 if combinedFactor is weird, 
          // and we don't let this update the 'cost' permanently unless handleRecalculate is called.
          cost = currentSale / (combinedFactor || 1);
        }
      }

      const lineCostTotal = cost * q;
      if (item.item_type === 'SERVICE') {
        totalServicesCost += lineCostTotal;
      } else {
        totalProductsCost += lineCostTotal;
      }

      predictedVendaGlobal += lineCostTotal * combinedFactor;
      actualVendaGlobal += currentSale * q;
    });

    const totalCostBase = totalProductsCost + totalServicesCost;
    const bdiVal = (totalCostBase * bdiFactor) - totalCostBase;

    // Profit is now the residual to ensure (Base + BDI + Profit) always equals Actual Total
    // This handles manual price overrides correctly.
    const profitVal = actualVendaGlobal - totalCostBase - bdiVal;

    let discountVal = 0;
    if (proposal.discount_type === 'FIXED') {
      discountVal = Number(proposal.discount_value) || 0;
    } else {
      // Discount applies to the Actual Global Sale
      discountVal = actualVendaGlobal * ((Number(proposal.discount_value) || 0) / 100);
    }

    return {
      productsBase: Number(totalProductsCost.toFixed(2)),
      servicesTotal: Number(totalServicesCost.toFixed(2)),
      bdiVal: Number(bdiVal.toFixed(2)),
      profitVal: Number(profitVal.toFixed(2)),
      discountVal: Number(discountVal.toFixed(2)),
      final: Number((actualVendaGlobal - discountVal).toFixed(2)),
      actualFinal: Number((actualVendaGlobal - discountVal).toFixed(2))
    };
  };

  const handleRecalculatePrices = async () => {
    if (!selectedProjectId || !budgetItems.length) return;
    if (!confirm('Deseja recalcular todos os preços de venda com base no Custo Unitário, BDI e Margem de Lucro atuais? Itens com custo zero que forem encontrados no catálogo serão restaurados.')) return;

    setLoading(true);
    const bdiPct = Number(proposal.bdi_percent) || 0;
    const profitPct = Number(proposal.profit_percent) || 0;
    const combinedFactor = (1 + (bdiPct / 100)) * (1 + (profitPct / 100));

    const updatedItems = budgetItems.map(item => {
      let cost = Number(item.cost_price || 0);

      // Healing / Fallback from Catalog
      if (cost <= 0) {
        const cleanName = item.name.includes('[') && item.name.includes(']')
          ? item.name.split(']')[1]?.trim() || item.name
          : item.name.trim();

        const catalogProd = catalogProducts.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
        if (catalogProd && catalogProd.cost_price > 0) {
          cost = catalogProd.cost_price;
        } else {
          // If still 0, we use current unit_price but with a STATIC assumption (e.g. current combined factor)
          // to break the circular reduction. Or we keep it 0 if combinedFactor is 0.
          if (item.unit_price > 0 && combinedFactor > 0) {
            cost = Number(item.unit_price) / combinedFactor;
          }
        }
      }

      const newUnitPrice = cost * combinedFactor;
      return { ...item, cost_price: cost, unit_price: newUnitPrice };
    });

    try {
      const { error } = await supabase
        .from('budget_items')
        .upsert(updatedItems.map(i => ({
          id: i.id,
          project_id: selectedProjectId,
          unit_price: i.unit_price,
          name: i.name,
          quantity_final: i.quantity_final,
          cost_price: i.cost_price,
          item_type: i.item_type,
          origin: i.origin
        })));

      if (error) throw error;
      setBudgetItems(updatedItems);
      alert('Preços recalculados com sucesso! Todos os itens foram sincronizados com as novas taxas.');
    } catch (e: any) {
      console.error('Error recalculating prices:', e);
      alert('Erro ao recalcular preços: ' + e.message);
    } finally {
      setLoading(false);
    }
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
    } catch (error: any) {
      console.error(error);
      alert('Erro ao salvar proposta: ' + (error.message || 'Erro desconhecido'));
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
      cost_price: newItem.cost_price || newItem.price, // Default Cost to Price if 0 (Manual Entry)
      origin: 'MANUAL' as const,
      item_type: modalTab === 'service' ? 'SERVICE' : 'PRODUCT'
    };

    // If we have markups, we should probably reverse-calculate the Cost so the Price matches what was typed
    // BUT only if the user didn't explicitly type a cost.
    // However, the modal usually just asks for "Preço de Venda" (Price) for manual items?
    // If so, Cost = Price / Factor.
    if (!newItem.cost_price && newItem.price > 0) {
      const bdiPct = Number(proposal.bdi_percent) || 0;
      const profitPct = Number(proposal.profit_percent) || 0;
      const combinedFactor = (1 + (bdiPct / 100)) * (1 + (profitPct / 100));
      if (combinedFactor > 1) {
        newItemData.cost_price = newItem.price / combinedFactor;
      }
    }

    if (itemToReplace || itemToEdit) {
      // Update existing item
      const activeId = itemToReplace?.id || itemToEdit?.id;
      const { data, error } = await supabase
        .from('budget_items')
        .update(newItemData)
        .eq('id', activeId)
        .select();

      if (error) {
        alert('Erro ao atualizar item: ' + error.message);
      } else {
        setBudgetItems(prev => prev.map(item => item.id === activeId ? data?.[0] : item));
        setIsAddItemModalOpen(false);
        setNewItem({ name: '', quantity: 1, price: 0, cost_price: 0 });
        setItemToReplace(null);
        setItemToEdit(null);
      }
    } else {
      // Insert new item
      const { data, error } = await supabase.from('budget_items').insert(newItemData).select();

      if (error) {
        alert('Erro ao adicionar item: ' + error.message);
      } else {
        setBudgetItems(prev => [...prev, data?.[0]]);
        setIsAddItemModalOpen(false);
        setNewItem({ name: '', quantity: 1, price: 0, cost_price: 0 });
      }
    }
    setLoading(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este item da proposta?')) return;
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (error) alert('Erro ao excluir: ' + error.message);
    else setBudgetItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateItem = async (id: string, updates: Partial<any>) => {
    // Optimistic update
    setBudgetItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));

    // If updating unit_price, we should also update cost_price to reflect the new "Base"
    // otherwise the next Recalculate will revert it.
    let finalUpdates = { ...updates };

    if (updates.unit_price !== undefined) {
      const bdiPct = Number(proposal.bdi_percent) || 0;
      const profitPct = Number(proposal.profit_percent) || 0;
      const combinedFactor = (1 + (bdiPct / 100)) * (1 + (profitPct / 100));

      // New Cost = New Price / Factor. 
      // This ensures that this manual price is respected as the result of Cost * Factor.
      const newCost = Number(updates.unit_price) / (combinedFactor || 1);
      finalUpdates.cost_price = newCost;
    }

    const { error } = await supabase
      .from('budget_items')
      .update(finalUpdates)
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
        const footerY = pageHeight - 10;

        // --- Company Stamps/Credentials on EVERY Page ---
        let stampX = 20;
        const stampY = pageHeight - 35; // Position above footer text

        if (pdfSettings.show_credentials) {
          if (pdfSettings.credentials_img) {
            try {
              doc.addImage(pdfSettings.credentials_img, 'PNG', stampX, stampY, 30, 15);
              stampX += 35;
            } catch (e) { console.warn('Error adding credentials_img to footer:', e); }
          } else if (pdfSettings.credentials) {
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(pdfSettings.credentials, stampX, stampY + 10);
            stampX += 40;
          }
        }

        if (pdfSettings.show_carimbo) {
          if (pdfSettings.carimbo_img) {
            try {
              doc.addImage(pdfSettings.carimbo_img, 'PNG', stampX, stampY, 30, 15);
            } catch (e) { console.warn('Error adding carimbo_img to footer:', e); }
          } else if (pdfSettings.carimbo) {
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(pdfSettings.carimbo, stampX, stampY + 10);
          }
        }

        // --- Page Number Footer ---
        doc.setFontSize(8);
        doc.setTextColor(150);
        const footerText = `Proposta Comercial - ${pdfSettings.project_name_pdf || project.name} | Página ${pageNum} de ${totalPages}`;
        doc.text(footerText, pageWidth / 2, footerY, { align: 'center' });
      };

      const drawHeader = (doc: any, title: string) => {
        // Background for header (Black Banner) - using image if possible, otherwise color
        try {
          doc.addImage('/header_banner.png', 'PNG', 0, 0, pageWidth, 40);
        } catch (e) {
          doc.setFillColor(0, 0, 0);
          doc.rect(0, 0, pageWidth, 40, 'F');
        }

        doc.setTextColor(40); // Dark grey for title below banner
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(title.toUpperCase(), 20, 52);

        // Proposal Number & Project Number in Header
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100);

        let headerY = 52;
        if (proposal.proposal_number) {
          doc.text(`Proposta Nº ${proposal.proposal_number}/${new Date().getFullYear()}`, pageWidth - 20, headerY, { align: 'right' });
          headerY += 5; // Move down for Project Number
        }

        if (project.project_number) {
          const prString = `PR${String(project.project_number).padStart(3, '0')}`;
          doc.text(`Projeto: ${prString}`, pageWidth - 20, headerY, { align: 'right' });
        }

        // Red accent line below title
        doc.setDrawColor(239, 68, 68);
        doc.setLineWidth(1);
        doc.line(20, 56, 60, 56);
      };

      // --- PAGE 1: COVER ---
      doc.setFillColor(0, 0, 0); // Black Cover
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Logo on Cover
      try {
        doc.addImage('/logo.png', 'PNG', 20, 20, 40, 20);
      } catch (e) {
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1);
        doc.line(20, 40, 60, 40);
      }

      doc.setFontSize(40);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text('PROPOSTA', 20, 80);
      doc.text('COMERCIAL', 20, 100);

      doc.setFontSize(14);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 200, 200);
      doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 115);

      let coverNumY = 130;
      if (proposal.proposal_number) {
        doc.setFontSize(18);
        doc.setTextColor(239, 68, 68);
        doc.setFont('helvetica', 'bold');
        doc.text(`Nº ${proposal.proposal_number}/${new Date().getFullYear()}`, 20, coverNumY);
        coverNumY += 10;
      }

      if (project.project_number) {
        const prString = `PR${String(project.project_number).padStart(3, '0')}`;
        doc.setFontSize(14);
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`Projeto: ${prString}`, 20, coverNumY);
      }

      doc.setFillColor(239, 68, 68); // Red Accent
      doc.rect(0, 140, pageWidth * 0.4, 2, 'F');

      // Project Info on cover
      doc.setFontSize(12);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');

      let coverY = 200;
      doc.text('PREPARADO PARA:', 20, coverY);

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(230, 230, 230);

      coverY += 8;
      const clientText = project.client || 'N/A';
      const splitClient = doc.splitTextToSize(clientText, pageWidth - 40);
      doc.text(splitClient, 20, coverY);

      coverY += (splitClient.length * 6);
      const projectNameText = pdfSettings.project_name_pdf || project.name;
      const splitProject = doc.splitTextToSize(projectNameText, pageWidth - 40);
      doc.text(splitProject, 20, coverY);

      doc.setFontSize(10);
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 20, pageHeight - 20);
      doc.text(`Validade: ${proposal.validity_days || 10} dias`, pageWidth - 20, pageHeight - 20, { align: 'right' });

      // --- PAGE 2: SCOPE & OBJECTIVE (Dynamic) ---
      const hasDynamicSections = sections.some(s => s.is_active);
      const showStandardScope = !pdfSettings.hide_product_values;

      if (hasDynamicSections || showStandardScope || pdfSettings.scope_img) {
        doc.addPage();
        drawHeader(doc, 'ESCOPO TÉCNICO E OBJETIVO');

        let yPos = 70;

        // Render Scope Image if present
        if (pdfSettings.scope_img) {
          try {
            // Determine image dimensions to fit within margins
            // Use 16:9 ratio or actual aspect ratio if possible, but jsPDF addImage handles scaling if we give strict bounds?
            // Let's force full width - 40px
            const imgWidth = pageWidth - 40;
            const imgHeight = imgWidth * 0.5625; // 16:9 approx

            doc.addImage(pdfSettings.scope_img, 'PNG', 20, yPos, imgWidth, imgHeight);
            yPos += imgHeight + 10;
          } catch (e) {
            console.error('Error adding scope image to PDF:', e);
          }
        }

        if (hasDynamicSections) {
          // Render Dynamic Sections
          sections.filter(s => s.is_active).forEach(section => {
            // Check Page Break
            if (yPos > pageHeight - 40) {
              doc.addPage();
              drawHeader(doc, 'ESCOPO TÉCNICO E OBJETIVO');
              yPos = 70;
            }

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
          const introText = `A presente proposta tem por objetivo apresentar os custos e condições técnicas para a execução dos serviços de engenharia de segurança contra incêndio no empreendimento "${pdfSettings.project_name_pdf || project.name}", contemplando o fornecimento de materiais ou mão de obra conforme detalhamento técnico a seguir.`;
          const splitIntro = doc.splitTextToSize(introText, pageWidth - 40);
          doc.text(splitIntro, 20, yPos);

          yPos += (splitIntro.length * 5) + 10;

          if (proposal.observations) {
            if (yPos > pageHeight - 40) {
              doc.addPage();
              drawHeader(doc, 'ESCOPO TÉCNICO E OBJETIVO');
              yPos = 70;
            }
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
      drawHeader(doc, 'DETALHAMENTO DO INVESTIMENTO');

      doc.setTextColor(40);
      doc.setFontSize(11);
      doc.text('ITENS E EQUIPAMENTOS', 20, 68);

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
      let majorIndex = 0;

      // Add Central Items
      if (centralItems.length > 0) {
        majorIndex++;
        let colSpan = 2;
        if (pdfSettings.show_cost) colSpan += 2;
        if (pdfSettings.show_cost_column) colSpan += 2;
        tableBody.push([{ content: `${majorIndex}. ITENS DE COTAÇÃO CENTRAL`, colSpan: colSpan, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);

        centralItems.forEach((item, idx) => {
          const row = [`${majorIndex}.${idx + 1} ${item.name || 'Item'}`, item.quantity_final || 0];
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

          majorIndex++;
          const modelTotal = mItems.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);

          // Header for Model
          let colSpan = 2;
          if (pdfSettings.show_cost) colSpan += 2;
          if (pdfSettings.show_cost_column) colSpan += 2;

          tableBody.push([{
            content: `${majorIndex}. MODELO DE SERVIÇO: ${modelName.toUpperCase()} ${pdfSettings.show_cost ? `(Total: R$ ${modelTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : ''}`,
            colSpan: colSpan,
            styles: { fillColor: [238, 242, 255], textColor: [67, 56, 202], fontStyle: 'bold' }
          }]);

          visibleItems.forEach((item, idx) => {
            const cleanName = item.name.includes('[MODELO:') ? item.name.split('] ')[1] : item.name;
            const row = [`${majorIndex}.${idx + 1} ${cleanName}`, item.quantity_final || 0];

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

      // Add Infra Items grouped by kit
      if (infraItems.length > 0) {
        const grouped = infraItems.reduce((acc, item) => {
          const kitName = item.name.match(/\[INFRA:(.+?)\]/)?.[1] || 'Outros';
          if (!acc[kitName]) acc[kitName] = [];
          acc[kitName].push(item);
          return acc;
        }, {} as Record<string, any[]>);

        (Object.entries(grouped) as [string, any[]][]).forEach(([kitName, kitItems]) => {
          // Filter logic for Infra? Usually just checks if products hidden.
          // Assuming infraItems already filtered in outer scope? No, filtering happens inside.
          // Block from lines 807 already filtered: if (proposal.hide_products_pdf) return false;
          // So infraItems are visible.

          majorIndex++;
          let colSpan = 2;
          if (pdfSettings.show_cost) colSpan += 2;
          if (pdfSettings.show_cost_column) colSpan += 2;
          tableBody.push([{ content: `${majorIndex}. INFRAESTRUTURA: ${kitName.toUpperCase()}`, colSpan: colSpan, styles: { fillColor: [255, 247, 237], textColor: [194, 65, 12], fontStyle: 'bold' } }]);

          kitItems.forEach((item, idx) => {
            const cleanName = item.name.includes('[INFRA:') ? item.name.split('[INFRA:')[0].trim() : item.name;
            const row = [`${majorIndex}.${idx + 1} ${cleanName}`, item.quantity_final || 0];
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
        startY: 75, // Lowered to avoid header
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
            // It's a header row. colSpan is already set in tableBody generation.
          }
        },
        margin: { top: 70, bottom: 40 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            drawHeader(doc, 'DETALHAMENTO DO INVESTIMENTO (CONT.)');
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
        financeBody.push(['Subtotal de Materiais/Serviços', `R$ ${vals.productsBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (pdfSettings.show_bdi !== false) {
        financeBody.push(['BDI (Bonificação e Despesas Indiretas)', `R$ ${vals.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
      }

      if (pdfSettings.show_profit !== false) {
        financeBody.push(['Margem de lucro encargos', `R$ ${vals.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]);
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
        margin: { bottom: 40 },
        columnStyles: { 1: { halign: 'right', cellWidth: 60 } }
      });

      yPos = (doc as any).lastAutoTable.finalY + 40;

      // --- PAGE 4: COMMERCIAL TERMS & SIGNATURES ---
      doc.addPage();
      drawHeader(doc, 'CONDIÇÕES COMERCIAIS');

      doc.setTextColor(40);
      autoTable(doc, {
        startY: 70,
        body: [
          ['Cronograma de Execução', proposal.execution_schedule || 'A combinar'],
          ['Condições de Pagamento', proposal.payment_conditions || 'A combinar'],
          ['Validade da Proposta', `${proposal.validity_days || 10} dias a partir desta data`]
        ],
        theme: 'grid',
        margin: { top: 70, bottom: 40 },
        styles: { fontSize: 10, cellPadding: 5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, fillColor: [248, 250, 252] } }
      });

      yPos = (doc as any).lastAutoTable.finalY + 40;

      // --- REFERENCES / OBSERVATIONS ---
      if (pdfSettings.show_referencias && pdfSettings.referencias) {
        // Check if we need a new page
        if (yPos > pageHeight - 60) {
          doc.addPage();
          drawHeader(doc, 'REFERÊNCIAS / OBSERVAÇÕES');
          yPos = 70;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(40);
        doc.text('REFERÊNCIAS / OBSERVAÇÕES', 20, yPos);

        yPos += 6;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        const splitRefs = doc.splitTextToSize(pdfSettings.referencias, pageWidth - 40);
        doc.text(splitRefs, 20, yPos);

        yPos += (splitRefs.length * 4) + 20; // Add padding after references
      }

      // Check if signature fits on page
      if (yPos > pageHeight - 40) {
        doc.addPage();
        drawHeader(doc, 'CONDIÇÕES COMERCIAIS (CONT.)');
        yPos = 70;
      }

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

      if (pdfSettings.validade) {
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Proposta válida por: ${pdfSettings.validade} dias`, 20, sigYPos + 30);
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
      const finalBlob = new Blob([finalPdfBytes as any], { type: 'application/pdf' });
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



  const values = calculateValues();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span>Proposta Comercial</span>
              {projects.find(p => p.id === selectedProjectId)?.project_number && (
                <span className="bg-primary/20 text-primary text-[10px] font-black px-2 py-0.5 rounded border border-primary/30 ml-2">
                  PR{String(projects.find(p => p.id === selectedProjectId)?.project_number).padStart(3, '0')}
                </span>
              )}
            </div>
            {clientDetails?.fantasy_name && (
              <span className="text-primary text-xs font-bold uppercase tracking-widest mt-1 italic">
                {clientDetails.fantasy_name}
              </span>
            )}
          </div>
        }
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
                  <div className="lg:col-span-3 flex flex-col gap-3 pb-2 border-b border-white/5">
                    <label className="text-xs font-bold text-primary uppercase tracking-wider">Identificação do Projeto no PDF</label>
                    <input
                      type="text"
                      className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-3 text-white focus:border-primary outline-none text-lg font-bold"
                      value={pdfSettings.project_name_pdf || ''}
                      onChange={(e) => savePdfSettings({ ...pdfSettings, project_name_pdf: e.target.value })}
                      placeholder="Nome personalizado (ex: RESIDENCIAL VIA NATURALE)"
                    />
                    <p className="text-[10px] text-slate-500">Este nome aparecerá no cabeçalho e capa do PDF da Proposta Comercial.</p>
                  </div>

                  <div className="lg:col-span-3 flex flex-col gap-3 pb-2 border-b border-white/5">
                    <label className="text-xs font-bold text-primary uppercase tracking-wider">Imagem de Escopo / Projeto (Capa)</label>
                    <div className="flex gap-4 items-center">
                      <div className="flex-1">
                        <label className="flex flex-col items-center justify-center w-full h-16 border border-white/10 border-dashed rounded-lg cursor-pointer hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-2 text-slate-400">
                            <span className="material-symbols-outlined text-[20px]">add_photo_alternate</span>
                            <span className="text-xs font-bold uppercase">Selecionar Imagem</span>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload('scope_img', e.target.files[0])} />
                        </label>
                      </div>
                      {pdfSettings.scope_img && (
                        <div className="relative group">
                          <img src={pdfSettings.scope_img} alt="Escopo" className="h-16 rounded border border-white/10" />
                          <button
                            onClick={() => savePdfSettings({ ...pdfSettings, scope_img: '' })}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <span className="material-symbols-outlined text-[12px]">close</span>
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">Esta imagem será exibida em destaque na página de escopo ou capa.</p>
                  </div>

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
                            <span>Exibir Subtotal (Materiais/serviços)</span>
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
            <div className="flex flex-col gap-4">
              <label className="block text-sm font-medium text-slate-400">Selecione o Projeto para Proposta</label>

              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  {/* Search Input */}
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">search</span>
                    <input
                      type="text"
                      placeholder="Buscar projeto por nome ou cliente..."
                      className="w-full bg-background-dark border border-white/10 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <select
                    value={selectedProjectId}
                    onChange={(e) => onSelectProject(e.target.value)}
                    className="w-full bg-background-dark border border-white/10 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                  >
                    <option value="">Selecione...</option>
                    {filteredProjects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.project_number ? `PR${String(p.project_number).padStart(3, '0')} - ` : ''}{p.name} - {p.client}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 h-11 shrink-0">
                  {selectedProjectId && (
                    <>
                      <button
                        onClick={() => {
                          const project = projects.find(p => p.id === selectedProjectId);
                          if (project) handleDuplicateProposal(project);
                        }}
                        className="flex items-center justify-center w-11 h-11 rounded-lg bg-surface-dark border border-white/10 text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-all"
                        title="Duplicar Projeto e Proposta"
                      >
                        <span className="material-symbols-outlined text-[20px]">content_copy</span>
                      </button>

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
          </div>

          {selectedProjectId && (
            <>
              {/* Calculation Cards */}
              {/* Financial Flow Summary Bar */}
              <div className="bg-surface-dark border border-white/5 rounded-2xl overflow-hidden shadow-2xl mb-8">
                <div className="flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-white/5">

                  {/* Step 1: Costs Breakdown */}
                  <div className="flex-1 p-6 bg-black/20">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-rose-500 text-[18px]">inventory_2</span>
                      </div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">1. Levantamento de Custos</h4>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Base Materiais</p>
                        <p className="text-white text-lg font-bold font-mono">R$ {values.productsBase.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-500 uppercase mb-1">Serviços / Mão de Obra</p>
                        <p className="text-white text-lg font-bold font-mono">R$ {values.servicesTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-end">
                      <span className="text-[10px] font-black text-rose-400 uppercase">Custo Total (Líquido)</span>
                      <span className="text-white text-xl font-black font-mono">R$ {(values.productsBase + values.servicesTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Step 2: Markup Controls */}
                  <div className="flex-1 p-6 bg-indigo-500/5 relative group">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-indigo-500 text-[18px]">calculate</span>
                      </div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">2. Formação de Preço (Markups)</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black text-blue-400 uppercase tracking-tighter">BDI (%)</label>
                          <span className="text-[9px] font-bold text-slate-500">+R${values.bdiVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            className="w-full bg-background-dark/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-lg font-black outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center"
                            value={proposal.bdi_percent}
                            onChange={e => setProposal({ ...proposal, bdi_percent: Number(e.target.value) })}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-bold">%</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[9px] font-black text-emerald-400 uppercase tracking-tighter">Lucro (%)</label>
                          <span className="text-[9px] font-bold text-slate-500">+R${values.profitVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            className="w-full bg-background-dark/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-lg font-black outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-center"
                            value={proposal.profit_percent}
                            onChange={e => setProposal({ ...proposal, profit_percent: Number(e.target.value) })}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 font-bold">%</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col items-center">
                      <button
                        onClick={handleRecalculatePrices}
                        className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-900/40 transition-all flex items-center justify-center gap-2 group/btn active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px] group-hover/btn:rotate-180 transition-transform duration-500">refresh</span>
                        Recalcular Todos os Itens
                      </button>
                      <p className="text-[8px] text-slate-500 mt-2 font-medium tracking-tight">Aplica as taxas acima sobre o custo de cada item abaixo</p>
                    </div>
                  </div>

                  {/* Step 3: Final Investiment */}
                  <div className="lg:w-72 p-6 bg-emerald-500/10 flex flex-col justify-between border-l-4 border-emerald-500/30">
                    <div>
                      <div className="flex items-center gap-2 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                          <span className="material-symbols-outlined text-emerald-500 text-[18px]">payments</span>
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500">3. Resultado Final</h4>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-black text-emerald-400 uppercase tracking-widest">Investimento Total</p>
                        <p className="text-white text-3xl font-black font-mono tracking-tighter">
                          R$ {values.final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                        {Math.abs(values.final - (values.actualFinal || 0)) > 0.05 && (
                          <div className="flex items-center gap-1 mt-1 text-[8px] font-black text-amber-500 uppercase tracking-tighter bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                            <span className="material-symbols-outlined text-[10px]">sync_problem</span>
                            Sincronização pendente
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 space-y-2">
                      {values.discountVal > 0 && (
                        <div className="flex justify-between items-center px-3 py-1.5 bg-rose-500/10 rounded-lg border border-rose-500/20">
                          <span className="text-[9px] font-black text-rose-400 uppercase">Desconto Aplicado</span>
                          <span className="text-[10px] font-bold text-rose-400">- R$ {values.discountVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase px-1">
                        <span>Margem Bruta Estimada</span>
                        <span className="text-emerald-500">~ R$ {(values.final - (values.productsBase + values.servicesTotal)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  </div>

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
                        <th className="px-6 py-3 w-44">Custo Unit.</th>
                        <th className="px-6 py-3 w-44">Venda Unit.</th>
                        <th className="px-6 py-3 text-right">Total Venda</th>
                        <th className="px-6 py-3 text-right text-indigo-400">BDI (Est.)</th>
                        <th className="px-6 py-3 text-right text-emerald-400">Lucro (Est.)</th>
                        <th className="px-6 py-3 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {budgetItems.map(item => {
                        const bdiPctVal = Number(proposal.bdi_percent || 0) / 100;
                        const profitPctVal = Number(proposal.profit_percent || 0) / 100;
                        const bdiFact = 1 + bdiPctVal;
                        const profitFact = 1 + profitPctVal;

                        // Calculate informative BDI and Profit values
                        let costBase = Number(item.cost_price || 0);
                        if (costBase <= 0) {
                          const cleanName = item.name.includes('[') && item.name.includes(']')
                            ? item.name.split(']')[1]?.trim() || item.name
                            : item.name.trim();
                          const catalogItem = catalogItems.find(p => p.name.trim().toLowerCase() === cleanName.toLowerCase());
                          if (catalogItem && catalogItem.cost_price > 0) {
                            costBase = catalogItem.cost_price;
                          } else if (Number(item.unit_price) > 0) {
                            costBase = Number(item.unit_price) / (bdiFact * profitFact);
                          }
                        }

                        const qty = Number(item.quantity_final || 0);
                        const bdiValUnit = costBase * bdiPctVal;
                        const profitValUnit = (costBase + bdiValUnit) * profitPctVal;

                        const bdiTotalLine = bdiValUnit * qty;
                        const profitTotalLine = profitValUnit * qty;

                        return (
                          <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  {/* Icon indicating type */}
                                  {item.item_type === 'SERVICE' ? (
                                    <span className="material-symbols-outlined text-indigo-400">construction</span>
                                  ) : (
                                    <span className="material-symbols-outlined text-emerald-400">inventory_2</span>
                                  )}
                                  <button
                                    onClick={() => handleUpdateItem(item.id, { item_type: item.item_type === 'SERVICE' ? 'PRODUCT' : 'SERVICE' })}
                                    className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase transition-all shadow-sm ${item.item_type === 'SERVICE'
                                      ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/40 border border-indigo-500/30'
                                      : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 border border-emerald-500/30'
                                      }`}
                                    title="Clique para alternar entre Produto e Serviço"
                                  >
                                    {item.item_type === 'SERVICE' ? 'Serviço' : 'Produto'}
                                  </button>
                                  <input
                                    type="text"
                                    className="bg-transparent text-white font-medium text-sm outline-none border-b border-white/5 focus:border-primary/50 w-full transition-all py-0.5"
                                    value={item.name}
                                    onChange={(e) => handleUpdateItem(item.id, { name: e.target.value })}
                                  />
                                </div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase mt-0.5 ml-0">
                                  {item.origin === 'CALCULATED' ? 'Extraído da Engenharia' : 'Adicionado na Proposta'}
                                </div>
                                {itemDescriptions[item.name] && (
                                  <div className="text-[10px] text-slate-400 mt-1 italic leading-tight max-w-md">
                                    {itemDescriptions[item.name]}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center">
                                <input
                                  type="number"
                                  className="w-16 bg-background-dark border border-white/10 rounded px-2 py-1 text-white text-center font-bold text-xs outline-none focus:border-primary"
                                  value={item.quantity_final}
                                  onChange={(e) => handleUpdateItem(item.id, { quantity_final: Number(e.target.value) })}
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className={`flex items-center gap-1 bg-background-dark/30 border border-white/5 rounded px-2 py-1.5 transition-colors ${item.origin === 'MANUAL' ? 'focus-within:border-rose-500/30' : ''}`}>
                                <span className={`text-[10px] font-bold ${item.origin === 'MANUAL' ? 'text-rose-500' : 'text-rose-500/60'}`}>R$</span>
                                <input
                                  type="number"
                                  className="w-full bg-transparent outline-none text-right font-mono text-xs text-white"
                                  value={item.cost_price || 0}
                                  onChange={(e) => handleUpdateItem(item.id, { cost_price: Number(e.target.value) })}
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
                                  onChange={(e) => handleUpdateItem(item.id, { unit_price: Number(e.target.value) })}
                                  step="any"
                                />
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right text-white font-bold">R$ {(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>

                            {/* Informative Columns */}
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-mono text-indigo-400">R$ {bdiTotalLine.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <span className="text-[9px] text-slate-600 font-bold uppercase">Total BDI</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex flex-col items-end">
                                <span className="text-xs font-mono text-emerald-400">R$ {profitTotalLine.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                <span className="text-[9px] text-slate-600 font-bold uppercase">Total Lucro</span>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-right">

                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                <button
                                  onClick={() => {
                                    setItemToEdit(item);
                                    setNewItem({ name: item.name, quantity: item.quantity_final, price: item.unit_price, cost_price: item.cost_price || 0 });
                                    // Determine tab
                                    if (item.origin === 'MANUAL' && item.item_type === 'PRODUCT') setModalTab('custom');
                                    else if (item.item_type === 'SERVICE') setModalTab('service');
                                    else setModalTab('product');

                                    setModalSearchTerm('');
                                    setShowSearchList(false);
                                    setIsAddItemModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                                  title="Editar Item Detalhado"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setItemToReplace(item);
                                    setNewItem({ name: item.name, quantity: item.quantity_final, price: item.unit_price, cost_price: item.cost_price || 0 });
                                    setModalTab(item.item_type === 'SERVICE' ? 'service' : 'product');
                                    setModalSearchTerm('');
                                    setShowSearchList(false);
                                    setIsAddItemModalOpen(true);
                                  }}
                                  className="p-1.5 hover:bg-primary/10 rounded-lg text-primary"
                                  title="Substituir por Item do Catálogo"
                                >
                                  <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                                </button>
                                <button onClick={() => handleDeleteItem(item.id)} className="p-1.5 hover:bg-rose-500/10 rounded-lg text-rose-500">
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
                            <option value={20}>20 dias</option>
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

      {/* Add/Replace Item Modal */}
      {
        isAddItemModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-dark border border-white/10 rounded-2xl p-8 w-full max-w-lg shadow-2xl relative">
              <button
                onClick={() => {
                  setIsAddItemModalOpen(false);
                  setItemToReplace(null);
                  setItemToEdit(null);
                }}
                className="absolute top-4 right-4 text-slate-500 hover:text-white"
              >
                <span className="material-symbols-outlined">close</span>
              </button>

              <h3 className="text-xl font-bold text-white mb-6">
                {itemToEdit ? 'Editar Item' : itemToReplace ? 'Substituir Item' : 'Adicionar à Proposta'}
              </h3>

              {itemToReplace && (
                <div className="mb-6 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-[10px] text-primary font-bold uppercase mb-1">Substituindo:</p>
                  <p className="text-sm text-white font-medium truncate">{itemToReplace.name}</p>
                </div>
              )}

              {itemToEdit && (
                <div className="mb-6 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                  <p className="text-[10px] text-indigo-400 font-bold uppercase mb-1">Editando Item:</p>
                  <p className="text-sm text-white font-medium truncate">{itemToEdit.name}</p>
                </div>
              )}

              {/* Tabs */}
              <div className="flex bg-background-dark p-1 rounded-lg mb-6 border border-white/5">
                {(['product', 'service', 'custom'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => {
                      setModalTab(tab);
                      setNewItem({ name: '', quantity: 1, price: 0, cost_price: 0 });
                      setModalSearchTerm('');
                      setShowSearchList(false);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-md transition-all uppercase ${modalTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {tab === 'product' ? 'Produto' : tab === 'service' ? 'Serviço' : 'Personalizado'}
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {modalTab === 'product' && (
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Buscar Produto</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                      <input
                        type="text"
                        className="w-full bg-background-dark border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-indigo-500 transition-all"
                        placeholder="Pesquise por nome, marca ou modelo..."
                        value={modalSearchTerm}
                        onChange={e => {
                          setModalSearchTerm(e.target.value);
                          setShowSearchList(true);
                        }}
                        onFocus={() => setShowSearchList(true)}
                      />
                    </div>

                    {showSearchList && modalSearchTerm && (
                      <div className="absolute z-50 w-full mt-2 bg-[#2D2D39] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {catalogItems
                          .filter(p => p.name.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                          .map(p => (
                            <button
                              key={p.name}
                              onClick={() => {
                                setNewItem({ ...newItem, name: p.name, price: p.price, cost_price: p.cost_price || 0 });
                                setModalSearchTerm(p.name);
                                setShowSearchList(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-indigo-600/20 text-sm border-b border-white/5 last:border-none group flex justify-between items-center"
                            >
                              <div className="flex flex-col">
                                <span className="text-white font-medium group-hover:text-indigo-400 transition-colors uppercase text-[11px]">{p.name}</span>
                                <span className="text-xs text-slate-400">Preço Base: R${p.price.toLocaleString('pt-BR')}</span>
                              </div>
                              <span className="material-symbols-outlined text-indigo-500 opacity-0 group-hover:opacity-100 transition-all">add_circle</span>
                            </button>
                          ))}
                        {catalogItems.filter(p => p.name.toLowerCase().includes(modalSearchTerm.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center text-slate-500 text-xs italic">Nenhum produto encontrado.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {modalTab === 'service' && (
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Buscar Serviço</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
                      <input
                        type="text"
                        className="w-full bg-background-dark border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white outline-none focus:border-indigo-500 transition-all"
                        placeholder="Pesquise o serviço..."
                        value={modalSearchTerm}
                        onChange={e => {
                          setModalSearchTerm(e.target.value);
                          setShowSearchList(true);
                        }}
                        onFocus={() => setShowSearchList(true)}
                      />
                    </div>

                    {showSearchList && modalSearchTerm && (
                      <div className="absolute z-50 w-full mt-2 bg-[#2D2D39] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                        {serviceCatalog
                          .filter(s => s.name.toLowerCase().includes(modalSearchTerm.toLowerCase()))
                          .map(s => (
                            <button
                              key={s.name}
                              onClick={() => {
                                setNewItem({ ...newItem, name: s.name, price: 0 });
                                setModalSearchTerm(s.name);
                                setShowSearchList(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-indigo-600/20 text-sm border-b border-white/5 last:border-none group flex justify-between items-center"
                            >
                              <div className="flex flex-col">
                                <span className="text-white font-medium group-hover:text-indigo-400 transition-colors uppercase text-[11px]">{s.name}</span>
                                <span className="text-[10px] text-slate-500 truncate max-w-[300px]">{s.description}</span>
                              </div>
                              <span className="material-symbols-outlined text-indigo-500 opacity-0 group-hover:opacity-100 transition-all">add_circle</span>
                            </button>
                          ))}
                        {serviceCatalog.filter(s => s.name.toLowerCase().includes(modalSearchTerm.toLowerCase())).length === 0 && (
                          <div className="p-4 text-center text-slate-500 text-xs italic">Nenhum serviço encontrado.</div>
                        )}
                      </div>
                    )}
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

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Custo Unitário (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full bg-background-dark border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500"
                    placeholder="Opcional - Valor de custo do item"
                    value={newItem.cost_price}
                    onChange={e => setNewItem({ ...newItem, cost_price: parseFloat(e.target.value) })}
                  />
                  <p className="text-[10px] text-slate-500 mt-1 italic">Este valor é usado para calcular o lucro real da proposta.</p>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => {
                    setIsAddItemModalOpen(false);
                    setItemToReplace(null);
                    setItemToEdit(null);
                  }}
                  className="flex-1 py-3 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-white/5 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!newItem.name || loading}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold shadow-lg shadow-indigo-900/20 disabled:opacity-50 transition-all"
                >
                  {itemToEdit || itemToReplace ? 'Salvar Alterações' : 'Adicionar'}
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
