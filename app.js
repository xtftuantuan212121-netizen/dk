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
function setNote(t){ day().note = t; save(); }   // 不 render,免得打字时丢焦点
function pastNotes(){
  const ds = Object.keys(S.days).filter(d=>d<TODAY && S.days[d].note).sort().reverse().slice(0,5);
  if (!ds.length) return "";
  return `<div class="past">${ds.map(d=>`<div><span>${d.slice(5)}</span>${esc(S.days[d].note)}</div>`).join("")}</div>`;
}
function askToken(){
  document.getElementById("app").insertAdjacentHTML("beforeend", `
  <div class="modal" id="modal"><div class="box">
    <h2 class="serif">开启云端同步</h2>
    <p>贴一次令牌，这台设备就永久记住。进度存进你自己的私有仓库 <code>${GH.owner}/${GH.repo}</code>，手机电脑共用一份。</p>
    <input id="tok" type="password" placeholder="github_pat_…" autocomplete="off">
    <div class="row"><button id="tokok">保存并同步</button><button id="tokno">先不用</button></div>
    <p class="hint">令牌只存在这个浏览器里，不会发给除 GitHub 以外的任何地方。</p>
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

/* ---------- 渲染 ---------- */
const esc = s => String(s).replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
function cardRow(c, r, s){
  const late = (!r && s.due < TODAY) ? `<span class="late">迟 ${diffDays(TODAY,s.due)} 天</span>` : "";
  const lastH = (s.hist||[]).filter(h=>h.d!==TODAY).slice(-1)[0];
  const last = lastH && lastH.at!=="D0" ? (lastH.ok ? `<span class="last">${lastH.at} 全对${s.passes&&!r?` ${s.passes}/2`:""}</span>` : `<span class="last bad">${lastH.at} 漏：${esc(lastH.miss||"未记")}</span>`) : "";
  const box = r ? (r.ok ? "ok" : "bad") : "";
  let missEl = "";
  if (r && !r.ok) {
    missEl = editingMiss===c.id
      ? `<input class="mi" data-miss="${c.id}" value="${esc(r.miss)}" placeholder="漏了什么，一行" autofocus>`
      : `<button class="miss" data-editmiss="${c.id}">${r.miss ? "漏："+esc(r.miss) : "记一下漏了什么"}</button>`;
  }
  return `<div class="card ${r?"done":""}">
    <button class="box ${box}" data-ok="${c.id}" title="点一下=过，再点=漏，再点=撤销"></button>
    <span class="n">${c.id}</span>
    <span class="t">${esc(c.title)}</span>${c.star?`<span class="star">${c.star}</span>`:""}
    ${late}${r?"":last}${missEl}
    <span class="src">${c.board} ${esc(c.chapShort)}</span>
  </div>`;
}

function render(){
  const app = document.getElementById("app");
  const td = day();
  const due = dueToday();
  const groups = groupByStage(due);
  const reviewed = due.filter(c=>td.rev[c.id]).length;
  const allDone = due.length>0 && reviewed===due.length;
  const P = progress(CARDS);
  const boards = Object.keys(ABBR).map(b => ({b, ...progress(CARDS.filter(c=>c.board===b))}));
  const hot = new Set(due.map(c=> (td.rev[c.id]?td.rev[c.id].stage:cs(c.id).stage)));
  if (td.d0.length) hot.add(0);
  const stageCount = st => CARDS.filter(c=>{const s=cs(c.id);return s&&s.stage===st;}).length;
  const dt = parse(TODAY);
  const tp = tomorrowPreview();
  const unlearned = CARDS.filter(c=>!cs(c.id));

  // 右栏：今晚
  const tonightCards = td.d0.map(id=>BYID[id]).filter(Boolean);
  const chapOfTonight = [...new Set(tonightCards.map(c=>`${c.board} ${c.chapShort}`))].join(" · ");
  let picker = "";
  if (pickerOpen && !td.d0done) {
    let cur = ""; const rows = [];
    unlearned.forEach(c => {
      const key = `${c.board}｜${c.chap}`;
      if (key!==cur) { cur=key; rows.push(`<div class="ch">${esc(c.board)} · ${esc(c.chap)} <button data-addch="${esc(c.board)}|||${esc(c.chap)}" style="margin-left:8px;text-decoration:underline">整章加入</button></div>`); }
      const inT = td.d0.includes(c.id);
      rows.push(`<div class="row"><span class="id">${c.id}</span><span>${esc(c.title)}</span><span class="op"><button data-pick="${c.id}">${inT?"移出":"加入"}</button></span></div>`);
    });
    picker = `<div class="picker">${rows.join("")||'<div class="empty">86 张全学过了。</div>'}</div>`;
  }

  app.innerHTML = `
  <div class="head">
    <div class="date serif">${dt.getMonth()+1}月${dt.getDate()}日<small>周${WEEK[dt.getDay()]} · 考前 ${diffDays(EXAM,TODAY)} 天</small></div>
    <div class="count">
      <span><b class="serif">${reviewed}</b>/ ${due.length} 今早已掏 ${allDone?'<span class="ok">✓ 清空</span>':''}</span>
      <span><b class="serif">${td.d0done?td.d0.length:td.d0.length}</b>张今晚新学 ${td.d0done?'<span class="ok">✓</span>':''}</span>
      <span><b class="serif">${P.out}</b>/ ${P.total} 已出池</span>
    </div>
  </div>

  <div class="prog">
    <div>
      <div class="plabel"><span><b class="serif">${P.pct.toFixed(1)}%</b>总进度 · 86 张卡各走到第几格，加起来</span><span>已学 ${P.learned} / ${P.total} 张 · 未学 ${P.total-P.learned}</span></div>
      <div class="bar"><i style="width:${P.pct}%"></i></div>
      <div class="streak">近 14 天 <span class="dots">${streakDots()}</span>（● = 那天掏过或学过新卡）</div>
    </div>
    <div class="boards">${boards.map(x=>`<div><div class="plabel"><span><b>${x.pct.toFixed(0)}%</b> ${x.b}</span><span>${x.learned}/${x.total}</span></div><div class="bar thin"><i style="width:${x.pct}%"></i></div></div>`).join("")}</div>
  </div>

  <div class="wheel">${STAGES.map((s,i)=>`<div class="seg ${hot.has(i)?"hot":""}">${s.k}<em>${s.short}</em><u>${i===0?"":stageCount(i)+" 张在此"}</u></div>`).join("")}</div>
  <p class="legend">轮动规则：每过一关往右走一格；漏了不清零，退回上一格明早重走。D7、D15 连续两次全对的卡出池，只在 D30 / 考前抽查。黑点＝今天有卡停在这一格。</p>

  <div class="cols">
    <div>
      <h2 class="serif">今早要掏的</h2>
      <p class="sub">摘耳机、合稿。按组掏，每组开头那句是这一轮掏什么。掏完只标漏，不补讲。<br>方框点一下＝过，再点＝漏（会让你记一行漏了什么），再点＝撤销。</p>
      ${groups.length ? groups.map(g=>`
        <div class="grp">
          <div class="tag serif">${STAGES[g.st].k}<small>${g.cards.length} 张${g.st===1?"<br>昨晚学的":""}</small></div>
          <div><div class="ask">${STAGES[g.st].ask}</div>${g.cards.map(c=>cardRow(c, td.rev[c.id], cs(c.id))).join("")}</div>
        </div>`).join("")
        : `<div class="grp"><div></div><div class="empty big">${P.learned? "今早没有卡滚到。":"还没有卡。今晚在右边选第一批新卡，明早就会滚到这里。"}</div></div>`}
      ${allDone ? `<div class="grp"><div></div><div class="empty big">今早 ${due.length} 张清空。✓</div></div>` : ""}
    </div>

    <div>
      <div class="tonight ${td.d0done?"full":""}">
        <span class="ribbon">今晚 D0</span>
        <h2 class="serif">新学 ${td.d0.length} 张 ${td.d0done?"":`<button data-picker>${pickerOpen?"收起":"选卡 ▾"}</button>`}</h2>
        ${chapOfTonight?`<p class="sub" style="margin-bottom:10px;${td.d0done?"color:#bbb":""}">${esc(chapOfTonight)}</p>`:""}
        ${tonightCards.length ? tonightCards.map(c=>`<div class="card"><span class="box ${td.d0done?"ok":""}" style="${td.d0done?"border-color:#fff;background:#111":""}"></span><span class="n">${c.id}</span><span class="t">${esc(c.title)}</span>${td.d0done?"":`<button class="x" data-pick="${c.id}">移出</button>`}</div>`).join("")
          : `<div class="empty">还没选。点「选卡」从没学过的 ${unlearned.length} 张里挑今晚的（建议 3–5 张，同一章）。</div>`}
        ${picker}
        <div class="gates">
          <h3>第一天过关的两道门</h3>
          <div class="gate" data-gate="0"><span class="box ${td.gates[0]?"ok":""}"></span><div><b>① 白纸上画出这一章的链</b><span>卡名一个不漏、顺序对，每两张之间写一句「前一格看不见什么 → 所以出现它」。</span></div></div>
          <div class="gate" data-gate="1"><span class="box ${td.gates[1]?"ok":""}"></span><div><b>② 看卡名能掏钉子 + 关键词</b><span>关键词八成以上，结构性错误零个。漏一两个词正常，标上就行。</span></div></div>
          <p class="nope" style="${td.d0done?"color:#aaa":""}">今晚不要求默成稿，成稿是 D4 的事。耳机循环放在今晚到明早之间，明早 6:30 摘耳机掏一次，才知道它有没有用。</p>
        </div>
        ${td.d0done
          ? `<button class="d0btn done" data-undod0>今晚完成 ✓（点此撤销）</button>`
          : `<button class="d0btn" data-finishd0 ${(td.gates[0]&&td.gates[1]&&td.d0.length)?"":"disabled"}>两道门都过了，今晚完成</button>`}
      </div>

      <div class="tomorrow">
        <b>明天 ${TOMORROW.slice(5).replace("-","-")} 会滚到：</b><br>
        ${tp.parts.length ? tp.parts.join(" · ") : "暂时没有"}<br>
        ${tp.n ? `共 ${tp.n} 张，约 ${Math.round(tp.n*2.5)} 分钟。` : ""}
        ${tp.heavy ? `<br><b>${tp.heavy}</b>` : ""}
      </div>

      <div class="note">
        <h3>今天干了什么</h3>
        <textarea data-note placeholder="一两行就行：学到哪、卡在哪、明天想先掏什么。">${esc(td.note||"")}</textarea>
        ${pastNotes()}
      </div>
    </div>
  </div>

  <div class="foot">
    <span>${SERVER==="github" ? "云端同步中（手机/电脑共用） · <button data-logout>换令牌</button>" : SERVER==="local" ? "进度写入 打卡/state.json" : `⚠ 进度只存在这个浏览器里 · <button data-login>贴令牌开启云端同步</button>`}${loadError?` · <b style="color:#000">云端读取失败：${esc(loadError)}</b>`:""} · <button data-export>导出备份</button></span>
    <span>间隔 1 / 2 / 4 / 7 / 15 / 30 / 60 天 · 艾宾浩斯 + 莱特纳退格</span>
  </div>`;
  const ex = app.querySelector("[data-export]"); if (ex) ex.onclick = exportState;
  const lg = app.querySelector("[data-login]"); if (lg) lg.onclick = askToken;
  const lo = app.querySelector("[data-logout]"); if (lo) lo.onclick = askToken;
  const nt = app.querySelector("[data-note]"); if (nt) { let t; nt.oninput = () => { clearTimeout(t); t=setTimeout(()=>setNote(nt.value),600); }; }

  // 事件
  app.querySelectorAll("[data-ok]").forEach(b => b.onclick = () => {
    const id=b.dataset.ok, r=td.rev[id];
    if (!r) mark(id, true);
    else if (r.ok) { mark(id, false); editingMiss=id; render(); }
    else { mark(id, false); } // 第三次：撤销（mark 内部判断同状态撤销）
  });
  app.querySelectorAll("[data-editmiss]").forEach(b => b.onclick = () => { editingMiss=b.dataset.editmiss; render(); });
  app.querySelectorAll("input.mi").forEach(inp => {
    inp.focus();
    const done = () => { editingMiss=null; setMiss(inp.dataset.miss, inp.value.trim()); };
    inp.onkeydown = e => { if (e.key==="Enter") done(); if (e.key==="Escape"){ editingMiss=null; render(); } };
    inp.onblur = done;
  });
  app.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => toggleTonight(b.dataset.pick));
  app.querySelectorAll("[data-addch]").forEach(b => b.onclick = () => { const [bd,ch]=b.dataset.addch.split("|||"); addChapter(bd,ch); });
  app.querySelectorAll("[data-gate]").forEach(b => b.onclick = () => toggleGate(+b.dataset.gate));
  const pk = app.querySelector("[data-picker]"); if (pk) pk.onclick = () => { pickerOpen=!pickerOpen; render(); };
  const fd = app.querySelector("[data-finishd0]"); if (fd) fd.onclick = finishD0;
  const ud = app.querySelector("[data-undod0]"); if (ud) ud.onclick = () => { if (confirm("撤销今晚完成？这批卡会回到未学。")) undoD0(); };
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
