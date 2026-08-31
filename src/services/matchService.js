function buildGroupMatchOrder(participants) {
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
    pairs = [[1, 4], [2, 4], [1, 3], [3, 4], [1, 2], [2, 3]];
  } else if (n === 5) {
    pairs = [[2, 5], [3, 4], [1, 5], [2, 3], [1, 4], [5, 3], [1, 3], [4, 2], [4, 5], [1, 2]];
  } else {
    for (let i = 1; i <= n; i++) {
      for (let j = i + 1; j <= n; j++) pairs.push([i, j]);
    }
  }

  return pairs.map(([a, b], i) => ({
    ordre: i + 1,
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
  assignGroupReferees
};
