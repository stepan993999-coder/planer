/* Синхронизация планера через Supabase (общая для iPhone/веба и программы на Mac).
   Интерфейс для app.js — window.plannerSync: load(), save(key,value), onRemote(cb).
   На Mac под ним остаётся файловое хранилище программы (preload), в вебе — localStorage.

   Как устроено слияние. Для каждого раздела на устройстве хранится «база» — версия, которая
   точно была в облаке. Если раздел изменили и здесь, и на другом устройстве, правки
   объединяются по записям (трёхстороннее слияние): добавленное и изменённое с обеих сторон
   сохраняется, при правке одной и той же записи побеждает это устройство. */
(function(){
"use strict";
const CFG=window.PLANER_CONFIG||{};
const LOCAL=window.planner&&window.planner.load?window.planner:null;   // хранилище программы на Mac
const PLATFORM=LOCAL?"mac":"web";
const KEYS=["tasks","events","finance","goals","habits","notes","loans"];
const LS_DATA="planer-cache-v2",LS_DIRTY="planer-dirty-v2",LS_MODE="planer-mode-v2",LS_LINK="planer-linked-v2",
      LS_BASE="planer-base-v1",LS_FORCE="planer-force-keys-v1",LS_FORCE_FLAG="planer-force-local",LS_BACKUP="planer-cloud-backup";
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const lsDel=k=>{try{localStorage.removeItem(k)}catch(e){}};
const configured=!!(CFG.supabaseUrl&&CFG.supabaseKey&&window.supabase);

let data={},dirty=lsGet(LS_DIRTY,{}),force=lsGet(LS_FORCE,{}),baseBox=lsGet(LS_BASE,{uid:null,v:{}}),
    sb=null,user=null,channel=null,listeners=[],pushT={},pushing={},again={},linking=false;
let base=baseBox.v||{};
function saveBase(){lsSet(LS_BASE,{uid:user?user.id:baseBox.uid,v:base})}

/* ---------- сравнение и слияние ---------- */
/* Postgres (jsonb) возвращает объекты с другим порядком ключей, поэтому сравниваем в каноническом виде */
function canon(v){if(v===undefined)return"undefined";if(v===null||typeof v!=="object")return JSON.stringify(v);
  if(Array.isArray(v))return"["+v.map(canon).join(",")+"]";
  return"{"+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+canon(v[k])).join(",")+"}"}
const eq=(a,b)=>canon(a)===canon(b);
const isObj=x=>x!=null&&typeof x==="object"&&!Array.isArray(x);
const isKeyed=a=>Array.isArray(a)&&a.every(x=>isObj(x)&&(x.id!=null||x.name!=null));
const keyOf=x=>x.id!=null?"i:"+x.id:"n:"+x.name;
function merge3(b,l,r){
  if(eq(l,r))return l;if(eq(l,b))return r;if(eq(r,b))return l;
  if(isKeyed(l)&&isKeyed(r)){
    const B=new Map((isKeyed(b)?b:[]).map(x=>[keyOf(x),x])),L=new Map(l.map(x=>[keyOf(x),x])),R=new Map(r.map(x=>[keyOf(x),x]));const out=[];
    for(const x of r){const k=keyOf(x);
      if(L.has(k))out.push(merge3(B.get(k),L.get(k),x));          // есть везде — сливаем поля
      else if(!B.has(k))out.push(x);                               // добавлено на другом устройстве
      else if(!eq(B.get(k),x))out.push(x)}                         // здесь удалили, но там успели изменить — оставляем
    for(const x of l){const k=keyOf(x);
      if(!R.has(k)&&(!B.has(k)||!eq(B.get(k),x)))out.push(x)}      // добавлено здесь (или там удалили, а здесь изменили)
    return out}
  if(isObj(l)&&isObj(r)){const o={},B=isObj(b)?b:{};
    for(const k of new Set([...Object.keys(r),...Object.keys(l)])){const v=merge3(B[k],l[k],r[k]);if(v!==undefined)o[k]=v}return o}
  return l}

/* ---------- статус ---------- */
let stText="",stState="local";
function status(s,t){stState=s;stText=t;document.querySelectorAll("[data-sync]").forEach(el=>{el.dataset.s=s;const sp=el.querySelector("span");(sp||el).textContent=t})}
const observer=new MutationObserver(()=>{document.querySelectorAll("[data-sync]").forEach(el=>{if(el.dataset.s!==stState)status(stState,stText)})});
const okStatus=()=>{if(!Object.keys(dirty).length)status("ok","Синхронизировано")};

/* ---------- локальное хранилище ---------- */
async function localLoad(){if(LOCAL)return (await LOCAL.load())||{};return lsGet(LS_DATA,{})}
function localSave(k,v){if(LOCAL)return LOCAL.save(k,v);const all=lsGet(LS_DATA,{});all[k]=v;lsSet(LS_DATA,all)}
function markDirty(k,on){if(on)dirty[k]=Date.now();else delete dirty[k];lsSet(LS_DIRTY,dirty)}
function setForce(k,on){if(on)force[k]=1;else delete force[k];lsSet(LS_FORCE,force)}
function emit(k,v){for(const cb of listeners)try{cb(k,clone(v))}catch(e){console.error(e)}}
function setLocal(k,v){data[k]=clone(v);localSave(k,data[k]);emit(k,data[k])}

/* ---------- облако ---------- */
async function pushKey(k){
  if(!sb||!user||linking)return;if(pushing[k]){again[k]=true;return}
  pushing[k]=true;status("busy","Сохраняю…");
  try{
    if(!force[k]){                                        // перед отправкой сверяемся: не изменил ли раздел кто-то ещё
      const {data:rows,error}=await sb.from("planner_docs").select("value").eq("key",k);if(error)throw error;
      if(rows&&rows.length){const rv=rows[0].value;
        if(!eq(rv,base[k])){const m=merge3(base[k],data[k],rv);base[k]=clone(rv);saveBase();if(!eq(m,data[k]))setLocal(k,m)}}}
    const snap=canon(data[k]),val=clone(data[k])??null;
    const {error}=await sb.from("planner_docs").upsert({user_id:user.id,key:k,value:val,updated_at:new Date().toISOString()},{onConflict:"user_id,key"});
    if(error)throw error;
    base[k]=val;saveBase();setForce(k,false);
    if(canon(data[k])===snap)markDirty(k,false);else again[k]=true;
    okStatus()}
  catch(e){console.warn(e);status("err",navigator.onLine===false?"Нет интернета — изменения сохранены на устройстве и отправятся позже":"Не удалось сохранить в облако, повторю позже")}
  pushing[k]=false;if(again[k]){again[k]=false;pushKey(k)}
}
function schedulePush(k){clearTimeout(pushT[k]);pushT[k]=setTimeout(()=>pushKey(k),600)}
function pushDirty(){for(const k of Object.keys(dirty))pushKey(k)}

/* пришла версия раздела из облака (при загрузке или мгновенное обновление) */
function applyRemote(k,v){
  if(pushing[k])return;                                   // идёт своя отправка — она сама сверится с облаком
  if(force[k]){base[k]=clone(v);saveBase();schedulePush(k);return}
  if(eq(v,data[k])){base[k]=clone(v);saveBase();return}   // то же самое (в т.ч. «эхо» своего сохранения)
  if(!dirty[k]){base[k]=clone(v);saveBase();setLocal(k,v);return}
  const m=merge3(base[k],data[k],v);base[k]=clone(v);saveBase();
  if(!eq(m,data[k]))setLocal(k,m);
  if(eq(m,v))markDirty(k,false);else schedulePush(k)}

async function fetchAll(){const {data:rows,error}=await sb.from("planner_docs").select("key,value,updated_at");if(error)throw error;return rows||[]}

/* есть ли в разделе что-то, введённое человеком (а не созданное программой при первом запуске) */
const AUTO_CATS=["Взял в долг","Вернул долг","Дал в долг","Вернули мне долг"];
function meaningful(k,v){if(v==null)return false;
  if(Array.isArray(v))return v.length>0;
  if(k==="finance")return !!((v.tx&&v.tx.length)||(v.cats||[]).some(c=>!AUTO_CATS.includes(c.name))||Object.values(v.wallets||{}).some(w=>w&&(+w.start||w.date)));
  if(k==="loans")return !!(v.list&&v.list.length);
  if(k==="notes")return !!((v.items&&v.items.length)||v.text);
  return false}
function counts(d){const n=k=>Array.isArray(d[k])?d[k].length:0;const f=d.finance||{},l=d.loans||{};
  return `задач ${n("tasks")}, событий ${n("events")}, операций ${(f.tx||[]).length}, целей ${n("goals")}, кредитов ${(l.list||[]).length}`}

/* первый вход под этим аккаунтом на этом устройстве */
async function link(remote){
  const localHas=KEYS.some(k=>meaningful(k,data[k])),remoteHas=KEYS.some(k=>meaningful(k,remote[k]));
  let choice=!remoteHas?"device":!localHas?"cloud":await askConflict(remote);
  base={};
  if(choice==="cloud"){for(const k of KEYS){markDirty(k,false);setForce(k,false)}}
  else if(choice==="device"){if(remoteHas)lsSet(LS_BACKUP,{at:new Date().toISOString(),data:remote});
    for(const k of KEYS)if(data[k]!=null){markDirty(k,true);setForce(k,true)}}
  else{for(const k of KEYS)if(data[k]!=null){markDirty(k,true);setForce(k,false)}}   // объединить: база пустая, записи складываются
  saveBase();lsSet(LS_LINK+":"+user.id,true)}

async function pull(first){
  if(!sb||!user||linking)return;status("busy","Сверяюсь с облаком…");
  let rows;try{rows=await fetchAll()}catch(e){status("err",navigator.onLine===false?"Нет интернета — показаны данные с устройства":"Нет связи с облаком — показаны данные с устройства");return}
  const remote={};for(const r of rows)remote[r.key]=r.value;
  if(!lsGet(LS_LINK+":"+user.id,false)){linking=true;try{await link(remote)}finally{linking=false}}
  for(const k of KEYS){if(k in remote)applyRemote(k,remote[k]);else if(data[k]!=null&&!dirty[k])markDirty(k,true)}
  pushDirty();okStatus();subscribe()}
function subscribe(){
  if(channel||!sb||!user)return;
  channel=sb.channel("planer-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"planner_docs",filter:"user_id=eq."+user.id},p=>{const r=p.new;if(r&&r.key&&KEYS.includes(r.key)&&!linking)applyRemote(r.key,r.value)}).subscribe()}

/* ---------- вход ---------- */
function overlay(html){let o=document.getElementById("sync-ov");if(!o){o=document.createElement("div");o.id="sync-ov";o.className="sync-ov";document.body.appendChild(o)}o.innerHTML=`<div class="sync-box">${html}</div>`;o.hidden=false;o.onclick=null;return o}
function closeOverlay(){const o=document.getElementById("sync-ov");if(o)o.hidden=true}
function askConflict(remote){return new Promise(res=>{const here=LOCAL?"этом Mac":"этом устройстве";
  const o=overlay(`<h2>Данные есть и здесь, и в облаке</h2>
  <p><b>В облаке:</b> ${counts(remote)}.<br><b>На ${here}:</b> ${counts(data)}.</p>
  <p class="hint">«Взять из облака» — данные устройства заменятся облачными. «Объединить» — записи сложатся вместе.</p>
  <div class="sync-actions"><button class="btn pri" data-sc="cloud">Взять из облака</button><button class="btn" data-sc="merge">Объединить</button></div>
  <button class="linkish sync-skip" data-sc="device">Заменить облако данными этого устройства…</button>`);
  let sure=false;
  o.onclick=e=>{const b=e.target.closest("[data-sc]");if(!b)return;
    if(b.dataset.sc==="device"&&!sure){sure=true;b.textContent="Точно заменить? Всё, что сейчас в облаке, будет стёрто на всех устройствах. Нажмите ещё раз";b.style.color="var(--bad)";return}
    closeOverlay();res(b.dataset.sc)}})}
function showLogin(msg){
  const o=overlay(`<h2>Вход в планер</h2><p class="hint">Один аккаунт на всех устройствах — так данные будут общими на iPhone и Mac.</p>
   <form id="sync-login"><input type="email" id="sl-email" placeholder="Почта" autocomplete="username" autocapitalize="off" required><input type="password" id="sl-pass" placeholder="Пароль (не меньше 6 символов)" autocomplete="current-password" required minlength="6">
   <p class="sync-msg" id="sl-msg">${msg||""}</p>
   <div class="sync-actions"><button class="btn pri" type="submit">Войти</button><button class="btn" type="button" id="sl-signup">Создать аккаунт</button></div></form>
   <button class="linkish sync-skip" id="sl-skip">Пока без синхронизации — данные только на этом устройстве</button>`);
  const em=o.querySelector("#sl-email"),pw=o.querySelector("#sl-pass"),m=o.querySelector("#sl-msg");
  const run=async up=>{if(!em.value||pw.value.length<6){m.textContent="Укажите почту и пароль от 6 символов";return}m.textContent=up?"Создаю аккаунт…":"Вхожу…";
    let r;try{r=up?await sb.auth.signUp({email:em.value.trim(),password:pw.value}):await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value})}
    catch(e){m.textContent="Нет связи с сервером. Проверьте интернет и попробуйте ещё раз";return}
    if(r.error){m.textContent=/invalid login/i.test(r.error.message)?"Неверная почта или пароль":/already registered/i.test(r.error.message)?"Такой аккаунт уже есть — нажмите «Войти»":/fetch|network/i.test(r.error.message)?"Нет связи с сервером. Проверьте интернет и попробуйте ещё раз":"Ошибка: "+r.error.message;return}
    if(up&&!r.data.session){m.textContent="Аккаунт создан. Подтвердите почту по ссылке из письма и нажмите «Войти»";return}
    lsSet(LS_MODE,"sync");closeOverlay();await onUser(r.data.user||(r.data.session&&r.data.session.user))};
  o.querySelector("#sync-login").onsubmit=e=>{e.preventDefault();run(false)};
  o.querySelector("#sl-signup").onclick=()=>run(true);
  o.querySelector("#sl-skip").onclick=()=>{lsSet(LS_MODE,"local");closeOverlay();status("local","Без синхронизации — нажмите, чтобы войти")};
  setTimeout(()=>em.focus(),50);
}
function showAccount(){
  if(!configured){overlay(`<h2>Синхронизация не настроена</h2><p>В файле config.js не указан проект Supabase.</p><div class="sync-actions"><button class="btn" data-x>Закрыть</button></div>`).onclick=e=>{if(e.target.closest("[data-x]"))closeOverlay()};return}
  if(!user){if(waitingNet){resume();return}showLogin();return}
  const o=overlay(`<h2>Синхронизация</h2><p>Вы вошли как <b>${(user.email||"").replace(/</g,"&lt;")}</b>.</p><p class="hint">${stText}</p>
   <div class="sync-actions"><button class="btn pri" data-a="now">Синхронизировать сейчас</button><button class="btn" data-a="out">Выйти</button><button class="btn" data-a="x">Закрыть</button></div>`);
  o.onclick=async e=>{const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a;closeOverlay();
    if(a==="now"){pushDirty();pull(false)}
    if(a==="out"){try{await sb.auth.signOut()}catch(err){}user=null;if(channel){sb.removeChannel(channel);channel=null}lsSet(LS_MODE,"local");status("local","Вы вышли — данные только на этом устройстве")}}
}
async function onUser(u){if(!u)return;const firstForUser=!user||user.id!==u.id;user=u;waitingNet=false;
  if(baseBox.uid!==u.id){base={};baseBox={uid:u.id,v:base};saveBase()}       // другой аккаунт — база не годится
  if(firstForUser)await pull(true)}

/* восстановление входа: если срок входа истёк, а сети нет — не требуем пароль, а ждём сеть */
let waitingNet=false,resuming=false;
async function resume(){
  if(user||resuming||!sb)return;resuming=true;
  let s=null,failed=false;
  try{const r=await Promise.race([sb.auth.getSession(),new Promise((_,rej)=>setTimeout(()=>rej(new Error("нет ответа")),8000))]);s=r.data;if(r.error)failed=true}
  catch(e){failed=true}
  resuming=false;
  let stored=false;try{stored=!!localStorage.getItem("planer-auth")}catch(e){}
  if(s&&s.session){await onUser(s.session.user);return}
  if(stored&&(failed||navigator.onLine===false)){waitingNet=true;status("err","Нет интернета — изменения сохраняются на устройстве и отправятся позже");return}
  waitingNet=false;
  if(lsGet(LS_MODE,"")!=="local")showLogin();else status("local","Без синхронизации — нажмите, чтобы войти")}

/* ---------- интерфейс ---------- */
async function load(){
  data=await localLoad();data=data||{};
  observer.observe(document.body,{childList:true,subtree:true});
  if(!configured){status("local","Данные только на этом устройстве");return clone(data)}
  if(lsGet(LS_FORCE_FLAG,0)){lsDel(LS_FORCE_FLAG);for(const k of KEYS)if(data[k]!=null){markDirty(k,true);setForce(k,true)}}   // после «Импорта данных» на Mac
  try{sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"planer-auth",lock:async(n,t,fn)=>fn()}})}
  catch(e){console.error(e);status("err","Синхронизация не запустилась: "+e.message);return clone(data)}
  setTimeout(async()=>{await resume();
    try{sb.auth.onAuthStateChange((ev,ses)=>{if(ses&&ses.user&&(!user||user.id!==ses.user.id))onUser(ses.user)})}catch(e){}},30);
  return clone(data);
}
/* правки помечаются «неотправленными» всегда — даже без входа и без сети, чтобы потом не потеряться */
function save(k,v){data[k]=clone(v);localSave(k,data[k]);if(configured){markDirty(k,true);if(sb&&user)schedulePush(k)}return Promise.resolve()}

const api=Object.assign({},LOCAL||{badge(){},notify(){},openDataFolder(){},onNav(){},onNewTask(){}},{
  platform:PLATFORM,load,save,onRemote:cb=>{listeners.push(cb)},syncMenu:showAccount,_merge3:merge3,
  /* после загрузки из файла: данные этого устройства целиком заменяют облако */
  forceLocal(){if(!configured)return;for(const k of KEYS)if(data[k]!=null){markDirty(k,true);setForce(k,true)}if(sb&&user)for(const k of KEYS)if(dirty[k])schedulePush(k)}});
window.plannerSync=api;   // на Mac window.planner защищён от подмены, поэтому отдельное имя

function wake(){if(user){pushDirty();pull(false)}else if(waitingNet)resume()}
document.addEventListener("click",e=>{if(e.target.closest('[data-act="syncMenu"]'))showAccount()});
window.addEventListener("online",wake);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")wake()});
let lastFocusPull=0;window.addEventListener("focus",()=>{if(Date.now()-lastFocusPull>5000){lastFocusPull=Date.now();wake()}});
setInterval(()=>{if(document.visibilityState!=="visible")return;if(user){if(Object.keys(dirty).length)pushDirty()}else if(waitingNet)resume()},60000);
setInterval(()=>{if(user&&document.visibilityState==="visible")pull(false)},180000);   // страховка, если мгновенные обновления не дошли
window.addEventListener("pagehide",()=>{for(const k in pushT){clearTimeout(pushT[k])}pushDirty()});
})();
