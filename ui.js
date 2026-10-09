/* 渲染层(Y2K 浅色版)。逻辑在 app.js。 */
const esc = s => String(s??"").replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const SUBJ_COLOR = {"传播学":"c0","英语二":"c1","政治":"c2","其他":"c3"};
const pad2 = n => String(n).padStart(2,"0");
const cid = id => id.replace(/^(\D+)(\d+)$/, (_,a,b)=>`${a}·${pad2(b)}`);

function cardRow(c, r, s){
  const late = (!r && s.due < TODAY) ? `<span class="late">迟 ${diffDays(TODAY,s.due)} 天</span>` : "";
  const lastH = (s.hist||[]).filter(h=>h.d!==TODAY).slice(-1)[0];
  const last = lastH && lastH.at!=="D0" ? (lastH.ok ? `<span class="last">${lastH.at} 全对${s.passes&&!r?` ${s.passes}/2`:""}</span>` : `<span class="last bad">${lastH.at} 漏：${esc(lastH.miss||"未记")}</span>`) : "";
  let missEl = "";
  if (r && !r.ok) missEl = editingMiss===c.id
      ? `<input class="mi" data-miss="${c.id}" value="${esc(r.miss)}" placeholder="漏了什么，一行">`
      : `<button class="miss" data-editmiss="${c.id}">${r.miss ? "漏："+esc(r.miss) : "记一下漏了什么"}</button>`;
  return `<div class="card ${r?"done":""}">
    <button class="box ${r?(r.ok?"ok":"bad"):""}" data-ok="${c.id}" title="点一下=过，再点=漏，再点=撤销"></button>
    <span class="id">${cid(c.id)}</span><span class="t">${esc(c.title)}</span>${c.star?`<span class="star">${c.star}</span>`:""}
    ${late}${r?"":last}${missEl}<span class="src">${c.board} · ${esc(c.chapShort)}</span></div>`;
}

function render(){
  const app = document.getElementById("app");
  const td = day();
  const due = dueToday(), groups = groupByStage(due);
  const reviewed = due.filter(c=>td.rev[c.id]).length, allDone = due.length>0 && reviewed===due.length;
  const P = progress(CARDS);
  const boards = Object.keys(ABBR).map(b => ({b, ...progress(CARDS.filter(c=>c.board===b))}));
  const hot = new Set(due.map(c=> (td.rev[c.id]?td.rev[c.id].stage:cs(c.id).stage))); if (td.d0.length) hot.add(0);
  const stageCount = st => CARDS.filter(c=>{const s=cs(c.id);return s&&s.stage===st;}).length;
  const dt = parse(TODAY), tp = tomorrowPreview();
  const unlearned = CARDS.filter(c=>!cs(c.id));
  const tonightCards = td.d0.map(id=>BYID[id]).filter(Boolean);
  const chapOfTonight = [...new Set(tonightCards.map(c=>`${c.board} · ${c.chapShort}`))].join(" / ");
  const R = 62, C = 2*Math.PI*R;
  // 今日进度:今早每张卡 1 分 + 今晚 D0(选了卡才算) 1 分 + 「今天还要做」每条 1 分
  const todosAll = td.todos||[];
  const tN = due.length + (td.d0.length?1:0) + todosAll.length;
  const tDone = reviewed + (td.d0.length&&td.d0done?1:0) + todosAll.filter(t=>t.ok).length;
  const TP = { pct: tN? tDone/tN*100 : 0, done:tDone, total:tN };
  const todayMode = pmode==="today";
  const shown = todayMode ? TP : P;
  const isFull = todayMode && tN>0 && tDone===tN;

  let picker = "";
  if (pickerOpen && !td.d0done) {
    let cur = ""; const rows = [];
    unlearned.forEach(c => {
      const key = `${c.board}｜${c.chap}`;
      if (key!==cur) { cur=key; rows.push(`<div class="ch">${esc(c.board)} · ${esc(c.chap)}<button data-addch="${esc(c.board)}|||${esc(c.chap)}">整章加入</button></div>`); }
      rows.push(`<div class="row"><span class="id">${c.id}</span><span>${esc(c.title)}</span><span class="op"><button data-pick="${c.id}">${td.d0.includes(c.id)?"移出":"加入"}</button></span></div>`);
    });
    picker = `<div class="picker">${rows.join("")||'<div class="empty">全学过了。</div>'}</div>`;
  }

  // 今天还要做:按科目分区,只显示有的
  const todos = td.todos||[];
  const subjOrder = [...SUBJECTS, ...[...new Set(todos.map(t=>t.s))].filter(s=>!SUBJECTS.includes(s))];
  const secs = subjOrder.filter(s=>todos.some(t=>t.s===s)).map((s,si)=>`
    <div class="sec"><h4 class="ser"><span class="num">(${pad2(si+1)})</span><i>${esc(s)}</i><span class="sw ${SUBJ_COLOR[s]||"c4"}"></span></h4>
      ${todos.map((t,i)=>t.s===s?`<div class="card ${t.ok?"done":""}"><button class="box ${t.ok?"ok":""}" data-todo="${i}"></button><span class="t">${esc(t.x)}</span><button class="del" data-deltodo="${i}">删</button></div>`:"").join("")}
    </div>`).join("");
  const lastSubj = localStorage.getItem("dk_subj") || "传播学";

  const log = td.log||[];
  const pastDays = Object.keys(S.days).filter(d=>d<TODAY && (S.days[d].log||[]).length).sort().reverse().slice(0,4);

  app.innerHTML = `
  <div class="hero">
    <div class="menu ser"><div><span class="num">(01)</span><span class="k"><i>recall</i></span></div><div><span class="num">(02)</span><span class="k"><i>chain</i></span></div><div><span class="num">(03)</span><span class="k"><i>recite</i></span></div><div><span class="num">(04)</span><span class="k"><i>sleep</i></span></div></div>
    <div class="title">
      <div class="eyebrow ser">DAILY RECALL <span>— (${dt.getFullYear()})</span></div>
      <div class="date ser"><i>${dt.getMonth()+1}月${dt.getDate()}日</i></div>
      <div class="meta ser">周${WEEK[dt.getDay()]} · 考前 <b class="cd">${diffDays(EXAM,TODAY)}</b> 天 · 今早 <b>${reviewed}</b>/${due.length} 已掏${allDone?" ✓":""} · 今晚 <b>${td.d0.length}</b> 张${td.d0done?" ✓":""} · 已出池 <b>${P.out}</b>/${P.total}</div>
    </div>
    <div class="orb" style="right:290px;top:52px;width:88px;height:88px;z-index:1"></div>
    <span class="spark" style="right:380px;top:22px">✦</span><span class="spark t" style="right:250px;top:150px">✧</span>
    <div class="ring ser"><div class="pct ${isFull?"full":""}">${todayMode ? (tN? Math.floor(TP.pct) : 0) : P.pct.toFixed(1)}<span style="font-size:32px">%</span></div>
      <div class="cap">${todayMode ? `TODAY · ${TP.done}/${TP.total} DONE${isFull?" ✓":""}` : `TOTAL PROGRESS · ${P.learned}/${P.total} LEARNED`}</div>
      <div class="pmode ${todayMode?"today":""}" data-pmode title="切换：总进度 / 今天"><span class="lab ${todayMode?"":"on"}">总进度</span><span class="sw"><i></i></span><span class="lab ${todayMode?"on":""}">今天</span></div>
    </div>
  </div>
  <div class="bar ${isFull?"full":""}"><i style="width:${shown.pct}%"></i>${todayMode&&tN?Array.from({length:tN-1},(_,i)=>`<span class="mark" style="left:${(i+1)/tN*100}%"></span>`).join(""):""}</div>
  <div class="barrow"><span>${todayMode ? (tN? `今天 ${tN} 件：今早 ${due.length} 张 · 今晚 ${td.d0.length?"1 批":"0"} · 还要做 ${todosAll.length} 条 —— 全勾完就是 100%` : "今天还没有任务。选今晚的卡、或在右边加一件事。") : `${P.total} 张卡各走到第几格，加起来`}</span><span>近 14 天 ${streakDots()}</span></div>
  <div class="boards ser">${boards.map(x=>`<span><b>${x.pct.toFixed(0)}%</b>${x.b} <span style="color:var(--ink3);font-size:12px">${x.learned}/${x.total}</span></span>`).join("")}</div>

  <div class="wheel">${STAGES.map((s,i)=>`<div class="seg ${hot.has(i)?"hot":""} ${i>=3?"v":""} ${i>=6&&!hot.has(i)?"dim":""}"><span class="lab ser"><b>(${pad2(i)})</b>${s.k}</span><em>${s.short}</em><u>${i===0?(td.d0.length?`今晚 ${td.d0.length}`:"—"):(stageCount(i)?stageCount(i)+" 张":"—")}</u></div>`).join("")}</div>

  <div class="cols">
    <div>
      <h2 class="ser"><i>今早要掏的</i><span class="n">${due.length} 张 · 约 ${Math.round(due.length*2.5)} 分钟</span></h2>
      <p class="hint">摘耳机、合稿。点一下＝过，再点＝漏（记一行），再点＝撤销。漏了不清零，退一格明早重来。</p>
      <div class="panel">
        ${groups.length ? groups.map(g=>`<div class="grp"><div class="tag ser">${STAGES[g.st].k}<small>${g.cards.length} 张${g.st===1?" · 昨晚学的":""}</small></div><div><div class="ask">${STAGES[g.st].ask}</div>${g.cards.map(c=>cardRow(c, td.rev[c.id], cs(c.id))).join("")}</div></div>`).join("")
          : `<div class="empty big">${P.learned? "今早没有卡滚到。":"还没有卡。今晚在右边选第一批新卡，明早就会滚到这里。"}</div>`}
        ${allDone ? `<div class="empty big">今早 ${due.length} 张清空 ✓</div>` : ""}
      </div>
    </div>
    <div class="split" id="split"></div>
    <div class="right">
      <div class="panel tonight ${td.d0done?"full":""}">
        <h3 class="ser"><i>新学 ${td.d0.length} 张</i>${td.d0done?"":`<button class="pk" data-picker>${pickerOpen?"收起":"选卡 ▾"}</button>`}<span class="tagr">TONIGHT · D0</span></h3>
        <div class="sub">${chapOfTonight ? esc(chapOfTonight) : `还没选。从没学过的 ${unlearned.length} 张里挑 3–5 张同一章。`}</div>
        ${tonightCards.map(c=>`<div class="card"><span class="box ${td.d0done?"ok":""}"></span><span class="id">${cid(c.id)}</span><span class="t">${esc(c.title)}</span>${td.d0done?"":`<button class="x" data-pick="${c.id}">移出</button>`}</div>`).join("")}
        ${picker}
        <div class="gates"><h4>第一天过关的两道门</h4>
          <div class="gate" data-gate="0"><span class="o ${td.gates[0]?"ok":""}"></span><div><b>① 白纸上画出这一章的链</b><span>卡名不漏、顺序对，每两张之间写一句「前一格看不见什么 → 所以出现它」。</span></div></div>
          <div class="gate" data-gate="1"><span class="o ${td.gates[1]?"ok":""}"></span><div><b>② 看卡名能掏钉子 + 关键词</b><span>八成以上，结构性错误零个。漏一两个词正常。</span></div></div>
          <p class="nope">今晚不要求默成稿，成稿是 D4 的事。耳机循环放今晚到明早之间，明早 6:30 摘耳机掏一次才算数。</p>
        </div>
        ${td.d0done ? `<button class="btn done" data-undod0>今晚完成 ✓（点此撤销）</button>` : `<button class="btn" data-finishd0 ${(td.gates[0]&&td.gates[1]&&td.d0.length)?"":"disabled"}>两道门都过了，今晚完成</button>`}
      </div>

      <div class="panel soft">
        <h3 class="ser" style="margin:0 0 14px;font-size:26px"><i>今天还要做</i><span style="font-size:12px;color:var(--ink3);margin-left:10px;font-family:'PingFang SC';letter-spacing:1px">有哪科显示哪科</span></h3>
        ${secs || `<div class="empty">英语、政治、卡之外的传播学……都丢这里，当天勾完就完。</div>`}
        <form class="add" data-addtodo><select name="s">${SUBJECTS.map(s=>`<option ${s===lastSubj?"selected":""}>${s}</option>`).join("")}</select><input name="x" placeholder="加一件事，回车" autocomplete="off"><button class="go" type="submit">+</button></form>
      </div>

      <div class="panel soft note">
        <h4 class="ser"><i>今天干了什么</i><span>${log.length} 条 · 一条一发</span></h4>
        ${log.length?`<div class="feed">${log.map((l,i)=>`<div class="item"><span class="tm">${l.t}</span><span class="tx">${esc(l.x)}</span><button class="del" data-dellog="${i}">删</button></div>`).join("")}</div>`:""}
        <form class="send" data-addlog><input name="x" placeholder="干了一条，发一条…" autocomplete="off"><button class="go" type="submit">发送</button></form>
        ${pastDays.length?`<div class="past">${pastDays.map(d=>`<div><span>${d.slice(5)}</span>${S.days[d].log.length} 条 · ${esc(S.days[d].log[0].x)}</div>`).join("")}</div>`:""}
      </div>

      <div class="tomorrow"><b>明天 ${TOMORROW.slice(5)} 会滚到：</b>${tp.parts.length ? tp.parts.join(" · ") : "暂时没有"}${tp.n ? ` —— 共 ${tp.n} 张，约 ${Math.round(tp.n*2.5)} 分钟。` : ""}${tp.heavy ? `<br><b>${tp.heavy}</b>` : ""}</div>
    </div>
  </div>

  <div class="foot">
    <span>${SERVER==="github" ? `<span class="on"></span>云端同步中 · 手机电脑共用 · <button data-logout>换令牌</button>` : SERVER==="local" ? `<span class="on"></span>写入本机 state.json` : `<span class="on off"></span>只存在这个浏览器里 · <button data-login>贴令牌开启云端同步</button>`}${loadError?` · <b>云端读取失败：${esc(loadError)}</b>`:""} · <button data-export>导出备份</button></span>
    <span>间隔 1 / 2 / 4 / 7 / 15 / 30 / 60 天 · 艾宾浩斯 + 莱特纳退格</span>
  </div>`;

  // ---- 事件 ----
  const q = s => app.querySelector(s), qa = s => [...app.querySelectorAll(s)];
  qa("[data-ok]").forEach(b => b.onclick = () => { const id=b.dataset.ok, r=td.rev[id]; if (!r) mark(id,true); else if (r.ok) { mark(id,false); editingMiss=id; render(); } else mark(id,false); });
  qa("[data-editmiss]").forEach(b => b.onclick = () => { editingMiss=b.dataset.editmiss; render(); });
  qa("input.mi").forEach(inp => { inp.focus(); const done=()=>{ editingMiss=null; setMiss(inp.dataset.miss, inp.value.trim()); }; inp.onkeydown=e=>{ if(e.key==="Enter") done(); if(e.key==="Escape"){ editingMiss=null; render(); } }; inp.onblur=done; });
  qa("[data-pick]").forEach(b => b.onclick = () => toggleTonight(b.dataset.pick));
  qa("[data-addch]").forEach(b => b.onclick = () => { const [bd,ch]=b.dataset.addch.split("|||"); addChapter(bd,ch); });
  qa("[data-gate]").forEach(b => b.onclick = () => toggleGate(+b.dataset.gate));
  const pk=q("[data-picker]"); if(pk) pk.onclick=()=>{ pickerOpen=!pickerOpen; render(); };
  const fd=q("[data-finishd0]"); if(fd) fd.onclick=finishD0;
  const ud=q("[data-undod0]"); if(ud) ud.onclick=()=>{ if(confirm("撤销今晚完成？这批卡会回到未学。")) undoD0(); };
  qa("[data-todo]").forEach(b=>b.onclick=()=>toggleTodo(+b.dataset.todo));
  qa("[data-deltodo]").forEach(b=>b.onclick=()=>delTodo(+b.dataset.deltodo));
  const fa=q("[data-addtodo]"); if(fa) fa.onsubmit=e=>{ e.preventDefault(); localStorage.setItem("dk_subj", fa.s.value); addTodo(fa.s.value, fa.x.value); };
  qa("[data-dellog]").forEach(b=>b.onclick=()=>delLog(+b.dataset.dellog));
  const fl=q("[data-addlog]"); if(fl) fl.onsubmit=e=>{ e.preventDefault(); addLog(fl.x.value); setTimeout(()=>{ const f=q(".feed"); if(f) f.scrollTop=f.scrollHeight; const i=q("[data-addlog] input"); if(i) i.focus(); },0); };
  const ex=q("[data-export]"); if(ex) ex.onclick=exportState;
  const pm=q("[data-pmode]"); if(pm) pm.onclick=()=>{ pmode = pmode==="today"?"total":"today"; localStorage.setItem("dk_pmode", pmode); render(); };
  const lg=q("[data-login]"); if(lg) lg.onclick=askToken; const lo=q("[data-logout]"); if(lo) lo.onclick=askToken;
  // 分栏拖拽(记住宽度)
  const sp=q("#split"); if(sp){ sp.onmousedown=e=>{ e.preventDefault(); sp.classList.add("on"); const move=ev=>{ const w=Math.min(760,Math.max(360, document.querySelector(".cols").getBoundingClientRect().right - ev.clientX)); document.documentElement.style.setProperty("--right", w+"px"); }; const up=()=>{ sp.classList.remove("on"); localStorage.setItem("dk_right", getComputedStyle(document.documentElement).getPropertyValue("--right")); window.removeEventListener("mousemove",move); window.removeEventListener("mouseup",up); }; window.addEventListener("mousemove",move); window.addEventListener("mouseup",up); }; }
}
let pmode = localStorage.getItem("dk_pmode") || "today";
const savedW = localStorage.getItem("dk_right"); if (savedW) document.documentElement.style.setProperty("--right", savedW.trim());
