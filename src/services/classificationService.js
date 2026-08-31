function ratio(won, lost) {
  won = Number(won || 0);
  lost = Number(lost || 0);

  if (lost === 0) {
    if (won === 0) return 0;
    return Number.POSITIVE_INFINITY;
  }

  return won / lost;
}

function computeBaseStats(participants, matches) {
  const stats = new Map();

  for (const p of participants) {
    stats.set(p.idparticipant, {
      idparticipant: p.idparticipant,
      nom_mostrar: p.nom_mostrar,
      ranking: Number(p.ranking || 0),
      victories: 0,
      derrotes: 0
    });
  }

  for (const m of matches) {
    if (m.estat !== 'FINALITZAT' || !m.guanyador) continue;

    const s1 = stats.get(m.participant1);
    const s2 = stats.get(m.participant2);
    if (!s1 || !s2) continue;

    if (m.guanyador === m.participant1) {
      s1.victories++;
      s2.derrotes++;
    } else if (m.guanyador === m.participant2) {
      s2.victories++;
      s1.derrotes++;
    }
  }

  return [...stats.values()];
}

function miniTableStats(tiedIds, matches, gameRows) {
  const tied = new Set(tiedIds);
  const stats = new Map();

  for (const id of tiedIds) {
    stats.set(id, {
      idparticipant: id,
      jocs_guanyats: 0,
      jocs_perduts: 0,
      punts_guanyats: 0,
      punts_perduts: 0
    });
  }

  const relevantMatches = matches.filter(m =>
    m.estat === 'FINALITZAT' &&
    tied.has(m.participant1) &&
    tied.has(m.participant2)
  );

  const relevantMatchIds = new Set(relevantMatches.map(m => m.idpartit));

  for (const m of relevantMatches) {
    const s1 = stats.get(m.participant1);
    const s2 = stats.get(m.participant2);

    const r1 = Number(m.resultat1 || 0);
    const r2 = Number(m.resultat2 || 0);

    s1.jocs_guanyats += r1;
    s1.jocs_perduts += r2;
    s2.jocs_guanyats += r2;
    s2.jocs_perduts += r1;
  }

  for (const g of gameRows) {
    if (!relevantMatchIds.has(g.idpartit)) continue;

    const match = relevantMatches.find(m => m.idpartit === g.idpartit);
    if (!match) continue;

    const s1 = stats.get(match.participant1);
    const s2 = stats.get(match.participant2);

    const p1 = Number(g.punts1 || 0);
    const p2 = Number(g.punts2 || 0);

    s1.punts_guanyats += p1;
    s1.punts_perduts += p2;
    s2.punts_guanyats += p2;
    s2.punts_perduts += p1;
  }

  for (const s of stats.values()) {
    s.factor_jocs = ratio(s.jocs_guanyats, s.jocs_perduts);
    s.factor_punts = ratio(s.punts_guanyats, s.punts_perduts);
  }

  return stats;
}

function classifyGroup(participants, matches, gameRows) {
  const base = computeBaseStats(participants, matches);

  const byVictories = new Map();
  for (const s of base) {
    if (!byVictories.has(s.victories)) byVictories.set(s.victories, []);
    byVictories.get(s.victories).push(s);
  }

  const victoryLevels = [...byVictories.keys()].sort((a, b) => b - a);
  const final = [];

  for (const victoryCount of victoryLevels) {
    const tied = byVictories.get(victoryCount);

    if (tied.length === 1) {
      final.push({
        ...tied[0],
        factor_jocs: null,
        factor_punts: null,
        desempat: ''
      });
      continue;
    }

    const mini = miniTableStats(
      tied.map(x => x.idparticipant),
      matches,
      gameRows
    );

    tied.sort((a, b) => {
      const ma = mini.get(a.idparticipant);
      const mb = mini.get(b.idparticipant);

      if (ma.factor_jocs !== mb.factor_jocs) {
        return mb.factor_jocs - ma.factor_jocs;
      }

      if (ma.factor_punts !== mb.factor_punts) {
        return mb.factor_punts - ma.factor_punts;
      }

      // Només per mantenir un ordre visual estable.
      // No és un criteri esportiu oficial.
      return Number(b.ranking || 0) - Number(a.ranking || 0);
    });

    for (const item of tied) {
      const miniItem = mini.get(item.idparticipant);

      final.push({
        ...item,
        ...miniItem,
        desempat: 'mini-taula'
      });
    }
  }

  return final.map((row, index) => ({
    ...row,
    posicio: index + 1
  }));
}

module.exports = {
  ratio,
  computeBaseStats,
  miniTableStats,
  classifyGroup
};
