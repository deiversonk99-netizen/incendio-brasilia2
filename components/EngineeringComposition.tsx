import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { Project, ServiceModel, ServiceModelItem } from '../types';
import NewProjectModal from './NewProjectModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface EngineeringCompositionProps {
  onNext: () => void;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}

interface BudgetItem {
  id: string;
  name: string;
  quantity_calculated: number;
  quantity_final: number;
  unit_price: number;
  origin: 'CALCULATED' | 'MANUAL';
  project_id: string;
}

const EngineeringComposition: React.FC<EngineeringCompositionProps> = ({ onNext, selectedProjectId, onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  // selectedProjectId is now a prop
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Manual Add Item State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [replicationSummary, setReplicationSummary] = useState<{ name: string, factor: number, type: string }[]>([]);

  // Service Models State
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<ServiceModel[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Exchange Product State
  const [isExchangeModalOpen, setIsExchangeModalOpen] = useState(false);
  const [itemToExchange, setItemToExchange] = useState<BudgetItem | null>(null);
  const [exchangeSearch, setExchangeSearch] = useState('');

  // PDF Settings State
  const [pdfSettings, setPdfSettings] = useState<any>({
    carimbo: '',
    assinatura: '',
    crq: '',
    credentials: '',
    referencias: '',
    validade: '10'
  });
  const [showPdfSettings, setShowPdfSettings] = useState(false);

  const loadPdfSettings = async (projectId: string) => {
    try {
      const { data } = await supabase
        .from('pdf_settings')
        .select('variables')
        .eq('project_id', projectId)
        .eq('phase', 'ENG_B')
        .single();

      if (data) {
        setPdfSettings(data.variables);
      } else {
        setPdfSettings({
          carimbo: '',
          assinatura: '',
          crq: '',
          credentials: '',
          referencias: '',
          validade: '10'
        });
      }
    } catch (e) {
      console.warn('PDF settings load error:', e);
    }
  };

  const savePdfSettings = async (newSettings: any) => {
    setPdfSettings(newSettings);
    if (!selectedProjectId) return;

    try {
      await supabase
        .from('pdf_settings')
        .upsert({
          project_id: selectedProjectId,
          phase: 'ENG_B',
          variables: newSettings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'project_id, phase' });
    } catch (e) {
      console.error('Error saving PDF settings:', e);
    }
  };

  const handleImageUpload = (field: string, file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      savePdfSettings({ ...pdfSettings, [field]: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  // Load catalog for the add modal
  useEffect(() => {
    const loadCatalog = async () => {
      const { data } = await supabase.from('product_catalog').select('name, price').order('name');
      if (data) setCatalogProducts(data);
    };
    loadCatalog();
    loadCatalog();
  }, []);

  // Fetch Service Models with Items for Pricing
  useEffect(() => {
    const fetchModels = async () => {
      setLoadingModels(true);
      const { data } = await supabase
        .from('service_models')
        .select(`
          *,
          items:service_model_items(
            quantity,
            product:product_catalog(price)
          )
        `)
        .order('name');

      if (data) {
        // Calculate totals
        const modelsWithTotals = data.map((m: any) => {
          const productsTotal = m.items?.reduce((acc: number, item: any) => {
            return acc + (item.quantity * (item.product?.price || 0));
          }, 0) || 0;
          return {
            ...m,
            total_products_price: productsTotal,
            total_price: (m.labor_price || 0) + productsTotal
          };
        });
        setAvailableModels(modelsWithTotals);
      }
      setLoadingModels(false);
    };
    if (isModelModalOpen) {
      fetchModels();
    }
  }, [isModelModalOpen]);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadBudgetItems();
      loadPdfSettings(selectedProjectId);
    } else {
      setItems([]);
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

  useEffect(() => {
    if (selectedProjectId) {
      const fetchReplicationInfo = async () => {
        const { data: floors } = await supabase.from('floors').select('name, replication_factor, calculation_type').eq('project_id', selectedProjectId);
        if (floors) {
          const summary = floors
            .filter((f: any) => f.replication_factor > 1)
            .map((f: any) => ({
              name: f.name,
              factor: f.replication_factor,
              type: f.calculation_type === 'complete' ? 'Completa' : 'Superfície'
            }));
          setReplicationSummary(summary);
        }
      };
      fetchReplicationInfo();
    }
  }, [selectedProjectId]);

  const loadBudgetItems = async () => {
    setLoading(true);
    // Try to load existing items first
    const { data: existingItems } = await supabase
      .from('budget_items')
      .select('*')
      .eq('project_id', selectedProjectId)
      .order('name');

    if (existingItems && existingItems.length > 0) {
      setItems(existingItems);
    } else {
      // If no items, calculate from Phase A
      await calculateFromPhaseA();
    }
    setLoading(false);
  };

  const calculateFromPhaseA = async () => {
    setCalculating(true);
    console.log('Calculating from Phase A...');

    // 1. Fetch all floors
    // 1. Fetch all floors
    const { data: floors } = await supabase
      .from('floors')
      .select('items, replication_factor, calculation_type')
      .eq('project_id', selectedProjectId);

    if (!floors) {
      setCalculating(false);
      return;
    }

    // 2. Fetch all components for all kits
    const { data: allKitComponents } = await supabase
      .from('kit_components')
      .select('*, composition_kits(name, loss_percentage)');

    // 2.1 Fetch Catalog Logic for Pricing
    const { data: catalogProducts } = await supabase
      .from('product_catalog')
      .select('name, price');

    const priceMap: Record<string, number> = {};
    if (catalogProducts) {
      // Normalize to lowercase for matching
      catalogProducts.forEach(p => priceMap[p.name.trim().toLowerCase()] = p.price);
    }

    const kitMap: Record<string, { loss: number, components: any[] }> = {};
    if (allKitComponents) {
      allKitComponents.forEach((comp: any) => {
        const kitId = comp.kit_id;
        if (!kitMap[kitId]) {
          kitMap[kitId] = {
            loss: comp.composition_kits?.loss_percentage || 10,
            components: []
          };
        }
        kitMap[kitId].components.push(comp);
      });
    }

    // 3. Aggregate
    const aggregation: Record<string, number> = {};

    floors.forEach(floor => {
      const items = floor.items as any;
      const replication = floor.replication_factor || 1;
      const checks = items.item_checks || {};

      const central = items.central_items || {};
      Object.entries(central).forEach(([name, qty]) => {
        // Skip if explicitly unchecked
        if (checks[name] === false) return;

        aggregation[name] = (aggregation[name] || 0) + (Number(qty) * replication);
      });

      Object.entries(items).forEach(([key, val]) => {
        if (key !== 'central_items' && key !== 'infra_kits' && key !== 'item_checks' && typeof val === 'number') {
          // Legacy or direct items
          // Assuming these might also need replication if they exist? 
          // For safety, apply replication to everything that looks like a quantity
          aggregation[key] = (aggregation[key] || 0) + (Number(val) * replication);
        }
      });

      const kits = items.infra_kits || [];
      kits.forEach((kitUsage: any) => {
        const kitDef = kitMap[kitUsage.kit_id];
        if (kitDef) {
          const meters = Number(kitUsage.meters);
          if (meters <= 0) return;

          // Apply replication to meters (more floors = more pipes)
          const totalMeters = meters * replication;

          kitDef.components.forEach(comp => {
            const baseQty = totalMeters * Number(comp.conversion_factor);
            const withLoss = baseQty * (1 + (Number(kitDef.loss) / 100));
            // Round up to avoid fractional units for things that are integers
            const roundedQty = Math.ceil(withLoss);

            // Group by Product Name + Infra Name to identify the source
            const displayName = `${comp.product_name} [INFRA:${kitUsage.name}]`;
            aggregation[displayName] = (aggregation[displayName] || 0) + roundedQty;
          });
        }
      });
    });


    // Set Replication Summary for display
    const summary = floors
      .filter((f: any) => f.replication_factor > 1)
      .map((f: any) => ({
        name: f.name,
        factor: f.replication_factor,
        type: f.calculation_type === 'complete' ? 'Completa' : 'Superfície'
      }));
    setReplicationSummary(summary);

    // 4. Prepare inserts
    const newItems = Object.entries(aggregation).map(([name, qty]) => {
      // Fix: strip the [INFRA:...] part before checking price catalog
      // Example: "TUBO 1/2 [INFRA:Infra Alarme]" -> "TUBO 1/2"
      const cleanName = name.includes('[INFRA:') ? name.split('[INFRA:')[0].trim() : name.trim();
      const unitPrice = priceMap[cleanName.toLowerCase()] || 0;

      return {
        project_id: selectedProjectId,
        name: name,
        quantity_calculated: qty,
        quantity_final: qty,
        unit_price: unitPrice,
        origin: 'CALCULATED' as const
      };
    });

    if (newItems.length > 0) {
      // Clear old calculated items to avoid duplicates logic for now, or use upsert? 
      // For simplicity, we delete CALCULATED items for this project and re-insert.
      await supabase.from('budget_items').delete().eq('project_id', selectedProjectId).eq('origin', 'CALCULATED');

      const { data, error } = await supabase.from('budget_items').insert(newItems).select();
      if (data) setItems(prev => [...prev.filter(i => i.origin === 'MANUAL'), ...data as any]);
      if (error) console.error('Error inserting calculated items:', error);
    } else {
      // If aggregation empty, clear calculated items
      await supabase.from('budget_items').delete().eq('project_id', selectedProjectId).eq('origin', 'CALCULATED');
      setItems(prev => prev.filter(i => i.origin === 'MANUAL'));
    }

    setCalculating(false);
  };

  const handleRecalculate = () => {
    if (!selectedProjectId) return;
    if (confirm('Isso irá recalcular todos os itens baseados na Fase A e substituirá os valores manuais da coluna "Calculado". Deseja continuar?')) {
      calculateFromPhaseA();
    }
  };

  const handleUpdateItem = async (id: string, field: keyof BudgetItem, value: string | number) => {
    // Optimistic update
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        let updatedItem = { ...item, [field]: value };

        // Auto-update price if name matches a catalog product
        if (field === 'name') {
          const catalogProd = catalogProducts.find(p => p.name === value);
          if (catalogProd) {
            updatedItem.unit_price = catalogProd.price;
            // Also sync price to DB immediately for the item
            supabase.from('budget_items').update({ unit_price: catalogProd.price }).eq('id', id).then(({ error }) => {
              if (error) console.error('Error auto-updating price field:', error);
            });
          }
        }

        return updatedItem;
      }
      return item;
    }));

    // DB Update for the primary field
    await supabase.from('budget_items').update({ [field]: value }).eq('id', id);
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;

    // Optimistic update
    setItems(prev => prev.filter(item => item.id !== id));

    // DB Update
    const { error } = await supabase.from('budget_items').delete().eq('id', id);
    if (error) {
      console.error('Error deleting item:', error);
      alert('Erro ao excluir item.');
      loadBudgetItems(); // Re-load to sync with DB if error
    }
  };

  const handleSwapProduct = async (catalogProduct: any) => {
    if (!itemToExchange) return;

    const updatedItem = {
      ...itemToExchange,
      name: catalogProduct.name,
      unit_price: catalogProduct.price
    };

    // Optimistic update
    setItems(prev => prev.map(item => item.id === itemToExchange.id ? updatedItem : item));

    // DB Update
    const { error } = await supabase
      .from('budget_items')
      .update({
        name: catalogProduct.name,
        unit_price: catalogProduct.price
      })
      .eq('id', itemToExchange.id);

    if (error) {
      console.error('Error swapping product:', error);
      alert('Erro ao trocar produto.');
      loadBudgetItems();
    }

    setIsExchangeModalOpen(false);
    setItemToExchange(null);
    setExchangeSearch('');
  };

  const calculateTotal = () => {
    return items.reduce((acc, item) => acc + (item.quantity_final * item.unit_price), 0);
  };

  const handleAddItem = async () => {
    if (!selectedProjectId || !newItemName) return;

    const newItem = {
      project_id: selectedProjectId,
      name: newItemName,
      quantity_calculated: 0,
      quantity_final: 1, // Default to 1
      unit_price: newItemPrice,
      origin: 'MANUAL'
    };

    const { data, error } = await supabase.from('budget_items').insert(newItem).select();
    if (data) {
      setItems(prev => [...prev, data[0] as any]);
      setIsAddModalOpen(false);
      setNewItemName('');
      setNewItemPrice(0);
    }
    if (error) {
      console.error(error);
      alert('Erro ao adicionar item.');
    }
  };

  const handleAddModels = async () => {
    if (!selectedProjectId || selectedModelIds.length === 0) return;

    try {
      setLoading(true);
      const newBudgetItems: any[] = [];

      for (const modelId of selectedModelIds) {
        const model = availableModels.find(m => m.id === modelId);
        if (!model) continue;

        // 1. Add Labor Item (The editable total regulator)
        newBudgetItems.push({
          project_id: selectedProjectId,
          name: `[MODELO: ${model.name}] Mão de Obra / Serviço`,
          quantity_calculated: 0,
          quantity_final: 1,
          unit_price: model.labor_price || 0,
          origin: 'MANUAL'
        });

        // 2. Fetch Model Items with Products
        const { data: modelItems } = await supabase
          .from('service_model_items')
          .select('*, product:product_catalog(*)')
          .eq('service_model_id', modelId);

        if (modelItems) {
          modelItems.forEach((item: any) => {
            if (item.product) {
              newBudgetItems.push({
                project_id: selectedProjectId,
                name: `[MODELO: ${model.name}] ${item.product.name}`,
                quantity_calculated: 0,
                quantity_final: item.quantity,
                unit_price: item.product.price,
                origin: 'MANUAL'
              });
            }
          });
        }
      }

      const { data, error } = await supabase.from('budget_items').insert(newBudgetItems).select();

      if (error) throw error;

      if (data) {
        setItems(prev => [...prev, ...data as any]);
        setIsModelModalOpen(false);
        setSelectedModelIds([]);
      }

    } catch (e) {
      console.error('Error adding models:', e);
      alert('Erro ao adicionar modelos.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    if (!confirm(`Deseja excluir todo o modelo "${modelName}" e seus itens?`)) return;

    // Filter out items that belong to this model
    const itemsToDelete = items.filter(i => i.name.includes(`[MODELO: ${modelName}]`));

    // Optimistic update
    setItems(prev => prev.filter(i => !i.name.includes(`[MODELO: ${modelName}]`)));

    // DB Update
    const ids = itemsToDelete.map(i => i.id);
    const { error } = await supabase.from('budget_items').delete().in('id', ids);

    if (error) {
      console.error('Error deleting model items:', error);
      alert('Erro ao excluir itens do modelo.');
      loadBudgetItems();
    }
  };

  const handleUpdateModelTotal = async (modelName: string, newTotal: number, modelItems: BudgetItem[]) => {
    // 1. Calculate sum of products
    const laborItem = modelItems.find(i => i.name.includes('Mão de Obra / Serviço'));
    if (!laborItem) return;

    const productsTotal = modelItems
      .filter(i => !i.name.includes('Mão de Obra / Serviço'))
      .reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);

    // 2. Calculate new labor price
    // NewTotal = ProductsTotal + (LaborPrice * 1)
    // LaborPrice = NewTotal - ProductsTotal
    const newLaborPrice = newTotal - productsTotal;

    // 3. Update
    await handleUpdateItem(laborItem.id, 'unit_price', newLaborPrice);
  };


  const generateCompositionPDF = () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project || items.length === 0) {
      alert('Selecione um projeto com itens calculados.');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Utility for adding footer
    const addFooter = (doc: any, pageNum: number, totalPages: number) => {
      doc.setFontSize(8);
      doc.setTextColor(150);
      const footerText = `Composição de Materiais - ${project.name} | Página ${pageNum} de ${totalPages}`;
      doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });
    };

    // --- Page 1: Header and Summary ---
    doc.setFillColor(0, 0, 0); // Black
    doc.rect(0, 0, pageWidth, 50, 'F');

    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPOSIÇÃO DE MATERIAIS', 20, 28);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 36);
    doc.text(`Identificação: PRJ-${project.id.slice(0, 5).toUpperCase()}`, 20, 42);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 20, 28, { align: 'right' });

    doc.setTextColor(40);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO DE CUSTOS', 20, 65);
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 67, pageWidth - 20, 67);

    const calcItems = items.filter(i => i.origin === 'CALCULATED');
    const manualItems = items.filter(i => i.origin === 'MANUAL');
    const calcTotal = calcItems.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);
    const manualTotal = manualItems.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);
    const total = calcTotal + manualTotal;

    autoTable(doc, {
      startY: 72,
      head: [['Categoria', 'Qtd Itens', 'Total Etapa (R$)']],
      body: [
        ['Itens Projetados (Sistema)', calcItems.length.toString(), `R$ ${calcTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        ['Itens Manuais (Extra)', manualItems.length.toString(), `R$ ${manualTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
        [{ content: 'INVESTIMENTO TOTAL ESTIMADO', styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
        { content: items.length.toString(), styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } },
        { content: `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, styles: { fontStyle: 'bold', fillColor: [30, 41, 59], textColor: [255, 255, 255] } }]
      ],
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 4 }
    });

    let yPos = (doc as any).lastAutoTable.finalY + 20;

    // --- Items Table ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LISTA DETALHADA DE MATERIAIS', 20, yPos);
    doc.line(20, yPos + 2, pageWidth - 20, yPos + 2);
    yPos += 10;

    // Group items for PDF
    const centralItems = items.filter(i => !i.name.includes('[INFRA:') && !i.name.includes('[MODELO:'));
    const infraItems = items.filter(i => i.name.includes('[INFRA:'));
    const modelItems = items.filter(i => i.name.includes('[MODELO:'));

    const tableData: any[] = [];

    // Add Central Items
    if (centralItems.length > 0) {
      tableData.push([{ content: 'ITENS DE COTAÇÃO CENTRAL', colSpan: 5, styles: { fillColor: [240, 240, 240], fontStyle: 'bold' } }]);
      centralItems.forEach(item => {
        tableData.push([
          item.name,
          'Sistema',
          item.quantity_final,
          `R$ ${item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          `R$ ${(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        ]);
      });
    }

    // Add Model Items grouped by Model
    if (modelItems.length > 0) {
      const grouped = modelItems.reduce((acc, item) => {
        const modelName = item.name.match(/\[MODELO:(.+?)\]/)?.[1]?.trim() || 'Outros';
        if (!acc[modelName]) acc[modelName] = [];
        acc[modelName].push(item);
        return acc;
      }, {} as Record<string, BudgetItem[]>);

      (Object.entries(grouped) as [string, BudgetItem[]][]).forEach(([modelName, mItems]) => {
        const modelTotal = mItems.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);

        tableData.push([{
          content: `MODELO DE SERVIÇO: ${modelName.toUpperCase()}  (Total: R$ ${modelTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`,
          colSpan: 5,
          styles: { fillColor: [238, 242, 255], textColor: [67, 56, 202], fontStyle: 'bold' } // Indigo color
        }]);

        mItems.forEach(item => {
          const isLabor = item.name.includes('Mão de Obra / Serviço');
          const cleanName = item.name.includes('[MODELO:') ? item.name.split('] ')[1] : item.name;

          tableData.push([
            cleanName + (isLabor ? ' (Serviço)' : ''),
            'Modelo',
            item.quantity_final,
            `R$ ${item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            `R$ ${(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          ]);
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
      }, {} as Record<string, BudgetItem[]>);

      (Object.entries(grouped) as [string, BudgetItem[]][]).forEach(([kitName, kitItems]) => {
        tableData.push([{ content: `INFRAESTRUTURA: ${kitName.toUpperCase()}`, colSpan: 5, styles: { fillColor: [255, 247, 237], textColor: [194, 65, 12], fontStyle: 'bold' } }]);
        kitItems.forEach(item => {
          // Clean product name for PDF display
          const cleanName = item.name.split('[INFRA:')[0].trim();
          tableData.push([
            cleanName,
            'Infra',
            item.quantity_final,
            `R$ ${item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            `R$ ${(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          ]);
        });
      });
    }

    autoTable(doc, {
      startY: yPos,
      head: [['Produto', 'Origem', 'Qtd Final', 'Custo Unit.', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], fontSize: 9 },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { cellWidth: 25 },
        2: { halign: 'center', cellWidth: 25 },
        3: { halign: 'right', cellWidth: 35 },
        4: { halign: 'right', cellWidth: 35 }
      }
    });

    // Page numbers
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      addFooter(doc, i, totalPages);
    }

    // --- Signature / Stamp Section if provided ---
    const needsValidPage = pdfSettings.show_assinatura || pdfSettings.show_crq || pdfSettings.show_credentials || pdfSettings.show_carimbo || pdfSettings.show_referencias;

    if (needsValidPage) {
      doc.addPage();
      doc.setFillColor(0, 0, 0);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('CREDENCIAIS E VALIDAÇÃO', 20, 25);

      doc.setTextColor(40);
      doc.setFontSize(10);
      let sigY = 60;

      if (pdfSettings.show_assinatura && pdfSettings.assinatura) {
        doc.text(`Responsável: ${pdfSettings.assinatura}`, 20, sigY);
        sigY += 8;
      }
      if (pdfSettings.show_crq && pdfSettings.crq) {
        doc.text(`CRQ/CREA: ${pdfSettings.crq}`, 20, sigY);
        sigY += 8;
      }

      if (pdfSettings.show_credentials) {
        if (pdfSettings.credentials_img) {
          doc.addImage(pdfSettings.credentials_img, 'PNG', 20, sigY, 40, 20);
          sigY += 25;
        } else if (pdfSettings.credentials) {
          doc.text(`Credenciais: ${pdfSettings.credentials}`, 20, sigY);
          sigY += 8;
        }
      }

      if (pdfSettings.show_carimbo) {
        if (pdfSettings.carimbo_img) {
          doc.addImage(pdfSettings.carimbo_img, 'PNG', 20, sigY, 40, 20);
          sigY += 25;
        } else if (pdfSettings.carimbo) {
          doc.text(`Carimbo: ${pdfSettings.carimbo}`, 20, sigY);
          sigY += 15;
        }
      }

      if (pdfSettings.show_referencias && pdfSettings.referencias) {
        doc.setFont('helvetica', 'bold');
        doc.text('Referências:', 20, sigY);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(pdfSettings.referencias, pageWidth - 40), 20, sigY + 6);
        sigY += 20;
      }

      if (pdfSettings.validade) {
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Validade deste documento: ${pdfSettings.validade} dias`, 20, pageHeight - 20);
      }
    }

    doc.save(`Composicao_${project.name.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Composição de Materiais"
        subtitle="Revisão de itens agregados e ajuste de quantidades finais."
        breadcrumbs={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Engenharia</span>
            <span className="material-symbols-outlined text-text-muted text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">Fase B - Composição</span>
          </div>
        }
        actions={
          <div className="flex gap-3">
            <button
              onClick={handleRecalculate}
              disabled={calculating || !selectedProjectId}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-surface-dark border border-white/10 hover:bg-white/5 text-white transition-all font-bold text-sm disabled:opacity-50"
              title="Forçar recálculo baseado na Fase A"
            >
              <span className={`material-symbols-outlined text-[18px] ${calculating ? 'animate-spin' : ''}`}>
                refresh
              </span>
              Recalcular
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              disabled={!selectedProjectId}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-emerald-600/10 border border-emerald-500/20 hover:bg-emerald-600/20 text-emerald-500 transition-all font-bold text-sm disabled:opacity-50"
            >
              Adicionar Item
            </button>
            <button
              onClick={() => setIsModelModalOpen(true)}
              disabled={!selectedProjectId}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-indigo-600/10 border border-indigo-500/20 hover:bg-indigo-600/20 text-indigo-500 transition-all font-bold text-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">post_add</span>
              Adicionar Modelo
            </button>
            <button
              onClick={generateCompositionPDF}
              disabled={!selectedProjectId || items.length === 0}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all font-bold text-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              PDF Materiais
            </button>
            <button className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm" onClick={onNext}>
              <span className="material-symbols-outlined text-[18px]">check</span>
              Finalizar Composição
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-8 relative">
        {/* Added relative for modal positioning context if needed, though fixed is better */}
        <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-12">

          {/* PDF Customization Toggle */}
          {selectedProjectId && (
            <div className="bg-surface-dark rounded-xl border border-white/5 overflow-hidden shadow-sm">
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
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Project Selection */}
          <div className="bg-surface-dark p-6 rounded-xl border border-white/5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-end gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium text-slate-400 mb-2">Selecione o Projeto</label>
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
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface-dark p-6 rounded-xl border border-white/5">
                  <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Total de Itens</h4>
                  <div className="text-3xl font-black text-white">{items.length}</div>
                </div>
                <div className="bg-surface-dark p-6 rounded-xl border border-white/5 border-l-4 border-l-yellow-500">
                  <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Itens com Conflito</h4>
                  <div className="text-3xl font-black text-yellow-500">0</div>
                </div>
                <div className="bg-surface-dark p-6 rounded-xl border border-white/5 border-l-4 border-l-primary/50 bg-primary/5">
                  <h4 className="text-primary/70 text-xs font-bold uppercase tracking-wider mb-2">Custo Estimado</h4>
                  <div className="text-3xl font-black text-white">R$ {calculateTotal().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
              </div>

              {/* Replication Info Alert */}
              {replicationSummary.length > 0 && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[20px]">content_copy</span>
                    Fatores de Replicação Considerados
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {replicationSummary.map((item, idx) => (
                      <span key={idx} className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-1 rounded border border-indigo-500/30">
                        {item.name}: <strong>{item.factor}x</strong> <span className="text-indigo-400/70">({item.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="bg-surface-dark rounded-xl border border-white/5 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-slate-400 font-medium uppercase text-xs tracking-wider">
                      <tr>
                        <th className="px-6 py-4">Produto</th>
                        <th className="px-6 py-4">Origem</th>
                        <th className="px-6 py-4 text-center">Qtd. Sistema</th>
                        <th className="px-6 py-4 text-center">Qtd. Final</th>
                        <th className="px-6 py-4 text-right">Custo Unit.</th>
                        <th className="px-6 py-4 text-right">Total</th>
                        <th className="px-6 py-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loading || calculating ? (
                        <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">Calculando materiais...</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">Nenhum item encontrado. Adicione manualmente ou verifique a Fase A.</td></tr>
                      ) : (
                        <>
                          {/* 1. Itens de Cotação (Central Items) */}
                          {items.filter(i => !i.name.includes('[INFRA:')).length > 0 && (
                            <>
                              <tr className="bg-white/5">
                                <td colSpan={7} className="px-6 py-2">
                                  <div className="flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-widest">
                                    <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                                    Itens de Cotação Central
                                  </div>
                                </td>
                              </tr>
                              {items.filter(i => !i.name.includes('[INFRA:')).map(item => (
                                <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        list="catalog-products"
                                        className="flex-1 bg-transparent border-b border-transparent hover:border-white/20 focus:border-primary focus:bg-background-dark/50 rounded px-2 py-1 text-white outline-none transition-all font-medium"
                                        value={item.name}
                                        onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                                      />
                                      <button
                                        onClick={() => {
                                          setItemToExchange(item);
                                          setIsExchangeModalOpen(true);
                                        }}
                                        className="p-1 text-slate-500 hover:text-primary hover:bg-primary/10 rounded transition-all"
                                        title="Trocar por produto do catálogo"
                                      >
                                        <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                                      </button>
                                    </div>
                                    <datalist id="catalog-products">
                                      {catalogProducts.map((p, idx) => (
                                        <option key={idx} value={p.name} />
                                      ))}
                                    </datalist>
                                    <div className="text-[10px] text-slate-500 px-2 mt-1">{item.origin === 'CALCULATED' ? 'Sugerido pelo sistema' : 'Adicionado Manualmente'}</div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${item.origin === 'CALCULATED'
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      }`}>
                                      {item.origin === 'CALCULATED' ? 'Calculado' : 'Manual'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center text-slate-400">{item.quantity_calculated}</td>
                                  <td className="px-6 py-4 text-center">
                                    <input
                                      type="number"
                                      className="w-20 bg-background-dark border border-white/10 rounded px-2 py-1 text-center text-white focus:border-primary outline-none font-bold"
                                      value={item.quantity_final}
                                      onChange={(e) => handleUpdateItem(item.id, 'quantity_final', Number(e.target.value))}
                                    />
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <span className="text-slate-500 text-xs">R$</span>
                                      <input
                                        type="number"
                                        className="w-24 bg-background-dark border border-white/10 rounded px-2 py-1 text-right text-white focus:border-primary outline-none font-bold"
                                        value={item.unit_price}
                                        onChange={(e) => handleUpdateItem(item.id, 'unit_price', Number(e.target.value))}
                                      />
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 text-right font-bold text-white">
                                    R$ {(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                      title="Excluir Item"
                                    >
                                      <span className="material-symbols-outlined text-[20px]">delete</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </>
                          )}

                          {/* 2. Produtos de Infraestrutura Agrupados por Kit */}
                          {(Object.entries(items.reduce((acc, item) => {
                            if (item.name.includes('[INFRA:')) {
                              const kitName = item.name.match(/\[INFRA:(.+?)\]/)?.[1] || 'Outros';
                              if (!acc[kitName]) acc[kitName] = [];
                              acc[kitName].push(item);
                            }
                            return acc;
                          }, {} as Record<string, BudgetItem[]>)) as [string, BudgetItem[]][]).map(([kitName, kitItems]) => (
                            <React.Fragment key={kitName}>
                              <tr className="bg-white/5 border-t border-white/10">
                                <td colSpan={7} className="px-6 py-2">
                                  <div className="flex items-center gap-2 text-orange-400 font-bold text-[11px] uppercase tracking-widest">
                                    <span className="material-symbols-outlined text-[16px]">construction</span>
                                    Infraestrutura: <span className="text-white bg-orange-500/20 px-2 py-0.5 rounded border border-orange-500/30">{kitName}</span>
                                  </div>
                                </td>
                              </tr>
                              {kitItems.map(item => {
                                // Extract clean product name from "Product [INFRA:Infra]"
                                const cleanName = item.name.includes('[INFRA:') ? item.name.split('[INFRA:')[0].trim() : item.name;

                                return (
                                  <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                        <input
                                          type="text"
                                          list="catalog-products"
                                          className="flex-1 bg-transparent border-b border-transparent hover:border-white/20 focus:border-primary focus:bg-background-dark/50 rounded px-2 py-1 text-white outline-none transition-all font-medium"
                                          value={cleanName}
                                          onChange={(e) => {
                                            const newName = `${e.target.value} [INFRA:${kitName}]`;
                                            handleUpdateItem(item.id, 'name', newName);
                                          }}
                                        />
                                        <button
                                          onClick={() => {
                                            setItemToExchange(item);
                                            setIsExchangeModalOpen(true);
                                          }}
                                          className="p-1 text-slate-500 hover:text-primary hover:bg-primary/10 rounded transition-all"
                                          title="Trocar por produto do catálogo"
                                        >
                                          <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                                        </button>
                                      </div>
                                      <datalist id="catalog-products">
                                        {catalogProducts.map((p, idx) => (
                                          <option key={idx} value={p.name} />
                                        ))}
                                      </datalist>
                                      <div className="text-[10px] text-slate-500 px-2 mt-1">Sugerido para {kitName}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">
                                        Infra
                                      </span>
                                    </td>
                                    <td className="px-6 py-4 text-center text-slate-400">{item.quantity_calculated}</td>
                                    <td className="px-6 py-4 text-center">
                                      <input
                                        type="number"
                                        className="w-20 bg-background-dark border border-white/10 rounded px-2 py-1 text-center text-white focus:border-primary outline-none font-bold"
                                        value={item.quantity_final}
                                        onChange={(e) => handleUpdateItem(item.id, 'quantity_final', Number(e.target.value))}
                                      />
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <span className="text-slate-500 text-xs">R$</span>
                                        <input
                                          type="number"
                                          className="w-24 bg-background-dark border border-white/10 rounded px-2 py-1 text-right text-white focus:border-primary outline-none font-bold"
                                          value={item.unit_price}
                                          onChange={(e) => handleUpdateItem(item.id, 'unit_price', Number(e.target.value))}
                                        />
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-white">
                                      R$ {(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                        title="Excluir Item"
                                      >
                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          ))}


                          {/* 3. Service Models Grouping */}
                          {(Object.entries(items.reduce((acc, item) => {
                            if (item.name.includes('[MODELO:')) {
                              const modelName = item.name.match(/\[MODELO:(.+?)\]/)?.[1]?.trim() || 'Outros';
                              if (!acc[modelName]) acc[modelName] = [];
                              acc[modelName].push(item);
                            }
                            return acc;
                          }, {} as Record<string, BudgetItem[]>)) as [string, BudgetItem[]][]).map(([modelName, modelItems]) => {
                            // Calculate Model Total
                            const modelTotal = modelItems.reduce((acc, i) => acc + (i.quantity_final * i.unit_price), 0);

                            return (
                              <React.Fragment key={modelName}>
                                <tr className="bg-white/5 border-t border-white/10 group/header">
                                  <td colSpan={7} className="px-6 py-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-[12px] uppercase tracking-widest">
                                          <span className="material-symbols-outlined text-[18px]">layers</span>
                                          Modelo: <span className="text-white bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">{modelName}</span>
                                        </div>
                                        <button
                                          onClick={() => handleDeleteModel(modelName)}
                                          className="opacity-0 group-hover/header:opacity-100 transition-opacity p-1 text-slate-500 hover:text-red-500 flex items-center"
                                          title="Excluir Modelo Inteiro"
                                        >
                                          <span className="material-symbols-outlined text-[18px]">delete_sweep</span>
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold text-indigo-300 uppercase">Valor Total do Modelo:</span>
                                        <div className="flex items-center bg-background-dark border border-indigo-500/30 rounded-lg px-2 py-1">
                                          <span className="text-indigo-400 text-xs mr-1">R$</span>
                                          <input
                                            type="number"
                                            className="w-28 bg-transparent text-white font-bold outline-none text-right"
                                            value={modelTotal.toFixed(2)}
                                            onChange={(e) => handleUpdateModelTotal(modelName, Number(e.target.value), modelItems)}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                                {modelItems.map(item => {
                                  const isLabor = item.name.includes('Mão de Obra / Serviço');
                                  const cleanName = item.name.includes('[MODELO:') ? item.name.split('] ')[1] : item.name;

                                  if (isLabor) return null; // Hide Labor item row as it's managed via Header Total

                                  return (
                                    <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-white">
                                            {cleanName}
                                          </span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 px-2 mt-1">
                                          Item do Modelo {modelName}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4">
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                                          Modelo
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-center text-slate-400">-</td>
                                      <td className="px-6 py-4 text-center">
                                        <input
                                          type="number"
                                          className="w-20 bg-background-dark border border-white/10 rounded px-2 py-1 text-center text-white focus:border-primary outline-none font-bold"
                                          value={item.quantity_final}
                                          onChange={(e) => handleUpdateItem(item.id, 'quantity_final', Number(e.target.value))}
                                        />
                                      </td>
                                      <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <span className="text-slate-500 text-xs">R$</span>
                                          <input
                                            type="number"
                                            className="w-24 bg-background-dark border border-white/10 rounded px-2 py-1 text-right text-white focus:border-primary outline-none font-bold"
                                            value={item.unit_price}
                                            onChange={(e) => handleUpdateItem(item.id, 'unit_price', Number(e.target.value))}
                                          />
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 text-right font-bold text-white">
                                        R$ {(item.quantity_final * item.unit_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-6 py-4 text-center">
                                        <button
                                          onClick={() => handleDeleteItem(item.id)}
                                          className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                          title="Excluir Item"
                                        >
                                          <span className="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-dark border border-white/10 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Adicionar Item Manualmente</h3>

            <div className="flex flex-col gap-4">
              <div>
                <label className="text-slate-400 text-sm font-medium block mb-2">Produto</label>
                <select
                  className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 px-4 text-white focus:border-primary outline-none"
                  value={newItemName}
                  onChange={(e) => {
                    const name = e.target.value;
                    const prod = catalogProducts?.find(p => p.name === name);
                    setNewItemName(name);
                    if (prod) setNewItemPrice(prod.price);
                  }}
                >
                  <option value="">Selecione do catálogo...</option>
                  {catalogProducts?.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-sm font-medium block mb-2">Preço Unit. (R$)</label>
                  <input
                    type="number"
                    className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 px-4 text-white focus:border-primary outline-none"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg hover:bg-white/5 text-slate-400 font-bold text-sm transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddItem}
                  disabled={!newItemName}
                  className="px-6 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors disabled:opacity-50"
                >
                  Adicionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Model Selection Modal */}
      {isModelModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-dark border border-white/10 rounded-xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
            <h3 className="text-xl font-bold text-white mb-2">Adicionar Modelos de Serviço</h3>
            <p className="text-slate-400 text-sm mb-6">Selecione os modelos que deseja incluir nesta composição.</p>

            <div className="flex-1 overflow-y-auto mb-6 pr-2">
              {loadingModels ? (
                <div className="text-center p-8 text-slate-500">Carregando modelos...</div>
              ) : availableModels.length === 0 ? (
                <div className="text-center p-8 text-slate-500">Nenhum modelo disponível. Crie modelos na aba "Modelos de Serviços".</div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {availableModels.map(model => {
                    const isAlreadyAdded = items.some(i => i.name.includes(`[MODELO: ${model.name}]`));

                    return (
                      <label key={model.id} className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${isAlreadyAdded
                        ? 'bg-red-500/5 border-red-500/10 opacity-60 cursor-not-allowed'
                        : selectedModelIds.includes(model.id)
                          ? 'bg-indigo-600/10 border-indigo-500/50 cursor-pointer'
                          : 'bg-black/20 border-white/5 hover:bg-white/5 cursor-pointer'
                        }`}>
                        <input
                          type="checkbox"
                          className="mt-1 w-5 h-5 rounded border-white/20 bg-black/20 text-indigo-500 focus:ring-offset-0 focus:ring-0"
                          checked={selectedModelIds.includes(model.id)}
                          disabled={isAlreadyAdded}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedModelIds([...selectedModelIds, model.id]);
                            } else {
                              setSelectedModelIds(selectedModelIds.filter(id => id !== model.id));
                            }
                          }}
                        />
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-white text-base">
                              {model.name}
                              {isAlreadyAdded && <span className="ml-2 text-red-400 text-xs uppercase font-bold">(Já adicionado)</span>}
                            </span>
                            <span className="text-emerald-400 font-bold">R$ {model.total_price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-xs mt-1">
                            <span className="text-slate-400">{model.description || 'Sem descrição'}</span>
                            <span className="text-slate-500">
                              (M.O.: R$ {model.labor_price?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                            </span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-auto">
              <button
                onClick={() => {
                  setIsModelModalOpen(false);
                  setSelectedModelIds([]);
                }}
                className="px-4 py-2 rounded-lg hover:bg-white/5 text-slate-400 font-bold text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddModels}
                disabled={selectedModelIds.length === 0 || loading}
                className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span> : <span className="material-symbols-outlined text-[18px]">check</span>}
                Confirmar ({selectedModelIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSuccess={(id) => {
          fetchProjects();
          onSelectProject(id);
          setIsNewProjectModalOpen(false);
        }}
      />

      {/* Product Exchange Modal */}
      {isExchangeModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-surface-dark border border-white/10 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Trocar Produto</h3>
            <p className="text-slate-400 text-sm mb-6">
              Substituir <strong>{itemToExchange?.name}</strong> por um novo item do catálogo. O preço será atualizado.
            </p>

            <div className="flex flex-col gap-4">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[20px]">search</span>
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar no catálogo..."
                  className="w-full bg-background-dark border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-primary outline-none"
                  value={exchangeSearch}
                  onChange={(e) => setExchangeSearch(e.target.value)}
                />
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-white/5 border border-white/5 rounded-lg bg-black/20">
                {catalogProducts
                  .filter(p => !exchangeSearch || p.name.toLowerCase().includes(exchangeSearch.toLowerCase()))
                  .map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSwapProduct(p)}
                      className="w-full flex items-center justify-between p-3 hover:bg-primary/10 transition-colors text-left group"
                    >
                      <span className="text-white group-hover:text-primary transition-colors">{p.name}</span>
                      <span className="text-emerald-500 font-bold text-xs uppercase">R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </button>
                  ))
                }
                {catalogProducts.filter(p => !exchangeSearch || p.name.toLowerCase().includes(exchangeSearch.toLowerCase())).length === 0 && (
                  <div className="p-4 text-center text-slate-500 italic text-sm">Nenhum produto encontrado.</div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setIsExchangeModalOpen(false)}
                  className="px-4 py-2 rounded-lg hover:bg-white/5 text-slate-400 font-bold text-sm transition-colors"
                >
                  Cancelar
                </button>
              </div>
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

export default EngineeringComposition;
