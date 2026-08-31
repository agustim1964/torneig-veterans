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
  const r = total % 4; const sizes=[];
  if (r===0) { for(let i=0;i<total/4;i++) sizes.push(4); return sizes; }
  if (r===1 && total>=9) { sizes.push(5); for(let i=0;i<(total-5)/4;i++) sizes.push(4); return sizes; }
  if (r===2) { for(let i=0;i<(total-6)/4;i++) sizes.push(4); sizes.push(3,3); return sizes; }
  if (r===3) { for(let i=0;i<(total-3)/4;i++) sizes.push(4); sizes.push(3); return sizes; }
  return [total];
}

function randomizeInBlocks(items, blockSize) {
  const result = [];
  for (let i = 0; i < items.length; i += blockSize) {
    result.push(...shuffle(items.slice(i, i + blockSize)));
  }
  return result;
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
  const numGroups = sizes.length;
  const groups = sizes.map((size, i) => ({
    number: i + 1,
    size,
    participants: []
  }));

  // CAPS DE SÈRIE: sense sorteig
  // 1r ranking -> grup 1, 2n -> grup 2, etc.
  const seeds = sorted.slice(0, numGroups);
  seeds.forEach((p, i) => groups[i].participants.push(p));

  // La serp comença amb el segon jugador de cada grup.
  const remaining = sorted.slice(numGroups);
  const randomized = randomizeInBlocks(remaining, blockSize);

  let row = 1;      // segon jugador del grup
  let indexInRow = 0;

  for (const p of randomized) {
    let order;
    if (row % 2 === 1) {
      // Segona fila: de l'últim grup al primer.
      order = Array.from({ length: numGroups }, (_, i) => numGroups - 1 - i);
    } else {
      // Tercera fila: del primer grup a l'últim.
      order = Array.from({ length: numGroups }, (_, i) => i);
    }

    // Saltar grups que ja estan plens (casos de grups de 3).
    let assigned = false;
    let attempts = 0;

    while (!assigned && attempts < numGroups) {
      const gi = order[indexInRow % numGroups];
      indexInRow++;
      attempts++;

      if (groups[gi].participants.length < groups[gi].size) {
        groups[gi].participants.push(p);
        assigned = true;
      }

      if (indexInRow >= numGroups) {
        indexInRow = 0;
        row++;
      }
    }

    if (!assigned) {
      const fallback = groups.find(g => g.participants.length < g.size);
      if (!fallback) throw new Error('No hi ha espai disponible als grups.');
      fallback.participants.push(p);
    }
  }

  return groups;
}

module.exports = {
  shuffle,
  calculateGroupSizes,
  randomizeInBlocks,
  drawGroups
};
