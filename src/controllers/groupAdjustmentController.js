const db = require('../config/db');
const crypto = require('crypto');
const { isoDate } = require('../services/scheduleService');
const { MARKER } = require('../services/excelMasterService');
const { newGroupMatches, scheduleNewMatches, conflict } = require('../services/groupAdjustmentService');

async function load(cx, id, lock = false) {
  const [[group]] = await cx.query(`SELECT g.*,c.nom AS categoria_nom,c.idcompeticio,
    COALESCE(pg.durada_partit,cc.durada_partit_grups,20) AS duration,comp.data_inici,comp.data_fi
    FROM grups g JOIN categories c ON c.idcategoria=g.idcategoria
    JOIN competicions comp ON comp.idcompeticio=c.idcompeticio
    LEFT JOIN configuracio_competicio cc ON cc.idcompeticio=c.idcompeticio
    LEFT JOIN programacio_grups pg ON pg.idgrup=g.idgrup WHERE g.idgrup=? ${lock?'FOR UPDATE':''}`, [id]);
  if (!group) throw new Error('Grup no trobat.');
  if (lock) {
    await cx.query('SELECT idcompeticio FROM competicions WHERE idcompeticio=? FOR UPDATE',[group.idcompeticio]);
    await cx.query('SELECT idgrup FROM grups WHERE idgrup=? FOR UPDATE',[id]);
  }
  const [roster] = await cx.query(`SELECT p.*,gp.ordre_visual FROM grup_participants gp JOIN participants p ON p.idparticipant=gp.idparticipant
    WHERE gp.idgrup=? ORDER BY gp.ordre_visual`,[id]);
  const [available] = await cx.query(`SELECT p.* FROM participants p WHERE p.idcategoria=? AND p.actiu=1 AND p.baixa=0
    AND NOT EXISTS (SELECT 1 FROM grup_participants gp WHERE gp.idparticipant=p.idparticipant) ORDER BY p.nom_mostrar`,[group.idcategoria]);
  const [matches] = await cx.query('SELECT * FROM partits WHERE idgrup=? ORDER BY numero_partit',[id]);
  const [tables] = await cx.query('SELECT * FROM taules WHERE activa=1 ORDER BY numero');
  const [phases] = await cx.query('SELECT idfase FROM fases WHERE idcategoria=?',[group.idcategoria]);
  const [games] = await cx.query('SELECT pj.idpartit FROM partit_jocs pj JOIN partits p ON p.idpartit=pj.idpartit WHERE p.idgrup=?',[id]);
  return { group,roster,available,matches,tables,phases,games,isoDate };
}
async function occupancy(cx) {
  const [busy] = await cx.query(`SELECT pa.*,COALESCE(pg.durada_partit,IF(pa.idgrup IS NULL,cc.durada_partit_eliminatories,cc.durada_partit_grups),20) AS duration
    FROM partits pa JOIN categories c ON c.idcategoria=pa.idcategoria
    LEFT JOIN configuracio_competicio cc ON cc.idcompeticio=c.idcompeticio
    LEFT JOIN programacio_grups pg ON pg.idgrup=pa.idgrup WHERE pa.data_hora IS NOT NULL AND pa.idtaula IS NOT NULL`);
  const [reserved] = await cx.query(`SELECT CONCAT(DATE_FORMAT(pg.data,'%Y-%m-%d'),' ',pg.hora_inici) AS data_hora,
    COALESCE(pgt.idtaula,pg.idtaula) AS idtaula,TIME_TO_SEC(TIMEDIFF(pg.hora_final,pg.hora_inici))/60 AS duration
    FROM programacio_grups pg LEFT JOIN programacio_grup_taules pgt ON pgt.idprogramacio=pg.idprogramacio
    WHERE pg.data IS NOT NULL AND NOT EXISTS (SELECT 1 FROM partits pa WHERE pa.idgrup=pg.idgrup)`);
  const [links] = await cx.query('SELECT idparticipant,idjugador FROM participant_jugadors');
  const members = new Map();
  for (const link of links) { if (!members.has(link.idparticipant)) members.set(link.idparticipant,[]); members.get(link.idparticipant).push(link.idjugador); }
  return { busy:[...busy,...reserved],members };
}
function editable(data) {
  if (data.games.length || data.matches.some(m => m.estat!=='PENDENT' || m.guanyador || Number(m.resultat1) || Number(m.resultat2))) throw new Error('Aquest grup té partits començats o resultats desats.');
}
function options(body, data) {
  const tableId = Number(body.tableId);
  if (!data.tables.some(t=>t.idtaula===tableId)) throw new Error('Tria una taula activa.');
  if (body.date < isoDate(data.group.data_inici) || body.date > isoDate(data.group.data_fi)) throw new Error('La data ha de ser dins de la competició.');
  return { date:body.date,start:body.start,end:body.end,tableId,duration:Number(data.group.duration) };
}
async function plan(cx,data,body) {
  editable(data);
  if (data.phases.length) throw new Error('La categoria ja té fases finals creades. Cal revisar-les abans de canviar-ne els classificats.');
  const participantId=Number(body.participantId);
  if (!data.available.some(p=>p.idparticipant===participantId)) throw new Error('Tria un participant actiu de la categoria que encara no tingui grup.');
  let matches=newGroupMatches(data.roster,participantId,data.matches);
  if (!data.matches.length) {
    const { buildGroupMatchOrder,assignGroupReferees }=require('../services/matchService');
    matches=assignGroupReferees(buildGroupMatchOrder([...data.roster,{idparticipant:participantId,ordre_visual:Math.max(...data.roster.map(p=>p.ordre_visual))+1}]),[...data.roster,{idparticipant:participantId}]);
  } else if (data.matches.length !== data.roster.length*(data.roster.length-1)/2) throw new Error('Falten partits del grup actual. Cal completar-los abans de l’alta.');
  if (body.mode==='auto') { const {busy,members}=await occupancy(cx); matches=scheduleNewMatches(matches,busy,members,options(body,data)); }
  else if (body.mode!=='manual') throw new Error('Mode no vàlid.');
  const digest=crypto.createHash('sha256').update(JSON.stringify({roster:data.roster.map(p=>p.idparticipant),existing:data.matches,matches})).digest('hex');
  return { matches,digest,participantId };
}
async function syncSchedule(cx,group) {
  const [[first]]=await cx.query('SELECT idtaula,data_hora FROM partits WHERE idgrup=? AND idtaula IS NOT NULL AND data_hora IS NOT NULL ORDER BY data_hora LIMIT 1',[group.idgrup]);
  if (!first) return;
  const d=new Date(first.data_hora),minute=d.getHours()*60+d.getMinutes();
  const {minutesToTime}=require('../services/scheduleService');
  await cx.query(`INSERT INTO programacio_grups (idgrup,idtaula,data,hora_inici,hora_final,durada_partit,bloquejada,observacions)
    VALUES (?,?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE observacions=VALUES(observacions),bloquejada=1`,
    [group.idgrup,first.idtaula,isoDate(d),minutesToTime(minute),minutesToTime(minute+Number(group.duration)),group.duration,`${MARKER}: horari gestionat per partit`]);
}
exports.show=async(req,res)=>res.render('groups/adjust', { ...await load(db,Number(req.params.id)),preview:null,body:{},message:req.query.saved?'Canvis desats. Les actes i el màster reflecteixen els partits programats.':null });
exports.preview=async(req,res)=>{ const data=await load(db,Number(req.params.id));res.render('groups/adjust',{...data,preview:await plan(db,data,req.body),body:req.body,message:null}); };
exports.add=async(req,res)=>{
  const cx=await db.getConnection();try { await cx.beginTransaction();const data=await load(cx,Number(req.params.id),true);const planned=await plan(cx,data,req.body);
    if(planned.digest!==req.body.digest)throw new Error('La proposta ha canviat. Torna a previsualitzar abans de desar.');
    const position=Math.max(...data.roster.map(p=>Number(p.ordre_visual)))+1;
    await cx.query('INSERT INTO grup_participants (idgrup,idparticipant,posicio_sorteig,ordre_visual) VALUES (?,?,?,?)',[data.group.idgrup,planned.participantId,position,position]);
    const [[max]]=await cx.query('SELECT COALESCE(MAX(numero_partit),0) n FROM partits WHERE idcategoria=?',[data.group.idcategoria]);let number=Number(max.n);
    for(const m of planned.matches)await cx.query(`INSERT INTO partits (idcategoria,idgrup,numero_partit,participant1,participant2,idarbitre_participant,estat,idtaula,data_hora)
      VALUES (?,?,?,?,?,?,'PENDENT',?,?)`,[data.group.idcategoria,data.group.idgrup,++number,m.participant1,m.participant2,m.idarbitre_participant,m.idtaula||null,m.data_hora||null]);
    await syncSchedule(cx,data.group);
    await cx.query("INSERT INTO log_canvis (accio,entitat,identitat,descripcio) VALUES ('ALTA_MANUAL_GRUP','grup',?,?)",[data.group.idgrup,`Participant ${planned.participantId}: ${planned.matches.length} partits nous. Horaris existents conservats.`]);
    await cx.commit();res.redirect(`/groups/${data.group.idgrup}/adjust?saved=1`);
  }catch(e){await cx.rollback();throw e;}finally{cx.release();}
};
exports.schedule=async(req,res)=>{
  const cx=await db.getConnection();try{await cx.beginTransaction();const data=await load(cx,Number(req.params.id),true);editable(data);
    const m=data.matches.find(m=>m.idpartit===Number(req.body.matchId));if(!m)throw new Error('Partit no trobat al grup.');
    const opts=options(req.body,data);const referee=Number(req.body.refereeId);
    if(!data.roster.some(p=>p.idparticipant===referee)||[m.participant1,m.participant2].includes(referee))throw new Error('L’àrbitre ha de ser un altre component del grup.');
    const when=`${opts.date} ${req.body.start}:00`;
    if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:00$/.test(when)||!Number.isFinite(new Date(when.replace(' ','T')).getTime()))throw new Error('Hora no vàlida.');
    const candidate={...m,data_hora:when,idtaula:opts.tableId,idarbitre_participant:referee};const {busy,members}=await occupancy(cx);
    if(conflict(candidate,busy,members,opts.duration))throw new Error('La taula, un jugador o l’àrbitre ja tenen un partit en aquesta franja.');
    await cx.query('UPDATE partits SET data_hora=?,idtaula=?,idarbitre_participant=? WHERE idpartit=?',[when,opts.tableId,referee,m.idpartit]);await syncSchedule(cx,data.group);
    await cx.query("INSERT INTO log_canvis (accio,entitat,identitat,descripcio) VALUES ('AJUST_HORARI_PARTIT','partit',?,?)",[m.idpartit,`${when}; taula ${opts.tableId}; àrbitre ${referee}`]);
    await cx.commit();res.redirect(`/groups/${data.group.idgrup}/adjust?saved=1`);
  }catch(e){await cx.rollback();throw e;}finally{cx.release();}
};
