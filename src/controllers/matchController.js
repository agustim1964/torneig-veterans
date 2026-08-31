const db = require('../config/db');
const { buildGroupMatchOrder } = require('../services/matchService');
const { classifyGroup } = require('../services/classificationService');

async function getCategory(categoryId) {
  const [[category]] = await db.query(`
    SELECT c.*, comp.nom AS competicio_nom, comp.idcompeticio
    FROM categories c
    INNER JOIN competicions comp
      ON comp.idcompeticio = c.idcompeticio
    WHERE c.idcategoria = ?
  `, [categoryId]);
  return category;
}

exports.listByCategory = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await getCategory(categoryId);

  if (!category) return res.status(404).send('Categoria no trobada.');

  const [matches] = await db.query(`
    SELECT
      pa.*,
      g.numero AS grup_numero,
      p1.nom_mostrar AS participant1_nom,
      p2.nom_mostrar AS participant2_nom,
      t.numero AS taula_numero,
      t.nom AS taula_nom
    FROM partits pa
    INNER JOIN grups g ON g.idgrup = pa.idgrup
    LEFT JOIN participants p1 ON p1.idparticipant = pa.participant1
    LEFT JOIN participants p2 ON p2.idparticipant = pa.participant2
    LEFT JOIN taules t ON t.idtaula = pa.idtaula
    WHERE pa.idcategoria = ?
      AND pa.idgrup IS NOT NULL
    ORDER BY pa.data_hora, g.numero, pa.numero_partit
  `, [categoryId]);


  for (const match of matches) {
    const [games] = await db.query(`
      SELECT numero_joc, punts1, punts2
      FROM partit_jocs
      WHERE idpartit = ?
      ORDER BY numero_joc
    `, [match.idpartit]);

    match.jocs = games;
  }

  const [groups] = await db.query(`
    SELECT *
    FROM grups
    WHERE idcategoria = ?
    ORDER BY numero
  `, [categoryId]);

  const [allGameRows] = await db.query(`
    SELECT pj.*
    FROM partit_jocs pj
    INNER JOIN partits pa ON pa.idpartit = pj.idpartit
    WHERE pa.idcategoria = ?
      AND pa.idgrup IS NOT NULL
    ORDER BY pj.idpartit, pj.numero_joc
  `, [categoryId]);

  const groupedStandings = {};

  for (const group of groups) {
    const [participants] = await db.query(`
      SELECT p.idparticipant, p.nom_mostrar, p.ranking
      FROM grup_participants gp
      INNER JOIN participants p
        ON p.idparticipant = gp.idparticipant
      WHERE gp.idgrup = ?
      ORDER BY gp.ordre_visual
    `, [group.idgrup]);

    const groupMatches = matches.filter(m => m.idgrup === group.idgrup);
    const matchIds = new Set(groupMatches.map(m => m.idpartit));
    const groupGames = allGameRows.filter(g => matchIds.has(g.idpartit));

    groupedStandings[group.idgrup] = classifyGroup(
      participants,
      groupMatches,
      groupGames
    ).map(row => ({
      ...row,
      grup_numero: group.numero
    }));
  }

  res.render('matches/index', {
    category,
    matches,
    groupedStandings
  });
};

exports.generateGroups = async (req,res)=>{const categoryId=Number(req.params.categoryId),category=await getCategory(categoryId);const [groups]=await db.query(`SELECT g.*,pg.idtaula,pg.data,pg.hora_inici,pg.durada_partit FROM grups g LEFT JOIN programacio_grups pg ON pg.idgrup=g.idgrup WHERE g.idcategoria=? ORDER BY g.numero`,[categoryId]);if(groups.some(g=>!g.idtaula||!g.hora_inici))return res.status(400).send(`<h1>Falta programació</h1><p><a href="/schedule/competition/${category.idcompeticio}">Anar al màster</a></p>`);const cx=await db.getConnection();try{await cx.beginTransaction();await cx.query(`DELETE FROM partits WHERE idcategoria=? AND idgrup IS NOT NULL AND estat='PENDENT'`,[categoryId]);let num=1;for(const g of groups){const [ps]=await cx.query(`SELECT p.idparticipant,gp.ordre_visual FROM grup_participants gp JOIN participants p ON p.idparticipant=gp.idparticipant WHERE gp.idgrup=? ORDER BY gp.ordre_visual`,[g.idgrup]);const order=buildGroupMatchOrder(ps),[hh,mm]=String(g.hora_inici).split(':').map(Number),dt=g.data?new Date(g.data):new Date();dt.setHours(hh,mm,0,0);for(let i=0;i<order.length;i++){const when=new Date(dt.getTime()+i*Number(g.durada_partit||20)*60000);await cx.query(`INSERT INTO partits(idcategoria,idgrup,numero_partit,participant1,participant2,estat,idtaula,data_hora) VALUES(?,?,?,?,?,'PENDENT',?,?)`,[categoryId,g.idgrup,num++,order[i].participant1,order[i].participant2,g.idtaula,when]);}}await cx.commit();res.redirect(`/matches/category/${categoryId}`);}catch(e){await cx.rollback();throw e;}finally{cx.release();}};

exports.saveResult = async (req, res) => {
  const matchId = Number(req.params.id);
  const categoryId = Number(req.body.categoryId);

  const [[match]] = await db.query(`
    SELECT participant1, participant2
    FROM partits
    WHERE idpartit = ?
  `, [matchId]);

  if (!match) return res.status(404).send('Partit no trobat.');

  const games = [];

  for (let n = 1; n <= 5; n++) {
    const raw1 = req.body[`joc${n}_p1`];
    const raw2 = req.body[`joc${n}_p2`];

    if (
      raw1 !== undefined && raw1 !== '' &&
      raw2 !== undefined && raw2 !== ''
    ) {
      games.push({
        numero_joc: n,
        punts1: Number(raw1),
        punts2: Number(raw2)
      });
    }
  }

  let r1 = 0;
  let r2 = 0;

  for (const game of games) {
    if (game.punts1 > game.punts2) r1++;
    else if (game.punts2 > game.punts1) r2++;
  }

  let winner = null;
  if (r1 >= 3 && r1 > r2) winner = match.participant1;
  if (r2 >= 3 && r2 > r1) winner = match.participant2;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(`
      DELETE FROM partit_jocs
      WHERE idpartit = ?
    `, [matchId]);

    for (const game of games) {
      await connection.query(`
        INSERT INTO partit_jocs
          (idpartit, numero_joc, punts1, punts2)
        VALUES (?, ?, ?, ?)
      `, [
        matchId,
        game.numero_joc,
        game.punts1,
        game.punts2
      ]);
    }

    await connection.query(`
      UPDATE partits
      SET
        resultat1 = ?,
        resultat2 = ?,
        guanyador = ?,
        estat = ?
      WHERE idpartit = ?
    `, [
      r1,
      r2,
      winner,
      winner ? 'FINALITZAT' : 'PENDENT',
      matchId
    ]);

    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }

  res.redirect(`/matches/category/${categoryId}`);
};
