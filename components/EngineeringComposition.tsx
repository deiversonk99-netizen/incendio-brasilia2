import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { Project } from '../types';

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
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState(0);

  // Load catalog for the add modal
  useEffect(() => {
    const loadCatalog = async () => {
      const { data } = await supabase.from('product_catalog').select('name, price').order('name');
      if (data) setCatalogProducts(data);
    };
    loadCatalog();
  }, []);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadBudgetItems();
    } else {
      setItems([]);
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

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
    const { data: floors } = await supabase
      .from('floors')
      .select('items')
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

      const central = items.central_items || {};
      Object.entries(central).forEach(([name, qty]) => {
        aggregation[name] = (aggregation[name] || 0) + Number(qty);
      });

      Object.entries(items).forEach(([key, val]) => {
        if (key !== 'central_items' && key !== 'infra_kits' && typeof val === 'number') {
          aggregation[key] = (aggregation[key] || 0) + Number(val);
        }
      });

      const kits = items.infra_kits || [];
      kits.forEach((kitUsage: any) => {
        const kitDef = kitMap[kitUsage.kit_id];
        if (kitDef) {
          const meters = Number(kitUsage.meters);
          kitDef.components.forEach(comp => {
            const baseQty = meters * Number(comp.conversion_factor);
            const withLoss = baseQty * (1 + (Number(kitDef.loss) / 100));
            // Round up to avoid fractional units for things that are integers
            const roundedQty = Math.ceil(withLoss);

            aggregation[comp.product_name] = (aggregation[comp.product_name] || 0) + roundedQty;
          });
        }
      });
    });

    // 4. Prepare inserts
    const newItems = Object.entries(aggregation).map(([name, qty]) => {
      // Try exact match first, then lowercase match
      const unitPrice = priceMap[name.trim().toLowerCase()] || 0;

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

  const handleUpdateItem = async (id: string, field: 'quantity_final' | 'unit_price', value: number) => {
    // Optimistic update
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

    // DB Update (debounce could be good here, but keeping it simple for now)
    await supabase.from('budget_items').update({ [field]: value }).eq('id', id);
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
              <span className="material-symbols-outlined text-[18px]">add</span>
              Adicionar Item
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

          {/* Project Selection */}
          <div className="bg-surface-dark p-6 rounded-xl border border-white/5 shadow-sm">
            <label className="block text-sm font-medium text-slate-400 mb-2">Selecione o Projeto</label>
            <select
              value={selectedProjectId}
              onChange={(e) => onSelectProject(e.target.value)}
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loading || calculating ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Calculando materiais...</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">Nenhum item encontrado. Adicione manualmente ou verifique a Fase A.</td></tr>
                      ) : (
                        items.map(item => (
                          <tr key={item.id} className="hover:bg-white/5 transition-colors group">
                            <td className="px-6 py-4 font-medium text-white">
                              {item.name}
                              <div className="text-xs text-slate-500 font-normal">{item.origin === 'CALCULATED' ? 'Sugerido pelo sistema' : 'Adicionado Manualmente'}</div>
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
                          </tr>
                        ))
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
    </div>
  );
};

export default EngineeringComposition;
