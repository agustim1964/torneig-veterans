function buildGroupMatchOrder(participants){
 const o=[...participants].sort((a,b)=>Number(a.ordre_visual||0)-Number(b.ordre_visual||0)); const pos={}; o.forEach((p,i)=>pos[i+1]=p.idparticipant); const n=o.length; let pairs=[];
 if(n===3) pairs=[[1,3],[2,3],[1,2]];
 else if(n===4) pairs=[[1,4],[2,4],[1,3],[3,4],[1,2],[2,3]];
 else if(n===5) pairs=[[2,5],[3,4],[1,5],[2,3],[1,4],[5,3],[1,3],[4,2],[4,5],[1,2]];
 else for(let i=1;i<=n;i++) for(let j=i+1;j<=n;j++) pairs.push([i,j]);
 return pairs.map(([a,b],i)=>({ordre:i+1,participant1:pos[a],participant2:pos[b]}));
}
module.exports={buildGroupMatchOrder};
