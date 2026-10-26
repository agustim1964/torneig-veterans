const assert = require('assert');
const ExcelJS = require('exceljs');
const { readMasterSlots, buildExcelMatches, expandExcelScheduleRows } = require('./src/services/excelMasterService');

async function run() {
  const workbook = new ExcelJS.Workbook();
  const dates = { DIMECRES: '2026-10-28', DIJOUS: '2026-10-29' };
  for (const [name, lengths] of [['DIMECRES', [4, 7]], ['DIJOUS', [2, 3]]]) {
    const sheet = workbook.addWorksheet(name);
    sheet.getCell('B4').value = 1; sheet.getCell('C4').value = 2;
    for (let i = 0; i < Math.max(...lengths); i++) {
      sheet.getRow(5 + i).getCell(1).value = new Date(Date.UTC(1899, 11, 30, 15, i * 20));
      if (i < lengths[0]) sheet.getRow(5 + i).getCell(2).value = 'G1M40';
      if (i < lengths[1]) sheet.getRow(5 + i).getCell(3).value = 'G1F40';
    }
  }
  const slots = readMasterSlots(workbook, dates, [{ numero: 1, idtaula: 10, activa: 1 }, { numero: 2, idtaula: 20, activa: 1 }]);
  const groups = [{ idgrup: 1, idcategoria: 1, categoria_nom: 'M40', numero: 1 }, { idgrup: 2, idcategoria: 2, categoria_nom: 'F40', numero: 1 }];
  const participants = Array.from({ length: 9 }, (_, i) => ({ idparticipant: i + 1, idgrup: i < 4 ? 1 : 2, ordre_visual: i < 4 ? i + 1 : i - 3, actiu: 1, baixa: 0 }));
  const members = participants.map(p => ({ idparticipant: p.idparticipant, idjugador: p.idparticipant }));
  const matches = buildExcelMatches(slots, groups, participants, members);
  assert.strictEqual(matches.length, 16);
  for (const group of groups) {
    const planned = matches.filter(m => m.idgrup === group.idgrup);
    const pairs = new Set(planned.map(m => [m.participant1, m.participant2].sort((a,b) => a-b).join('/')));
    assert.strictEqual(pairs.size, planned.length);
    for (const date of Object.values(dates)) {
      const playing = new Set(planned.filter(m => m.date === date).flatMap(m => [m.participant1, m.participant2]));
      assert.strictEqual(playing.size, group.idgrup === 1 ? 4 : 5);
    }
    for (const m of planned) assert(![m.participant1, m.participant2].includes(m.idarbitre_participant));
  }
  assert.throws(() => buildExcelMatches(slots.slice(1), groups, participants, members), /franges/);
  assert.throws(() => buildExcelMatches([{ ...slots[0], label: 'G99M40' }, ...slots.slice(1)], groups, participants, members), /no sortejat/);
  assert.throws(() => buildExcelMatches(slots, groups, participants, [...members, { idparticipant: 5, idjugador: 1 }]), /Solapament/);
  const friday = workbook.addWorksheet('DIVENDRES');
  friday.getCell('B4').value = 1;
  friday.getCell('C4').value = 2;
  for (let i = 0; i < 6; i++) {
    friday.getCell(5 + i, 1).value = new Date(Date.UTC(1899, 11, 30, 9, i * 20));
    friday.getCell(5 + i, 2).value = 'G1PARKM';
    friday.getCell(5 + i, 3).value = 'G1PARKDB';
  }
  const parkSlots = readMasterSlots(workbook, { DIVENDRES: '2026-10-30' }, [{ numero: 1, idtaula: 10, activa: 1 }, { numero: 2, idtaula: 20, activa: 1 }]);
  const parkGroups = [{ idgrup: 1, idcategoria: 1, categoria_nom: 'PARKINSONM', numero: 1 }, { idgrup: 2, idcategoria: 2, categoria_nom: 'PARKINSONDB', numero: 1 }];
  const parkParticipants = participants.slice(0, 8).map((p, i) => ({ ...p, idgrup: i < 4 ? 1 : 2 }));
  const parkMatches = buildExcelMatches(parkSlots, parkGroups, parkParticipants, []);
  assert.strictEqual(parkMatches.length, 12);
  assert(parkMatches.every(m => m.date === '2026-10-30' && m.idarbitre_participant && ![m.participant1, m.participant2].includes(m.idarbitre_participant)));
  const rows = [{ idgrup: 1, idprogramacio: 1, observacions: 'MASTER_EXCEL', durada_partit: 20 }];
  const expanded = await expandExcelScheduleRows({ query: async () => [matches.filter(m => m.idgrup === 1).map(m => ({ ...m, data_hora: new Date(m.data_hora.replace(' ', 'T')), taula_numero: 1 }))] }, rows, 1);
  assert.strictEqual(expanded.length, 2);
  assert.strictEqual(expanded[0].hora_final, '16:20:00');
  assert.strictEqual(expanded[1].data, dates.DIJOUS);
  assert.strictEqual(expanded[1].hora_final, '15:40:00');
  console.log('Màster Excel: cobertura dels dos dies, partits únics, arbitratges, conflictes i blocs horaris correctes.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
