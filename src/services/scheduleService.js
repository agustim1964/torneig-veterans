function timeToMinutes(time) {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(value) {
  const minutes = ((value % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.substring(0, 10);
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function generateMaster(groups, tables, planDate, startTime, duration, locked = []) {
  if (!tables.length) throw new Error('No hi ha taules actives.');

  const start = timeToMinutes(startTime || '09:00');
  const availability = new Map(tables.map(t => [t.idtaula, start]));
  const lockedIds = new Set(locked.map(r => r.idgrup));

  // Només ocupen disponibilitat del dia que estem planificant.
  for (const row of locked) {
    if (isoDate(row.data) !== isoDate(planDate)) continue;
    availability.set(
      row.idtaula,
      Math.max(availability.get(row.idtaula) || start, timeToMinutes(row.hora_final))
    );
  }

  const out = [];
  for (const group of groups) {
    if (lockedIds.has(group.idgrup)) continue;

    let table = tables[0];
    for (const candidate of tables) {
      if ((availability.get(candidate.idtaula) || start) < (availability.get(table.idtaula) || start)) {
        table = candidate;
      }
    }

    const ini = availability.get(table.idtaula) || start;
    const matchDuration = Number(group.durada_partit || duration || 20);
    const fi = ini + Number(group.nombre_partits) * matchDuration;

    out.push({
      idgrup: group.idgrup,
      idtaula: table.idtaula,
      data: isoDate(planDate),
      hora_inici: minutesToTime(ini),
      hora_final: minutesToTime(fi),
      durada_partit: matchDuration
    });

    availability.set(table.idtaula, fi);
  }

  return out;
}

module.exports = { timeToMinutes, minutesToTime, isoDate, generateMaster };
