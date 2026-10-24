require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const assert = require('assert');
const db = require('./src/config/db');
const groupController = require('./src/controllers/groupController');
const scheduleController = require('./src/controllers/scheduleController');

async function capture(controller, req) {
  let captured;
  await controller(req, {
    render(view, data) { captured = { view, data }; },
    status(code) { throw new Error(`HTTP ${code}`); }
  });
  assert(captured);
  return captured;
}

async function save(view, data, filename) {
  let html = await ejs.renderFile(path.join(__dirname, 'src/views', view + '.ejs'), data);
  const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'public/images/capcalera-fctt.png')).toString('base64');
  html = html.replaceAll('/images/capcalera-fctt.png', logo);
  fs.writeFileSync(filename, html);
}

async function run() {
  const id = Number(process.argv[2]);
  if (!id) throw new Error('Ús: node export-competition-print.js idcompeticio');
  const dir = path.join(__dirname, 'output', 'impressio');
  fs.mkdirSync(dir, { recursive: true });
  const [categories] = await db.query('SELECT idcategoria,nom FROM categories WHERE idcompeticio=? ORDER BY tipus,sexe,edat_minima,nom', [id]);
  const sheets = [];
  for (const category of categories) {
    const result = await capture(groupController.printCategoryGroups, { params: { categoryId: category.idcategoria }, query: {} });
    for (const sheet of result.data.sheets) {
      assert(sheet.matches.length > 0);
      for (const match of sheet.matches) {
        assert(match.data_hora && match.taula_numero && match.participant1_nom && match.participant2_nom && match.arbitre_nom);
      }
    }
    sheets.push(...result.data.sheets);
    await save(result.view, result.data, path.join(dir, `Actes-${category.nom.replace(/[^\p{L}\p{N}-]/gu, '-')}.html`));
  }
  await save('groups/print', { pageTitle: 'Actes · SALOU 2026', sheets }, path.join(dir, 'Actes-tots-els-grups.html'));
  const master = await capture(scheduleController.print, { params: { competitionId: id } });
  assert.strictEqual(master.data.days.length, 2);
  const occupied = master.data.days.reduce((sum, day) => sum + day.slots.reduce((count, slot) => count + slot.cells.filter(Boolean).length, 0), 0);
  assert.strictEqual(occupied, sheets.reduce((sum, sheet) => sum + sheet.matches.length, 0));
  await save(master.view, master.data, path.join(dir, 'Master-competicio.html'));
  const screen = await capture(scheduleController.show, { params: { competitionId: id }, query: {} });
  await ejs.renderFile(path.join(__dirname, 'src/views', screen.view + '.ejs'), screen.data);
  assert(screen.data.rows.every(row => row.excel_imported));
  console.log(JSON.stringify({ groups: sheets.length, matches: occupied, scheduleBlocks: screen.data.rows.length, output: dir }));
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
