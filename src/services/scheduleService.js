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
  if (!tables.length) throw new Error('No hi ha taules disponibles per aquesta competició.');

  const start = timeToMinutes(startTime || '09:00');
  const availability = new Map(tables.map(t => [t.idtaula, start]));
  const lockedIds = new Set(locked.map(r => r.idgrup));

  // Les programacions bloquejades poden ocupar més d'una taula.
  for (const row of locked) {
    if (isoDate(row.data) !== isoDate(planDate)) continue;
    const ids = Array.isArray(row.taules_ids) && row.taules_ids.length
      ? row.taules_ids
      : [row.idtaula];
    for (const idtaula of ids) {
      availability.set(
        Number(idtaula),
        Math.max(availability.get(Number(idtaula)) || start, timeToMinutes(row.hora_final))
      );
    }
  }

  const out = [];

  for (const group of groups) {
    if (lockedIds.has(group.idgrup)) continue;

    const needed = Math.max(1, Number(group.taules_necessaries || 1));
    if (needed > tables.length) {
      throw new Error(
        `${group.categoria_nom || 'Categoria'} necessita ${needed} taules simultànies però la competició només en té ${tables.length}.`
      );
    }

    // Triem les N taules que queden lliures abans. La franja pot començar
    // quan totes les taules seleccionades estan disponibles.
    const chosen = [...tables]
      .sort((a, b) => {
        const da = availability.get(a.idtaula) || start;
        const db = availability.get(b.idtaula) || start;
        return da - db || Number(a.numero) - Number(b.numero);
      })
      .slice(0, needed);

    const ini = Math.max(...chosen.map(t => availability.get(t.idtaula) || start));
    const matchDuration = Number(group.durada_partit || duration || 20);

    // Grups normals: una taula i tots els partits seguits.
    // Top X: totes les partides d'una ronda són simultànies i la durada
    // del bloc és nombre de rondes x durada de partit.
    const slots = group.format_competicio === 'GRUP_UNIC'
      ? Number(group.nombre_rondes || 0)
      : Number(group.nombre_franges || group.nombre_partits || 0);
    const fi = ini + slots * matchDuration;

    out.push({
      idgrup: group.idgrup,
      idtaula: chosen[0].idtaula,
      taules: chosen.map(t => t.idtaula),
      data: isoDate(planDate),
      hora_inici: minutesToTime(ini),
      hora_final: minutesToTime(fi),
      durada_partit: matchDuration
    });

    for (const table of chosen) availability.set(table.idtaula, fi);
  }

  return out;
}


function addDays(iso, days) {
  const [y, m, d] = String(iso).substring(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function generateGlobalMaster(groups, tables, startDate, endDate, startTime, endTime, duration, locked = []) {
  if (!tables.length) throw new Error('No hi ha taules disponibles per aquesta competició.');

  const firstDate = isoDate(startDate);
  const lastDate = isoDate(endDate || startDate);
  const dayStart = timeToMinutes(startTime || '09:00');
  const dayEnd = timeToMinutes(endTime || '20:00');

  if (!firstDate || !lastDate) throw new Error('Cal definir les dates de la competició.');
  if (dayEnd <= dayStart) throw new Error("L'hora final de jornada ha de ser posterior a l'hora inicial.");

  const lockedIds = new Set(locked.map(r => Number(r.idgrup)));
  const occupancy = new Map();

  function getDay(date) {
    if (!occupancy.has(date)) {
      occupancy.set(date, new Map(tables.map(t => [Number(t.idtaula), dayStart])));
    }
    return occupancy.get(date);
  }

  for (const row of locked) {
    const date = isoDate(row.data);
    if (!date) continue;
    const day = getDay(date);
    const ids = Array.isArray(row.taules_ids) && row.taules_ids.length
      ? row.taules_ids.map(Number)
      : [Number(row.idtaula)];
    for (const id of ids) {
      day.set(id, Math.max(day.get(id) || dayStart, timeToMinutes(row.hora_final)));
    }
  }

  // Prioritzem primer els blocs que necessiten més taules (Top X),
  // i després mantenim l'ordre de categoria/grup rebut de la consulta.
  const pending = groups
    .filter(g => !lockedIds.has(Number(g.idgrup)))
    .map((g, index) => ({ ...g, _order: index }))
    .sort((a, b) =>
      Number(b.taules_necessaries || 1) - Number(a.taules_necessaries || 1) ||
      a._order - b._order
    );

  const out = [];

  for (const group of pending) {
    const needed = Math.max(1, Number(group.taules_necessaries || 1));
    if (needed > tables.length) {
      throw new Error(`${group.categoria_nom || 'Categoria'} necessita ${needed} taules simultànies però només n'hi ha ${tables.length}.`);
    }

    const matchDuration = Number(group.durada_partit || duration || 20);
    const slots = group.format_competicio === 'GRUP_UNIC'
      ? Number(group.nombre_rondes || 0)
      : Number(group.nombre_franges || group.nombre_partits || 0);
    const blockMinutes = slots * matchDuration;

    let assigned = null;
    let date = firstDate;

    while (date <= lastDate && !assigned) {
      const day = getDay(date);

      const sortedTables = [...tables].sort((a, b) => {
        const aa = day.get(Number(a.idtaula)) || dayStart;
        const bb = day.get(Number(b.idtaula)) || dayStart;
        return aa - bb || Number(a.numero) - Number(b.numero);
      });

      // Provem totes les combinacions consecutives dins l'ordre de disponibilitat;
      // per la mida habitual de torneig això és suficient i manté les taules compactes.
      for (let i = 0; i <= sortedTables.length - needed; i++) {
        const chosen = sortedTables.slice(i, i + needed);
        const ini = Math.max(...chosen.map(t => day.get(Number(t.idtaula)) || dayStart));
        const fi = ini + blockMinutes;

        if (fi <= dayEnd) {
          assigned = { date, chosen, ini, fi };
          break;
        }
      }

      if (!assigned) date = addDays(date, 1);
    }

    if (!assigned) {
      throw new Error(
        `No hi ha prou espai entre ${firstDate} i ${lastDate} per programar ${group.categoria_nom || 'la categoria'}.`
      );
    }

    out.push({
      idgrup: group.idgrup,
      idtaula: assigned.chosen[0].idtaula,
      taules: assigned.chosen.map(t => Number(t.idtaula)),
      data: assigned.date,
      hora_inici: minutesToTime(assigned.ini),
      hora_final: minutesToTime(assigned.fi),
      durada_partit: matchDuration
    });

    const day = getDay(assigned.date);
    for (const table of assigned.chosen) {
      day.set(Number(table.idtaula), assigned.fi);
    }
  }

  return out;
}

module.exports = { timeToMinutes, minutesToTime, isoDate, generateMaster, generateGlobalMaster };
