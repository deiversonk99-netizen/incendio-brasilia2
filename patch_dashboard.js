const fs = require('fs');
const filePath = 'components/DashboardView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const fetchDataStart = content.indexOf('  const fetchData = async () => {');
if (fetchDataStart === -1) {
  console.error('Could not find fetchData function!');
  process.exit(1);
}

const useEffectMarker = '  useEffect(() => {\n    fetchData();\n  }, []);';
const useEffectEnd = content.indexOf(useEffectMarker, fetchDataStart);
if (useEffectEnd === -1) {
  console.error('Could not find useEffect marker!');
  // Try alternative with \r\n
  const altMarker = '  useEffect(() => {\r\n    // Load all data on mount';
  const altEnd = content.indexOf(altMarker, fetchDataStart);
  console.log('Alt marker found at:', altEnd);
  console.log('Looking for marker:', JSON.stringify(useEffectMarker));
  process.exit(1);
}

const fetchDataEnd = useEffectEnd + useEffectMarker.length;

console.log('Found fetchData at:', fetchDataStart);
console.log('Found useEffect end at:', fetchDataEnd);

const newFetchData = `  const fetchData = async () => {
    setLoading(true);

    try {
      // Run all independent queries in parallel
      const results = await Promise.all([
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('clients').select('name, fantasy_name'),
        supabase.from('proposals').select('project_id'),
        supabase.from('floors').select('project_id'),
        supabase.from('budget_items').select('project_id').eq('origin', 'CALCULATED'),
        supabase.from('user_profiles').select('id, email, role'),
        supabase.from('tasks').select('*').is('group_id', null).order('created_at', { ascending: false }),
        supabase.from('project_status_columns').select('*').order('order_index', { ascending: true }),
        supabase.from('user_profiles').select('id').eq('role', 'ADMIN').limit(1).maybeSingle(),
        supabase.from('project_label_definitions').select('*'),
      ]);

      const projData = results[0].data;
      const clientsData = results[1].data;
      const proposalData = results[2].data;
      const floorsData = results[3].data;
      const itemsData = results[4].data;
      const profilesData = results[5].data;
      const quickTasksData = results[6].data;
      const colsData = results[7].data;
      const adminProfile = results[8].data;
      const labelData = results[9].data;

      // 1. Projects
      if (projData) {
        setProjects(projData as Project[]);
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const monthlyData: Record<string, number> = {};
        months.forEach(m => (monthlyData[m] = 0));
        projData.forEach((p: any) => {
          if (p.created_at) {
            const date = new Date(p.created_at);
            monthlyData[months[date.getMonth()]] += Number(p.value || 0);
          }
        });
        setChartData(months.map(m => ({ name: m, real: monthlyData[m] })));
      }

      // 2. Clients
      if (clientsData) setClients(clientsData);

      // 3. Proposals
      if (proposalData) setProjectsWithProposals(new Set(proposalData.map((p: any) => p.project_id)));

      // 4. Floors
      if (floorsData) setProjectsWithFloors(new Set(floorsData.map((f: any) => f.project_id)));

      // 5. Calculated Items
      if (itemsData) setProjectsWithCalculatedItems(new Set(itemsData.map((i: any) => i.project_id)));

      // 6. Label Definitions
      const defaultLabels = [
        { color: 'bg-red-500', label: 'Critico' },
        { color: 'bg-orange-500', label: 'Urgente' },
        { color: 'bg-yellow-500', label: 'Atencao' },
        { color: 'bg-green-500', label: 'Normal' },
        { color: 'bg-blue-500', label: 'Baixa Prioridade' },
        { color: 'bg-purple-500', label: 'Aguardando' },
      ];
      if (labelData && labelData.length > 0) {
        const adminLabels = adminProfile
          ? labelData.filter((l: any) => l.user_id === adminProfile.id)
          : labelData;
        setLabelDefinitions(adminLabels.length > 0 ? adminLabels : labelData);
      } else {
        setLabelDefinitions(defaultLabels);
      }

      // 7. All profiles
      if (profilesData) setAllProfiles(profilesData);

      // 8. Quick Tasks
      if (quickTasksData) setTasks(quickTasksData);

      // 9. Status Columns
      let currentCols: any[] = colsData || [];

      if (currentCols.length === 0 && user) {
        const defaultCols = [
          { user_id: user.id, label: 'Em Analise', color: 'bg-blue-400', shadow_class: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]', order_index: 0, project_types: ['business', 'factory', 'store', 'residential'] },
          { user_id: user.id, label: 'Aprovado', color: 'bg-yellow-400', shadow_class: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]', order_index: 1, project_types: ['business', 'factory', 'store', 'residential'] },
          { user_id: user.id, label: 'Execucao', color: 'bg-primary', shadow_class: 'shadow-[0_0_8px_rgba(226,29,72,0.6)]', order_index: 2, project_types: ['business', 'factory', 'store', 'residential'] },
          { user_id: user.id, label: 'Concluido', color: 'bg-emerald-400', shadow_class: 'shadow-[0_0_8px_rgba(52,211,153,0.6)]', order_index: 3, project_types: ['business', 'factory', 'store', 'residential'] },
        ];
        const { data: insertedCols } = await supabase.from('project_status_columns').insert(defaultCols).select();
        if (insertedCols) currentCols = insertedCols.sort((a: any, b: any) => a.order_index - b.order_index);
      }

      if (currentCols.length > 0) {
        setStatusColumns(currentCols);
        const colMap: Record<string, string> = {
          'ANALYSIS': currentCols.find((c: any) => c.label === 'Em Analise')?.id || currentCols[0].id,
          'APPROVED': currentCols.find((c: any) => c.label === 'Aprovado')?.id || currentCols[Math.min(1, currentCols.length - 1)].id,
          'EXECUTION': currentCols.find((c: any) => c.label === 'Execucao')?.id || currentCols[Math.min(2, currentCols.length - 1)].id,
          'DONE': currentCols.find((c: any) => c.label === 'Concluido')?.id || currentCols[currentCols.length - 1].id,
        };
        const legacyStatuses = ['ANALYSIS', 'APPROVED', 'EXECUTION', 'DONE'];
        const needsMigration = projData?.some((p: any) => legacyStatuses.includes(p.status));
        if (needsMigration) {
          console.log('Migrating legacy project statuses to UUIDs...');
          for (const [oldStatus, newId] of Object.entries(colMap)) {
            await supabase.from('projects').update({ status: newId }).eq('status', oldStatus);
          }
        }
      }

    } catch (err) {
      console.error('fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);`;

const newContent = content.slice(0, fetchDataStart) + newFetchData + content.slice(fetchDataEnd);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Done! fetchData rewritten successfully. File size:', newContent.length);
