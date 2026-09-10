
const express=require("express"), http=require("http"), {Server}=require("socket.io"), path=require("path");
const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.static(path.join(__dirname,"public")));
const rooms=new Map();
const META={
 merlin:{n:"멀린",s:"good",img:"merlin-large.png"}, percival:{n:"퍼시벌",s:"good",img:"percival.png"},
 loyal:{n:"아서 왕의 충신",s:"good",img:"loyal-1.png"}, assassin:{n:"암살자",s:"evil",img:"assassin.png"},
 morgana:{n:"모르가나",s:"evil",img:"morgana.png"}, oberon:{n:"오베론",s:"evil",img:"oberon.png"},
 mordred:{n:"모드레드",s:"evil",img:"mordred.png"}
};
const SIZE={5:[2,3,2,3,3],6:[2,3,4,3,4],7:[2,3,3,4,4],8:[3,4,4,5,5],9:[3,4,4,5,5],10:[3,4,4,5,5]};
const uid=()=>Math.random().toString(36).slice(2,7).toUpperCase();
function roomView(r,p){
 const votes=Object.entries(r.votes).map(([id,v])=>({id,v}));
 return {code:r.code,phase:r.phase,round:r.round,host:r.host,players:r.ps.map(x=>({id:x.id,name:x.name,king:x.id===r.king,role:x.role})),
 team:r.team,teamSize:SIZE[r.ps.length]?.[r.round]||0,votes,missions:r.missions,failCount:r.failCount||0,
 win:r.win,assassinTarget:r.assassinTarget, me:{id:p.id,name:p.name,role:p.role,meta:p.role?META[p.role]:null,info:info(r,p)}};
}
function info(r,p){
 if(p.role==="merlin") return r.ps.filter(x=>META[x.role]?.s==="evil"&&x.role!=="mordred").map(x=>({name:x.name,role:META[x.role].n}));
 if(p.role==="percival") return r.ps.filter(x=>x.role==="merlin"||x.role==="morgana").map(x=>({name:x.name,amb:true}));
 if(META[p.role]?.s==="evil"&&p.role!=="oberon") return r.ps.filter(x=>META[x.role]?.s==="evil"&&x.id!==p.id&&x.role!=="oberon").map(x=>({name:x.name,role:META[x.role].n}));
 return [];
}
function emit(r){for(const p of r.ps)io.to(p.id).emit("state",roomView(r,p))}
function advanceKing(r){const i=r.order.indexOf(r.king);r.king=r.order[(i+1)%r.order.length]}
function create(name,socket){let c;do{c=uid()}while(rooms.has(c));const p={id:socket.id,name,role:null};const r={code:c,host:socket.id,ps:[p],phase:"lobby",round:0,king:null,order:[],team:[],votes:{},quests:[],missions:[],win:null};rooms.set(c,r);socket.join(c);socket.data.room=c;emit(r)}
io.on("connection",s=>{
 s.on("create",({name})=>create((name||"플레이어").slice(0,16),s));
 s.on("join",({code,name})=>{const r=rooms.get((code||"").toUpperCase());if(!r)return s.emit("err","방을 찾을 수 없습니다.");if(r.phase!=="lobby")return s.emit("err","이미 시작된 방입니다.");if(r.ps.length>=10)return s.emit("err","최대 10명입니다.");r.ps.push({id:s.id,name:(name||"플레이어").slice(0,16),role:null});s.join(r.code);s.data.room=r.code;emit(r)});
 s.on("setRoles",roles=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.phase!=="lobby")return;if(roles.length!==r.ps.length)return s.emit("err","역할 수가 인원수와 같아야 합니다.");r.roles=roles;emit(r)});
 s.on("start",()=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id)return;if(!r.roles||r.roles.length!==r.ps.length)return s.emit("err","역할을 인원수에 맞게 선택하세요.");const a=[...r.roles].sort(()=>Math.random()-.5);r.ps.forEach((p,i)=>p.role=a[i]);r.order=r.ps.map(p=>p.id);r.phase="kingPick";emit(r)});
 s.on("pickKing",id=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.phase!=="kingPick")return;if(!r.ps.some(p=>p.id===id))return;r.king=id;r.phase="team";emit(r)});
 s.on("toggleTeam",id=>{const r=rooms.get(s.data.room);if(!r||r.phase!=="team"||r.king!==s.id)return;const n=SIZE[r.ps.length][r.round];if(r.team.includes(id))r.team=r.team.filter(x=>x!==id);else if(r.team.length<n)r.team.push(id);emit(r)});
 s.on("startVote",()=>{const r=rooms.get(s.data.room);if(!r||r.king!==s.id||r.team.length!==SIZE[r.ps.length][r.round])return s.emit("err","원정대 인원을 맞춰주세요.");r.votes={};r.phase="vote";emit(r)});
 s.on("vote",v=>{const r=rooms.get(s.data.room);if(!r||r.phase!=="vote"||!["yes","no"].includes(v))return;r.votes[s.id]=v;emit(r);if(Object.keys(r.votes).length===r.ps.length){const yes=Object.values(r.votes).filter(x=>x==="yes").length;if(yes>r.ps.length/2){r.phase="quest";r.quests=[]}else{r.missions.push({round:r.round+1,team:[],result:"거부"});if(r.missions.filter(x=>x.result==="거부").length>=5){r.win="evil";r.phase="over"}else{advanceKing(r);r.team=[];r.round=r.round;r.phase="team"}}emit(r)}});
 s.on("quest",v=>{const r=rooms.get(s.data.room);if(!r||r.phase!=="quest"||!r.team.includes(s.id)||!["success","fail"].includes(v))return;const p=r.ps.find(x=>x.id===s.id);if(v==="fail"&&META[p.role].s==="good")return s.emit("err","선의 진영은 실패 카드를 낼 수 없습니다.");if(r.quests.some(x=>x.id===s.id))return;r.quests.push({id:s.id,v});emit(r);if(r.quests.length===r.team.length){const fails=r.quests.filter(x=>x.v==="fail").length;const bad=r.ps.length>=7&&r.round===3?fails>=2:fails>=1;r.missions.push({round:r.round+1,team:r.team.map(id=>r.ps.find(p=>p.id===id)?.name),result:bad?"실패":"성공"});const good=r.missions.filter(x=>x.result==="성공").length,evil=r.missions.filter(x=>x.result==="실패").length;if(good>=3){r.phase="assassination"}else if(evil>=3){r.win="evil";r.phase="over"}else{r.phase="roundEnd";r.last=bad?"실패":"성공"}emit(r)}});
 s.on("nextRound",()=>{const r=rooms.get(s.data.room);if(!r||r.host!==s.id||r.phase!=="roundEnd")return;r.round++;r.team=[];r.votes={};r.quests=[];advanceKing(r);r.phase="team";emit(r)});
 s.on("assassinate",id=>{const r=rooms.get(s.data.room);if(!r||r.phase!=="assassination"||s.id!==r.ps.find(p=>p.role==="assassin")?.id)return;r.assassinTarget=id;r.win=r.ps.find(p=>p.id===id)?.role==="merlin"?"evil":"good";r.phase="over";emit(r)});
 s.on("disconnect",()=>{const r=rooms.get(s.data.room);if(!r)return;r.ps=r.ps.filter(p=>p.id!==s.id);if(!r.ps.length)return rooms.delete(r.code);if(r.host===s.id)r.host=r.ps[0].id;if(r.king===s.id)r.king=r.ps[0].id;emit(r)})
});
server.listen(process.env.PORT||3000);
