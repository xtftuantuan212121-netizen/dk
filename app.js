/* 传播学打卡 · 逻辑
   间隔：D0 当晚 → D1 → D2 → D4 → D7 → D15 → D30 → D60
   过关往右一格；漏了退一格（最低退到 D1）明早重来；D7、D15 连续全对 → 出池（只剩 D30/D60 抽查）。 */

const EXAM = "2026-12-20";
const STAGES = [
  { k:"D0",  gap:0,  ask:"当晚：画链 + 掏关键词", short:"画链 · 关键词" },
  { k:"D1",  gap:1,  ask:"看卡名 → 掏钉子 + 关键词行，不要成稿", short:"关键词" },
  { k:"D2",  gap:1,  ask:"关键词再掏一遍，重点看上次漏的那几个词", short:"关键词" },
  { k:"D4",  gap:2,  ask:"★★★ 卡默成稿（350 字起），其余卡仍掏关键词", short:"成稿首默" },
  { k:"D7",  gap:3,  ask:"成稿第二默。全对 → 记 1/2", short:"成稿" },
  { k:"D15", gap:8,  ask:"成稿。这是出池前最后一关", short:"成稿" },
  { k:"D30", gap:15, ask:"出池卡关键词快抽，错了退回 D15", short:"关键词抽" },
  { k:"D60", gap:30, ask:"考前总滚：成稿", short:"考前总滚" },
];
const FINAL = STAGES.length; // 8 = 走完
const ABBR = { "控制研究":"控", "内容研究":"内", "效果研究":"效" };

let CARDS = [], BYID = {}, S = { cards:{}, days:{} };
let pickerOpen = false, editingMiss = null;

/* ---------- 日期 ---------- */
const pad = n => String(n).padStart(2,"0");
function ymd(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function parse(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(s,n){ const d=parse(s); d.setDate(d.getDate()+n); return ymd(d); }
function diffDays(a,b){ return Math.round((parse(a)-parse(b))/86400000); }
const TODAY = ymd(new Date());
const TOMORROW = addDays(TODAY,1);
const WEEK = "日一二三四五六";

/* ---------- 存取 ----------
   三种后端,自动选:GitHub(有令牌,云端,手机电脑同步) > 本地 serve.py(state.json) > 浏览器 */
let SERVER = false;
const GH = { owner:"xtftuantuan212121-netizen", repo:"dk-data", path:"state.json" };
let ghSha = null;
const token = () => localStorage.getItem("dk_token") || "";
const ghHeaders = () => ({ Authorization:`Bearer ${token()}`, Accept:"application/vnd.github+json", "If-None-Match":"" });
const b64e = s => btoa(unescape(encodeURIComponent(s)));
const b64d = s => decodeURIComponent(escape(atob(s.replace(/\n/g,""))));
async function ghLoad(){
  const r = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}?t=${Date.now()}`, {headers:ghHeaders(), cache:"no-store"});
  if (r.status===404) { ghSha=null; return {cards:{},days:{}}; }
  if (r.status===401 || r.status===403) throw new Error("令牌无效或没权限");
  if (!r.ok) throw new Error("GitHub "+r.status);
  const j = await r.json(); ghSha = j.sha; return JSON.parse(b64d(j.content));
}
async function ghSave(retry=true){
  const body = { message:`打卡 ${new Date().toISOString().slice(0,16)}`, content:b64e(JSON.stringify(S,null,1)) };
  if (ghSha) body.sha = ghSha;
  const r = await fetch(`https://api.github.com/repos/${GH.owner}/${GH.repo}/contents/${GH.path}`, {method:"PUT", headers:{...ghHeaders(),"Content-Type":"application/json"}, body:JSON.stringify(body)});
  if (r.status===409 || r.status===422) { // sha 过期:别处改过,拉新 sha 再推一次(以本机为准)
    if (!retry) throw new Error("冲突");
    await ghLoad(); return ghSave(false);
  }
  if (!r.ok) throw new Error("GitHub "+r.status);
  ghSha = (await r.json()).content.sha;
}

async function load(){
  if (window.CARDS_EMBED) CARDS = window.CARDS_EMBED;
  else CARDS = await (await fetch("cards.json")).json();
  CARDS.forEach(c => BYID[c.id]=c);
  const l = localStorage.getItem("dk_state");
  const local = l ? JSON.parse(l) : null;
  let remote = null;
  if (token()) {
    try { remote = await ghLoad(); SERVER = "github"; }
    catch(e){ loadError = e.message; }
  } else {
    try {
      const r = await fetch("state.json", {cache:"no-store"});
      if (r.ok && location.protocol!=="file:" && location.hostname==="localhost") { remote = await r.json(); SERVER = "local"; }
    } catch(e){}
  }
  // 取更新的那份(按最后改动时间);云端有而本机没有 → 用云端
  const pick = [remote, local].filter(x=>x && x.cards).sort((a,b)=>(b.updated||"").localeCompare(a.updated||""))[0];
  if (pick) S = pick;
  S.cards ||= {}; S.days ||= {};
  if (SERVER==="github" && pick && pick!==remote) saveNow(); // 本机更新 → 推上去
}
let loadError = "";
let saveT, saving=false, dirty=false;
function save(){
  clearTimeout(saveT);
  S.updated = new Date().toISOString();
  localStorage.setItem("dk_state", JSON.stringify(S));
  saveT = setTimeout(saveNow, 400);
}
async function saveNow(){
  if (!SERVER) { toast("已存(浏览器)"); return; }
  if (saving) { dirty=true; return; }
  saving = true;
  try {
    if (SERVER==="github") { await ghSave(); toast("已同步到云端 ✓"); }
    else { const r = await fetch("/state",{method:"POST",body:JSON.stringify(S)}); toast(r.ok?"已存 state.json":"存文件失败"); }
  } catch(e){ toast("云端同步失败:"+e.message+"(本机已存)"); }
  saving = false;
  if (dirty) { dirty=false; saveNow(); }
}
function exportState(){
  const blob = new Blob([JSON.stringify(S,null,1)],{type:"application/json"});
  const a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`state-${TODAY}.json`; a.click();
}
/* 今日日志:一条一发 */
function addLog(text){ const t=text.trim(); if(!t) return; (day().log ||= []).push({t:new Date().toTimeString().slice(0,5), x:t}); save(); render(); }
function delLog(i){ const l=day().log||[]; l.splice(i,1); save(); render(); }
/* 今天还要做:按科目分区,自带科目 */
const SUBJECTS = ["传播学","英语二","政治","其他"];
function addTodo(subj, text){ const t=text.trim(); if(!t) return; (day().todos ||= []).push({s:subj||"其他", x:t, ok:false}); save(); render(); }
function toggleTodo(i){ const l=day().todos||[]; if(l[i]) l[i].ok=!l[i].ok; save(); render(); }
function delTodo(i){ const l=day().todos||[]; l.splice(i,1); save(); render(); }
function askToken(){
  document.getElementById("app").insertAdjacentHTML("beforeend", `
  <div class="modal" id="modal"><div class="box2">
    <h2 class="serif">开启云端同步</h2>
    <p>贴一次令牌，这台设备就永久记住。进度存进你自己的私有仓库 <code>${GH.owner}/${GH.repo}</code>，手机电脑共用一份。</p>
    <input id="tok" type="password" placeholder="github_pat_…" autocomplete="off">
    <div class="row"><button id="tokok">保存并同步</button><button id="tokno">先不用</button></div>
    <p class="hint2">令牌只存在这个浏览器里，不会发给除 GitHub 以外的任何地方。</p>
  </div></div>`);
  const m = document.getElementById("modal");
  document.getElementById("tokno").onclick = () => m.remove();
  document.getElementById("tokok").onclick = async () => {
    const v = document.getElementById("tok").value.trim(); if (!v) return;
    localStorage.setItem("dk_token", v); loadError="";
    try { await ghLoad(); } catch(e){ localStorage.removeItem("dk_token"); alert("令牌不对或没权限："+e.message); return; }
    location.reload();
  };
}
function toast(t){ const el=document.getElementById("toast"); el.textContent=t; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),900); }

/* ---------- 状态推导 ---------- */
function cs(id){ return S.cards[id] || null; }   // {learned, stage, due, passes, hist:[]}
function day(d=TODAY){ return S.days[d] ||= { d0:[], gates:[false,false], d0done:false, rev:{} }; }

function dueToday(){
  // 今天该掏的：stage>=1 且 due<=today ；或今天已经评过的（保持显示）
  const td = day();
  return CARDS.filter(c => {
    const s = cs(c.id); if(!s || s.stage<1 || s.stage>=FINAL) return false;
    return s.due <= TODAY || td.rev[c.id];
  });
}
function groupByStage(list){
  const g = {};
  list.forEach(c => { const r = day().rev[c.id]; const st = r ? r.stage : cs(c.id).stage; (g[st] ||= []).push(c); });
  return Object.keys(g).map(Number).sort((a,b)=>a-b).map(st => ({st, cards: g[st]}));
}

/* 评卡：ok=true 过 / false 漏；再次点同一状态=撤销 */
function mark(id, ok, miss){
  const td = day(); const s = cs(id); if(!s) return;
  const prev = td.rev[id];
  if (prev) { // 撤销回原状态
    Object.assign(s, prev.before); delete td.rev[id];
    if (prev.ok === ok && miss===undefined) { save(); render(); return; }
  }
  const before = { stage:s.stage, due:s.due, passes:s.passes };
  const stage = s.stage;
  if (ok) {
    const ns = stage+1;
    s.passes = (stage>=4) ? (s.passes||0)+1 : 0;   // D7 起算连续全对
    s.stage = ns; s.due = ns<FINAL ? addDays(TODAY, STAGES[ns].gap) : null;
  } else {
    s.passes = 0;
    s.stage = Math.max(1, stage-1); s.due = TOMORROW;
  }
  s.hist = s.hist||[]; s.hist.push({d:TODAY, at:STAGES[stage].k, ok, miss: miss||""});
  td.rev[id] = { ok, miss: miss||"", stage, before };
  save(); render();
}
function setMiss(id, text){
  const td = day(); const r = td.rev[id]; if(!r) return;
  r.miss = text; const s = cs(id); const h = (s.hist||[]).slice().reverse().find(h=>h.d===TODAY); if(h) h.miss=text;
  save(); render();
}

/* 今晚 D0 */
function toggleTonight(id){
  const td = day(); if (td.d0done) return;
  const i = td.d0.indexOf(id);
  if (i>=0) td.d0.splice(i,1); else td.d0.push(id);
  save(); render();
}
function addChapter(board, chap){
  const td = day(); if (td.d0done) return;
  CARDS.filter(c=>c.board===board && c.chap===chap && !cs(c.id) && !td.d0.includes(c.id)).forEach(c=>td.d0.push(c.id));
  save(); render();
}
function toggleGate(i){ const td=day(); if(td.d0done) return; td.gates[i]=!td.gates[i]; save(); render(); }
function finishD0(){
  const td = day(); if (!(td.gates[0]&&td.gates[1]&&td.d0.length)) return;
  td.d0.forEach(id => { S.cards[id] = { learned:TODAY, stage:1, due:TOMORROW, passes:0, hist:[{d:TODAY,at:"D0",ok:true,miss:""}] }; });
  td.d0done = true; save(); render();
}
function undoD0(){
  const td = day(); if(!td.d0done) return;
  td.d0.forEach(id => { const s=cs(id); if (s && s.learned===TODAY) delete S.cards[id]; });
  td.d0done=false; save(); render();
}

/* 进度 */
function progress(list){
  let sum=0, out=0, learned=0;
  list.forEach(c => { const s=cs(c.id); if(!s) return; learned++; sum += Math.min(s.stage, FINAL); if (s.stage>=6) out++; });
  return { pct: list.length? sum/(list.length*FINAL)*100 : 0, out, learned, total:list.length };
}
function streakDots(){
  const arr=[]; for(let i=13;i>=0;i--){ const d=addDays(TODAY,-i); const td=S.days[d]; const act = td && (Object.keys(td.rev||{}).length || td.d0done); arr.push(act?"●":"○"); }
  return arr.join("");
}
function tomorrowPreview(){
  const td = day();
  const list = CARDS.filter(c => { const s=cs(c.id); return s && s.stage>=1 && s.stage<FINAL && s.due && s.due<=TOMORROW && !(s.due<=TODAY && !td.rev[c.id]); });
  const g = {}; list.forEach(c=>{ (g[cs(c.id).stage] ||= []).push(c.id); });
  const parts = Object.keys(g).map(Number).sort((a,b)=>a-b).map(st=>`${STAGES[st].k} ${g[st].join("、")}`);
  const d0n = td.d0done ? 0 : td.d0.length;
  if (d0n) parts.unshift(`D1 今晚这 ${d0n} 张`);
  const n = list.length + d0n;
  // 未来 7 天负荷
  const loads=[]; for(let i=2;i<=7;i++){ const dd=addDays(TODAY,i); loads.push(CARDS.filter(c=>{const s=cs(c.id);return s&&s.due===dd;}).length); }
  const mx = Math.max(...loads,0), mi = loads.indexOf(mx);
  return { parts, n, heavy: mx>=12 ? `${addDays(TODAY,mi+2).slice(5).replace("-","-")} 会滚到 ${mx} 张，那天前后新卡建议减到 2 张。` : "" };
}

load().then(() => {
  render();
  if (location.hash === "#selftest") selftest();
  else if (!token() && location.hostname.endsWith("github.io")) askToken();
});

/* 自测：打开 index.html#selftest，结果写进 <title>（不触碰真实 state.json） */
function selftest(){
  save = () => {};  // 不落盘
  const out = [];
  const t = (n, c) => out.push(`${c?"ok":"FAIL"} ${n}`);
  const id = "控1"; const s0 = cs(id);
  t("初始 D1", s0 && s0.stage===1);
  mark(id, true); t("过→D2 due 明天", cs(id).stage===2 && cs(id).due===TOMORROW);
  mark(id, false); t("改漏→退回 D1(最低)", cs(id).stage===1 && day().rev[id].ok===false);
  mark(id, false); t("再点同状态=撤销", !day().rev[id] && cs(id).stage===1);
  const e1 = "效1"; mark(e1, true); t("D7 过→passes 1, D15 due +8", cs(e1).passes===1 && cs(e1).stage===5 && cs(e1).due===addDays(TODAY,8));
  const n7 = "内7"; mark(n7, true); t("D15 第二次全对→出池 passes 2", cs(n7).passes===2 && cs(n7).stage===6);
  const e2 = "效2"; mark(e2, false); setMiss(e2, "测试漏"); t("漏记文字", day().rev[e2].miss==="测试漏" && cs(e2).stage===3);
  const td = day(); td.gates=[true,true]; finishD0(); t("D0 完成→4 张进 D1", td.d0done && td.d0.every(i=>cs(i)&&cs(i).stage===1&&cs(i).due===TOMORROW));
  undoD0(); t("撤销 D0", !td.d0done && td.d0.every(i=>!cs(i)));
  document.title = out.join(" | ");
}
