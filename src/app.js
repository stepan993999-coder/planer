(function(){
"use strict";
const API=window.plannerSync||window.planner||{load:async()=>{try{return JSON.parse(localStorage.getItem("planner")||"{}")}catch(e){return{}}},save:async(k,v)=>{try{const o=JSON.parse(localStorage.getItem("planner")||"{}");o[k]=v;localStorage.setItem("planner",JSON.stringify(o))}catch(e){}},badge(){},notify(){},openDataFolder(){},onNav(){},onNewTask(){}};
const KEYS={tasks:[],events:[],finance:{tx:[],cur:"RUB",budgets:{},cats:[]},goals:[],habits:[],notes:{text:"",items:[]},loans:{list:[],budget:0,start:"",target:"",mode:"reduce",appBal:{}}};
const S={};for(const k in KEYS)S[k]=clone(KEYS[k]);
function clone(x){return JSON.parse(JSON.stringify(x))}
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);

/* ---------- даты ---------- */
const pad=n=>String(n).padStart(2,"0");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const D=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const TODAY=()=>ymd(new Date());
const MONTHS=["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WD=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const REPEAT={"":"Не повторять",daily:"Каждый день",weekly:"Каждую неделю",monthly:"Каждый месяц",yearly:"Каждый год"};
function isoWeek(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y0)/864e5+1)/7)}
function dayOfYear(d){return Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-new Date(d.getFullYear(),0,1))/864e5)+1}
function nice(s){if(!s)return"";const t=TODAY();if(s===t)return"Сегодня";if(s===ymd(addDays(new Date(),1)))return"Завтра";if(s===ymd(addDays(new Date(),-1)))return"Вчера";
  return D(s).toLocaleDateString("ru-RU",{day:"numeric",month:"short"}).replace(".","")}
function plural(n,a,b,c){n=Math.abs(n)%100;const m=n%10;if(n>10&&n<20)return c;if(m>1&&m<5)return b;if(m===1)return a;return c}
function occurs(e,s){if(!e.date||s<e.date)return false;if(s===e.date)return true;const r=e.repeat;if(!r)return false;
  const a=D(e.date),b=D(s);if(r==="daily")return true;if(r==="weekly")return a.getDay()===b.getDay();
  if(r==="monthly")return a.getDate()===b.getDate();if(r==="yearly")return a.getDate()===b.getDate()&&a.getMonth()===b.getMonth();return false}
const eventsOn=s=>S.events.filter(e=>occurs(e,s)).sort((a,b)=>(a.time||"").localeCompare(b.time||""));

/* ---------- деньги ---------- */
function money(v,sign){const cur=S.finance.cur||"RUB";let s;try{s=new Intl.NumberFormat("ru-RU",{style:"currency",currency:cur,maximumFractionDigits:0}).format(Math.abs(v))}catch(e){s=Math.round(Math.abs(v))+" "+cur}
  return (v<0?"−":sign&&v>0?"+":"")+s}
const fmtN=n=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:2}).format(+n||0);
const CATS_OUT=["Продукты","Кафе и рестораны","Транспорт","Жильё","Связь и интернет","Здоровье","Развлечения","Одежда","Подарки","Образование","Прочее"];
const CATS_IN=["Зарплата","Фриланс","Подарки","Возврат","Прочее"];

/* ---------- хранение ---------- */
const pend={};
function save(k){clearTimeout(pend[k]);pend[k]=setTimeout(()=>{pend[k]=null;API.save(k,clone(S[k]))},250)}
window.addEventListener("beforeunload",()=>{for(const k in pend)if(pend[k]){clearTimeout(pend[k]);API.save(k,clone(S[k]))}});

/* ---------- состояние интерфейса ---------- */
const now=new Date();
const ui={view:"overview",calY:now.getFullYear(),calM:now.getMonth(),calSel:TODAY(),finY:now.getFullYear(),finM:now.getMonth(),taskFilter:"open",txType:"out",tag:{}};
const VIEWS=[["overview","Обзор"],["calendar","Календарь"],["tasks","Задачи"],["finance","Финансы"],["loans","Кредиты"],["goals","Цели"],["habits","Привычки"],["notes","Заметки"]];
function go(v){if(VIEWS.some(x=>x[0]===v)){ui.view=v;if(window.PlanerHooks&&PlanerHooks.beforeGo)PlanerHooks.beforeGo(v);render();$("#main").scrollTop=0;if(API.platform==="web")window.scrollTo(0,0)}}

/* ---------- отмена ---------- */
let undoState=null,toastT=null;
function snapshotFor(k){undoState={k,v:clone(S[k])}}
function toast(msg,canUndo){const t=$("#toast");t.innerHTML=esc(msg)+(canUndo?' <button type="button" data-act="undo">Вернуть</button>':"");t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;undoState=null},5000)}

/* ---------- отрисовка ---------- */
let editing=false;
function render(){
  const ae=document.activeElement;const fid=ae&&ae.id&&$("#main").contains(ae)?ae.id:null;let selr=null;try{if(fid&&ae.selectionStart!=null)selr=[ae.selectionStart,ae.selectionEnd]}catch(e){}
  for(const k in LISTS){const t=ui.tag[k];if(t&&!LISTS[k]().some(x=>(x.tags||[]).includes(t)))ui.tag[k]=""}
  const v=ui.view;
  const due=S.tasks.filter(t=>!t.done&&t.date&&t.date<=TODAY()).length;
  API.badge(due);
  $("#nav").innerHTML=VIEWS.map(([id,name],i)=>`<a href="#" data-act="go" data-v="${id}" ${v===id?'aria-current="page"':""}><span>${name}</span>${id==="tasks"&&due?`<span class="cnt">${due}</span>`:(API.platform==="web"?"":`<kbd>⌘${i+1}</kbd>`)}</a>`).join("");
  if(window.PlanerHooks&&PlanerHooks.afterNav)PlanerHooks.afterNav(v);
  const fn={overview:vOverview,calendar:vCalendar,tasks:vTasks,finance:()=>M.vFinance(),loans:()=>M.vLoans(),goals:vGoals,habits:vHabits,notes:vNotes}[v];
  $("#main").innerHTML=`<div class="wrap">${window.PlanerHooks&&PlanerHooks.banner?PlanerHooks.banner():""}${fn()}</div>`;
  if(fid){const el=document.getElementById(fid);if(el){el.focus();if(selr)try{el.setSelectionRange(selr[0],selr[1])}catch(e){}}}
}
const exTag=x=>x&&x.ex?'<span class="ex">пример</span>':"";
/* ---------- теги ---------- */
function parseTags(s){return [...new Set(String(s||"").split(/[,#\s]+/).map(t=>t.trim().toLowerCase()).filter(Boolean))]}
const LISTS={tasks:()=>S.tasks,events:()=>S.events,tx:()=>S.finance.tx,goals:()=>S.goals,habits:()=>S.habits,notes:()=>S.notes.items||[]};
const SAVEKEY={tasks:"tasks",events:"events",tx:"finance",goals:"goals",habits:"habits",notes:"notes"};
function tagChips(k,x){return `<span class="tags">${(x.tags||[]).map(t=>`<button type="button" class="tag ${ui.tag[k]===t?"on":""}" data-act="tagPick" data-k="${k}" data-tag="${esc(t)}" title="Показать только #${esc(t)}">#${esc(t)}</button>`).join("")}<button type="button" class="tag-add" data-act="tagEdit" data-k="${k}" data-id="${x.id}" title="Изменить теги" aria-label="Изменить теги">#</button></span>`}
function tagBar(k){const cnt={};for(const x of LISTS[k]())for(const t of x.tags||[])cnt[t]=(cnt[t]||0)+1;const all=Object.keys(cnt).sort();
  if(ui.tag[k]&&!cnt[ui.tag[k]])ui.tag[k]="";
  if(!all.length)return"";const cur=ui.tag[k];
  return `${cur?`<div class="tagnote"><span>Показаны только записи с тегом <b>#${esc(cur)}</b></span><button type="button" class="btn sm" data-act="tagPick" data-k="${k}" data-tag="">✕ Показать все</button></div>`:""}<div class="tagbar"><span class="hint">Теги:</span><button type="button" class="tag ${!cur?"on":""}" data-act="tagPick" data-k="${k}" data-tag="">все</button>${all.map(t=>`<button type="button" class="tag ${cur===t?"on":""}" data-act="tagPick" data-k="${k}" data-tag="${esc(t)}">#${esc(t)} <small>${cnt[t]}</small></button>`).join("")}</div>`}
const byTag=(k,x)=>!ui.tag[k]||(x.tags||[]).includes(ui.tag[k]);
const PRIO_NAME={high:"высокий",mid:"обычный",low:"низкий"};
const prioSelect=id=>`<select id="${id}" name="prio" aria-label="Приоритет"><option value="mid">Обычный</option><option value="high">Высокий</option><option value="low">Низкий</option></select>`;
function fmtDur(m){m=+m||0;const h=Math.floor(m/60),mm=m%60;return (h?h+" ч":"")+(h&&mm?" ":"")+(mm?mm+" мин":"")||"0 мин"}
function addMin(t,m){const [h,mm]=t.split(":").map(Number);const x=(h*60+mm+(+m||0))%1440;return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0")}
const tRange=e=>e.time?(e.end?e.time+"–"+e.end:e.time):"";
function taskTime(t){if(t.time&&t.dur)return t.time+"–"+addMin(t.time,t.dur);if(t.time)return t.time;if(t.dur)return "≈ "+fmtDur(t.dur);return ""}
const DURS=[15,30,45,60,90,120,180,240,360,480];
function durSelect(id,sel){const opts=[...DURS];if(sel&&!opts.includes(+sel))opts.push(+sel),opts.sort((a,b)=>a-b);return `<select ${id?`id="${id}"`:""} name="dur" aria-label="Сколько займёт"><option value="">длительность</option>${opts.map(m=>`<option value="${m}" ${+sel===m?"selected":""}>${fmtDur(m)}</option>`).join("")}</select>`}
function timeChip(k,x){const txt=k==="tasks"?taskTime(x):tRange(x);return txt?`<button type="button" class="chip tchip num" data-act="timeEdit" data-k="${k}" data-id="${x.id}" title="Изменить время">${esc(txt)}</button>`:`<button type="button" class="tag-add" data-act="timeEdit" data-k="${k}" data-id="${x.id}" title="Указать время">+время</button>`}
const tagInput=(id,ph)=>`<input id="${id}" type="text" name="tags" placeholder="${ph||"#теги"}" autocomplete="off" style="width:130px">`;
const ed=(k,id,f)=>`data-edit="${k}|${id}|${f}" title="Двойной щелчок — изменить"`;
function isEmpty(){return !S.tasks.length&&!S.events.length&&!S.finance.tx.length&&!S.goals.length&&!S.habits.length}
function hasEx(){return S.tasks.some(x=>x.ex)||S.events.some(x=>x.ex)||S.finance.tx.some(x=>x.ex)||S.goals.some(x=>x.ex)||S.habits.some(x=>x.ex)}

function taskRow(t,showDate=true){
  const td=TODAY();let dc="";
  if(t.date&&showDate){const cls=!t.done&&t.date<td?"late":t.date===td?"today":"";dc=`<span class="chip ${cls}">${nice(t.date)}</span>`}
  return `<div class="item ${t.done?"done":""}"><button type="button" class="prio ${t.prio||"mid"}" data-act="prioCycle" data-id="${t.id}" title="Приоритет: ${PRIO_NAME[t.prio||"mid"]}. Нажмите, чтобы сменить" aria-label="Приоритет: ${PRIO_NAME[t.prio||"mid"]}"></button>
  <input type="checkbox" class="check" data-act="toggleTask" data-id="${t.id}" ${t.done?"checked":""} aria-label="Готово: ${esc(t.title)}">
  <span class="ibody"><span class="t" ${ed("tasks",t.id,"title")}>${esc(t.title)}${exTag(t)}</span><span class="meta">${timeChip("tasks",t)}${dc}${tagChips("tasks",t)}${t.list?`<span class="chip">${esc(t.list)}</span>`:""}</span></span>
  <button class="icon" data-act="del" data-k="tasks" data-id="${t.id}" aria-label="Удалить">✕</button></div>`}

function monthTotals(y,m){const p=y+"-"+pad(m+1);let inc=0,out=0;const cats={};
  for(const t of S.finance.tx){if(!t.date||!t.date.startsWith(p))continue;if(t.type==="in")inc+=+t.amount;else{out+=+t.amount;cats[t.cat||"Прочее"]=(cats[t.cat||"Прочее"]||0)+(+t.amount)}}
  return{inc,out,bal:inc-out,cats}}
function hv(h,d){const v=h.days[d];return v===true?1:(+v||0)}
function hT(h){return Math.max(1,+h.target||1)}
function hOk(h,d){const v=hv(h,d);return (h.mode||"min")==="max"?v<=hT(h):v>=hT(h)}
function hStart(h){if(h.created)return h.created;const ks=Object.keys(h.days).sort();return ks[0]||TODAY()}
function cellCls(h,d){const v=hv(h,d),t=hT(h);if((h.mode||"min")==="max")return v===0?"":v<=t?"ok":"over";return v>=t?"ok":v>0?"part":""}
function streak(h){let n=0;let d=new Date();const max=(h.mode||"min")==="max";
  if(!max){if(!hOk(h,ymd(d)))d=addDays(d,-1);while(hv(h,ymd(d))>0&&hOk(h,ymd(d))){n++;d=addDays(d,-1)}return n}
  const st=hStart(h);while(ymd(d)>=st&&hOk(h,ymd(d))){n++;d=addDays(d,-1)}return n}
function habitAdd(id,d,delta){const h=S.habits.find(x=>x.id===id);if(!h)return;const v=Math.max(0,hv(h,d)+delta);if(v)h.days[d]=v;else delete h.days[d];save("habits");render()}
function sortTasks(a,b){const pr={high:0,mid:1,low:2};if(a.done!==b.done)return a.done?1:-1;const ad=a.date||"9999",bd=b.date||"9999";if(ad!==bd)return ad.localeCompare(bd);const at=a.time||"99",bt=b.time||"99";if(at!==bt)return at.localeCompare(bt);return(pr[a.prio]??1)-(pr[b.prio]??1)}

function vOverview(){
  const d=new Date(),td=TODAY();
  const wd=d.toLocaleDateString("ru-RU",{weekday:"long"});
  const dm=d.toLocaleDateString("ru-RU",{day:"numeric",month:"long"});
  const yearDays=Math.round((new Date(d.getFullYear(),11,31)-new Date(d.getFullYear(),0,0))/864e5);
  const due=S.tasks.filter(t=>!t.done&&t.date&&t.date<=td).sort(sortTasks);
  const doneToday=S.tasks.filter(t=>t.done&&t.date===td).length;const planned=due.filter(t=>t.date===td).reduce((a,t)=>a+(+t.dur||0),0);
  const evs=[];for(let i=0;i<=7&&evs.length<7;i++){const s=ymd(addDays(d,i));for(const e of eventsOn(s))evs.push({e,s})}
    const goals=S.goals.slice(0,4);
  let html=`<div class="head"><div><div class="eyebrow">${esc(wd)} · неделя ${isoWeek(d)} · день ${dayOfYear(d)} из ${yearDays}</div><div class="today-big">${esc(dm)}</div></div>
  ${hasEx()?'<button class="btn" data-act="clearEx">Убрать примеры</button>':""}</div>`;
  if(isEmpty())html+=`<div class="banner"><p><b>Планер пока пустой.</b> Добавьте первую задачу ниже или откройте нужный раздел слева. Чтобы посмотреть, как всё работает, загрузите пример: такие записи помечены и убираются одной кнопкой.</p><button class="btn pri" data-act="seed">Заполнить примером</button></div>`;
  html+=`<div class="grid g-over">
  <section class="panel span2"><div class="panel-h"><h2>На сегодня${planned?` · запланировано ${fmtDur(planned)}`:""}</h2><a href="#" data-act="go" data-v="tasks">Все задачи →</a></div>
    <form class="row" data-form="quickTask"><input id="qt" type="text" class="grow" name="title" placeholder="Новая задача на сегодня${API.platform==="web"?"":"  (⌘N)"}" required autocomplete="off"><input id="qt-time" type="time" name="time" aria-label="Время начала">${durSelect("qt-dur")}${prioSelect("qt-prio")}<button class="btn pri">Добавить</button></form>
    <div class="list">${due.length?due.map(t=>taskRow(t)).join(""):`<p class="empty">${doneToday?"Всё на сегодня сделано.":"Задач на сегодня нет."}</p>`}</div></section>
  <section class="panel"><div class="panel-h"><h2>Ближайшие 7 дней</h2><a href="#" data-act="go" data-v="calendar">Календарь →</a></div>
    <div class="list">${evs.length?evs.map(({e,s})=>`<div class="item"><span class="dot" style="--ec:var(--${e.color||"c1"})"></span><span class="t">${esc(e.title)}${exTag(e)}</span><span class="chip ${s===td?"today":""}">${nice(s)}${e.time?" · "+esc(tRange(e)):""}</span><button class="icon" data-act="del" data-k="events" data-id="${e.id}" aria-label="Удалить">✕</button></div>`).join(""):'<p class="empty">Событий на неделе нет.</p>'}</div></section>
  ${M.overviewMoney()}
  <section class="panel"><div class="panel-h"><h2>Цели</h2><a href="#" data-act="go" data-v="goals">Все цели →</a></div>
    ${goals.length?goals.map(g=>{const p=goalPct(g);return`<div style="display:flex;flex-direction:column;gap:6px"><div class="panel-h"><span style="font-weight:600;overflow-wrap:anywhere;min-width:0">${esc(g.title)}${exTag(g)}</span><span class="num" style="font-size:12px;color:var(--muted)">${p}%</span></div><div class="pbar"><i style="width:${p}%"></i></div></div>`}).join(""):'<p class="empty">Целей пока нет.</p>'}</section>
  <section class="panel"><div class="panel-h"><h2>Привычки сегодня</h2><a href="#" data-act="go" data-v="habits">Трекер →</a></div>
    <div class="list">${S.habits.length?S.habits.map(h=>{const st=streak(h);const t=hT(h);const max=(h.mode||"min")==="max";const v=hv(h,td);
     const ctl=(t===1&&!max)?`<input type="checkbox" class="check" data-act="habit" data-id="${h.id}" data-d="${td}" ${v?"checked":""} aria-label="${esc(h.name)}">`:`<span class="hctl"><button class="btn sm" data-act="hMinus" data-id="${h.id}" aria-label="Минус один">−</button><span class="num ${cellCls(h,td)}">${v}/${t}</span><button class="btn sm" data-act="hPlus" data-id="${h.id}" aria-label="Плюс один">+</button></span>`;
     return `<div class="item">${ctl}<span class="t">${esc(h.name)}${exTag(h)}</span><span class="chip">${st} ${plural(st,"день","дня","дней")} подряд</span><button class="icon" data-act="del" data-k="habits" data-id="${h.id}" aria-label="Удалить">✕</button></div>`}).join(""):'<p class="empty">Добавьте привычку, чтобы отмечать её каждый день.</p>'}</div></section>
  ${M.overviewCats()}
  </div>`;
  return html}

function vTasks(){
  const td=TODAY(),f=ui.taskFilter;
  const filters=[["open","Активные"],["today","Сегодня"],["upcoming","Предстоящие"],["nodate","Без даты"],["done","Выполненные"]];
  let list=S.tasks.slice();
  if(f==="open")list=list.filter(t=>!t.done);
  if(f==="today")list=list.filter(t=>!t.done&&t.date&&t.date<=td);
  if(f==="upcoming")list=list.filter(t=>!t.done&&t.date>td);
  if(f==="nodate")list=list.filter(t=>!t.done&&!t.date);
  if(f==="done")list=list.filter(t=>t.done);
  list=list.filter(x=>byTag("tasks",x));list.sort(sortTasks);
  const lists=[...new Set(["Личное","Работа","Дом","Учёба",...S.tasks.map(t=>t.list).filter(Boolean)])];
  return `<div class="head"><div><div class="eyebrow">${S.tasks.filter(t=>!t.done).length} активных · ${S.tasks.filter(t=>t.done).length} выполнено</div><h1>Задачи</h1></div>
  ${S.tasks.some(t=>t.done)?'<button class="btn" data-act="clearDone">Удалить выполненные</button>':""}</div>
  <section class="panel">
   <form class="row" data-form="addTask">
     <input id="t-title" type="text" class="grow" name="title" placeholder="Что нужно сделать?" required autocomplete="off">
     <input id="t-date" type="date" name="date" aria-label="Срок">
     <input id="t-time" type="time" name="time" aria-label="Время начала">${durSelect("t-dur")}
     <select id="t-prio" name="prio" aria-label="Приоритет"><option value="mid">Обычный</option><option value="high">Высокий</option><option value="low">Низкий</option></select>
     <input id="t-list" type="text" name="list" list="lists" placeholder="Список" style="width:120px" autocomplete="off">
     ${tagInput("t-tags")}
     <datalist id="lists">${lists.map(l=>`<option value="${esc(l)}">`).join("")}</datalist>
     <button class="btn pri">Добавить</button>
   </form>
   <div class="panel-h"><div class="seg" role="group" aria-label="Фильтр">${filters.map(([id,n])=>`<button type="button" data-act="tf" data-f="${id}" aria-pressed="${f===id}">${n}</button>`).join("")}</div><span class="hint">Двойной щелчок по задаче — переименовать</span></div>
   ${tagBar("tasks")}
   <div class="list">${list.length?list.map(t=>taskRow(t)).join(""):'<p class="empty">Здесь пусто.</p>'}</div>
  </section>`}

function vCalendar(){
  const y=ui.calY,m=ui.calM,td=TODAY();
  const first=new Date(y,m,1);const shift=(first.getDay()+6)%7;const start=addDays(first,-shift);
  let cells=`<div class="dh" aria-hidden="true"></div>`+WD.map(w=>`<div class="dh">${w}</div>`).join("");
  for(let w=0;w<6;w++){
    const ws=addDays(start,w*7);
    if(w>=4&&ws.getMonth()!==m)break;
    cells+=`<div class="wk" title="Неделя ${isoWeek(ws)}">${isoWeek(ws)}</div>`;
    for(let i=0;i<7;i++){const d=addDays(ws,i),s=ymd(d);
      const ev=eventsOn(s).filter(e=>byTag("events",e));const tk=S.tasks.filter(t=>t.date===s&&!t.done).sort(sortTasks);
      const items=[...ev.map(e=>`<span class="ev" style="--ec:var(--${e.color||"c1"})">${e.time?esc(tRange(e))+" ":""}${esc(e.title)}</span>`),...tk.map(t=>`<span class="ev task p-${t.prio||"mid"}" title="Приоритет: ${PRIO_NAME[t.prio||"mid"]}">☐ ${t.time?esc(t.time)+" ":""}${esc(t.title)}</span>`)];
      cells+=`<button type="button" class="day ${d.getMonth()!==m?"out":""} ${s===td?"is-today":""} ${s===ui.calSel?"sel":""}" data-act="calDay" data-d="${s}" aria-label="${d.toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}"><span class="n">${d.getDate()}</span>${items.slice(0,3).join("")}${items.length>3?`<span class="more">ещё ${items.length-3}</span>`:""}<span class="dots">${[...ev.map(e=>`<span class="dot" style="--ec:var(--${e.color||"c1"})"></span>`),...tk.map(()=>'<span class="dot" style="--ec:var(--muted)"></span>')].slice(0,4).join("")}</span></button>`}
  }
  const sel=ui.calSel,sd=D(sel);
  const sev=eventsOn(sel);
  const stk=S.tasks.filter(t=>t.date===sel).sort(sortTasks);
  return `<div class="head"><div><div class="eyebrow">${y}</div><h1>${MONTHS[m]}</h1></div>
   <div style="display:flex;gap:6px"><button class="btn" data-act="calPrev" aria-label="Предыдущий месяц">←</button><button class="btn" data-act="calToday">Сегодня</button><button class="btn" data-act="calNext" aria-label="Следующий месяц">→</button></div></div>
  ${tagBar("events")}
  <div class="cal-wrap">
   <div class="cal">${cells}</div>
   <section class="panel">
     <div><div class="eyebrow">${sd.toLocaleDateString("ru-RU",{weekday:"long"})}</div><div style="font-family:var(--f-display);font-weight:700;font-size:21px">${sd.toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}</div></div>
     <h2>События</h2>
     <div class="list">${sev.length?sev.map(e=>`<div class="item"><span class="dot" style="--ec:var(--${e.color||"c1"})"></span><span class="ibody"><span class="t" ${ed("events",e.id,"title")}>${esc(e.title)}${exTag(e)}${e.repeat?` <span class="chip">↻ ${REPEAT[e.repeat].toLowerCase()}</span>`:""}</span><span class="meta">${timeChip("events",e)}${tagChips("events",e)}</span></span><button class="icon" data-act="del" data-k="events" data-id="${e.id}" aria-label="Удалить${e.repeat?" все повторы":""}">✕</button></div>`).join(""):'<p class="empty">Нет событий.</p>'}</div>
     <form data-form="addEvent" style="display:flex;flex-direction:column;gap:8px">
       <input id="e-title" type="text" name="title" placeholder="Новое событие" required autocomplete="off">
       <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label class="mini">с<input id="e-time" type="time" name="time" aria-label="Начало"></label><label class="mini">до<input id="e-end" type="time" name="end" aria-label="Окончание"></label>${tagInput("e-tags")}
         <select id="e-rep" name="repeat" aria-label="Повтор">${Object.entries(REPEAT).map(([k,v])=>`<option value="${k}">${v}</option>`).join("")}</select></div>
       <div style="display:flex;gap:8px;align-items:center"><span class="colors" role="radiogroup" aria-label="Цвет">${["c1","c2","c3","c4"].map((c,i)=>`<label><input type="radio" name="color" value="${c}" ${i===0?"checked":""}><span style="--ec:var(--${c})"></span></label>`).join("")}</span>
       <button class="btn pri" style="margin-left:auto">Добавить</button></div>
       <span class="hint">Событие со временем напомнит о себе уведомлением за 10 минут.</span>
     </form>
     <h2>Задачи на день</h2>
     <div class="list">${stk.length?stk.map(t=>taskRow(t,false)).join(""):'<p class="empty">Нет задач.</p>'}</div>
     <form class="row" data-form="addDayTask"><input id="dt-title" type="text" class="grow" name="title" placeholder="Задача на этот день" required autocomplete="off"><input id="dt-time" type="time" name="time" aria-label="Время начала">${durSelect("dt-dur")}${prioSelect("dt-prio")}<button class="btn">Добавить</button></form>
   </section>
  </div>`}

function goalPct(g){const st=+g.start||0,tg=+g.target,cur=+g.current||0;if(tg===st)return cur===tg?100:0;return Math.max(0,Math.min(100,Math.round((cur-st)/(tg-st)*100)))}
const fmtS=n=>{const v=+n||0;return (v<0?"−":"")+fmtN(Math.abs(v))};
function vGoals(){
  const td=TODAY();const list=S.goals.filter(g=>byTag("goals",g));
  return `<div class="head"><div><div class="eyebrow">${S.goals.filter(g=>goalPct(g)>=100).length} из ${S.goals.length} достигнуто</div><h1>Цели</h1></div></div>
  <section class="panel"><h2>Новая цель</h2>
   <form class="row" data-form="addGoal">
    <input id="g-title" type="text" class="grow" name="title" placeholder="Например: сбросить вес, прочитать книги" required autocomplete="off">
    <label class="mini">Старт<input id="g-start" type="number" name="start" step="any" value="0" style="width:90px"></label>
    <label class="mini">Цель<input id="g-target" type="number" name="target" step="any" placeholder="−10" required style="width:90px"></label>
    <input id="g-unit" type="text" name="unit" placeholder="ед. (кг, ₽, км)" style="width:120px" autocomplete="off">
    <input id="g-dl" type="date" name="deadline" aria-label="Срок">
    ${tagInput("g-tags")}
    <button class="btn pri">Добавить</button>
   </form><span class="hint">Цель может быть меньше старта или отрицательной: например, старт 0 и цель −10 кг, или старт 80 и цель 70.</span></section>
  ${tagBar("goals")}
  <div class="grid g-cards">${list.length?list.map(g=>{const p=goalPct(g);const won=p>=100;const st=+g.start||0;
    let dl="";if(g.deadline&&!won){const days=Math.round((D(g.deadline)-D(td))/864e5);dl=days<0?`<span class="chip late">просрочено на ${-days} ${plural(-days,"день","дня","дней")}</span>`:`<span class="chip">осталось ${days} ${plural(days,"день","дня","дней")}</span>`}
    return `<article class="panel goal ${won?"won":""}"><div class="panel-h"><span class="t" ${ed("goals",g.id,"title")}>${esc(g.title)}${exTag(g)}</span><button class="icon" data-act="del" data-k="goals" data-id="${g.id}" aria-label="Удалить">✕</button></div>
    <div class="meta">${won?'<span class="chip ok">Достигнута</span>':""}${dl}${g.deadline?`<span class="chip">до ${D(g.deadline).toLocaleDateString("ru-RU",{day:"numeric",month:"short",year:"numeric"})}</span>`:""}${tagChips("goals",g)}</div>
    <div class="pbar"><i style="width:${p}%"></i></div>
    <div class="panel-h"><span class="num">${fmtS(g.current)} → ${fmtS(g.target)} ${esc(g.unit||"")}</span><span class="num" style="color:var(--muted)">${p}%</span></div>
    ${st?`<span class="hint">Старт: ${fmtS(st)} ${esc(g.unit||"")}</span>`:""}
    <div class="goal-ctl"><button class="btn sm" data-act="gDec" data-id="${g.id}" aria-label="Минус один">−1</button><button class="btn sm" data-act="gInc" data-id="${g.id}" aria-label="Плюс один">+1</button>
     <input type="number" step="any" id="gs-${g.id}" data-goal="${g.id}" value="${g.current}" aria-label="Текущее значение"><span class="hint">текущее, Enter</span></div></article>`}).join(""):`<p class="empty">${S.goals.length?"Нет целей с этим тегом.":"Целей пока нет. Добавьте первую: название, откуда стартуете, к какому числу идёте и срок."}</p>`}</div>`}

function vHabits(){
  const days=[];for(let i=13;i>=0;i--)days.push(addDays(new Date(),-i));const td=TODAY();const list=S.habits.filter(h=>byTag("habits",h));
  return `<div class="head"><div><div class="eyebrow">Последние 2 недели</div><h1>Привычки</h1></div></div>
  <section class="panel">
   <form class="row" data-form="addHabit"><input id="h-name" type="text" class="grow" name="name" placeholder="Новая привычка: зарядка, вода, перекуры…" required autocomplete="off">
    <select id="h-mode" name="mode" aria-label="Условие"><option value="min">Хотя бы</option><option value="max">Не больше</option></select>
    <input id="h-target" type="number" name="target" min="1" step="1" value="1" style="width:64px" aria-label="Раз в день"><span class="hint">раз в день</span>
    ${tagInput("h-tags")}<button class="btn pri">Добавить</button></form>
   <span class="hint">Щелчок по клетке — +1, правый щелчок или долгое нажатие — −1. Если привычка «1 раз в день», щелчок просто отмечает день. «Не больше 7 раз» подойдёт, чтобы считать перекуры и держать лимит: зелёный — в пределах, красный — превышен.</span>
   ${tagBar("habits")}
   ${list.length?`<div class="tbl-wrap"><table class="hab"><thead><tr><th></th>${days.map(d=>`<th class="${d.getDay()%6===0?"we":""}">${WD[(d.getDay()+6)%7]}<br>${d.getDate()}</th>`).join("")}<th>Серия</th><th>30 дней</th></tr></thead><tbody>
   ${list.map(h=>{const st=streak(h);const t=hT(h);const max=(h.mode||"min")==="max";
     let okd=0,sum=0,nd=0;const s0=hStart(h);for(let i=0;i<30;i++){const k=ymd(addDays(new Date(),-i));if(max&&k<s0)continue;nd++;sum+=hv(h,k);if(hOk(h,k)&&(max||hv(h,k)>0))okd++}
     const stat=max?`≈ ${fmtN(nd?sum/nd:0)} в день`:`${Math.round(okd/30*100)}%`;
     return `<tr><td class="hname"><div class="hn"><button class="icon" data-act="del" data-k="habits" data-id="${h.id}" aria-label="Удалить привычку">✕</button><span class="t" ${ed("habits",h.id,"name")}>${esc(h.name)}</span>${exTag(h)}</div><div class="meta"><span class="chip">${max?"не больше":"хотя бы"} ${t} в день</span>${tagChips("habits",h)}</div></td>
     ${days.map(d=>{const s=ymd(d);const v=hv(h,s);const show=(t>1||max)&&v;return`<td><button type="button" class="hc ${cellCls(h,s)} ${s===td?"td":""}" data-act="habit" data-id="${h.id}" data-d="${s}" aria-label="${esc(h.name)}, ${d.toLocaleDateString("ru-RU",{day:"numeric",month:"long"})}: ${v}">${show?v:""}</button></td>`}).join("")}
     <td class="num" style="padding-left:10px!important;white-space:nowrap">${st} ${plural(st,"день","дня","дней")}</td><td class="num" style="white-space:nowrap">${stat}</td></tr>`}).join("")}
   </tbody></table></div>`:`<p class="empty">${S.habits.length?"Нет привычек с этим тегом.":"Добавьте привычку и отмечайте её каждый день."}</p>`}
  </section>`}

const URL_RE=/(?:https?:\/\/|www\.|t\.me\/)[^\s<>"'«»]+/gi;
function linkify(t){t=t||"";let out="",last=0,m;URL_RE.lastIndex=0;
  while((m=URL_RE.exec(t))){let url=m[0];const tr=url.match(/[.,;:!?)\]]+$/);if(tr&&!(tr[0].startsWith(")")&&url.includes("(")))url=url.slice(0,-tr[0].length);
    out+=esc(t.slice(last,m.index));const href=/^(www\.|t\.me\/)/i.test(url)?"https://"+url:url;
    out+=`<a class="nlink" href="${esc(href)}" target="_blank" rel="noopener" title="Открыть в браузере">${esc(url)}</a>`;last=m.index+url.length;URL_RE.lastIndex=last}
  return out+esc(t.slice(last))}
function linkCount(n){URL_RE.lastIndex=0;return ((n.text||"").match(URL_RE)||[]).length}
function noteTitle(n){const l=(n.text||"").split("\n").map(x=>x.trim()).filter(Boolean);return l[0]||"Без названия"}
function noteSnip(n){const l=(n.text||"").split("\n").map(x=>x.trim()).filter(Boolean);return l.slice(1).join(" ").slice(0,90)}
function vNotes(){const items=S.notes.items||[];
  const list=items.filter(n=>byTag("notes",n)).sort((a,b)=>(b.updated||0)-(a.updated||0));
  const sel=list.find(n=>n.id===ui.noteSel)||list[0];
  return `<div class="head"><div><div class="eyebrow">Черновики, идеи, списки · ${items.length}</div><h1>Заметки</h1></div><button class="btn pri" data-act="noteNew">Новая заметка</button></div>
  ${tagBar("notes")}
  <div class="notes-wrap"><div class="note-list">${list.length?list.map(n=>`<div class="note-card ${sel&&sel.id===n.id?"on":""}" data-act="noteSel" data-id="${n.id}"><div class="panel-h"><b class="t">${esc(noteTitle(n))}</b><button class="icon" data-act="del" data-k="notes" data-id="${n.id}" aria-label="Удалить заметку">✕</button></div>${noteSnip(n)?`<span class="hint">${esc(noteSnip(n))}</span>`:""}<span class="meta">${linkCount(n)?`<span class="chip">${linkCount(n)} ${plural(linkCount(n),"ссылка","ссылки","ссылок")}</span>`:""}${tagChips("notes",n)}</span></div>`).join(""):`<p class="empty">${items.length?"Нет заметок с этим тегом.":"Заметок пока нет."}</p>`}</div>
  <div class="note-ed">${sel?(ui.noteEdit===sel.id?`<div class="note-bar"><span class="hint">Редактирование. Ссылки станут активными после «Готово».</span><button type="button" class="btn sm pri" data-act="noteDone">Готово</button></div><textarea id="notes" class="notes" data-id="${sel.id}" placeholder="Первая строка станет названием заметки. Сохраняется автоматически." aria-label="Текст заметки" spellcheck="true">${esc(sel.text)}</textarea>`:`<div class="note-bar"><span class="hint">Ссылки открываются в браузере. Нажмите на текст, чтобы изменить.</span><button type="button" class="btn sm" data-act="noteEdit" data-id="${sel.id}">Изменить</button></div><div class="note-view" data-act="noteEdit" data-id="${sel.id}" tabindex="0" role="button" aria-label="Текст заметки, нажмите чтобы изменить">${sel.text?linkify(sel.text):'<span class="hint">Пустая заметка. Нажмите, чтобы писать.</span>'}</div>`):'<p class="empty">Нажмите «Новая заметка», чтобы начать.</p>'}</div></div>`}

const M=window.PlanerMoney({S,ui,esc,money,pad,D,TODAY,MONTHS,ymd,exTag,plural,save,render:(...a)=>render(...a),toast,snapshotFor,uid,tagChips,tagBar,byTag,parseTags,tagInput});
/* ---------- действия ---------- */
function find(k,id){return S[k].find(x=>x.id===id)}
document.addEventListener("click",e=>{
  if(e.target.closest("a.nlink"))return;
  const a=e.target.closest("[data-act]");if(!a)return;const act=a.dataset.act,id=a.dataset.id;
  if(a.tagName==="A")e.preventDefault();
  if(M.onClick(act,a))return;
  switch(act){
    case "go":go(a.dataset.v);break;
    case "folder":API.openDataFolder();break;
    case "toggleTask":{const t=find("tasks",id);if(t){t.done=a.checked;save("tasks");render()}break}
    case "del":{const k=a.dataset.k;if(k==="notes"){snapshotFor("notes");S.notes.items=S.notes.items.filter(x=>x.id!==id);save("notes");render();toast("Заметка удалена",true);break}snapshotFor(k);S[k]=S[k].filter(x=>x.id!==id);save(k);render();toast("Удалено",true);break}
    case "delTx":{snapshotFor("finance");S.finance.tx=S.finance.tx.filter(x=>x.id!==id);save("finance");render();toast("Операция удалена",true);break}
    case "undo":{if(undoState){S[undoState.k]=undoState.v;save(undoState.k);undoState=null;render()}$("#toast").hidden=true;break}
    case "clearDone":{snapshotFor("tasks");S.tasks=S.tasks.filter(t=>!t.done);save("tasks");render();toast("Выполненные удалены",true);break}
    case "tf":ui.taskFilter=a.dataset.f;render();break;
    case "calPrev":ui.calM--;if(ui.calM<0){ui.calM=11;ui.calY--}render();break;
    case "calNext":ui.calM++;if(ui.calM>11){ui.calM=0;ui.calY++}render();break;
    case "calToday":ui.calM=new Date().getMonth();ui.calY=new Date().getFullYear();ui.calSel=TODAY();render();break;
    case "calDay":{ui.calSel=a.dataset.d;const d=D(ui.calSel);if(d.getMonth()!==ui.calM){ui.calM=d.getMonth();ui.calY=d.getFullYear()}render();break}
    case "finPrev":ui.finM--;if(ui.finM<0){ui.finM=11;ui.finY--}render();break;
    case "finNext":ui.finM++;if(ui.finM>11){ui.finM=0;ui.finY++}render();break;
    case "finNow":ui.finM=new Date().getMonth();ui.finY=new Date().getFullYear();render();break;
    case "gInc":case "gDec":{const g=find("goals",id);if(g){g.current=Math.round((+(g.current||0)+(act==="gInc"?1:-1))*1000)/1000;save("goals");render()}break}
    case "habit":{const h=find("habits",id);if(h){const d=a.dataset.d;if(hT(h)===1&&(h.mode||"min")==="min")habitAdd(id,d,hv(h,d)?-1:1);else habitAdd(id,d,1)}break}
    case "hPlus":habitAdd(id,TODAY(),1);break;
    case "prioCycle":{const t=find("tasks",id);if(t){const seq=["mid","high","low"];t.prio=seq[(seq.indexOf(t.prio||"mid")+1)%3];save("tasks");render();toast("Приоритет: "+PRIO_NAME[t.prio])}break}
    case "timeEdit":{const k=a.dataset.k;const x=LISTS[k]().find(i=>i.id===id);if(!x)break;const box=document.createElement("span");box.className="time-edit";
      box.innerHTML=(k==="tasks"?`<input type="time" class="te-a" value="${x.time||""}" aria-label="Время начала">${durSelect("",x.dur)}`:`<input type="time" class="te-a" value="${x.time||""}" aria-label="Начало"><span>–</span><input type="time" class="te-b" value="${x.end||""}" aria-label="Окончание">`)+`<button type="button" class="btn sm pri" data-act="timeSave" data-k="${k}" data-id="${id}">OK</button>`;
      a.replaceWith(box);editing=true;box.querySelector("input").focus();break}
    case "timeSave":{const k=a.dataset.k;const x=LISTS[k]().find(i=>i.id===id);const box=a.closest(".time-edit");editing=false;
      if(x&&box){x.time=box.querySelector(".te-a").value||"";if(k==="tasks")x.dur=+box.querySelector("select").value||0;else x.end=x.time?(box.querySelector(".te-b").value||""):"";save(k)}render();break}
    case "hMinus":habitAdd(id,TODAY(),-1);break;
    case "tagPick":{const k=a.dataset.k,t=a.dataset.tag;ui.tag[k]=t&&ui.tag[k]!==t?t:"";render();break}
    case "tagEdit":{const k=a.dataset.k;const x=LISTS[k]().find(i=>i.id===id);if(!x||editing)break;editing=true;const span=a.closest(".tags");const inp=document.createElement("input");inp.type="text";inp.className="inline-edit tag-input";inp.placeholder="теги через запятую";inp.value=(x.tags||[]).join(", ");span.replaceWith(inp);inp.focus();
      let done=false;const fin=ok=>{if(done)return;done=true;editing=false;if(ok){x.tags=parseTags(inp.value);save(SAVEKEY[k])}render()};
      inp.addEventListener("keydown",ev=>{if(ev.key==="Enter")fin(true);if(ev.key==="Escape")fin(false)});inp.addEventListener("blur",()=>fin(true));break}
    case "noteSel":ui.noteSel=id;ui.noteEdit=null;render();break;
    case "noteEdit":ui.noteSel=id;ui.noteEdit=id;render();{const t=document.getElementById("notes");if(t){t.focus();const L=t.value.length;t.setSelectionRange(L,L)}}break;
    case "noteDone":ui.noteEdit=null;if(notesT){clearTimeout(notesT);notesT=null;save("notes")}render();break;
    case "noteNew":{const n={id:uid(),text:"",tags:ui.tag.notes?[ui.tag.notes]:[],updated:Date.now()};S.notes.items.push(n);ui.noteSel=n.id;ui.noteEdit=n.id;save("notes");render();const t=document.getElementById("notes");if(t)t.focus();break}
    case "seed":seed();break;
    case "clearEx":{S.tasks=S.tasks.filter(x=>!x.ex);S.events=S.events.filter(x=>!x.ex);S.finance.tx=S.finance.tx.filter(x=>!x.ex);S.goals=S.goals.filter(x=>!x.ex);S.habits=S.habits.filter(x=>!x.ex);
      if(S.finance.exBudgets){for(const c of S.finance.exBudgets)delete S.finance.budgets[c];delete S.finance.exBudgets}
      for(const k of["tasks","events","finance","goals","habits"])save(k);render();toast("Примеры убраны");break}
  }
});
/* двойной щелчок — переименовать */
document.addEventListener("dblclick",e=>{
  const cr=e.target.closest("[data-catrename]");
  if(cr&&!editing){editing=true;const i=+cr.dataset.catrename;const inp=document.createElement("input");inp.type="text";inp.className="inline-edit";inp.value=cr.textContent;cr.replaceWith(inp);inp.focus();inp.select();
    let done=false;const fin=ok=>{if(done)return;done=true;editing=false;if(ok)M.renameCat(i,inp.value);render()};
    inp.addEventListener("keydown",ev=>{if(ev.key==="Enter")fin(true);if(ev.key==="Escape")fin(false)});inp.addEventListener("blur",()=>fin(true));return}
  const el=e.target.closest("[data-edit]");if(!el||editing)return;
  const [k,id,field]=el.dataset.edit.split("|");const item=find(k,id);if(!item)return;
  editing=true;const inp=document.createElement("input");inp.type="text";inp.className="inline-edit";inp.value=item[field];
  el.replaceWith(inp);inp.focus();inp.select();
  let done=false;const finish=ok=>{if(done)return;done=true;editing=false;const v=inp.value.trim();if(ok&&v&&v!==item[field]){item[field]=v;save(k)}render()};
  inp.addEventListener("keydown",ev=>{if(ev.key==="Enter")finish(true);if(ev.key==="Escape")finish(false)});
  inp.addEventListener("blur",()=>finish(true));
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(M.onChange(t))return;
  if(t.id==="cur"){S.finance.cur=t.value;save("finance");render()}
  if(t.dataset.goal){const g=find("goals",t.dataset.goal);if(g){g.current=parseFloat(String(t.value).replace(",","."))||0;save("goals");render()}}
});
let notesT=null;
document.addEventListener("focusout",e=>{if(e.target.id!=="notes")return;setTimeout(()=>{const ae=document.activeElement;if((ae&&ae.id==="notes")||!ui.noteEdit)return;
  ui.noteEdit=null;if(notesT){clearTimeout(notesT);notesT=null;save("notes")}if(!editing)render()},150)});
document.addEventListener("keydown",e=>{if(e.target.classList&&e.target.classList.contains("note-view")&&(e.key==="Enter"||e.key===" ")){e.preventDefault();e.target.click()}});
document.addEventListener("keydown",e=>{const box=e.target.closest&&e.target.closest(".time-edit");if(!box)return;if(e.key==="Enter"){e.preventDefault();box.querySelector('[data-act="timeSave"]').click()}if(e.key==="Escape"){editing=false;render()}});
document.addEventListener("input",e=>{
  if(M.onInput(e.target))return;
  if(e.target.id==="fin-q"){ui.finQ=e.target.value;render();return}
  if(e.target.id==="notes"){const n=(S.notes.items||[]).find(x=>x.id===e.target.dataset.id);if(!n)return;n.text=e.target.value;n.updated=Date.now();
    const c=document.querySelector(`.note-card[data-id="${n.id}"] .t`);if(c)c.textContent=noteTitle(n);
    clearTimeout(notesT);notesT=setTimeout(()=>save("notes"),500)}});
document.addEventListener("contextmenu",e=>{const a=e.target.closest('.hc[data-act="habit"]');if(!a)return;e.preventDefault();habitAdd(a.dataset.id,a.dataset.d,-1)});
document.addEventListener("submit",e=>{
  const f=e.target.closest("form[data-form]");if(!f)return;e.preventDefault();
  const v=Object.fromEntries(new FormData(f).entries());const kind=f.dataset.form;let focusId=null;
  const trim=s=>String(s||"").trim();
  if(kind==="addTask"||kind==="quickTask"||kind==="addDayTask"){
    const title=trim(v.title);if(!title)return;
    const date=kind==="quickTask"?TODAY():kind==="addDayTask"?ui.calSel:(v.date||"");
    S.tasks.push({id:uid(),title,done:false,date,prio:v.prio||"mid",list:trim(v.list),tags:parseTags(v.tags),time:v.time||"",dur:+v.dur||0});save("tasks");
    focusId={addTask:"t-title",quickTask:"qt",addDayTask:"dt-title"}[kind]}
  if(kind==="addEvent"){const title=trim(v.title);if(!title)return;S.events.push({id:uid(),title,date:ui.calSel,time:v.time||"",end:v.time&&v.end?v.end:"",color:v.color||"c1",repeat:v.repeat||"",tags:parseTags(v.tags)});save("events");focusId="e-title"}
  {const r=M.onSubmit(kind,v,trim);if(r!==undefined)focusId=r}
  if(kind==="addGoal"){const title=trim(v.title);const target=parseFloat(String(v.target).replace(",","."));const start=parseFloat(String(v.start||"0").replace(",","."))||0;if(!title||isNaN(target))return;if(target===start){toast("Цель должна отличаться от старта");return}S.goals.push({id:uid(),title,start,target,current:start,unit:trim(v.unit),deadline:v.deadline||"",tags:parseTags(v.tags)});save("goals");focusId="g-title"}
  if(kind==="addHabit"){const name=trim(v.name);if(!name)return;S.habits.push({id:uid(),name,days:{},target:Math.max(1,Math.round(+v.target||1)),mode:v.mode==="max"?"max":"min",created:TODAY(),tags:parseTags(v.tags)});save("habits");focusId="h-name"}
  render();if(focusId){const el=document.getElementById(focusId);if(el)el.focus()}
});
API.onNav(v=>go(v));
API.onNewTask(()=>{if(ui.view!=="tasks"&&ui.view!=="overview")go("tasks");const el=document.getElementById(ui.view==="tasks"?"t-title":"qt");if(el)el.focus()});

/* ---------- напоминания ---------- */
const notified=new Set();
function checkReminders(){
  const n=new Date(),s=ymd(n),mins=n.getHours()*60+n.getMinutes();
  for(const t of S.tasks){if(t.done||t.date!==s||!t.time)continue;const [th,tm]=t.time.split(":").map(Number);const df=th*60+tm-mins;const tk="t"+t.id+s;
    if(df<=10&&df>=0&&!notified.has(tk)){notified.add(tk);API.notify("Задача: "+t.title,df===0?"Пора начинать"+(t.dur?", займёт "+fmtDur(t.dur):""):`Через ${df} ${plural(df,"минуту","минуты","минут")}, в ${t.time}${t.dur?" · "+fmtDur(t.dur):""}`)}}
  for(const e of eventsOn(s)){if(!e.time)continue;const [h,m]=e.time.split(":").map(Number);const at=h*60+m;const diff=at-mins;
    const key=e.id+s;
    if(diff<=10&&diff>=0&&!notified.has(key)){notified.add(key);API.notify(e.title,diff===0?"Начинается сейчас"+(e.end?", до "+e.end:""):`Через ${diff} ${plural(diff,"минуту","минуты","минут")}, ${e.end?"с "+e.time+" до "+e.end:"в "+e.time}`)}}
}
let lastDay=TODAY();
setInterval(()=>{checkReminders();if(TODAY()!==lastDay){lastDay=TODAY();if(!editing&&!document.activeElement.matches("input,textarea"))render()}},30000);

/* ---------- пример ---------- */
function seed(){
  const d=n=>ymd(addDays(new Date(),n));const p=ymd(new Date()).slice(0,8);
  const T=(title,date,prio,list,done)=>({id:uid(),title,date,prio,list,done:!!done,ex:true});
  S.tasks.push(T("Оплатить интернет",d(0),"high","Дом"),T("Подготовить отчёт за месяц",d(0),"mid","Работа"),T("Записаться к стоматологу",d(-1),"mid","Личное"),
    T("Купить подарок маме",d(4),"low","Личное"),T("Разобрать почту",d(0),"low","Работа",true),T("Обновить резюме","","low","Работа"));
  const E=(title,date,time,color,repeat)=>({id:uid(),title,date,time,color,repeat:repeat||"",ex:true});
  S.events.push(E("Созвон с командой",d(0),"11:00","c1","weekly"),E("Тренировка",d(1),"19:30","c2"),E("День рождения мамы",d(5),"","c4","yearly"),E("Сдать отчёт",d(3),"18:00","c3"),E("Кино с друзьями",d(-4),"20:00","c4"));
  const X=(type,amount,cat,day,note,pay)=>({id:uid(),type,amount,cat,date:p+pad(day),note,pay:pay||"Карта",ex:true});
  const today=new Date().getDate();const dd=n=>Math.max(1,Math.min(today,n));
  S.finance.tx.push(X("out",1200,"Продукты",dd(2),"Пример покупки"),X("out",900,"Доставка еды и кафе",dd(3),"Пример обеда","Наличные"));
  const G=(title,target,current,unit,deadline)=>({id:uid(),title,target,current,unit,deadline,ex:true});
  S.goals.push(G("Прочитать книги за год",24,17,"книг",new Date().getFullYear()+"-12-31"),G("Подушка безопасности",300000,185000,"₽",d(120)),G("Пробежать за месяц",80,26,"км",d(27)));
  const hd=pattern=>{const o={};pattern.forEach((v,i)=>{if(v)o[d(-(pattern.length-1-i))]=true});return o};
  S.habits.push({id:uid(),name:"Зарядка 15 минут",days:hd([1,1,0,1,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,0]),ex:true},{id:uid(),name:"Читать 20 страниц",days:hd([0,1,1,1,0,1,1,0,1,1,0,1,1,1,0,1,1,1,1,0,0]),ex:true},{id:uid(),name:"2 литра воды",days:hd([1,1,0,1,1,0,1,1,1,1,1,0,1,1,1,1,1,0,1,1,1]),ex:true});
  for(const k of["tasks","events","finance","goals","habits"])save(k);render();
}

/* ---------- старт ---------- */
API.load().then(data=>{
  data=data||{};
  for(const k in KEYS){if(data[k]!=null)S[k]=Array.isArray(KEYS[k])?data[k]:Object.assign(clone(KEYS[k]),data[k])}
  migrate();
  render();checkReminders();
});
/* обновления с другого устройства (синхронизация) */
let remotePending=false;
const typing=()=>{const ae=document.activeElement;return editing||(ae&&$("#main").contains(ae)&&(/TEXTAREA|SELECT/.test(ae.tagName)||(ae.tagName==="INPUT"&&ae.value!=="")))};
if(API.onRemote)API.onRemote((k,v)=>{if(!(k in KEYS)||v==null)return;S[k]=Array.isArray(KEYS[k])?clone(v):Object.assign(clone(KEYS[k]),clone(v));if(typing()){remotePending=true;return}render()});
document.addEventListener("focusout",()=>setTimeout(()=>{if(remotePending&&!typing()){remotePending=false;render()}},80));
/* доступ для web.js */
window.Planer={S,ui,KEYS,render,go,save,clone,migrate,toast,esc,habitAdd};
/* Перенос данных из таблицы Excel и обновление старого формата финансов — один раз */
function migrate(){
  const X=window.EXCEL_IMPORT;let fin=false,lo=false;
  if(!S.finance.cats||!S.finance.cats.length){
    S.finance.cats=X?clone(X.cats):[];
    const known=n=>S.finance.cats.some(c=>c.name===n);
    for(const t of S.finance.tx)if(t.cat&&!known(t.cat))S.finance.cats.push({name:t.cat,type:t.type==="in"?"Доход":"Другой",plan:+(S.finance.budgets||{})[t.cat]||0,note:""});
    for(const c in (S.finance.budgets||{}))if(!known(c))S.finance.cats.push({name:c,type:"Другой",plan:+S.finance.budgets[c]||0,note:""});else{const cc=S.finance.cats.find(x=>x.name===c);if(!cc.plan)cc.plan=+S.finance.budgets[c]||0}
    fin=true}
  if(X&&!S.finance.excelImported){
    const ids=new Set(S.finance.tx.map(t=>t.id));
    for(const t of X.tx)if(!ids.has(t.id)){const ty=(S.finance.cats.find(c=>c.name===t.cat)||{}).type;S.finance.tx.push(Object.assign({type:ty==="Доход"?"in":"out"},t))}
    S.finance.excelImported=true;fin=true}
  if(X&&!S.loans.excelImported&&!(S.loans.list||[]).length){Object.assign(S.loans,clone(X.loans));S.loans.excelImported=true;lo=true}
  if(!Array.isArray(S.notes.items))S.notes.items=[];
  if(S.notes.text&&!S.notes.items.length){S.notes.items.push({id:uid(),text:S.notes.text,tags:[],updated:Date.now()});S.notes.text="";save("notes")}
  if(!S.finance.debtCats){S.finance.debtCats=true;S.finance.cats=S.finance.cats||[];
    for(const [n,d] of [["Взял в долг","in"],["Вернул долг","out"],["Дал в долг","out"],["Вернули мне долг","in"]])if(!S.finance.cats.some(c=>c.name===n))S.finance.cats.push({name:n,type:"Долг",dir:d,plan:0,note:d==="in"?"деньги пришли":"деньги ушли"});fin=true}
  if(fin)save("finance");if(lo)save("loans");
}
})();
