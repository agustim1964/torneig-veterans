function buildCategorySummary(categories, groups) {
  const sizes = new Set([3, 4, 5, 6, 7]);
  const rows = categories.map(category => ({
    ...category,
    participants: Number(category.participants || 0),
    groupCount: 0,
    groupedParticipants: 0,
    matches: 0,
    sizes: {}
  }));
  const byId = new Map(rows.map(row => [Number(row.idcategoria), row]));
  for (const group of groups) {
    const row = byId.get(Number(group.idcategoria));
    if (!row) continue;
    const size = Number(group.participants || 0);
    sizes.add(size);
    row.sizes[size] = (row.sizes[size] || 0) + 1;
    row.groupCount++;
    row.groupedParticipants += size;
    row.matches += size * (size - 1) / 2;
  }
  const totals = { participants: 0, groupCount: 0, groupedParticipants: 0, matches: 0, sizes: {} };
  for (const row of rows) {
    for (const key of ['participants', 'groupCount', 'groupedParticipants', 'matches']) totals[key] += row[key];
    for (const [size, count] of Object.entries(row.sizes)) totals.sizes[size] = (totals.sizes[size] || 0) + count;
  }
  return { rows, sizes: [...sizes].sort((a, b) => a - b), totals };
}

module.exports = { buildCategorySummary };
