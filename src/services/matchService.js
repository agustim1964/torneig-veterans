function buildBergerRoundRobin(participants) {
  const ordered = [...participants].sort(
    (a, b) => Number(a.ordre_visual || 0) - Number(b.ordre_visual || 0)
  );

  const players = ordered.map((p, index) => ({
    idparticipant: p.idparticipant,
    posicio: index + 1
  }));

  // Amb nombre imparell afegim un descans (BYE).
  if (players.length % 2 === 1) {
    players.push(null);
  }

  const n = players.length;
  const rounds = n - 1;
  const half = n / 2;
  let rotation = [...players];
  const matches = [];
  let ordre = 1;

  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < half; i++) {
      const a = rotation[i];
      const b = rotation[n - 1 - i];

      if (!a || !b) continue;

      // Alternem l'ordre visual dels jugadors per no deixar sempre
      // el mateix participant al mateix costat de l'acta.
      const swap = (round + i) % 2 === 0;
      const p1 = swap ? b : a;
      const p2 = swap ? a : b;

      matches.push({
        ordre: ordre++,
        ronda: round,
        participant1: p1.idparticipant,
        participant2: p2.idparticipant,
        posicio1: p1.posicio,
        posicio2: p2.posicio
      });
    }

    // Mètode del cercle: el primer queda fix.
    rotation = [
      rotation[0],
      rotation[n - 1],
      ...rotation.slice(1, n - 1)
    ];
  }

  return matches;
}

function buildGroupMatchOrder(participants, options = {}) {
  if (options.topX) {
    return buildBergerRoundRobin(participants);
  }

  const ordered = [...participants].sort(
    (a, b) => Number(a.ordre_visual || 0) - Number(b.ordre_visual || 0)
  );

  const pos = {};
  ordered.forEach((p, i) => { pos[i + 1] = p.idparticipant; });
  const n = ordered.length;

  let pairs = [];
  if (n === 3) {
    pairs = [[1, 3], [2, 3], [1, 2]];
  } else if (n === 4) {
    pairs = [[1, 4], [3, 2], [1, 3], [2, 4], [1, 2], [3, 4]];
  } else if (n === 5) {
    pairs = [[2, 5], [3, 4], [1, 5], [2, 3], [1, 4], [5, 3], [1, 3], [4, 2], [4, 5], [1, 2]];
  } else {
    for (let i = 1; i <= n; i++) {
      for (let j = i + 1; j <= n; j++) pairs.push([i, j]);
    }
  }

  return pairs.map(([a, b], i) => ({
    ordre: i + 1,
    // En grups de 4, cada dos partits consecutius formen una franja
    // simultània possible: 1-4/3-2, 1-3/2-4, 1-2/3-4.
    ronda: n === 4 ? Math.floor(i / 2) + 1 : null,
    participant1: pos[a],
    participant2: pos[b],
    posicio1: a,
    posicio2: b
  }));
}

function assignGroupReferees(matches, participants) {
  const counts = new Map(participants.map(p => [p.idparticipant, 0]));
  const position = new Map(participants.map((p, i) => [p.idparticipant, i]));

  return matches.map(match => {
    const eligible = participants
      .filter(p => p.idparticipant !== match.participant1 && p.idparticipant !== match.participant2)
      .sort((a, b) => {
        const diff = (counts.get(a.idparticipant) || 0) - (counts.get(b.idparticipant) || 0);
        if (diff) return diff;
        return (position.get(a.idparticipant) || 0) - (position.get(b.idparticipant) || 0);
      });

    const referee = eligible[0] || null;
    if (referee) {
      counts.set(referee.idparticipant, (counts.get(referee.idparticipant) || 0) + 1);
    }

    return {
      ...match,
      idarbitre_participant: referee ? referee.idparticipant : null
    };
  });
}

module.exports = {
  buildGroupMatchOrder,
  buildBergerRoundRobin,
  assignGroupReferees
};
