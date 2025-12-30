import React, { useEffect, useState } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { Project } from '../types';
import NewProjectModal from './NewProjectModal';

interface EngineeringSurveyProps {
  // ... existing props ...
  onNext: () => void;
  selectedProjectId: string;
  onSelectProject: (id: string) => void;
}

interface Floor {
  id: string;
  name: string;
  type: string;
  prancha: string;
  width: number;
  length: number;
  height: number;
  items: Record<string, number>;
}

const EngineeringSurvey: React.FC<EngineeringSurveyProps> = ({ onNext, selectedProjectId, onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

  // Form State
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [floorName, setFloorName] = useState('');
  const [floorType, setFloorType] = useState('Garagem');
  const [prancha, setPrancha] = useState('');

  const [width, setWidth] = useState(0);
  const [length, setLength] = useState(0);
  const [height, setHeight] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  const CENTRAL_ITEMS = [
    { label: 'Placas Sinaliz.', icon: 'exit_to_app' },
    { label: 'Detectores', icon: 'sensors' },
    { label: 'Acionadores', icon: 'touch_app' },
    { label: 'Sirenes AV', icon: 'notifications_active' },
    { label: 'Luminárias', icon: 'lightbulb' },
    { label: 'Extintor ABC', icon: 'fire_extinguisher' },
    { label: 'Caixa Hidrante', icon: 'water_drop' },
    { label: 'Bomba', icon: 'propane' },
  ];

  // Fetch Kits
  const [availableKits, setAvailableKits] = useState<{ id: string, name: string }[]>([]);
  const [floorKits, setFloorKits] = useState<{ kit_id: string, name: string, meters: number }[]>([]);

  useEffect(() => {
    // Initialize item counts
    const initialCounts: Record<string, number> = {};
    CENTRAL_ITEMS.forEach(item => initialCounts[item.label] = 0);
    setItemCounts(initialCounts);

    fetchProjects();
    fetchKits();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchFloors();
    } else {
      setFloors([]);
      resetForm();
    }
  }, [selectedProjectId]);

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const fetchKits = async () => {
    const { data } = await supabase.from('composition_kits').select('id, name').order('name');
    if (data) setAvailableKits(data);
  };

  const fetchFloors = async () => {
    setLoading(true);
    const { data } = await supabase.from('floors').select('*').eq('project_id', selectedProjectId).order('created_at', { ascending: true });
    if (data) setFloors(data);
    setLoading(false);
  };

  const handleEditFloor = (floor: Floor) => {
    setEditingFloorId(floor.id);
    setFloorName(floor.name);
    setFloorType(floor.type);
    setPrancha(floor.prancha);
    setWidth(floor.width);
    setLength(floor.length);
    setHeight(floor.height || 0);

    // Parse Items
    const items = floor.items as any;
    if (items.central_items) {
      setItemCounts({ ...itemCounts, ...items.central_items });
    } else {
      // Legacy support or flat structure
      const initialCounts: Record<string, number> = {};
      CENTRAL_ITEMS.forEach(item => initialCounts[item.label] = items[item.label] || 0);
      setItemCounts(initialCounts);
    }

    if (items.infra_kits) {
      setFloorKits(items.infra_kits);
    } else {
      setFloorKits([]);
    }

    document.getElementById('floor-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  const resetForm = () => {
    setEditingFloorId(null);
    setFloorName('');
    setPrancha('');
    setWidth(0);
    setLength(0);
    setHeight(0);
    const initialCounts: Record<string, number> = {};
    CENTRAL_ITEMS.forEach(item => initialCounts[item.label] = 0);
    setItemCounts(initialCounts);
    setFloorKits([]);
  };

  const handleAddKit = (kitId: string) => {
    if (!kitId) return;
    const kit = availableKits.find(k => k.id === kitId);
    if (kit) {
      setFloorKits([...floorKits, { kit_id: kit.id, name: kit.name, meters: 0 }]);
    }
  };

  const updateKitMeters = (index: number, meters: number) => {
    const newKits = [...floorKits];
    newKits[index].meters = meters;
    setFloorKits(newKits);
  };

  const removeKit = (index: number) => {
    setFloorKits(floorKits.filter((_, i) => i !== index));
  };

  const handleSaveFloor = async () => {
    if (!selectedProjectId) {
      alert('Selecione um projeto primeiro.');
      return;
    }
    if (!floorName) {
      alert('Digite o nome do pavimento.');
      return;
    }

    setIsSubmitting(true);

    // Save structured data
    const structuredItems = {
      central_items: itemCounts,
      infra_kits: floorKits
    };

    const floorData = {
      project_id: selectedProjectId,
      name: floorName,
      type: floorType,
      prancha: prancha,
      width: width,
      length: length,
      height: height,
      items: structuredItems
    };

    let error;
    if (editingFloorId) {
      const { error: updateError } = await supabase.from('floors').update(floorData).eq('id', editingFloorId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('floors').insert(floorData);
      error = insertError;
    }

    setIsSubmitting(false);

    if (error) {
      console.error('Error saving floor:', error);
      alert('Erro ao salvar pavimento.');
    } else {
      fetchFloors();
      resetForm();
      if (editingFloorId) alert('Pavimento atualizado com sucesso!');
      else alert('Pavimento salvo com sucesso!');
    }
  };

  const totalArea = floors.reduce((acc, floor) => acc + (Number(floor.width) * Number(floor.length)), 0);
  const currentArea = width * length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Levantamento de Dados"
        subtitle="Definição de pavimentos, dimensões e equipamentos básicos."
        breadcrumbs={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Engenharia</span>
            <span className="material-symbols-outlined text-text-muted text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">Fase A - Levantamento</span>
          </div>
        }
        actions={
          <button className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm" onClick={onNext}>
            Próxima Fase
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-12">

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
              <button
                onClick={() => setIsNewProjectModalOpen(true)}
                className="flex items-center gap-2 h-11 px-4 rounded-lg bg-surface-dark border border-white/10 text-white hover:bg-white/5 transition-all text-sm font-medium shrink-0"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">add</span>
                Novo Projeto
              </button>
            </div>
          </div>

          {selectedProjectId && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-white text-xl font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">layers</span>
                  Gerenciamento de Pavimentos
                </h3>
                <div className="bg-surface-dark px-4 py-1.5 rounded-full border border-card-dark text-sm text-slate-400 flex items-center gap-2">
                  Área Total Projetada: <span className="text-emerald-400 font-bold ml-1">{totalArea.toFixed(2)} m²</span>
                </div>
              </div>

              {/* Floor List - Mini Cards */}
              {floors.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {floors.map(floor => (
                    <div
                      key={floor.id}
                      onClick={() => handleEditFloor(floor)}
                      className={`bg-white/5 border rounded-lg p-4 hover:bg-white/10 transition-colors cursor-pointer relative group ${editingFloorId === floor.id ? 'border-primary bg-primary/5' : 'border-white/5'}`}
                    >
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined text-sm text-primary">edit</span>
                      </div>
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-white text-sm">{floor.name}</h4>
                        <span className="text-xs text-slate-500">{floor.prancha}</span>
                      </div>
                      <div className="text-xs text-slate-400 mb-2">{floor.type}</div>
                      <div className="text-emerald-400 font-bold text-sm">{(floor.width * floor.length).toFixed(2)} m²</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Floor Form */}
              <div id="floor-form" className="bg-surface-dark border border-card-dark rounded-xl p-6 shadow-xl relative overflow-hidden transition-all duration-300">
                <div className="absolute top-0 right-0 p-4">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${editingFloorId ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
                    {editingFloorId ? 'Editando Pavimento' : 'Novo Pavimento'}
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
                  <div className="lg:col-span-3 flex flex-col gap-6 border-b lg:border-b-0 lg:border-r border-card-dark pb-6 lg:pb-0 lg:pr-8">
                    <h4 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Identificação</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1.5">Nome do Pavimento</label>
                        <input
                          className="w-full bg-background-dark border border-card-dark rounded-lg px-3 py-2.5 text-white focus:border-primary outline-none transition-colors"
                          value={floorName}
                          onChange={(e) => setFloorName(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-400 mb-1.5">Tipo</label>
                          <select
                            className="w-full bg-background-dark border border-card-dark rounded-lg px-3 py-2.5 text-white focus:border-primary outline-none transition-colors"
                            value={floorType}
                            onChange={(e) => setFloorType(e.target.value)}
                          >
                            <option>Subsolo</option>
                            <option>Garagem</option>
                            <option>Térreo</option>
                            <option>Pilotis</option>
                            <option>Pavimento Tipo</option>
                            <option>Cobertura</option>
                            <option>Casa de Máquinas</option>
                            <option>Outros</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-400 mb-1.5">Nº Prancha</label>
                          <input
                            className="w-full bg-background-dark border border-card-dark rounded-lg px-3 py-2.5 text-white focus:border-primary outline-none transition-colors"
                            value={prancha}
                            onChange={(e) => setPrancha(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="bg-background-dark/30 p-4 rounded-lg border border-card-dark mt-4">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-bold text-white">Dimensões (m)</label>
                        <span className="text-xs text-primary font-bold">{currentArea.toFixed(2)} m²</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 uppercase">Largura</label>
                          <input
                            type="number"
                            className="w-full bg-background-dark border border-card-dark rounded px-2 py-2 text-white focus:border-primary outline-none text-center text-sm"
                            value={width || ''}
                            onChange={(e) => setWidth(parseFloat(e.target.value))}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 uppercase">Comp.</label>
                          <input
                            type="number"
                            className="w-full bg-background-dark border border-card-dark rounded px-2 py-2 text-white focus:border-primary outline-none text-center text-sm"
                            value={length || ''}
                            onChange={(e) => setLength(parseFloat(e.target.value))}
                            placeholder="0"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] text-slate-500 uppercase">Altura</label>
                          <input
                            type="number"
                            className="w-full bg-background-dark border border-card-dark rounded px-2 py-2 text-white focus:border-primary outline-none text-center text-sm"
                            value={height || ''}
                            onChange={(e) => setHeight(parseFloat(e.target.value))}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-9 flex flex-col gap-8">
                    {/* Central Items */}
                    <div>
                      <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-4 border-b border-card-dark pb-2">Itens da Central</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {CENTRAL_ITEMS.map((item, i) => (
                          <div key={i} className="bg-background-dark/50 border border-card-dark rounded-lg p-3 hover:border-primary/50 transition-colors group focus-within:border-primary">
                            <span className="material-symbols-outlined text-slate-500 group-focus-within:text-primary transition-colors text-[24px]">{item.icon}</span>
                            <label className="block text-[10px] text-slate-400 mt-2 truncate">{item.label}</label>
                            <input
                              type="number"
                              min="0"
                              className="w-full bg-transparent border-b border-card-dark py-1 text-white font-bold text-xl text-right outline-none focus:border-primary transition-colors"
                              value={itemCounts[item.label] || 0}
                              onChange={(e) => setItemCounts(prev => ({ ...prev, [item.label]: Number(e.target.value) }))}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Infrastructure Items (Using KITS) */}
                    <div>
                      <div className="flex justify-between items-center mb-4 border-b border-card-dark pb-2">
                        <h4 className="text-white text-sm font-bold uppercase tracking-wider">Infraestrutura (Kits)</h4>
                        <select
                          className="bg-background-dark border border-white/10 rounded text-xs text-white px-2 py-1 outline-none"
                          onChange={(e) => handleAddKit(e.target.value)}
                          value=""
                        >
                          <option value="">+ Adicionar Infraestrutura...</option>
                          {availableKits.map(kit => (
                            <option key={kit.id} value={kit.id}>{kit.name}</option>
                          ))}
                        </select>
                      </div>

                      {floorKits.length === 0 ? (
                        <div className="text-center py-6 border border-dashed border-white/10 rounded-lg text-slate-500 text-sm">
                          Nenhuma infraestrutura selecionada. Selecione um kit acima.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {floorKits.map((kit, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-background-dark/30 p-3 rounded-lg border border-white/5">
                              <div className="flex-1">
                                <div className="text-white font-bold text-sm">{kit.name}</div>
                                <div className="text-slate-500 text-xs text-primary">Kit de Infraestrutura</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-slate-400">Metros:</label>
                                <input
                                  type="number"
                                  className="w-24 bg-background-dark border border-white/10 rounded px-2 py-1 text-right text-white focus:border-primary outline-none font-bold"
                                  value={kit.meters}
                                  onChange={(e) => updateKitMeters(idx, Number(e.target.value))}
                                  placeholder="0"
                                />
                              </div>
                              <button onClick={() => removeKit(idx)} className="text-slate-500 hover:text-red-500 transition-colors p-2">
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end mt-4 gap-3">
                      {editingFloorId && (
                        <button
                          onClick={resetForm}
                          className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-3 px-6 rounded-lg transition-all"
                        >
                          Cancelar Edição
                        </button>
                      )}
                      <button
                        onClick={handleSaveFloor}
                        disabled={isSubmitting}
                        className={`bg-primary hover:bg-primary-dark text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-primary/20 transition-all flex items-center gap-2 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <span className="material-symbols-outlined">save</span>
                        {isSubmitting ? 'Salvando...' : (editingFloorId ? 'Atualizar Pavimento' : 'Salvar Pavimento')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </main>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSuccess={() => fetchProjects()}
      />
    </div>
  );
};

export default EngineeringSurvey;
