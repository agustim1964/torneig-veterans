function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function calculateGroupSizes(total, maxSize = 4, sizeAdjustment = -1) {
  total = Number(total);
  maxSize = Number(maxSize);
  sizeAdjustment = Number(sizeAdjustment);

  if (!Number.isInteger(total) || total < 2) {
    throw new Error('Calen com a mínim 2 participants per fer grups.');
  }

  if (!Number.isInteger(maxSize) || maxSize < 3 || maxSize > 8) {
    throw new Error('La mida N del grup ha d\'estar entre 3 i 8.');
  }
  if (![-1, 1].includes(sizeAdjustment)) {
    throw new Error('Tria grups de N i N-1 o de N i N+1.');
  }

  const minSize = maxSize + sizeAdjustment;

  // Maximitza els grups de N amb la mida alternativa seleccionada.
  for (let countMax = Math.floor(total / maxSize); countMax >= 0; countMax--) {
    const remaining = total - countMax * maxSize;

    if (remaining === 0) {
      return Array(countMax).fill(maxSize);
    }

    if (remaining > 0 && remaining % minSize === 0) {
      const countMin = remaining / minSize;
      return [
        ...Array(countMax).fill(maxSize),
        ...Array(countMin).fill(minSize)
      ];
    }
  }

  throw new Error(
    `Amb ${total} participants no es poden fer només grups de ${maxSize} i ${minSize}. ` +
    `Tria una altra mida N o combinació de mides.`
  );
}

function normalizeText(value) {
  return String(value || '').trim().toUpperCase();
}

function placementPenalty(participant, group) {
  const club = normalizeText(participant.club);
  const country = normalizeText(participant.pais);
  let penalty = 0;

  for (const existing of group.participants) {
    if (!existing) continue;
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
      // Un bloc pot travessar dues files de la serp i repetir un grup.
      for (let j = 0; j < i; j++) {
        if (slotGroupIndexes[j] === slotGroupIndexes[i]) {
          penalty += placementPenalty(candidate[i], { participants: [candidate[j]] });
        }
      }
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

function drawGroupsOnce(participants, blockSize = 4, maxGroupSize = 4, sizeAdjustment = -1) {
  blockSize = Number(blockSize);
  if (![2, 4].includes(blockSize)) {
    throw new Error('El sorteig ha de ser serp 2x2 o serp 4x4.');
  }

  const sorted = [...participants].sort((a, b) => {
    const d = Number(b.ranking || 0) - Number(a.ranking || 0);
    return d || String(a.nom_mostrar).localeCompare(String(b.nom_mostrar), 'ca');
  });

  const sizes = calculateGroupSizes(sorted.length, maxGroupSize, sizeAdjustment);
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
  const blocks = [];
  for (let start = 0; start < remaining.length; start += blockSize) {
    const block = remaining.slice(start, start + blockSize);
    const blockSlots = slots.slice(cursor, cursor + block.length);
    const chosen = bestPermutationForSlots(block, blockSlots, groups);

    const positions = [];
    chosen.forEach((participant, i) => {
      positions.push({ group: groups[blockSlots[i]], index: groups[blockSlots[i]].participants.length });
      groups[blockSlots[i]].participants.push(participant);
    });
    blocks.push(positions);

    cursor += block.length;
  }

  // Revisa els blocs anteriors amb tots els grups ja formats. Només es
  // permeten intercanvis dins del bloc original, sense moure caps de sèrie.
  for (let pass = 0; pass < 10; pass++) {
    let improved = false;
    for (const positions of blocks) {
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const a = positions[i];
          const b = positions[j];
          if (a.group === b.group) continue;
          const playerA = a.group.participants[a.index];
          const playerB = b.group.participants[b.index];
          a.group.participants[a.index] = null;
          b.group.participants[b.index] = null;
          const before = placementPenalty(playerA, a.group) + placementPenalty(playerB, b.group);
          const after = placementPenalty(playerB, a.group) + placementPenalty(playerA, b.group);
          const swap = after < before;
          a.group.participants[a.index] = swap ? playerB : playerA;
          b.group.participants[b.index] = swap ? playerA : playerB;
          if (swap) improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return groups;
}

function drawPenalty(groups) {
  return groups.reduce((total, group) => total + group.participants.reduce(
    (sum, player, index) => sum + placementPenalty(player, { participants: group.participants.slice(0, index) }), 0
  ), 0);
}

function drawGroups(participants, blockSize = 4, maxGroupSize = 4, sizeAdjustment = -1) {
  let best;
  let bestPenalty = Infinity;
  // Diversos desempats aleatoris eviten que una decisió inicial condicioni
  // tot el sorteig. Sense club, la penalització depèn només del país.
  for (let attempt = 0; attempt < 24; attempt++) {
    const groups = drawGroupsOnce(participants, blockSize, maxGroupSize, sizeAdjustment);
    const penalty = drawPenalty(groups);
    if (penalty < bestPenalty) {
      best = groups;
      bestPenalty = penalty;
    }
    if (bestPenalty === 0) break;
  }
  return best;
}


function buildSingleGroup(participants) {
  const sorted = [...participants].sort((a, b) => {
    const d = Number(b.ranking || 0) - Number(a.ranking || 0);
    return d || String(a.nom_mostrar).localeCompare(String(b.nom_mostrar), 'ca');
  });

  if (sorted.length < 2) {
    throw new Error('Calen com a mínim 2 participants per crear un Top X.');
  }

  return [{
    number: 1,
    size: sorted.length,
    participants: sorted
  }];
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
  buildSingleGroup,
  groupWarnings
};
