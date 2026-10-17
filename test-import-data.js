const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { _test } = require('./src/controllers/participantController');

async function run() {
  assert.strictEqual(_test.normalizeHeader('Data naixement'), 'data_naixement');
  assert.strictEqual(_test.normalizeHeader('País'), 'pais');

  assert.strictEqual(_test.parseBirthDate('28/06/1966'), '1966-06-28');
  assert.strictEqual(_test.parseBirthDate('1966-06-28'), '1966-06-28');
  assert.strictEqual(_test.parseBirthDate(24286), '1966-06-28');
  assert.strictEqual(_test.parseBirthDate('31/02/2020'), null);
  assert.strictEqual(_test.parseBirthDate(''), null);

  assert.strictEqual(_test.parseActive(1), 1);
  assert.strictEqual(_test.parseActive('sí'), 1);
  assert.strictEqual(_test.parseActive('inactiu'), 0);
  assert.strictEqual(_test.parseActive('0'), 0);
  assert.strictEqual(_test.parseActive(''), 1);
  assert.strictEqual(_test.parseActive('pendent'), null);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'torneig-import-'));
  const tempFile = path.join(tempDir, 'prova.xlsx');

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('IMPORT');
    sheet.addRow(['Nom', 'Cognoms', 'Data naixement', 'Actiu']);
    sheet.addRow(['Joan', 'Prova', new Date(Date.UTC(1966, 5, 28)), 0]);
    sheet.getCell('C2').numFmt = 'dd/mm/yyyy';
    await workbook.xlsx.writeFile(tempFile);

    const rows = await _test.readXlsx(tempFile);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].nom, 'Joan');
    assert.strictEqual(rows[0].cognoms, 'Prova');
    assert.strictEqual(_test.parseBirthDate(rows[0].data_naixement), '1966-06-28');
    assert.strictEqual(_test.parseActive(rows[0].actiu), 0);
    assert.strictEqual(rows[0].__rowNumber, 2);

    // Reproduce Excel files with prefixed XML and absolute table relationships.
    sheet.addTable({
      name: 'Import_Test', ref: 'A1', headerRow: true,
      columns: ['Nom', 'Cognoms', 'Data naixement', 'Actiu'].map(name => ({ name })),
      rows: [['Joan', 'Prova', '28/06/1966', 0]]
    });
    const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    for (const name of Object.keys(zip.files).filter(name => name.endsWith('.xml'))) {
      const xml = await zip.file(name).async('string');
      if (!xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) continue;
      zip.file(name, xml
        .replace(/<(\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, '<$1x:$2')
        .replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'));
    }
    const relName = 'xl/worksheets/_rels/sheet1.xml.rels';
    zip.file(relName, (await zip.file(relName).async('string'))
      .replace('Target="../tables/table1.xml"', 'Target="/xl/tables/table1.xml"'));
    fs.writeFileSync(tempFile, await zip.generateAsync({ type: 'nodebuffer' }));
    const compatibleRows = await _test.readXlsx(tempFile);
    assert.strictEqual(compatibleRows.length, 1);
    assert.strictEqual(compatibleRows[0].nom, 'Joan');
    assert.strictEqual(_test.parseBirthDate(compatibleRows[0].data_naixement), '1966-06-28');
    assert.strictEqual(_test.parseActive(compatibleRows[0].actiu), 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('Proves d’importació correctes.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
