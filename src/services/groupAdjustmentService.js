function newGroupMatches(roster, participantId, existing) {
  if (roster.some(p => p.idparticipant === participantId)) throw new Error('Aquest participant ja és al grup.');
  if (roster.length < 2 || roster.length >= 8) throw new Error('El grup ha de tenir entre 2 i 7 participants abans de l’alta.');
  const participants = [...roster, { idparticipant: participantId }];
  const counts = new Map(participants.map(p => [p.idparticipant, existing.filter(m => m.idarbitre_participant === p.idparticipant).length]));
  return roster.map(p => {
    const referee = participants.filter(q => ![p.idparticipant, participantId].includes(q.idparticipant))
      .sort((a,b) => counts.get(a.idparticipant) - counts.get(b.idparticipant))[0];
    counts.set(referee.idparticipant, counts.get(referee.idparticipant) + 1);
    return { participant1: p.idparticipant, participant2: participantId, idarbitre_participant: referee.idparticipant };
  });
}

function timestamp(value) {
  return value ? new Date(typeof value === 'string' ? value.replace(' ', 'T') : value).getTime() : NaN;
}
function conflict(candidate, busy, members, duration) {
  const start = timestamp(candidate.data_hora), end = start + duration * 60000;
  const identities = m => new Set([m.participant1,m.participant2,m.idarbitre_participant].filter(Boolean)
    .flatMap(id => [`p${id}`, ...(members.get(id) || []).map(j => `j${j}`)]));
  const involved = identities(candidate);
  return busy.some(m => {
    if (m.idpartit && m.idpartit === candidate.idpartit) return false;
    const a = timestamp(m.data_hora), b = a + Number(m.duration || duration) * 60000;
    if (!(start < b && end > a)) return false;
    return m.idtaula === candidate.idtaula || [...identities(m)].some(id => involved.has(id));
  });
}

function scheduleNewMatches(matches, busy, members, options) {
  const { date, start, end, tableId, duration } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(start || '') || !/^\d{2}:\d{2}$/.test(end || '')) throw new Error('Indica data, hora inicial i hora límit.');
  const beginning = timestamp(`${date} ${start}:00`), limit = timestamp(`${date} ${end}:00`);
  if (!Number.isFinite(beginning) || !Number.isFinite(limit) || limit <= beginning || duration <= 0) throw new Error('Franja horària no vàlida.');
  const planned = [];
  let cursor = beginning;
  for (const match of matches) {
    let candidate;
    while (cursor + duration * 60000 <= limit) {
      const d = new Date(cursor);
      const pad = n => String(n).padStart(2,'0');
      candidate = { ...match, idtaula: tableId, data_hora: `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:00` };
      if (!conflict(candidate, [...busy,...planned], members, duration)) break;
      candidate = null;
      cursor += 5 * 60000;
    }
    if (!candidate || cursor + duration * 60000 > limit) throw new Error('No hi caben tots els partits sense conflictes. Amplia la franja, canvia la taula o tria assignació manual.');
    planned.push(candidate);
    cursor += duration * 60000;
  }
  return planned;
}

module.exports = { newGroupMatches, scheduleNewMatches, conflict };
