import React, { useEffect, useState } from 'react';
import PageHeader from './PageHeader';
import { supabase } from '../lib/supabase';
import { Project } from '../types';
import NewProjectModal from './NewProjectModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  replication_factor?: number;
  calculation_type?: string;
  items: Record<string, number>;
}

const EngineeringSurvey: React.FC<EngineeringSurveyProps> = ({ onNext, selectedProjectId, onSelectProject }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
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
    validade: '10'
  });
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [clientDetails, setClientDetails] = useState<any>(null);

  // Form State
  const [editingFloorId, setEditingFloorId] = useState<string | null>(null);
  const [floorName, setFloorName] = useState('');
  const [floorType, setFloorType] = useState('Garagem');
  const [customFloorType, setCustomFloorType] = useState('');
  const [prancha, setPrancha] = useState('');

  const [width, setWidth] = useState(0);
  const [length, setLength] = useState(0);
  const [height, setHeight] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  // New State
  const [replicationFactor, setReplicationFactor] = useState(1);
  const [isReplicationEnabled, setIsReplicationEnabled] = useState(false);
  const [calculationType, setCalculationType] = useState('area');
  const [enabledItems, setEnabledItems] = useState<Record<string, boolean>>({});

  const loadPdfSettings = async (projectId: string) => {
    try {
      // 1. Load project-specific
      const { data } = await supabase
        .from('pdf_settings')
        .select('variables')
        .eq('project_id', projectId)
        .eq('phase', 'ENG_A')
        .single();

      // 2. Load Global User Profile Defaults
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('assinatura, crq, credentials, credentials_img, carimbo, carimbo_img')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (data) {
        setPdfSettings({
          show_assinatura: true,
          show_crq: true,
          show_credentials: true,
          show_referencias: true,
          show_carimbo: true,
          ...data.variables,
          // Fallback individual fields if missing in variables but present in profile
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
          validade: '10'
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
          phase: 'ENG_A',
          variables: newSettings,
          updated_at: new Date().toISOString()
        }, { onConflict: 'project_id, phase' });

      // Save global defaults to user profile
      const user = (await supabase.auth.getUser()).data.user;
      if (user) {
        await supabase
          .from('user_profiles')
          .update({
            assinatura: newSettings.assinatura,
            crq: newSettings.crq,
            credentials: newSettings.credentials,
            credentials_img: newSettings.credentials_img,
            carimbo: newSettings.carimbo,
            carimbo_img: newSettings.carimbo_img,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);
      }
    } catch (e) {
      console.error('Error saving PDF settings:', e);
    }
  };

  const FLOOR_TYPES = [
    'Subsolo',
    'Garagem',
    'Térreo',
    'Pilotis',
    'Pavimento Tipo',
    'Residencial',
    'Cobertura',
    'Casa de Máquinas',
    'Outros'
  ];

  const CENTRAL_ITEMS = [
    { label: 'Placas Sinaliz.', icon: 'exit_to_app' },
    { label: 'Detectores', icon: 'sensors' },
    { label: 'Acionadores', icon: 'touch_app' },
    { label: 'Sirenes AV', icon: 'notifications_active' },
    { label: 'Luminárias', icon: 'lightbulb' },
    { label: 'Extintor ABC', icon: 'fire_extinguisher' },
    { label: 'Caixa Hidrante', icon: 'water_drop' },
    { label: 'Bomba', icon: 'propane' },
    { label: 'Recalque', icon: 'water_pump' }, // New Item
    { label: 'Bicos de Sprinklers', icon: 'opacity' } // New Item
  ];

  // Fetch Kits
  const [availableKits, setAvailableKits] = useState<{ id: string, name: string }[]>([]);
  const [kitComponents, setKitComponents] = useState<Record<string, any[]>>({});
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
      loadPdfSettings(selectedProjectId);
      fetchClientDetails();
    } else {
      setFloors([]);
      resetForm();
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

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) setProjects(data);
  };

  const fetchKits = async () => {
    const { data: kits } = await supabase.from('composition_kits').select('id, name').order('name');
    if (kits) setAvailableKits(kits);

    const { data: components } = await supabase.from('kit_components').select('*');
    if (components) {
      const mapping: Record<string, any[]> = {};
      components.forEach((c: any) => {
        if (!mapping[c.kit_id]) mapping[c.kit_id] = [];
        mapping[c.kit_id].push(c);
      });
      setKitComponents(mapping);
    }
  };

  const fetchFloors = async () => {
    setLoading(true);
    const { data } = await supabase.from('floors').select('*').eq('project_id', selectedProjectId).order('created_at', { ascending: true });
    if (data) setFloors(data);
    setLoading(false);
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;
    const project = projects.find(p => p.id === selectedProjectId);
    if (!confirm(`Deseja realmente excluir o projeto "${project?.name}"? Esta ação removerá todos os pavimentos e dados vinculados.`)) return;

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


  const handleEditFloor = (floor: Floor) => {
    setEditingFloorId(floor.id);
    setFloorName(floor.name);

    if (FLOOR_TYPES.includes(floor.type) && floor.type !== 'Outros') {
      setFloorType(floor.type);
      setCustomFloorType('');
    } else {
      setFloorType('Outros');
      setCustomFloorType(floor.type);
    }

    setPrancha(floor.prancha);
    setWidth(floor.width);
    setLength(floor.length);
    setHeight(floor.height || 0);

    // New Fields
    setReplicationFactor(floor.replication_factor || 1);
    setCalculationType((floor.calculation_type as any) || 'area');

    // Parse Items
    const items = floor.items as any;
    if (items.central_items) {
      setItemCounts({ ...itemCounts, ...items.central_items });

      // Determine enabled based on value > 0 or existing logic
      const enabled: Record<string, boolean> = {};
      CENTRAL_ITEMS.forEach(item => {
        enabled[item.label] = (items.central_items[item.label] > 0);
      });
      // Merge with manual check logic if needed, but for now assuming if count > 0 it is enabled is safe default
      // However user specifically asked for "check", so let's allow 0 with check.
      // Since we don't store "checked" state separately in JSON yet, we might lose "checked but 0" state.
      // Use > -1 as a hack? No.
      // Let's infer for now: count > 0 -> checked.
      setEnabledItems(enabled);

    } else {
      const initialCounts: Record<string, number> = {};
      const enabled: Record<string, boolean> = {};
      CENTRAL_ITEMS.forEach(item => {
        initialCounts[item.label] = items[item.label] || 0;
        enabled[item.label] = (items[item.label] > 0);
      });
      setItemCounts(initialCounts);
      setEnabledItems(enabled);
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
    setFloorType('Garagem');
    setCustomFloorType('');
    setPrancha('');
    setWidth(0);
    setLength(0);
    setHeight(0);
    setReplicationFactor(1);
    setIsReplicationEnabled(false);
    setCalculationType('area');

    const initialCounts: Record<string, number> = {};
    const enabled: Record<string, boolean> = {};
    CENTRAL_ITEMS.forEach(item => {
      initialCounts[item.label] = 0;
      enabled[item.label] = false;
    });
    setItemCounts(initialCounts);
    setEnabledItems(enabled);
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

  const toggleItem = (label: string) => {
    setEnabledItems(prev => {
      const newState = { ...prev, [label]: !prev[label] };
      // If unchecked, maybe reset count to 0? Or keep it?
      // User asked: "adicionar o check... aparecendo os itens que estivem com ok".
      // Implicitly if unchecked, should correspond to 0 or "not included".
      // Let's NOT reset count instantly to allow re-checking without re-typing.
      return newState;
    });
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

    const finalType = floorType === 'Outros' ? customFloorType : floorType;
    if (!finalType) {
      alert('Selecione ou digite o tipo do pavimento.');
      return;
    }

    setIsSubmitting(true);

    // Save structured data
    // Filter out unchecked items? Or save all and filter in composition?
    // Saving all is safer.
    const structuredItems = {
      central_items: itemCounts,
      infra_kits: floorKits,
      item_checks: enabledItems // Save checked state explicitly
    };

    const floorData = {
      project_id: selectedProjectId,
      name: floorName,
      type: finalType,
      prancha: prancha,
      width: width,
      length: length,
      height: height,
      replication_factor: isReplicationEnabled ? replicationFactor : 1,
      calculation_type: calculationType,
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

  const generateSurveyPDF = () => {
    const project = projects.find(p => p.id === selectedProjectId);
    if (!project || floors.length === 0) {
      alert('Selecione um projeto com pavimentos cadastrados.');
      return;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Utility for adding footer
    const addFooter = (doc: any, pageNum: number, totalPages: number) => {
      const footerY = pageHeight - 10;

      // --- Company Stamps/Credentials on EVERY Page ---
      let stampX = 20;
      const stampY = pageHeight - 35;

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

      doc.setFontSize(8);
      doc.setTextColor(150);
      const footerText = `Levantamento Técnico - ${project.name} | Página ${pageNum} de ${totalPages}`;
      doc.text(footerText, pageWidth / 2, footerY, { align: 'center' });
    };

    // --- Page 1: Header and Summary ---
    doc.setFillColor(0, 0, 0); // Black Header
    doc.rect(0, 0, pageWidth, 50, 'F');

    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE LEVANTAMENTO', 20, 28);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text('INCÊNDIO BRASÍLIA ENGENHARIA', 20, 36);
    doc.text(`Identificação: PRJ-${project.id.slice(0, 5).toUpperCase()}`, 20, 42);
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - 20, 28, { align: 'right' });

    doc.setTextColor(40);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO PROJETO', 20, 65);
    doc.setDrawColor(226, 232, 240);
    doc.line(20, 67, pageWidth - 20, 67);

    // Summary Table
    const totalAreaCalc = floors.reduce((acc, f) => acc + (Number(f.width) * Number(f.length) * (f.replication_factor || 1)), 0);
    const totalEquipCount = floors.reduce((acc, f) => {
      const central = (f.items as any).central_items || {};
      const checks = (f.items as any).item_checks || {};
      return acc + Object.entries(central).reduce((sum, [name, qty]) => sum + (checks[name] !== false ? Number(qty) : 0), 0) * (f.replication_factor || 1);
    }, 0);

    autoTable(doc, {
      startY: 72,
      head: [['Indicador', 'Valor']],
      body: [
        ['Cliente', project.client || 'N/A'],
        ['Projeto', project.name],
        ['Tipo de Obra', project.type || 'N/A'],
        ['Total de Pavimentos', floors.length.toString()],
        ['Área Total (Estimada)', `${totalAreaCalc.toFixed(2)} m²`],
        ['Total de Equipamentos', totalEquipCount.toString()]
      ],
      theme: 'grid',
      margin: { bottom: 40 },
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });

    let yPos = (doc as any).lastAutoTable.finalY + 20;

    // --- Detail Section ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DETALHAMENTO POR PAVIMENTO', 20, yPos);
    doc.line(20, yPos + 2, pageWidth - 20, yPos + 2);
    yPos += 12;

    floors.forEach((floor, index) => {
      // Check for page break
      if (yPos > 240) {
        doc.addPage();
        yPos = 30;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(248, 250, 252);
      doc.rect(20, yPos - 5, pageWidth - 40, 7, 'F');
      doc.text(`${index + 1}. ${floor.name.toUpperCase()}`, 25, yPos);

      yPos += 8;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Prancha: ${floor.prancha || 'N/A'} | Dimensões: ${floor.width}x${floor.length}m | Área: ${(floor.width * floor.length).toFixed(2)}m²`, 25, yPos);

      if (floor.replication_factor && floor.replication_factor > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(79, 70, 229); // Indigo
        doc.text(`[REPLICAÇÃO: ${floor.replication_factor}x]`, pageWidth - 25, yPos, { align: 'right' });
        doc.setTextColor(40);
      }

      yPos += 6;

      const items = floor.items as any;
      const central = items.central_items || {};
      const checks = items.item_checks || {};

      const tableData = Object.entries(central)
        .filter(([name]) => checks[name] !== false)
        .map(([name, qty]) => [name, qty]);

      if (tableData.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [['Equipamento', 'Quant.']],
          body: tableData,
          theme: 'striped',
          margin: { left: 40, bottom: 40 },
          headStyles: { fillColor: [71, 85, 105], fontSize: 8 },
          styles: { fontSize: 8, cellPadding: 2 },
          tableWidth: 80
        });
        yPos = (doc as any).lastAutoTable.finalY + 15;
      } else {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum equipamento selecionado para este pavimento.', 40, yPos);
        yPos += 12;
      }
    });

    // Add page numbers to all pages
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

      if (pdfSettings.show_referencias && pdfSettings.referencias) {
        doc.setFont('helvetica', 'bold');
        doc.text('Referências:', 20, sigY + 5);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(pdfSettings.referencias, pageWidth - 40), 20, sigY + 11);
      }

      if (pdfSettings.validade) {
        doc.setFontSize(9);
        doc.setTextColor(150);
        doc.text(`Validade deste documento: ${pdfSettings.validade} dias`, 20, pageHeight - 20);
      }
    }

    doc.save(`Levantamento_${project.name.replace(/\s+/g, '_')}.pdf`);
  };

  const totalArea = floors.reduce((acc, floor) => {
    const floorArea = (Number(floor.width) * Number(floor.length));
    // Multiply by replication factor for total project area?
    // Usually project area includes all floors.
    return acc + (floorArea * (floor.replication_factor || 1));
  }, 0);

  const currentArea = width * length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span>Levantamento de Dados</span>
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
        subtitle="Definição de pavimentos, dimensões e equipamentos básicos."
        breadcrumbs={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-muted">Engenharia</span>
            <span className="material-symbols-outlined text-text-muted text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">Fase A - Levantamento</span>
          </div>
        }
        actions={
          <div className="flex gap-3">
            <button
              onClick={generateSurveyPDF}
              disabled={!selectedProjectId || floors.length === 0}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all font-bold text-sm disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              PDF Levantamento
            </button>
            <button className="flex items-center gap-2 h-10 px-6 rounded-lg bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 transition-all font-bold text-sm" onClick={onNext}>
              Próxima Fase
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-12">

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
                        <div className="flex flex-col">
                          <h4 className="font-bold text-white text-sm">{floor.name}</h4>
                          {floor.replication_factor && floor.replication_factor > 1 && (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded w-fit mt-1">
                              {floor.replication_factor}x Repetições
                            </span>
                          )}
                        </div>
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
                            {FLOOR_TYPES.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                          {floorType === 'Outros' && (
                            <input
                              className="w-full mt-2 bg-background-dark border border-card-dark rounded-lg px-3 py-2.5 text-white focus:border-primary outline-none transition-colors"
                              placeholder="Digite o tipo..."
                              value={customFloorType}
                              onChange={(e) => setCustomFloorType(e.target.value)}
                              autoFocus
                            />
                          )}
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

                      {/* Replication Logic */}
                      <div className="bg-indigo-500/5 p-4 rounded-lg border border-indigo-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            id="replication"
                            className="w-4 h-4 rounded"
                            checked={isReplicationEnabled}
                            onChange={(e) => {
                              setIsReplicationEnabled(e.target.checked);
                              if (!e.target.checked) setReplicationFactor(1);
                            }}
                          />
                          <label htmlFor="replication" className="text-sm font-bold text-white cursor-pointer select-none">Repetir Andares?</label>
                        </div>
                        {isReplicationEnabled && (
                          <div>
                            <label className="block text-xs text-slate-400 mb-1">Quantidade de Andares Iguais</label>
                            <input
                              type="number"
                              min="1"
                              className="w-full bg-background-dark border border-card-dark rounded px-2 py-2 text-white focus:border-primary outline-none"
                              value={replicationFactor}
                              onChange={(e) => setReplicationFactor(Number(e.target.value))}
                            />
                          </div>
                        )}
                      </div>

                    </div>


                    <div className="bg-background-dark/30 p-4 rounded-lg border border-card-dark mt-4">
                      <div className="flex justify-between items-center mb-3">
                        <label className="text-sm font-bold text-white">Dimensões (m)</label>
                        <span className="text-xs text-primary font-bold">{currentArea.toFixed(2)} m²</span>
                      </div>
                      <div className="mb-3">
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="calcType"
                              checked={calculationType === 'area'}
                              onChange={() => setCalculationType('area')}
                            />
                            <span className="text-xs text-slate-300">Superfície</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name="calcType"
                              checked={calculationType === 'complete'}
                              onChange={() => setCalculationType('complete')}
                            />
                            <span className="text-xs text-slate-300">Completa</span>
                          </label>
                        </div>
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
                    {/* Quotation Items */}
                    <div>
                      <h4 className="text-white text-sm font-bold uppercase tracking-wider mb-4 border-b border-card-dark pb-2">Itens da Cotação</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {CENTRAL_ITEMS.map((item, i) => (
                          <div
                            key={i}
                            className={`bg-background-dark/50 border rounded-lg p-3 transition-colors group focus-within:border-primary relative
                                ${enabledItems[item.label] ? 'border-primary/50 bg-primary/5' : 'border-card-dark opacity-75'}
                             `}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <span className={`material-symbols-outlined transition-colors text-[24px] ${enabledItems[item.label] ? 'text-primary' : 'text-slate-600'}`}>
                                {item.icon}
                              </span>
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-600"
                                checked={enabledItems[item.label] || false}
                                onChange={() => toggleItem(item.label)}
                              />
                            </div>

                            <label className={`block text-[10px] mt-1 truncate ${enabledItems[item.label] ? 'text-white' : 'text-slate-500'}`}>
                              {item.label}
                            </label>

                            <input
                              type="number"
                              min="0"
                              disabled={!enabledItems[item.label]}
                              className={`w-full bg-transparent border-b py-1 font-bold text-xl text-right outline-none transition-colors 
                                ${enabledItems[item.label] ? 'text-white border-card-dark focus:border-primary' : 'text-slate-600 border-transparent cursor-not-allowed'}
                              `}
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
                        <div className="space-y-4">
                          {floorKits.map((kit, idx) => (
                            <div key={idx} className="flex flex-col gap-3 bg-background-dark/30 p-4 rounded-lg border border-white/5">
                              <div className="flex items-center gap-4">
                                <div className="flex-1">
                                  <div className="text-white font-bold text-sm">{kit.name}</div>
                                  <div className="text-slate-500 text-xs text-primary uppercase font-bold tracking-wider">Kit de Infraestrutura</div>
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

                              {/* Visualization of products in the kit */}
                              {kitComponents[kit.kit_id] && kitComponents[kit.kit_id].length > 0 && (
                                <div className="mt-2 pl-4 border-l-2 border-primary/20 flex flex-col gap-1">
                                  <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Produtos Vinculados:</div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                                    {kitComponents[kit.kit_id].map((comp, ci) => (
                                      <div key={ci} className="text-[11px] text-slate-400 flex justify-between items-center group/item hover:text-slate-200 transition-colors">
                                        <span className="truncate pr-2">• {comp.product_name}</span>
                                        <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap bg-white/5 px-1 rounded">x {comp.conversion_factor}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
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

export default EngineeringSurvey;
