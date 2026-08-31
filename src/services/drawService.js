function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function calculateGroupSizes(total) {
  if (total < 3) throw new Error('Calen com a mínim 3 participants per fer grups.');
  if (total === 5) return [5];

  const r = total % 4;
  const sizes = [];

  if (r === 0) {
    for (let i = 0; i < total / 4; i++) sizes.push(4);
    return sizes;
  }

  if (r === 1 && total >= 9) {
    sizes.push(5);
    for (let i = 0; i < (total - 5) / 4; i++) sizes.push(4);
    return sizes;
  }

  if (r === 2) {
    for (let i = 0; i < (total - 6) / 4; i++) sizes.push(4);
    sizes.push(3, 3);
    return sizes;
  }

  if (r === 3) {
    for (let i = 0; i < (total - 3) / 4; i++) sizes.push(4);
    sizes.push(3);
    return sizes;
  }

  return [total];
}

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function placementPenalty(participant, group) {
  const club = normalizeText(participant.club);
  const country = normalizeText(participant.pais);
  let penalty = 0;

  for (const existing of group.participants) {
    if (club && club === normalizeText(existing.club)) penalty += 100;
    if (country && country === normalizeText(existing.pais)) penalty += 25;
  }

  return penalty;
}

function permutations(items) {
  if (items.length <= 1) return [items];
  const result = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) result.push([item, ...tail]);
  });
  return result;
}

function bestPermutationForSlots(block, slotGroupIndexes, groups) {
  const candidates = shuffle(permutations(block));
  let best = candidates[0];
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    let penalty = 0;
    for (let i = 0; i < candidate.length; i++) {
      penalty += placementPenalty(candidate[i], groups[slotGroupIndexes[i]]);
    }

    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      best = candidate;
    }
  }

  return best;
}

function buildSnakeSlots(groups) {
  const slots = [];
  const maxSize = Math.max(...groups.map(g => g.size));

  // La primera fila ja està ocupada pels caps de sèrie.
  for (let position = 2; position <= maxSize; position++) {
    const indexes = groups
      .map((g, i) => ({ g, i }))
      .filter(x => x.g.size >= position)
      .map(x => x.i);

    if (position % 2 === 0) indexes.reverse(); // 2n i 4t jugador: sentit invers
    slots.push(...indexes);
  }

  return slots;
}

function drawGroups(participants, blockSize = 4) {
  blockSize = Number(blockSize);
  if (![2, 4].includes(blockSize)) {
    throw new Error('El sorteig ha de ser serp 2x2 o serp 4x4.');
  }

  const sorted = [...participants].sort((a, b) => {
    const d = Number(b.ranking || 0) - Number(a.ranking || 0);
    return d || String(a.nom_mostrar).localeCompare(String(b.nom_mostrar), 'ca');
  });

  const sizes = calculateGroupSizes(sorted.length);
  const groups = sizes.map((size, i) => ({
    number: i + 1,
    size,
    participants: []
  }));

  // Caps de sèrie: directes, sense sorteig.
  sorted.slice(0, groups.length).forEach((p, i) => {
    groups[i].participants.push(p);
  });

  const remaining = sorted.slice(groups.length);
  const slots = buildSnakeSlots(groups);

  let cursor = 0;
  for (let start = 0; start < remaining.length; start += blockSize) {
    const block = remaining.slice(start, start + blockSize);
    const blockSlots = slots.slice(cursor, cursor + block.length);
    const chosen = bestPermutationForSlots(block, blockSlots, groups);

    chosen.forEach((participant, i) => {
      groups[blockSlots[i]].participants.push(participant);
    });

    cursor += block.length;
  }

  return groups;
}

function groupWarnings(group) {
  const warnings = [];
  const countBy = (field) => {
    const map = new Map();
    for (const p of group.participants) {
      const value = normalizeText(p[field]);
      if (!value) continue;
      map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map.entries()].filter(([, count]) => count >= 3);
  };

  for (const [club, count] of countBy('club')) {
    warnings.push(`${count} participants del mateix club (${club})`);
  }
  for (const [pais, count] of countBy('pais')) {
    warnings.push(`${count} participants del mateix país (${pais})`);
  }

  return warnings;
}

module.exports = {
  shuffle,
  calculateGroupSizes,
  placementPenalty,
  buildSnakeSlots,
  drawGroups,
  groupWarnings
};
