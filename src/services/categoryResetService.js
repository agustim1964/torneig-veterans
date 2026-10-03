// El caller gestiona la transacció: comprovacions i eliminacions són atòmiques.
async function hasFinishedKnockoutMatches(connection, categoryId) {
  const [[stats]] = await connection.query(`
    SELECT COUNT(*) AS total
    FROM partits pa
    INNER JOIN fases f ON f.idfase = pa.idfase
    WHERE f.idcategoria = ?
      AND f.tipus = 'ELIMINATORIA'
      AND pa.estat = 'FINALITZAT'
      AND COALESCE(pa.bye, 0) = 0
  `, [categoryId]);
  return Number(stats.total || 0) > 0;
}

async function deleteCategoryDraw(connection, categoryId) {
  const statements = [
    `DELETE pa FROM partits pa
     INNER JOIN fases f ON f.idfase = pa.idfase
     WHERE f.idcategoria = ?`,
    `DELETE qp FROM quadre_posicions qp
     INNER JOIN fases f ON f.idfase = qp.idfase
     WHERE f.idcategoria = ?`,
    `DELETE cf FROM classificacions_fase cf
     INNER JOIN fases f ON f.idfase = cf.idfase_desti
     WHERE f.idcategoria = ?`,
    `DELETE r FROM rondes r
     INNER JOIN fases f ON f.idfase = r.idfase
     WHERE f.idcategoria = ?`,
    'DELETE FROM fases WHERE idcategoria = ?',
    `DELETE pa FROM partits pa
     INNER JOIN grups g ON g.idgrup = pa.idgrup
     WHERE g.idcategoria = ?`,
    `DELETE gp FROM grup_participants gp
     INNER JOIN grups g ON g.idgrup = gp.idgrup
     WHERE g.idcategoria = ?`,
    'DELETE FROM grups WHERE idcategoria = ?'
  ];
  for (const statement of statements) {
    await connection.query(statement, [categoryId]);
  }
}

module.exports = { hasFinishedKnockoutMatches, deleteCategoryDraw };
