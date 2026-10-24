const { buildGroupMatchOrder, assignGroupReferees } = require('./matchService');
const { isoDate, minutesToTime } = require('./scheduleService');
const MARKER = 'MASTER_EXCEL';

function readMasterSlots(workbook, dates, tables) {
  const slots = [];
  const tableMap = new Map(tables.filter(t => t.activa).map(t => [Number(t.numero), t.idtaula]));
  for (const [name, date] of Object.entries(dates)) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`Falta la pestanya ${name}`);
    sheet.eachRow((row, ri) => {
      if (ri < 5) return;
      row.eachCell((cell, ci) => {
        if (ci < 2) return;
        const label = String(cell.value?.text || cell.value || '').trim();
        if (!label) return;
        if (!/^G\d+(M\d+|F\d+|DBM\d+|DBF\d+|XDB\d+)$/.test(label)) {
          throw new Error(`Etiqueta desconeguda: ${name}!${cell.address}: ${label}`);
        }
        const time = row.getCell(1).value;
        const table = Number(sheet.getRow(4).getCell(ci).value);
        if (!(time instanceof Date) || !tableMap.has(table)) throw new Error(`Hora o taula no vàlida: ${name}!${cell.address}`);
        const minute = time.getUTCHours() * 60 + time.getUTCMinutes();
        slots.push({ label, date, minute, table, idtaula: tableMap.get(table),
          data_hora: `${date} ${minutesToTime(minute)}`, source: `${name}!${cell.address}` });
      });
    });
  }
  return slots.sort((a, b) => a.data_hora.localeCompare(b.data_hora) || a.table - b.table);
}

function buildExcelMatches(slots, groups, participants, members) {
  const byLabel = new Map(groups.map(g => [`G${g.numero}${g.categoria_nom.replace(/^MDB/, 'DBM').replace(/^FDB/, 'DBF')}`, g]));
  const membersByParticipant = new Map();
  for (const m of members) {
    if (!membersByParticipant.has(m.idparticipant)) membersByParticipant.set(m.idparticipant, []);
    membersByParticipant.get(m.idparticipant).push(m.idjugador);
  }
  for (const slot of slots) if (!byLabel.has(slot.label)) throw new Error(`Grup no sortejat: ${slot.label}`);
  const matches = [];
  const numbers = new Map();
  for (const [label, group] of byLabel) {
    const players = participants.filter(p => p.idgrup === group.idgrup);
    if (players.length < 3 || players.some(p => !p.actiu || p.baixa)) throw new Error(`Participants no vàlids: ${label}`);
    const times = slots.filter(s => s.label === label);
    const pairing = buildGroupMatchOrder(players);
    // L'ordre antic de cinc deixava el jugador 3 sense partit en els tres
    // últims. Intercanviem dos enfrontaments perquè tothom jugui dijous.
    if (players.length === 5 && new Set(times.map(s => s.date)).size > 1) {
      [pairing[5], pairing[8]] = [pairing[8], pairing[5]];
    }
    const ordered = assignGroupReferees(pairing, players);
    if (times.length !== ordered.length) throw new Error(`${label}: ${times.length} franges per a ${ordered.length} partits`);
    // Tothom ha de tenir partit en cadascun dels dies del grup.
    for (const date of new Set(times.map(s => s.date))) {
      const playing = new Set();
      ordered.forEach((m, i) => { if (times[i].date === date) { playing.add(m.participant1); playing.add(m.participant2); } });
      if (playing.size !== players.length) throw new Error(`${label}: hi ha jugadors sense partit el ${date}`);
    }
    ordered.forEach((m, i) => {
      const number = (numbers.get(group.idcategoria) || 0) + 1;
      numbers.set(group.idcategoria, number);
      matches.push({ ...m, ...times[i], idcategoria: group.idcategoria, idgrup: group.idgrup, numero_partit: number });
    });
  }
  const occupiedTables = new Set();
  const occupiedPlayers = new Set();
  for (const match of matches) {
    const tableKey = `${match.data_hora}/${match.idtaula}`;
    if (occupiedTables.has(tableKey)) throw new Error(`Taula duplicada: ${tableKey}`);
    occupiedTables.add(tableKey);
    for (const participantId of [match.participant1, match.participant2, match.idarbitre_participant]) {
      if (!participantId) throw new Error(`Falta àrbitre: ${match.label}`);
      const identities = [`p${participantId}`, ...(membersByParticipant.get(participantId) || []).map(id => `j${id}`)];
      for (const identity of identities) {
        const key = `${match.data_hora}/${identity}`;
        if (occupiedPlayers.has(key)) throw new Error(`Solapament de jugador o àrbitre: ${key}`);
        occupiedPlayers.add(key);
      }
    }
  }
  return matches;
}

// El detall per partit és la font de veritat per als grups importats.
// Evita representar un grup de dos dies com un únic bloc continu.
async function expandExcelScheduleRows(connection, rows, competitionId) {
  if (!rows.some(r => r.observacions?.startsWith(MARKER))) return rows;
  const [matches] = await connection.query(`
    SELECT pa.idgrup, pa.idtaula, pa.data_hora, t.numero AS taula_numero, t.nom AS taula_nom
    FROM partits pa JOIN taules t ON t.idtaula = pa.idtaula
    WHERE pa.idcategoria IN (SELECT idcategoria FROM categories WHERE idcompeticio = ?)
      AND pa.idgrup IS NOT NULL ORDER BY pa.data_hora, t.numero
  `, [competitionId]);
  const result = rows.filter(r => !r.observacions?.startsWith(MARKER));
  const seen = new Set();
  for (const row of rows.filter(r => r.observacions?.startsWith(MARKER))) {
    if (seen.has(row.idgrup)) continue;
    seen.add(row.idgrup);
    for (const match of matches.filter(m => m.idgrup === row.idgrup)) {
      const dt = new Date(match.data_hora);
      const minute = dt.getHours() * 60 + dt.getMinutes();
      const date = isoDate(dt);
      const end = minutesToTime(minute + Number(row.durada_partit));
      const previous = result.find(r => r.excel_imported && r.idgrup === row.idgrup && r.idtaula === match.idtaula && r.data === date && r.hora_final === minutesToTime(minute));
      if (previous) previous.hora_final = end;
      else result.push({ ...row, ...match, data: date, hora_inici: minutesToTime(minute), hora_final: end,
        idtaula_real: match.idtaula, taules_numeros: String(match.taula_numero), excel_imported: true });
    }
  }
  return result.sort((a, b) => `${isoDate(a.data)} ${a.hora_inici}`.localeCompare(`${isoDate(b.data)} ${b.hora_inici}`) || a.taula_numero - b.taula_numero);
}

module.exports = { MARKER, readMasterSlots, buildExcelMatches, expandExcelScheduleRows };
