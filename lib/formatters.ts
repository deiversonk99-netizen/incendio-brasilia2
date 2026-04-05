/**
 * Returns the client name based on the specified mode (UI or PDF).
 * 
 * Mode 'ui': Returns fantasy_name if available, otherwise name (Razão Social).
 * Mode 'pdf': Returns name (Razão Social) if available, otherwise fantasy_name.
 */
export const getClientDisplayName = (
  client?: { name?: string; fantasy_name?: string } | null,
  mode: 'ui' | 'pdf' = 'ui'
): string => {
  if (!client) return 'N/A';
  
  const name = client.name?.trim() || '';
  const fantasy = client.fantasy_name?.trim() || '';

  if (mode === 'ui') {
    return fantasy !== '' ? fantasy : (name !== '' ? name : 'N/A');
  } else {
    // PDF mode
    return name !== '' ? name : (fantasy !== '' ? fantasy : 'N/A');
  }
};
