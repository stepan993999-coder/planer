/* Разделы «Финансы» и «Кредиты». Подключается из app.js через window.PlanerMoney(ctx). */
window.PlanerMoney=function(ctx){
"use strict";
const {S,ui,esc,money,pad,D,TODAY,MONTHS,ymd,exTag,plural,save,render,toast,snapshotFor,uid,tagChips,tagBar,byTag,parseTags,tagInput}=ctx;
const C=window.PlanerCalc;
const TYPES=["Доход","Обязательный","Кредит","Другой","Долг"];
const TYPE_CHIP={"Доход":"ok","Обязательный":"warn","Кредит":"late","Другой":"","Долг":"debt"};
const MON_SHORT=["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
const monLabel=k=>{const [y,m]=k.split("-").map(Number);return MONTHS[m-1]+" "+y};
const monShort=k=>{const [y,m]=k.split("-").map(Number);return MON_SHORT[m-1]+" "+String(y).slice(2)};
const rub=v=>money(v);
const real=()=>S.finance.tx.filter(t=>!t.ex);

function cats(){return S.finance.cats||[]}
const TYPE_ORDER={"Доход":0,"Обязательный":1,"Кредит":2,"Другой":3,"Долг":4};
const GROUP_NAME={"Доход":"Доходы","Обязательный":"Обязательные расходы","Кредит":"Кредиты","Другой":"Другие расходы","Долг":"Долги — не доход и не расход"};
const byName=(a,b)=>a.name.localeCompare(b.name,"ru",{sensitivity:"base"});
function sortedCats(){return cats().map((c,i)=>({c,i})).sort((a,b)=>(TYPE_ORDER[a.c.type]??9)-(TYPE_ORDER[b.c.type]??9)||byName(a.c,b.c))}
function grpRow(ty,arr){const g=arr.filter(x=>x.c.type===ty);const plan=g.reduce((a,x)=>a+(+x.c.plan||0),0);
  return `<tr class="grp"><td colspan="6"><b>${GROUP_NAME[ty]||ty}</b><span>${g.length} ${plural(g.length,"категория","категории","категорий")}${plan?" · план "+rub(plan)+" в месяц":""}</span></td></tr>`}
const TRANSFER="Перевод (наличные ↔ карта)";const WALLETS=["Наличные","Карта"];
function catType(name){if(name===TRANSFER)return "Перевод";const c=cats().find(c=>c.name===name);if(c)return c.type;const t=S.finance.tx.find(x=>x.cat===name);return t&&t.type==="in"?"Доход":"Другой"}
function txIsIncome(t){return catType(t.cat)==="Доход"}
function catDirName(name){const c=cats().find(x=>x.name===name);return c&&c.dir==="in"?"in":"out"}
function txDir(t){const c=cats().find(x=>x.name===t.cat);if(c&&c.type==="Долг")return c.dir==="in"?"in":"out";return t.dir||(t.type==="in"?"in":"out")}
function sumCat(p,name){return S.finance.tx.filter(t=>(t.date||"").startsWith(p)&&t.cat===name).reduce((a,t)=>a+(+t.amount||0),0)}
function debtStats(p){let i=0,o=0,mi=0,mo=0,n=0;for(const t of S.finance.tx){if(t.ex||catType(t.cat)!=="Долг")continue;n++;const a=+t.amount||0;const inn=txDir(t)==="in";
    if(inn)i+=a;else o+=a;if(p&&(t.date||"").startsWith(p)){if(inn)mi+=a;else mo+=a}}return{n,inAll:i,outAll:o,net:i-o,inM:mi,outM:mo}}
function walletDebt(w){let n=0;for(const t of S.finance.tx){if(t.ex||t.pay!==w||catType(t.cat)!=="Долг")continue;n+=(txDir(t)==="in"?1:-1)*(+t.amount||0)}return n}
function debtNowText(d){return d.net>0?`долг ${rub(d.net)}`:d.net<0?`мне должны ${rub(-d.net)}`:"долгов нет"}
function debtLine(){let i=0,o=0,n=0;for(const t of S.finance.tx){if(catType(t.cat)!=="Долг")continue;n++;if(txDir(t)==="in")i+=+t.amount||0;else o+=+t.amount||0}
  return n?`<p class="hint" style="margin:-8px 0 0">Долги за всё время: получено ${rub(i)}, отдано ${rub(o)}, разница ${money(i-o,true)}. В доходы, расходы и итог месяца не входят — учтены только в остатках наличных и карты.</p>`:""}
function calc(){return C.compute(S.loans,real(),catType,new Date(),txDir)}

function monthStats(p,src){let inc=0,obl=0,cr=0,oth=0,dIn=0,dOut=0,cashIn=0,cashOut=0,cardOut=0;const by={};
  for(const t of src){if(!t.date||!t.date.startsWith(p))continue;const a=+t.amount||0;const ty=catType(t.cat);if(ty==="Перевод")continue;const isIn=ty==="Доход"||(ty==="Долг"&&txDir(t)==="in");
    if(ty==="Доход")inc+=a;else if(ty==="Долг"){if(isIn)dIn+=a;else dOut+=a}else{if(ty==="Обязательный")obl+=a;else if(ty==="Кредит")cr+=a;else oth+=a;by[t.cat]=(by[t.cat]||0)+a}
    if(t.pay==="Наличные"){if(isIn)cashIn+=a;else cashOut+=a}else if(t.pay==="Карта"&&!isIn)cardOut+=a}
  return{inc,obl,cr,oth,dIn,dOut,debt:dIn-dOut,out:obl+cr+oth,left:inc-obl-cr-oth,cashIn,cashOut,cardOut,by}}

function catOptions(sel){
  return TYPES.map(ty=>{const list=cats().filter(c=>c.type===ty).sort(byName);if(!list.length)return"";
    return `<optgroup label="${({"Доход":"Доходы","Обязательный":"Обязательные","Кредит":"Кредиты","Другой":"Другие расходы","Долг":"Долги (не доход и не расход)"})[ty]}">${list.map(c=>`<option ${c.name===sel?"selected":""}>${esc(c.name)}</option>`).join("")}</optgroup>`}).join("")}

/* ---------------- Финансы ---------------- */
function vFinance(){
  const y=ui.finY,m=ui.finM,p=y+"-"+pad(m+1);
  const all=S.finance.tx;const f=monthStats(p,all);
  const tx=all.filter(t=>t.date&&t.date.startsWith(p)).sort((a,b)=>b.date.localeCompare(a.date)||(b.id>a.id?1:-1));
  const defDate=(y===new Date().getFullYear()&&m===new Date().getMonth())?TODAY():p+"-01";
  const planObl=cats().filter(c=>c.type==="Обязательный").reduce((a,c)=>a+(+c.plan||0),0);
  const planOth=cats().filter(c=>c.type==="Другой").reduce((a,c)=>a+(+c.plan||0),0);
  /* расходы против плана: обязательные и другие */
  const rows=cats().filter(c=>c.type==="Обязательный"||c.type==="Другой").map(c=>({c:c.name,ty:c.type,v:f.by[c.name]||0,l:+c.plan||0})).filter(r=>r.v||r.l);
  for(const k in f.by)if(!cats().some(c=>c.name===k)&&catType(k)!=="Кредит")rows.push({c:k,ty:"Другой",v:f.by[k],l:0});
  rows.sort((a,b)=>b.v-a.v||b.l-a.l);
  const max=Math.max(1,...rows.map(r=>Math.max(r.v,r.l)));
  const tab=ui.finTab||"month";
  return `<div class="head"><div><div class="eyebrow">${y} · дневник доходов и расходов</div><h1>Финансы: ${MONTHS[m].toLowerCase()}</h1></div>
   <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
   <div class="seg" role="group" aria-label="Вид"><button type="button" data-act="finTab" data-t="month" aria-pressed="${tab==="month"}">Месяц</button><button type="button" data-act="finTab" data-t="year" aria-pressed="${tab==="year"}">Сводка за год</button><button type="button" data-act="finTab" data-t="cats" aria-pressed="${tab==="cats"}">Категории</button></div>
   ${tab==="month"?`<button class="btn" data-act="finPrev" aria-label="Предыдущий месяц">←</button><button class="btn" data-act="finNow">Этот месяц</button><button class="btn" data-act="finNext" aria-label="Следующий месяц">→</button>`:""}</div></div>
  ${tab==="year"?vYear():tab==="cats"?vCats():`
  <div class="stats s5">
   <div class="stat"><small>Доходы</small><span class="num pos">${rub(f.inc)}</span></div>
   <div class="stat"><small>Обязательные${planObl?` · план ${rub(planObl)}`:""}</small><span class="num ${planObl&&f.obl>planObl?"neg":""}">${rub(f.obl)}</span></div>
   <div class="stat"><small>На кредиты</small><span class="num">${rub(f.cr)}</span></div>
   <div class="stat"><small>Другие${planOth?` · план ${rub(planOth)}`:""}</small><span class="num ${planOth&&f.oth>planOth?"neg":""}">${rub(f.oth)}</span></div>
   <div class="stat" title="Доходы минус расходы за месяц"><small>Итог месяца</small><span class="num ${f.left<0?"neg":""}">${money(f.left,true)}</span></div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">
   <section class="panel"><h2>Новая операция</h2>
    <form data-form="addTx" style="display:flex;flex-direction:column;gap:10px">
     <div style="display:flex;gap:8px;flex-wrap:wrap"><input id="x-amount" type="number" name="amount" min="0" step="0.01" placeholder="Сумма, без минуса" required class="grow">
     <input id="x-date" type="date" name="date" value="${defDate}" required aria-label="Дата"></div>
     <select id="x-cat" name="cat" required aria-label="Категория"><option value="" disabled ${ui.lastCat?"":"selected"}>Категория…</option>${catOptions(ui.lastCat)}</select>
     <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <div class="seg" role="radiogroup" aria-label="Способ оплаты">${["Карта","Наличные"].map(v=>`<button type="button" data-act="payWay" data-v="${v}" aria-pressed="${(ui.payWay||"Карта")===v}">${v}</button>`).join("")}</div>
      <input id="x-note" type="text" name="note" placeholder="Комментарий" autocomplete="off" class="grow">${tagInput("x-tags")}</div>
     <button class="btn pri">Записать</button>
     <span class="hint">Тип подставится сам по категории. Платёж с категорией «Кредит: …» сразу попадёт в раздел «Кредиты». Категории типа «Долг» не считаются доходом или расходом.</span>
    </form></section>
   <section class="panel"><div class="panel-h"><h2>${picked()?"Выбранные категории":"Расходы против плана"}</h2><button class="btn sm" data-act="finTab" data-t="cats">Выбрать категории</button></div>${catBars(p)}</section>
  </div>
  ${walletsPanel(p,defDate)}
  ${opsSection(p)}`}`}

/* операции: поиск, фильтры, сортировка */
function opsSection(p){
  const scope=ui.finScope||"month";const q=(ui.finQ||"").trim().toLowerCase();const fc=ui.finCat||"";const ft=ui.finType||"";const so=ui.finSort||"date-desc";
  let list=S.finance.tx.filter(t=>scope==="all"||(t.date||"").startsWith(p));
  if(fc)list=list.filter(t=>t.cat===fc);
  if(ft)list=list.filter(t=>catType(t.cat)===ft);
  list=list.filter(t=>byTag("tx",t));
  if(q)list=list.filter(t=>[t.cat,t.note,t.pay,(t.tags||[]).map(x=>"#"+x).join(" "),String(t.amount)].join(" ").toLowerCase().includes(q));
  const cmp={"date-desc":(a,b)=>b.date.localeCompare(a.date)||(b.id>a.id?1:-1),"date-asc":(a,b)=>a.date.localeCompare(b.date),"sum-desc":(a,b)=>b.amount-a.amount,"sum-asc":(a,b)=>a.amount-b.amount,"cat":(a,b)=>a.cat.localeCompare(b.cat,"ru")||b.date.localeCompare(a.date)}[so]||((a,b)=>0);
  list.sort(cmp);
  let sIn=0,sOut=0,sD=0;for(const t of list){const ty=catType(t.cat);if(ty==="Перевод")continue;if(ty==="Доход")sIn+=+t.amount;else if(ty==="Долг")sD+=(txDir(t)==="in"?1:-1)*(+t.amount||0);else sOut+=+t.amount}
  const filtered=!!(q||fc||ft||ui.tag.tx);
  const used=[...new Set(S.finance.tx.map(t=>t.cat))].filter(n=>!cats().some(c=>c.name===n));
  const catSel=`<select id="fin-cat" aria-label="Категория"><option value="">Все категории</option>${TYPES.map(ty=>{const l=cats().filter(c=>c.type===ty).sort(byName);return l.length?`<optgroup label="${ty}">${l.map(c=>`<option ${c.name===fc?"selected":""}>${esc(c.name)}</option>`).join("")}</optgroup>`:""}).join("")}${used.map(n=>`<option ${n===fc?"selected":""}>${esc(n)}</option>`).join("")}</select>`;
  return `<section class="panel"><div class="panel-h"><h2>Операции ${scope==="all"?"за всё время":"за месяц"} · ${list.length}</h2>
    <div class="seg" role="group" aria-label="Период"><button type="button" data-act="finScope" data-v="month" aria-pressed="${scope==="month"}">Этот месяц</button><button type="button" data-act="finScope" data-v="all" aria-pressed="${scope==="all"}">Всё время</button></div></div>
   <div class="filters"><input id="fin-q" type="search" placeholder="Поиск: категория, комментарий, #тег, сумма" value="${esc(ui.finQ||"")}" class="grow" autocomplete="off">
    ${catSel}
    <select id="fin-type" aria-label="Тип"><option value="">Все типы</option>${TYPES.map(t=>`<option ${t===ft?"selected":""}>${t}</option>`).join("")}</select>
    <select id="fin-sort" aria-label="Сортировка">${[["date-desc","Сначала новые"],["date-asc","Сначала старые"],["sum-desc","Сумма: по убыванию"],["sum-asc","Сумма: по возрастанию"],["cat","По категории"]].map(([v,l])=>`<option value="${v}" ${so===v?"selected":""}>${l}</option>`).join("")}</select>
    ${filtered?'<button class="btn" data-act="finReset">Сбросить</button>':""}</div>
   ${tagBar("tx")}
   ${filtered&&list.length?`<p class="hint" style="margin:0">Найдено ${list.length}: доходы ${rub(sIn)}, расходы ${rub(sOut)}${sD?", долги "+money(sD,true):""}</p>`:""}
   ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th>Категория</th><th>Тип</th><th>Способ</th><th>Комментарий</th><th>Теги</th><th class="r">Сумма</th><th></th></tr></thead><tbody>
   ${list.map(t=>{if(t.cat===TRANSFER)return trRow(t,scope);const ty=catType(t.cat);const inc=ty==="Доход"||(ty==="Долг"&&txDir(t)==="in");const dcls=ty==="Долг"?"debtv":inc?"pos":"neg";const known=cats().some(c=>c.name===t.cat);return `<tr><td class="num">${D(t.date).toLocaleDateString("ru-RU",scope==="all"?{day:"2-digit",month:"2-digit",year:"2-digit"}:{day:"2-digit",month:"2-digit"})}</td><td><button type="button" class="linkish" data-act="finCatPick" data-v="${esc(t.cat)}" title="Показать только эту категорию">${esc(t.cat)}</button>${exTag(t)}${known?"":' <span class="chip late" title="Категории нет в списке">нет в списке</span>'}</td><td><span class="chip ${TYPE_CHIP[ty]}">${ty}</span></td><td style="color:var(--muted)">${esc(t.pay||"—")}</td><td style="color:var(--muted)">${esc(t.note)}</td><td>${tagChips("tx",t)}</td><td class="r num ${dcls}">${money(inc?+t.amount:-t.amount,true)}</td><td class="r"><button class="icon" data-act="delTx" data-id="${t.id}" aria-label="Удалить">✕</button></td></tr>`}).join("")}
   </tbody></table></div>`:`<p class="empty">${filtered?"Ничего не найдено. Измените условия или нажмите «Сбросить».":"Операций пока нет. Запишите первую в форме выше."}</p>`}
  </section>`}

/* полоски по категориям: выбранные пользователем или все с тратами и планом */
function picked(){return cats().some(c=>c.show)}
function catBars(p,limit){
  const f=monthStats(p,S.finance.tx);const inc={};for(const t of S.finance.tx)if((t.date||"").startsWith(p)&&catType(t.cat)==="Доход")inc[t.cat]=(inc[t.cat]||0)+(+t.amount||0);
  let rows;
  if(picked())rows=sortedCats().map(x=>x.c).filter(c=>c.show).map(c=>({c:c.name,ty:c.type,v:c.type==="Доход"?(inc[c.name]||0):c.type==="Долг"?sumCat(p,c.name):(f.by[c.name]||0),l:+c.plan||0}));
  else{rows=cats().filter(c=>c.type==="Обязательный"||c.type==="Другой").map(c=>({c:c.name,ty:c.type,v:f.by[c.name]||0,l:+c.plan||0})).filter(r=>r.v||r.l);
    for(const k in f.by)if(!cats().some(c=>c.name===k)&&catType(k)!=="Кредит")rows.push({c:k,ty:"Другой",v:f.by[k],l:0});
    rows.sort((a,b)=>b.v-a.v||b.l-a.l)}
  const more=limit&&rows.length>limit?rows.length-limit:0;if(limit)rows=rows.slice(0,limit);
  if(!rows.length)return `<p class="empty">${picked()?"Выбранных категорий нет.":"В этом месяце расходов нет."}</p>`;
  const max=Math.max(1,...rows.map(r=>Math.max(r.v,r.l)))*1.1;
  return `<div class="bars">${rows.map(r=>{const ic=r.ty==="Доход";const over=!ic&&r.l&&r.v>r.l;return`<div class="bar ${over?"over":""} ${ic?"inc":""} ${r.ty==="Долг"?"debt":""}"><span class="lbl" title="${esc(r.c)}">${esc(r.c)}</span><span class="track"><span class="fill" style="width:${Math.max(r.v?2:0,r.v/max*100)}%"></span>${r.l?`<span class="lim" style="left:calc(${r.l/max*100}% - 1px)" title="План"></span>`:""}</span><span class="v num">${rub(r.v)}${r.l?`<small class="${over?"neg":""}">${ic?"план "+rub(r.l):over?"сверх плана на "+rub(r.v-r.l):"осталось "+rub(r.l-r.v)}</small>`:`<small>${r.ty==="Долг"?(catDirName(r.c)==="in"?"долг: пришло":"долг: ушло"):"без плана"}</small>`}</span></div>`}).join("")}</div>
  <span class="hint">${more?`И ещё ${more} в «Финансах». `:""}${picked()?"Черта — план на месяц. Список меняется во вкладке «Категории».":"Черта — план на месяц. Отметьте нужные категории во вкладке «Категории», чтобы видеть только их."}</span>`}
function overviewCats(){const d=new Date();const p=ymd(d).slice(0,7);
  return `<section class="panel wide"><div class="panel-h"><h2>Категории · ${MONTHS[d.getMonth()].toLowerCase()}</h2><div style="display:flex;gap:12px;align-items:center"><button class="btn sm" data-act="ovCats">Выбрать</button><a href="#" data-act="go" data-v="finance">Финансы →</a></div></div>${catBars(p,picked()?0:6)}</section>`}

/* ---------- кошельки: наличные и карта ---------- */
function wcfg(){S.finance.wallets=S.finance.wallets||{};for(const w of WALLETS)S.finance.wallets[w]=S.finance.wallets[w]||{start:0,date:""};return S.finance.wallets}
function txWalletFlow(t,w){const a=+t.amount||0;if(t.cat===TRANSFER)return t.to===w?a:t.from===w?-a:0;if(t.pay!==w)return 0;
  const ty=catType(t.cat);const isIn=ty==="Доход"||(ty==="Долг"&&txDir(t)==="in");return isIn?a:-a}
function walletBalance(w){const c=wcfg()[w];let b=+c.start||0;for(const t of S.finance.tx){if(t.ex)continue;if(c.date&&(t.date||"")<c.date)continue;b+=txWalletFlow(t,w)}return b}
function walletStats(p){const r={};for(const w of WALLETS)r[w]={in:0,out:0,tin:0,tout:0};
  for(const t of S.finance.tx){if(!(t.date||"").startsWith(p))continue;const a=+t.amount||0;
    if(t.cat===TRANSFER){if(r[t.from])r[t.from].tout+=a;if(r[t.to])r[t.to].tin+=a;continue}
    const w=r[t.pay];if(!w)continue;const f=txWalletFlow(t,t.pay);if(f>0)w.in+=f;else w.out+=-f}return r}
function trRow(t,scope){return `<tr class="trf"><td class="num">${D(t.date).toLocaleDateString("ru-RU",scope==="all"?{day:"2-digit",month:"2-digit",year:"2-digit"}:{day:"2-digit",month:"2-digit"})}</td><td>Перевод${exTag(t)}</td><td><span class="chip">перевод</span></td><td style="color:var(--muted);white-space:nowrap">${esc(t.from)} → ${esc(t.to)}</td><td style="color:var(--muted)">${esc(t.note)}</td><td>${tagChips("tx",t)}</td><td class="r num" style="color:var(--muted)">${rub(+t.amount)}</td><td class="r"><button class="icon" data-act="delTx" data-id="${t.id}" aria-label="Удалить">✕</button></td></tr>`}
function walletsPanel(p,defDate){const hasDebt=debtStats().n>0;const ws=walletStats(p);const cfg=wcfg();const noPay=S.finance.tx.filter(t=>(t.date||"").startsWith(p)&&t.cat!==TRANSFER&&!WALLETS.includes(t.pay)).length;
  const bal={};for(const w of WALLETS)bal[w]=walletBalance(w);const neg=WALLETS.some(w=>bal[w]<0);
  return `<section class="panel"><div class="panel-h"><h2>Наличные и карта</h2><button class="btn sm" data-act="walletSet">${ui.walletSet?"Готово":"Начальные остатки"}</button></div>
   ${ui.walletSet?`<div class="wset">${WALLETS.map(w=>`<label>${w}: остаток<input type="number" step="0.01" id="ws-${w==="Карта"?"card":"cash"}-start" data-wset="${w}|start" value="${cfg[w].start||""}" placeholder="0"></label><label>на дату (считать операции с этого дня)<input type="date" id="ws-${w==="Карта"?"card":"cash"}-date" data-wset="${w}|date" value="${cfg[w].date||""}"></label>`).join("")}</div><span class="hint">Впишите, сколько было в кошельке на выбранную дату. Более ранние операции в остаток не попадут.</span>`:""}
   <div class="wallets">${WALLETS.map(w=>{const s=ws[w];const b=bal[w];return `<div class="wallet"><div class="panel-h"><b>${w}</b><span class="num wbal ${b<0?"neg":""}">${money(b)}</span></div>
    <div class="kv"><span>Пришло за месяц</span><b class="num pos">${s.in?"+"+rub(s.in):"0 ₽"}</b><span>Ушло за месяц</span><b class="num neg">${s.out?"−"+rub(s.out):"0 ₽"}</b><span>Переводы</span><b class="num">${s.tin||s.tout?[s.tin?"+"+rub(s.tin):"",s.tout?"−"+rub(s.tout):""].filter(Boolean).join(" / "):"—"}</b>${hasDebt?(()=>{const dw=walletDebt(w);const own=b-dw;return `<span class="wdebt" title="${dw>0?`Остаток минус взятый в долг: ${rub(dw)}`:dw<0?`Остаток плюс одолженное вам должны: ${rub(-dw)}`:"Долгов через этот кошелёк нет"}">С учётом долга</span><b class="num wdebt ${own<0?"neg":""}">${money(own)}</b>`})():""}</div></div>`}).join("")}</div>
   <form class="row" data-form="transfer"><select id="tr-from" name="from" aria-label="Откуда"><option>Наличные</option><option>Карта</option></select><span class="hint">→</span><select id="tr-to" name="to" aria-label="Куда"><option>Карта</option><option>Наличные</option></select><input id="tr-amount" type="number" name="amount" min="0" step="0.01" placeholder="Сумма" required style="width:110px"><input id="tr-date" type="date" name="date" value="${defDate}" aria-label="Дата"><input id="tr-note" type="text" name="note" placeholder="Комментарий" class="grow" autocomplete="off"><button class="btn">Перевести</button></form>
   <span class="hint">Перевод — одна операция: не доход и не расход, меняет только остатки.${hasDebt?" «С учётом долга» — сколько останется после возврата долгов.":""}${neg?" Остаток ушёл в минус — задайте начальные остатки.":""}${noPay?` Операций без способа оплаты в этом месяце: ${noPay}, в остатки они не попадают.`:""}</span></section>`}

function yearMonths(){const st=(S.loans&&S.loans.start)||(new Date().getFullYear()+"-01");return Array.from({length:12},(_,i)=>C.addMonths(st,i))}
function vYear(){
  const ms=yearMonths();const src=S.finance.tx;
  const sums={};for(const t of src){const m=(t.date||"").slice(0,7);if(!ms.includes(m))continue;sums[t.cat]=sums[t.cat]||{};sums[t.cat][m]=(sums[t.cat][m]||0)+(+t.amount||0)}
  const names=[...sortedCats().map(x=>x.c.name),...Object.keys(sums).filter(n=>n!==TRANSFER&&!cats().some(c=>c.name===n))];
  const filledMonths=ms.filter(m=>src.some(t=>(t.date||"").startsWith(m))).length||1;
  const row=(name)=>{const c=cats().find(x=>x.name===name)||{type:catType(name),plan:0};const s=sums[name]||{};const tot=ms.reduce((a,m)=>a+(s[m]||0),0);
    if(!tot&&!c.plan)return"";
    return `<tr><td class="sticky">${esc(name)}</td><td><span class="chip ${TYPE_CHIP[c.type]}">${c.type}</span></td><td class="r num">${c.plan?rub(c.plan):""}</td>${ms.map(m=>{const v=s[m]||0;const over=c.plan&&c.type!=="Доход"&&c.type!=="Кредит"&&v>c.plan;return`<td class="r num ${over?"neg":""}" ${v?"":'style="color:var(--line)"'}>${v?fmt(v):"·"}</td>`}).join("")}<td class="r num"><b>${fmt(tot)}</b></td><td class="r num">${fmt(tot/filledMonths)}</td></tr>`};
  const tot=ty=>ms.map(m=>src.filter(t=>(t.date||"").startsWith(m)&&catType(t.cat)===ty).reduce((a,t)=>a+(+t.amount||0),0));
  const inc=tot("Доход"),obl=tot("Обязательный"),cr=tot("Кредит"),oth=tot("Другой");const dnet=ms.map(m=>src.filter(t=>(t.date||"").startsWith(m)&&catType(t.cat)==="Долг").reduce((a,t)=>a+(txDir(t)==="in"?1:-1)*(+t.amount||0),0));const left=ms.map((_,i)=>inc[i]-obl[i]-cr[i]-oth[i]);
  const foot=(label,arr,cls)=>`<tr class="foot"><td class="sticky">${label}</td><td></td><td></td>${arr.map(v=>`<td class="r num ${cls&&v<0?"neg":""}">${v?fmt(v):"·"}</td>`).join("")}<td class="r num"><b>${fmt(arr.reduce((a,b)=>a+b,0))}</b></td><td class="r num">${fmt(arr.reduce((a,b)=>a+b,0)/filledMonths)}</td></tr>`;
  return `<section class="panel"><div class="panel-h"><h2>Сводка по категориям и месяцам</h2><span class="hint">Красным — месяц, где расход по категории выше плана</span></div>
   <div class="tbl-wrap"><table class="year"><thead><tr><th class="sticky">Категория</th><th>Тип</th><th class="r">План</th>${ms.map(m=>`<th class="r">${monShort(m)}</th>`).join("")}<th class="r">Итого</th><th class="r">Среднее</th></tr></thead>
   <tbody>${names.map(row).join("")}</tbody><tfoot>${foot("Доходы",inc)}${foot("Обязательные",obl)}${foot("Платежи по кредитам",cr)}${foot("Другие расходы",oth)}${foot("Итог месяца",left,true)}</tfoot></table></div></section>`}
const fmt=v=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(Math.round(v));

function vCats(){
  const planObl=cats().filter(c=>c.type==="Обязательный").reduce((a,c)=>a+(+c.plan||0),0);
  const planOth=cats().filter(c=>c.type==="Другой").reduce((a,c)=>a+(+c.plan||0),0);
  const budget=S.loans&&S.loans.list&&S.loans.list.length?+S.loans.budget||0:0;
  return `<div class="stats s4"><div class="stat"><small>Обязательные, план</small><span class="num">${rub(planObl)}</span></div><div class="stat"><small>Другие, план</small><span class="num">${rub(planOth)}</span></div><div class="stat"><small>Кредиты, бюджет</small><span class="num">${rub(budget)}</span></div><div class="stat"><small>Нужно дохода в месяц</small><span class="num">${rub(planObl+planOth+budget)}</span></div></div>
  <section class="panel"><div class="panel-h"><h2>Категории доходов и расходов</h2><span class="hint">Отмеченные «Показ» видны в «Финансах» и на «Обзоре». Двойной щелчок по названию — переименовать.</span></div>
   <form class="row" data-form="addCat"><input id="c-name" type="text" class="grow" name="name" placeholder="Новая категория" required autocomplete="off">
    <select id="c-type" name="type" aria-label="Тип">${TYPES.map(t=>`<option>${t}</option>`).join("")}</select>
    <input id="c-plan" type="number" name="plan" min="0" step="any" placeholder="План в месяц" style="width:140px"><button class="btn pri">Добавить</button></form>
   <div class="tbl-wrap"><table><thead><tr><th title="Показывать на «Обзоре» и в «Финансах»">Показ</th><th>Категория</th><th>Тип</th><th class="r">План в месяц, ₽</th><th>Комментарий</th><th></th></tr></thead><tbody>
   ${sortedCats().map(({c,i},n,arr)=>`${n===0||arr[n-1].c.type!==c.type?grpRow(c.type,arr):""}<tr><td><input type="checkbox" class="check" data-catfield="show" data-i="${i}" ${c.show?"checked":""} aria-label="Показывать «${esc(c.name)}»"></td><td><span class="t" data-catrename="${i}" title="Двойной щелчок — переименовать">${esc(c.name)}</span></td>
     <td><select data-catfield="type" data-i="${i}" aria-label="Тип">${TYPES.map(t=>`<option ${t===c.type?"selected":""}>${t}</option>`).join("")}</select></td>
     <td class="r">${c.type==="Долг"?`<select data-catfield="dir" data-i="${i}" aria-label="Направление"><option value="in" ${c.dir==="in"?"selected":""}>+ деньги пришли</option><option value="out" ${c.dir!=="in"?"selected":""}>− деньги ушли</option></select>`:`<input type="number" min="0" step="any" data-catfield="plan" data-i="${i}" value="${c.plan||""}" placeholder="—" style="width:110px;text-align:right" aria-label="План">`}</td>
     <td><input type="text" data-catfield="note" data-i="${i}" value="${esc(c.note||"")}" placeholder="—" style="width:100%" aria-label="Комментарий"></td>
     <td class="r"><button class="icon" data-act="delCat" data-i="${i}" aria-label="Удалить категорию">✕</button></td></tr>`).join("")}
   </tbody></table></div></section>`}

/* ---------------- Кредиты ---------------- */
function vLoans(){
  const L=S.loans;
  if(!L||!L.list||!L.list.length)return `<div class="head"><div><div class="eyebrow">План погашения</div><h1>Кредиты</h1></div></div>
   <section class="panel"><p class="empty">Кредитов пока нет. Добавьте первый: долг, ставку и обязательный платёж. Платежи записывайте в «Финансах» с категорией «Кредит: …».</p>${loanForm()}</section>`;
  let fix=false;if(!L.start){L.start=ymd(new Date()).slice(0,7);fix=true}
  const minT=L.list.reduce((a,l)=>a+(+l.min||0),0);if(!(+L.budget)){L.budget=Math.ceil(minT/100)*100;fix=true}
  if(!L.target){L.target=C.closeMonthFor(L,+L.budget)||C.addMonths(L.start,11);fix=true}
  if(fix)save("loans");
  const r=calc();const tab=ui.loanTab||"plan";
  return `<div class="head"><div><div class="eyebrow">План погашения</div><h1>Кредиты</h1></div>
   <div class="seg" role="group" aria-label="Вид"><button type="button" data-act="loanTab" data-t="plan" aria-pressed="${tab==="plan"}">План</button><button type="button" data-act="loanTab" data-t="acct" aria-pressed="${tab==="acct"}">Учёт по месяцам</button><button type="button" data-act="loanTab" data-t="orig" aria-pressed="${tab==="orig"}">Исходный план</button><button type="button" data-act="loanTab" data-t="set" aria-pressed="${tab==="set"}">Кредиты и ставки</button></div></div>
  ${paramsPanel(L,r)}
  <div id="loan-live" class="live">${liveBody(r)}</div>`}
function budgetRange(L,s){const minB=Math.ceil(s.minTotal/1000)*1000;const maxB=Math.max(Math.ceil(s.initTotal/3/5000)*5000,Math.ceil((+L.budget||0)*1.5/5000)*5000,minB+10000);return [minB,maxB]}
function paramsPanel(L,r){const s=r.summary;const [minB,maxB]=budgetRange(L,s);
  return `<section class="panel params"><div class="panel-h"><h2>Параметры плана</h2><span class="hint">Меняйте платёж или дату — всё ниже пересчитывается сразу</span></div>
   <div class="param-grid">
    <div class="pg-budget"><label for="ln-budget">Платёж на кредиты в месяц, ₽</label>
     <div class="budget-row"><input type="range" id="ln-budget-range" min="${minB}" max="${maxB}" step="500" value="${Math.min(maxB,Math.max(minB,+L.budget||0))}" aria-label="Платёж в месяц"><input type="number" id="ln-budget" class="num" min="0" step="100" value="${L.budget||""}"></div>
     <div class="range-scale num"><span>${rub(minB)}</span><span>${rub(maxB)}</span></div></div>
    <label>Закрыть все кредиты к<input type="month" id="ln-target" value="${L.target||""}"></label>
    <label>Первый месяц плана<input type="month" id="ln-start" value="${L.start||""}"></label>
    <label>Если внесли больше плана<select data-lset="mode"><option value="reduce" ${L.mode!=="early"?"selected":""}>уменьшать платежи (срок прежний)</option><option value="early" ${L.mode==="early"?"selected":""}>закрыть раньше (платёж прежний)</option></select></label>
   </div>
   <p class="plan-sum" id="plan-sum">${planSum(r)}</p></section>`}
function planSum(r,base){const s=r.summary;const L=S.loans;
  let t=s.closeMonth?`При <b class="num">${rub(L.budget)}</b> в месяц все кредиты закроются в <b>${monPrep(s.closeMonth)}</b>, переплата процентами ≈ <b class="num">${rub(s.overpay)}</b>.`:`При <b class="num">${rub(L.budget)}</b> в месяц кредиты не закроются даже за 10 лет — увеличьте платёж.`;
  if(+L.budget<s.minTotal)t+=` <span class="neg">Это меньше суммы обязательных платежей (${rub(s.minTotal)}), они всё равно будут внесены.</span>`;
  if(base&&base.close&&s.closeMonth){const dm=C.monthsBetween(s.closeMonth,base.close);const dp=base.overpay-s.overpay;
    if(dm||Math.abs(dp)>=1)t+=`<br><span class="cmp">По сравнению с сохранённым планом: ${dm>0?`на ${dm} мес. раньше`:dm<0?`на ${-dm} мес. позже`:"срок тот же"}, переплата ${dp>=0?"меньше на "+rub(dp):"больше на "+rub(-dp)}.</span>`}
  return t}
const monPrep=k=>{const [y,m]=k.split("-").map(Number);return MONTHS[m-1].toLowerCase().replace(/ь$/,"е").replace(/й$/,"е").replace(/т$/,"те")+" "+y};
function liveUpdate(){const r=calc();const live=document.getElementById("loan-live");if(live)live.innerHTML=liveBody(r);const ps=document.getElementById("plan-sum");if(ps)ps.innerHTML=planSum(r,ui.loanBase)}
function onInput(t){
  if(t.id==="ln-budget-range"||t.id==="ln-budget"){if(!S.loans)return true;if(!ui.loanBase){const r0=calc();ui.loanBase={close:r0.summary.closeMonth,overpay:r0.summary.overpay}}
    const v=Math.max(0,+t.value||0);S.loans.budget=v;const o=document.getElementById(t.id==="ln-budget"?"ln-budget-range":"ln-budget");if(o)o.value=v;
    const cm=C.closeMonthFor(S.loans,v);if(cm){S.loans.target=cm;const ti=document.getElementById("ln-target");if(ti)ti.value=cm}
    liveUpdate();return true}
  return false}
function liveBody(r){
  const L=S.loans;const s=r.summary;const loans=L.list;
  const cur=s.curPlan;const ci=cur?r.plan.indexOf(cur):-1;const curA=ci>=0?r.acct[ci]:null;
  const paidCur=curA?curA.paidTotal:0;const pct=s.initTotal?Math.round((1-s.debtNow/s.initTotal)*100):0;
  const tab=ui.loanTab||"plan";
  const st=a=>a==="отстаёте"?"late":a==="опережаете"||a==="долгов нет"?"ok":a==="по плану"?"today":"";
  let html=`<div class="stats s4">
   <div class="stat"><small>Долг сейчас</small><span class="num">${rub(s.debtNow)}</span><span class="sub">было ${rub(s.initTotal)} · погашено ${Math.max(0,pct)}%</span></div>
   <div class="stat"><small>Внесено всего</small><span class="num">${rub(s.paidTotal)}</span><span class="sub">закрыто месяцев: ${s.closedMonths}</span></div>
   <div class="stat"><small>Нужно внести${cur?" в "+monLabel(cur.month).split(" ")[0].toLowerCase().replace(/ь$/,"е").replace(/й$/,"е").replace(/т$/,"те"):""}</small><span class="num">${rub(s.needNow)}</span><span class="sub">с учётом недоплат и переплат</span></div>
   <div class="stat"><small>Долги закроются</small><span class="num">${s.closeMonth?monLabel(s.closeMonth).toLowerCase():"дольше 10 лет"}</span><span class="sub">переплата процентами ≈ ${rub(s.overpay)}</span></div>
  </div>`;
  if(cur&&curA){const left=Math.max(0,cur.need-paidCur);const p=cur.need?Math.min(100,paidCur/cur.need*100):100;
    html+=`<section class="panel"><div class="panel-h"><h2>${monLabel(cur.month)} · ${cur.status==="идёт"?"месяц идёт":"по плану"}</h2><span class="num">${rub(paidCur)} из ${rub(cur.need)}</span></div>
     <div class="pbar big"><i style="width:${p}%"></i></div>
     <p style="margin:0">${left>0?`Осталось внести <b class="num">${rub(left)}</b>. Минимальные платежи — по всем кредитам, остальное по порядку погашения:`:"План на месяц выполнен."}</p>
     <div class="loan-row">${loans.map((l,j)=>{const need=cur.pay[j],paid=curA.paid[j],rest=Math.max(0,need-paid);return `<div class="lr"><div class="lr-h"><span class="order">${j+1}</span><b>${esc(l.short||l.name)}</b></div>
       <div class="num">${rub(paid)} <span class="hint">из ${rub(need)}</span></div><div class="pbar"><i style="width:${need?Math.min(100,paid/need*100):100}%"></i></div>
       <span class="hint">${rest>0?"осталось "+rub(rest)+(paid<Math.min(+l.min,need)?" · обязательный "+rub(l.min):""):"выполнено"}</span></div>`}).join("")}</div>
    </section>`}
  html+=`<section class="panel"><div class="panel-h"><h2>Долг по месяцам</h2><span class="legend"><i class="lg orig"></i>исходный план <i class="lg cur"></i>текущий план <i class="lg fact"></i>факт</span></div>${chart(r)}</section>`;
  html+=`<div class="grid g3">${loans.map((l,j)=>{const now=s.debtByLoanNow[j];const done=+l.balance?Math.max(0,1-now/l.balance):0;
    return `<article class="panel loan"><div class="panel-h"><span class="order">${j+1}</span><span class="t" style="flex:1;font-weight:700">${esc(l.short||l.name)}</span></div>
     <div class="num big">${rub(now)}</div><div class="pbar"><i style="width:${done*100}%"></i></div>
     <div class="kv"><span>Было на старте</span><b class="num">${rub(l.balance)}</b><span>Ставка</span><b class="num">${fmtPct(l.rate)} годовых</b><span>Обязательный платёж</span><b class="num">${rub(l.min)}</b><span>Категория платежа</span><b>${esc(l.cat)}</b></div>
     ${l.note?`<span class="hint">${esc(l.note)}</span>`:""}</article>`}).join("")}</div>`;
  html+= tab==="acct"?acctTable(r,st):tab==="orig"?origTable(r):tab==="set"?`<section class="panel"><h2>Кредиты, ставки и порядок погашения</h2>${loansEditor()}${loanForm()}</section>`:planTable(r,st);
  return html}
const fmtPct=r=>(Math.round((+r||0)*1000)/10).toString().replace(".",",")+"%";

function planTable(r,st){const loans=S.loans.list;
  return `<section class="panel"><div class="panel-h"><h2>План с учётом фактических платежей</h2><span class="hint">Закончившиеся месяцы берут реальные платежи, текущий и будущие — по плану. Отставание делится на месяцы до цели.</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Месяц</th><th>Статус</th><th class="r">Отклонение</th><th class="r">Нужно внести</th>${loans.map(l=>`<th class="r">${esc(l.short||l.name)}</th>`).join("")}<th class="r">Проценты</th><th class="r">Долг на конец</th><th class="r">По исходному плану</th></tr></thead><tbody>
  ${r.plan.filter((p,i)=>i===0||r.plan[i-1].endTotal>=1).map(p=>`<tr class="${p.status==="идёт"?"curm":""}"><td>${monLabel(p.month)}</td><td><span class="chip ${p.status==="факт"?"ok":p.status==="идёт"?"today":""}">${p.status}</span></td>
   <td class="r num ${p.dev>1?"neg":p.dev<-1?"pos":""}">${Math.abs(p.dev)<1?"—":money(p.dev,true)}</td><td class="r num"><b>${rub(p.need)}</b></td>${p.pay.map(v=>`<td class="r num">${v?rub(v):"—"}</td>`).join("")}
   <td class="r num" style="color:var(--muted)">${rub(p.interest.reduce((a,b)=>a+b,0))}</td><td class="r num"><b>${rub(p.endTotal)}</b></td><td class="r num" style="color:var(--muted)">${rub(p.origEnd)}</td></tr>`).join("")}
  </tbody></table></div><span class="hint">Отклонение: «+» — отстаёте от исходного плана, «−» — опережаете. Ставки оценены по начисленным процентам, расчёт долга приблизительный.</span></section>`}

function acctTable(r,st){const loans=S.loans.list;
  const rows=r.acct.filter(a=>a.has);
  return `<section class="panel"><div class="panel-h"><h2>Учёт по месяцам: факт против плана</h2><span class="hint">Долг = долг прошлого месяца + проценты − внесено. Если вписать остаток из приложения банка, расчёт пойдёт от него.</span></div>
  ${rows.length?`<div class="tbl-wrap"><table><thead><tr><th>Месяц</th><th class="r">Доход</th><th class="r">Обязательные</th><th class="r">Другие</th><th class="r">На кредиты</th><th class="r">Нужно было</th><th class="r">Разница</th><th class="r">Осталось денег</th><th class="r">Долг</th><th>Статус</th></tr></thead><tbody>
  ${rows.map(a=>`<tr><td>${monLabel(a.month)}</td><td class="r num pos">${rub(a.inc)}</td><td class="r num">${rub(a.obl)}</td><td class="r num">${rub(a.oth)}</td><td class="r num"><b>${rub(a.paidTotal)}</b></td><td class="r num">${rub(a.need)}</td><td class="r num ${a.diff<0?"neg":"pos"}">${money(a.diff,true)}</td><td class="r num ${a.left<0?"neg":""}">${money(a.left,true)}</td><td class="r num"><b>${rub(a.debt)}</b></td><td>${a.status?`<span class="chip ${st(a.status)}">${a.status}</span>`:""}</td></tr>`).join("")}
  </tbody></table></div>
  <h2 style="margin-top:6px">Остаток из приложения банка на конец месяца (необязательно)</h2>
  <div class="tbl-wrap"><table><thead><tr><th>Месяц</th>${loans.map(l=>`<th>${esc(l.short||l.name)}</th>`).join("")}</tr></thead><tbody>
  ${rows.map(a=>`<tr><td>${monLabel(a.month)}</td>${loans.map((l,j)=>{const v=((S.loans.appBal||{})[a.month]||{})[l.id];return `<td><input type="number" step="0.01" min="0" data-appbal="${a.month}|${l.id}" value="${typeof v==="number"?v:""}" placeholder="${Math.round(a.debtByLoan[j])}" style="width:130px" aria-label="Остаток ${esc(l.short||l.name)}"></td>`}).join("")}</tr>`).join("")}
  </tbody></table></div>`:'<p class="empty">Пока нет записей. Учёт появится, когда в «Финансах» будут операции за месяц плана.</p>'}</section>`}

function origTable(r){const loans=S.loans.list;
  return `<section class="panel"><div class="panel-h"><h2>Исходный план: по ${rub(S.loans.budget)} каждый месяц</h2><span class="hint">Не меняется от факта — с ним сравнивается текущее положение</span></div>
  <div class="tbl-wrap"><table><thead><tr><th>Месяц</th>${loans.map(l=>`<th class="r">${esc(l.short||l.name)}</th>`).join("")}<th class="r">Платёж всего</th><th class="r">Проценты</th><th class="r">Долг всего</th></tr></thead><tbody>
  ${r.orig.filter((p,i)=>i===0||r.orig[i-1].endTotal>=1).map(p=>`<tr><td>${monLabel(p.month)}</td>${p.pay.map(v=>`<td class="r num">${v?rub(v):"—"}</td>`).join("")}<td class="r num"><b>${rub(p.payTotal)}</b></td><td class="r num" style="color:var(--muted)">${rub(p.interest.reduce((a,b)=>a+b,0))}</td><td class="r num">${rub(p.endTotal)}</td></tr>`).join("")}
  </tbody></table></div><span class="hint">Переплата по исходному плану ≈ ${rub(r.summary.origOverpay)}.</span></section>`}

function settingsForm(L){
  return `<div class="set-grid">
   <label>Бюджет на кредиты в месяц, ₽<input type="number" min="0" step="100" data-lset="budget" value="${L.budget||""}"></label>
   <label>Первый месяц плана<input type="month" data-lset="start" value="${L.start||""}"></label>
   <label>Закрыть все кредиты к<input type="month" data-lset="target" value="${L.target||""}"></label>
   <label>Если внесли больше плана<select data-lset="mode"><option value="reduce" ${L.mode!=="early"?"selected":""}>уменьшать платежи (срок прежний)</option><option value="early" ${L.mode==="early"?"selected":""}>закрыть раньше (платёж прежний)</option></select></label>
  </div><span class="hint">Недоплата распределяется на месяцы до целевой даты. Порядок погашения — сверху вниз в списке кредитов.</span>`}
function loansEditor(){const loans=S.loans.list;
  return `<div class="tbl-wrap"><table><thead><tr><th>Порядок</th><th>Название</th><th>Коротко</th><th class="r">Долг на начало плана</th><th class="r">Ставка, %</th><th class="r">Обязательный платёж</th><th>Категория платежа</th><th></th></tr></thead><tbody>
  ${loans.map((l,j)=>`<tr><td style="white-space:nowrap"><button class="btn sm" data-act="loanUp" data-i="${j}" ${j===0?"disabled":""} aria-label="Выше">↑</button> <button class="btn sm" data-act="loanDown" data-i="${j}" ${j===loans.length-1?"disabled":""} aria-label="Ниже">↓</button></td>
   <td><input type="text" data-lfield="name" data-i="${j}" value="${esc(l.name)}" style="width:220px"></td><td><input type="text" data-lfield="short" data-i="${j}" value="${esc(l.short||"")}" style="width:130px"></td>
   <td class="r"><input type="number" step="0.01" data-lfield="balance" data-i="${j}" value="${l.balance}" style="width:120px;text-align:right"></td>
   <td class="r"><input type="number" step="0.1" data-lfield="ratePct" data-i="${j}" value="${Math.round(l.rate*1000)/10}" style="width:70px;text-align:right"></td>
   <td class="r"><input type="number" step="1" data-lfield="min" data-i="${j}" value="${l.min}" style="width:100px;text-align:right"></td>
   <td><select data-lfield="cat" data-i="${j}">${cats().filter(c=>c.type==="Кредит").map(c=>`<option ${c.name===l.cat?"selected":""}>${esc(c.name)}</option>`).join("")}</select></td>
   <td><button class="icon" data-act="delLoan" data-i="${j}" aria-label="Удалить кредит">✕</button></td></tr>`).join("")}</tbody></table></div>`}
function loanForm(){return `<form class="row" data-form="addLoan" style="border-top:1px dashed var(--line);padding-top:12px">
   <input id="ln-name" type="text" name="name" placeholder="Новый кредит, например «Сбер, карта»" required class="grow" autocomplete="off">
   <input id="ln-bal" type="number" name="balance" step="0.01" min="0" placeholder="Долг" required style="width:120px">
   <input id="ln-rate" type="number" name="rate" step="0.1" min="0" placeholder="Ставка, %" required style="width:100px">
   <input id="ln-min" type="number" name="min" step="1" min="0" placeholder="Обяз. платёж" required style="width:120px">
   <button class="btn">Добавить кредит</button></form><span class="hint">Для нового кредита автоматически появится категория «Кредит: …» — выбирайте её при записи платежа.</span>`}

function chart(r){
  const W=900,H=260,l=64,rr=16,t=14,b=30;
  const plan=r.plan,orig=r.orig;let last=plan.findIndex(p=>p.endTotal<1);let last2=orig.findIndex(p=>p.endTotal<1);
  const N=Math.min(plan.length,Math.max(last<0?plan.length:last+1,last2<0?orig.length:last2+1,6));
  const facts=r.acct.slice(0,N).map(a=>a.has?a.debt:null);
  const maxV=Math.max(r.summary.initTotal,...plan.slice(0,N).map(p=>p.endTotal),...facts.filter(v=>v!=null))*1.05||1;
  const step=niceStep(maxV/4);const top=Math.ceil(maxV/step)*step;
  const X=i=>l+(i+1)*(W-l-rr)/N, Y=v=>t+(1-v/top)*(H-t-b);const X0=l;
  const line=(arr,start)=>{let d=`M${X0},${Y(start)}`;arr.forEach((v,i)=>{if(v!=null)d+=` L${X(i)},${Y(v)}`});return d};
  let g="";for(let v=0;v<=top+1;v+=step)g+=`<line x1="${l}" x2="${W-rr}" y1="${Y(v)}" y2="${Y(v)}" class="gl"/><text x="${l-8}" y="${Y(v)+4}" text-anchor="end" class="tk">${v>=1000?Math.round(v/1000)+" тыс":v}</text>`;
  let xl=`<text x="${X0}" y="${H-10}" text-anchor="middle" class="tk">старт</text>`;const stp=Math.ceil(N/13);for(let i=0;i<N;i++)if(i%stp===0||i===N-1)xl+=`<text x="${X(i)}" y="${H-10}" text-anchor="middle" class="tk">${N>13?monShort(plan[i].month):monShort(plan[i].month).split(" ")[0]}</text>`;
  const fpts=facts.map((v,i)=>v==null?"":`<circle cx="${X(i)}" cy="${Y(v)}" r="5" class="fd"><title>${monLabel(plan[i].month)}: ${rub(v)}</title></circle>`).join("");
  const fl=facts.some(v=>v!=null)?`<path d="${line(facts.map((v,i)=>v),r.summary.initTotal)}" class="fl"/>`:"";
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График долга по месяцам">${g}${xl}
   <path d="${line(orig.slice(0,N).map(p=>p.endTotal),r.summary.initTotal)}" class="ol"/><path d="${line(plan.slice(0,N).map(p=>p.endTotal),r.summary.initTotal)}" class="pl"/>${fl}${fpts}
   ${plan.slice(0,N).map((p,i)=>`<circle cx="${X(i)}" cy="${Y(p.endTotal)}" r="${N>24?2:3}" class="pd"><title>${monLabel(p.month)}: план ${rub(p.endTotal)}</title></circle>`).join("")}</svg></div>`}
function niceStep(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const f=v/p;return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}

/* ---------------- Обзор ---------------- */
function overviewMoney(){
  const d=new Date();const p=ymd(d).slice(0,7);const f=monthStats(p,S.finance.tx);
  let loanHtml="";
  if(S.loans&&S.loans.list&&S.loans.list.length){const r=calc();const s=r.summary;const cur=s.curPlan;const i=cur?r.plan.indexOf(cur):-1;const paid=i>=0?r.acct[i].paidTotal:0;
    loanHtml=`<div style="display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--line);padding-top:10px">
     <div class="panel-h"><span style="font-weight:600">Кредиты в ${cur?MONTHS[+cur.month.slice(5)-1].toLowerCase().replace(/ь$/,"е").replace(/й$/,"е").replace(/т$/,"те"):"этом месяце"}</span><span class="num" style="font-size:12px">${rub(paid)} из ${rub(s.needNow)}</span></div>
     <div class="pbar"><i style="width:${s.needNow?Math.min(100,paid/s.needNow*100):100}%"></i></div>
     <span class="hint">Долг ${rub(s.debtNow)} · закроются ${s.closeMonth?monLabel(s.closeMonth).toLowerCase():"дольше 10 лет"}</span></div>`}
  return `<section class="panel"><div class="panel-h"><h2>${MONTHS[d.getMonth()]}: деньги</h2><a href="#" data-act="go" data-v="finance">Финансы →</a></div>
    <div class="stats" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="stat"><small>Доходы</small><span class="num pos">${rub(f.inc)}</span></div><div class="stat"><small>Расходы</small><span class="num neg">${rub(f.out)}</span></div></div>
    ${(()=>{const c=walletBalance("Наличные"),k=walletBalance("Карта");return `<div class="money-now"><div class="panel-h"><span class="hint">Денег сейчас</span><span class="num mn-total ${c+k<0?"neg":""}">${money(c+k)}</span></div>
     <span class="hint">наличные ${money(c)} · карта ${money(k)}${(()=>{const d=debtStats();return d.n?" · "+debtNowText(d):""})()}</span></div>`})()}
    <div class="panel-h"><span class="hint" title="Доходы минус расходы за месяц, без долгов">Итог месяца</span><span class="num ${f.left<0?"neg":"pos"}" style="font-weight:600">${money(f.left,true)}</span></div>
    ${loanHtml}</section>`}

/* ---------------- действия ---------------- */
function onClick(act,a){
  switch(act){
    case "finTab":ui.finTab=a.dataset.t;render();return true;
    case "loanTab":ui.loanTab=a.dataset.t;render();return true;
    case "finScope":ui.finScope=a.dataset.v;render();return true;
    case "walletSet":ui.walletSet=!ui.walletSet;render();return true;
    case "ovCats":ui.finTab="cats";ui.view="finance";render();return true;
    case "finReset":ui.finQ="";ui.finCat="";ui.finType="";ui.tag.tx="";render();return true;
    case "finCatPick":ui.finCat=ui.finCat===a.dataset.v?"":a.dataset.v;render();return true;
    case "payWay":ui.payWay=a.dataset.v;a.parentNode.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b===a));return true;
    case "delCat":{const i=+a.dataset.i;const c=cats()[i];if(!c)return true;snapshotFor("finance");S.finance.cats.splice(i,1);save("finance");render();toast(`Категория «${c.name}» удалена`,true);return true}
    case "loanUp":case "loanDown":{const i=+a.dataset.i,j=act==="loanUp"?i-1:i+1;const L=S.loans.list;if(j<0||j>=L.length)return true;[L[i],L[j]]=[L[j],L[i]];save("loans");render();return true}
    case "delLoan":{const i=+a.dataset.i;snapshotFor("loans");const l=S.loans.list.splice(i,1)[0];save("loans");render();toast(`Кредит «${l.short||l.name}» удалён`,true);return true}
  }
  return false}
function onChange(t){
  if(t.dataset.wset){const [w,f]=t.dataset.wset.split("|");const c=wcfg()[w];c[f]=f==="start"?(parseFloat(String(t.value).replace(",","."))||0):t.value;save("finance");render();return true}
  if(t.id==="ln-budget-range"||t.id==="ln-budget"){onInput(t);ui.loanBase=null;save("loans");render();return true}
  if(t.id==="ln-target"){if(!t.value)return true;const B=C.neededBudget(S.loans,t.value);if(B==null){toast("Эта дата раньше начала плана");render();return true}
    const minT=S.loans.list.reduce((a,l)=>a+(+l.min||0),0);S.loans.target=t.value;S.loans.budget=Math.max(B,Math.ceil(minT/100)*100);save("loans");render();
    const cm=C.closeMonthFor(S.loans,S.loans.budget);toast(B<minT&&cm&&cm<t.value?`Даже одними обязательными платежами долги закроются в ${monPrep(cm)}`:`Чтобы закрыть всё в ${monPrep(t.value)}, нужно вносить ${rub(S.loans.budget)} в месяц`);return true}
  if(t.id==="ln-start"){if(!t.value)return true;S.loans.start=t.value;const cm=C.closeMonthFor(S.loans,+S.loans.budget);if(cm)S.loans.target=cm;save("loans");render();return true}
  if(t.id==="fin-cat"){ui.finCat=t.value;render();return true}
  if(t.id==="fin-type"){ui.finType=t.value;render();return true}
  if(t.id==="fin-sort"){ui.finSort=t.value;render();return true}
  if(t.dataset.catfield){const c=cats()[+t.dataset.i];if(!c)return true;const f=t.dataset.catfield;c[f]=f==="plan"?(+t.value||0):f==="show"?t.checked:t.value;save("finance");render();return true}
  if(t.dataset.lset){const k=t.dataset.lset;S.loans[k]=k==="budget"?(+t.value||0):t.value;if(!S.loans[k]&&k!=="budget")return true;save("loans");render();return true}
  if(t.dataset.lfield){const l=S.loans.list[+t.dataset.i];const f=t.dataset.lfield;if(!l)return true;
    if(f==="ratePct")l.rate=(+t.value||0)/100;else if(f==="balance"||f==="min")l[f]=+t.value||0;else if(f==="cat")l.cat=t.value;else l[f]=t.value.trim()||l[f];save("loans");render();return true}
  if(t.dataset.appbal){const [m,id]=t.dataset.appbal.split("|");S.loans.appBal=S.loans.appBal||{};const o=S.loans.appBal[m]=S.loans.appBal[m]||{};
    if(t.value==="")delete o[id];else o[id]=+t.value;save("loans");render();return true}
  return false}
function onSubmit(kind,v,trim){
  if(kind==="addTx"){const amt=Math.abs(parseFloat(String(v.amount).replace(",",".")));if(!amt||!v.cat)return "x-amount";
    const ty=catType(v.cat);const dd=ty==="Долг"?catDirName(v.cat):"";S.finance.tx.push({id:uid(),type:ty==="Доход"||dd==="in"?"in":"out",dir:dd||undefined,amount:amt,cat:v.cat,date:v.date||TODAY(),pay:ui.payWay||"Карта",note:trim(v.note),tags:parseTags(v.tags)});
    ui.lastCat=v.cat;save("finance");const d=D(v.date||TODAY());ui.finY=d.getFullYear();ui.finM=d.getMonth();
    if(ty==="Кредит")toast(`Платёж учтён в разделе «Кредиты»`);else if(ty==="Долг")toast("Долг записан: не входит в доходы, расходы и итог месяца — меняет только остаток денег");return "x-amount"}
  if(kind==="transfer"){const amt=Math.abs(parseFloat(String(v.amount).replace(",",".")));if(!amt)return "tr-amount";if(v.from===v.to){toast("Выберите разные кошельки");return "tr-to"}
    S.finance.tx.push({id:uid(),type:"transfer",cat:TRANSFER,from:v.from,to:v.to,amount:amt,date:v.date||TODAY(),pay:"",note:trim(v.note),tags:[]});save("finance");toast(`Перевод ${v.from} → ${v.to} записан: остатки обновлены`);return "tr-amount"}
  if(kind==="addCat"){const name=trim(v.name);if(!name)return "c-name";if(cats().some(c=>c.name.toLowerCase()===name.toLowerCase())){toast("Такая категория уже есть");return "c-name"}
    S.finance.cats.push({name,type:v.type||"Другой",plan:+v.plan||0,note:""});save("finance");return "c-name"}
  if(kind==="addLoan"){const name=trim(v.name);if(!name)return "ln-name";const cat="Кредит: "+name;
    if(!cats().some(c=>c.name===cat)){S.finance.cats.push({name:cat,type:"Кредит",plan:0,note:""});save("finance")}
    S.loans.list.push({id:uid(),name,short:name,cat,balance:+v.balance||0,rate:(+v.rate||0)/100,min:+v.min||0,note:""});save("loans");return "ln-name"}
  return undefined}
/* переименование категории двойным щелчком */
function renameCat(i,newName){const c=cats()[i];if(!c)return;const old=c.name;newName=newName.trim();if(!newName||newName===old)return;
  c.name=newName;for(const t of S.finance.tx)if(t.cat===old)t.cat=newName;if(S.loans)for(const l of S.loans.list||[])if(l.cat===old)l.cat=newName;save("finance");save("loans")}

return {vFinance,vLoans,overviewMoney,overviewCats,onInput,onClick,onChange,onSubmit,renameCat,catType,calc,TYPES};
};
