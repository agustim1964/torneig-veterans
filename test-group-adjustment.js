const assert=require('assert');
const ejs=require('ejs');
const path=require('path');
const { newGroupMatches,scheduleNewMatches,conflict }=require('./src/services/groupAdjustmentService');
const { buildGroupMatchOrder,assignGroupReferees }=require('./src/services/matchService');
const db=require('./src/config/db');
const controller=require('./src/controllers/groupAdjustmentController');

async function run(){
  const roster=[1,2,3,4].map(id=>({idparticipant:id,ordre_visual:id,nom_mostrar:`Jugador ${id}`}));
  const existing=assignGroupReferees(buildGroupMatchOrder(roster),roster).map((m,i)=>({...m,idpartit:10+i,estat:'PENDENT',data_hora:`2026-10-28 11:${String(i*5).padStart(2,'0')}:00`,idtaula:1}));
  const snapshot=JSON.stringify(existing);
  const added=newGroupMatches(roster,5,existing);
  assert.strictEqual(added.length,4);
  assert.strictEqual(new Set(added.map(m=>m.participant1)).size,4);
  assert(added.every(m=>m.participant2===5&&![m.participant1,5].includes(m.idarbitre_participant)));
  assert.strictEqual(JSON.stringify(existing),snapshot);
  assert.throws(()=>newGroupMatches(roster,1,existing),/ja és/);
  assert.throws(()=>newGroupMatches(Array.from({length:8},(_,i)=>({idparticipant:i+1})),9,[]),/entre 2 i 7/);
  const options={date:'2026-10-29',start:'15:00',end:'17:00',tableId:2,duration:20};
  const busy=[{participant1:90,participant2:91,idtaula:2,data_hora:'2026-10-29 15:00:00',duration:20}];
  const planned=scheduleNewMatches(added,busy,new Map(),options);
  assert.strictEqual(planned[0].data_hora,'2026-10-29 15:20:00');
  assert.strictEqual(planned.at(-1).data_hora,'2026-10-29 16:20:00');
  assert.throws(()=>scheduleNewMatches(added,busy,new Map(),{...options,end:'15:40'}),/No hi caben/);
  assert.throws(()=>scheduleNewMatches(added,busy,new Map(),{...options,end:'14:00'}),/no vàlida/);
  const candidate={idpartit:100,participant1:1,participant2:5,idarbitre_participant:2,idtaula:3,data_hora:'2026-10-29 15:10:00'};
  assert(conflict(candidate,[{participant1:77,idarbitre_participant:2,idtaula:4,data_hora:'2026-10-29 15:00:00',duration:20}],new Map(),20));
  assert(conflict(candidate,[{participant1:77,idtaula:4,data_hora:'2026-10-29 15:00:00',duration:20}],new Map([[1,[999]],[77,[999]]]),20));
  assert(!conflict(candidate,[{...candidate}],new Map(),20),'Editar el mateix partit no crea un conflicte amb si mateix');
  assert(!conflict(candidate,[{participant1:1,idtaula:3,data_hora:'2026-10-29 14:50:00',duration:20}],new Map(),20),'Franges adjacents no se solapen');

  const group={idgrup:10,idcategoria:20,idcompeticio:6,categoria_nom:'M40',numero:1,duration:20,data_inici:'2026-10-24',data_fi:'2026-11-01'};
  const available=[{idparticipant:5,nom_mostrar:'Jugador nou'}];
  const tables=[{idtaula:1,numero:1,nom:'Taula 1'},{idtaula:2,numero:2,nom:'Taula 2'}];
  let committed=false,rolled=false;const inserts=[];
  const fake={
    beginTransaction:async()=>{},commit:async()=>{committed=true},rollback:async()=>{rolled=true},release:()=>{},
    query:async(sql,params)=>{
      if(sql.includes('SELECT g.*,c.nom'))return [[group]];
      if(sql.includes('SELECT p.*,gp.ordre_visual'))return [roster];
      if(sql.includes('SELECT p.* FROM participants'))return [available];
      if(sql.includes('SELECT * FROM partits WHERE idgrup'))return [existing];
      if(sql.includes('SELECT * FROM taules'))return [tables];
      if(sql.includes('SELECT idfase')||sql.includes('SELECT pj.idpartit'))return [[]];
      if(sql.includes('MAX(numero_partit)'))return [[{n:6}]];
      if(sql.includes('SELECT idtaula,data_hora'))return [[]];
      if(sql.startsWith('INSERT'))inserts.push({sql,params});
      return [[]];
    }
  };
  db.query=fake.query;db.getConnection=async()=>fake;
  let preview;
  const body={participantId:'5',mode:'manual'};
  await controller.preview({params:{id:'10'},body},{render:(view,data)=>{preview=data}});
  assert.strictEqual(preview.preview.matches.length,4);
  const html=await ejs.renderFile(path.join(__dirname,'src/views/groups/adjust.ejs'),preview);
  assert(html.includes('Confirmar alta')&&html.includes('Jugador nou'));
  await assert.rejects(controller.add({params:{id:'10'},body:{...body,digest:'stale'}},{}),/proposta ha canviat/);
  assert(rolled&&!committed);
  assert.strictEqual(inserts.length,0);
  let redirected;
  await controller.add({params:{id:'10'},body:{...body,digest:preview.preview.digest}},{redirect:url=>{redirected=url}});
  assert(committed);
  assert.strictEqual(inserts.filter(i=>i.sql.includes('INSERT INTO partits')).length,4);
  assert.strictEqual(inserts.filter(i=>i.sql.includes('INSERT INTO grup_participants')).length,1);
  assert.strictEqual(redirected,'/groups/10/adjust?saved=1');
  assert.strictEqual(JSON.stringify(existing),snapshot);
  console.log('Ajustos de grup: alta amb vista prèvia, conservació de partits, conflictes, rollback i horaris verificats.');
}
run().catch(error=>{console.error(error);process.exitCode=1});
