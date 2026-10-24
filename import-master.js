require('dotenv').config();
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');
const { isoDate } = require('./src/services/scheduleService');
const { MARKER, readMasterSlots, buildExcelMatches } = require('./src/services/excelMasterService');

async function run() {
  const file = process.argv[2];
  const competitionId = Number(process.argv[3]);
  if (!file || !competitionId) throw new Error('Ús: node import-master.js fitxer.xlsx idcompeticio [--apply]');
  const cx = await db.getConnection();
  let transaction = false;
  try {
    await cx.beginTransaction();
    transaction = true;
    const [[competition]] = await cx.query('SELECT * FROM competicions WHERE idcompeticio = ? FOR UPDATE', [competitionId]);
    if (!competition) throw new Error('Competició no trobada');
    const dates = {};
    const first = new Date(isoDate(competition.data_inici) + 'T12:00:00');
    const last = isoDate(competition.data_fi);
    for (let date = first; isoDate(date) <= last; date.setDate(date.getDate() + 1)) {
      const day = { 3: 'DIMECRES', 4: 'DIJOUS' }[date.getDay()];
      if (!day) continue;
      if (dates[day]) throw new Error('Les dates són ambigües: més d’un dimecres o dijous');
      dates[day] = isoDate(date);
    }
    if (Object.keys(dates).length !== 2) throw new Error('Falten les dates de dimecres i dijous');
    const [tables] = await cx.query('SELECT * FROM taules WHERE activa = 1 ORDER BY numero');
    const [groups] = await cx.query(`SELECT g.*, c.nom AS categoria_nom FROM grups g
      JOIN categories c ON c.idcategoria = g.idcategoria WHERE c.idcompeticio = ? ORDER BY c.idcategoria,g.numero FOR UPDATE`, [competitionId]);
    const [participants] = await cx.query(`SELECT gp.*,p.actiu,p.baixa,p.nom_mostrar FROM grup_participants gp
      JOIN participants p ON p.idparticipant=gp.idparticipant JOIN categories c ON c.idcategoria=p.idcategoria
      WHERE c.idcompeticio=? ORDER BY gp.idgrup,gp.ordre_visual`, [competitionId]);
    const [members] = await cx.query(`SELECT pj.* FROM participant_jugadors pj JOIN participants p ON p.idparticipant=pj.idparticipant
      JOIN categories c ON c.idcategoria=p.idcategoria WHERE c.idcompeticio=?`, [competitionId]);
    const [existing] = await cx.query(`SELECT pa.* FROM partits pa JOIN categories c ON c.idcategoria=pa.idcategoria
      WHERE c.idcompeticio=? FOR UPDATE`, [competitionId]);
    if (existing.length) throw new Error('Ja hi ha partits: la importació no els sobreescriu.');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);
    const slots = readMasterSlots(workbook, dates, tables);
    const matches = buildExcelMatches(slots, groups, participants, members);
    const summary = { competition: competition.nom, dates, groups: groups.length, matches: matches.length,
      days: Object.values(dates).map(date => ({ date, matches: matches.filter(m => m.date === date).length,
        end: require('./src/services/scheduleService').minutesToTime(Math.max(...matches.filter(m => m.date === date).map(m => m.minute)) + 20) })) };
    fs.mkdirSync('output', { recursive: true });
    fs.writeFileSync('output/master-import-preview.json', JSON.stringify({ summary, matches }, null, 2));
    console.log(JSON.stringify(summary));
    if (!process.argv.includes('--apply')) {
      await cx.rollback(); transaction = false;
      console.log('Validació correcta. Sense canvis a la base de dades.');
      return;
    }
    const [previousSchedule] = await cx.query(`SELECT pg.* FROM programacio_grups pg JOIN grups g ON g.idgrup=pg.idgrup
      JOIN categories c ON c.idcategoria=g.idcategoria WHERE c.idcompeticio=?`, [competitionId]);
    const [previousTables] = await cx.query(`SELECT pgt.* FROM programacio_grup_taules pgt JOIN programacio_grups pg ON pg.idprogramacio=pgt.idprogramacio
      JOIN grups g ON g.idgrup=pg.idgrup JOIN categories c ON c.idcategoria=g.idcategoria WHERE c.idcompeticio=?`, [competitionId]);
    const backup = path.join('output', `master-db-before-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify({ competition, groups, participants, members, existing, previousSchedule, previousTables }, null, 2));
    for (const group of groups) {
      const planned = matches.filter(m => m.idgrup === group.idgrup);
      const first = planned[0];
      const sameDay = planned.filter(m => m.date === first.date);
      const end = require('./src/services/scheduleService').minutesToTime(sameDay.at(-1).minute + 20);
      await cx.query(`INSERT INTO programacio_grups (idgrup,idtaula,data,hora_inici,hora_final,durada_partit,bloquejada,observacions)
        VALUES (?,?,?,?,?,20,1,?) ON DUPLICATE KEY UPDATE idtaula=VALUES(idtaula),data=VALUES(data),hora_inici=VALUES(hora_inici),
        hora_final=VALUES(hora_final),durada_partit=20,bloquejada=1,observacions=VALUES(observacions)`,
      [group.idgrup,first.idtaula,first.date,first.data_hora.slice(11),end,`${MARKER}: ${path.basename(file)}. Horari exacte a cada partit.`]);
      const [[pg]] = await cx.query('SELECT idprogramacio FROM programacio_grups WHERE idgrup=?', [group.idgrup]);
      await cx.query('DELETE FROM programacio_grup_taules WHERE idprogramacio=?', [pg.idprogramacio]);
      await cx.query('INSERT INTO programacio_grup_taules (idprogramacio,idtaula,ordre) VALUES (?,?,1)', [pg.idprogramacio,first.idtaula]);
      for (const m of planned) await cx.query(`INSERT INTO partits
        (idcategoria,idgrup,numero_partit,ronda_grup,participant1,participant2,idarbitre_participant,estat,idtaula,data_hora)
        VALUES (?,?,?,?,?,?,?,'PENDENT',?,?)`,
      [m.idcategoria,m.idgrup,m.numero_partit,m.ronda,m.participant1,m.participant2,m.idarbitre_participant,m.idtaula,m.data_hora]);
    }
    await cx.query(`INSERT INTO log_canvis (accio,entitat,identitat,descripcio) VALUES ('IMPORT_MASTER_EXCEL','competicio',?,?)`,
      [competitionId,`${matches.length} partits de ${groups.length} grups importats de ${path.basename(file)}. ${JSON.stringify(dates)}`]);
    await cx.commit(); transaction = false;
    console.log(`Importació desada. Còpia prèvia: ${backup}`);
  } finally {
    if (transaction) await cx.rollback();
    cx.release();
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
