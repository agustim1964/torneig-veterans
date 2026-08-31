const { calculateGroupSizes, drawGroups } = require('./src/services/drawService');

for (const total of [32, 31, 30, 29, 27, 18]) {
  const participants = Array.from({ length: total }, (_, i) => ({
    idparticipant: i + 1,
    nom_mostrar: `Jugador ${i + 1}`,
    ranking: 1000 - i
  }));

  const groups = drawGroups(participants);

  console.log('\n========================================');
  console.log('Participants:', total);
  console.log('Mides:', calculateGroupSizes(total));
  console.log('Grups:', groups.map(g => ({
    grup: g.number,
    jugadors: g.participants.map(p => p.ranking)
  })));
}
