// Display label for lead stages. The stored value stays stable (e.g. 'Follow Up');
// only the shown text changes here — so renames never need a data migration.
const LABELS = {
  'Follow Up': 'Further Talk/Follow Up',
}

export const stageLabel = (s) => LABELS[s] || s
