/* Синхронизация планера через Supabase (общая для iPhone/веба и программы на Mac).
   Подменяет window.planner: load(), save(key,value), onRemote(cb).
   На Mac под ним остаётся файловое хранилище программы (preload), в вебе — localStorage. */
(function(){
"use strict";
const CFG=window.PLANER_CONFIG||{};
const LOCAL=window.planner&&window.planner.load?window.planner:null;   // хранилище программы на Mac
const PLATFORM=LOCAL?"mac":"web";
const KEYS=["tasks","events","finance","goals","habits","notes","loans"];
const LS_DATA="planer-cache-v2",LS_DIRTY="planer-dirty-v2",LS_MODE="planer-mode-v2",LS_LINK="planer-linked-v2";
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const configured=!!(CFG.supabaseUrl&&CFG.supabaseKey&&window.supabase);

let data={},dirty=lsGet(LS_DIRTY,{}),sb=null,user=null,channel=null,listeners=[],pushT={},pushing={},again={};

/* ---------- статус ---------- */
let stText="",stState="local";
function status(s,t){stState=s;stText=t;document.querySelectorAll("[data-sync]").forEach(el=>{el.dataset.s=s;const sp=el.querySelector("span");(sp||el).textContent=t})}
const observer=new MutationObserver(()=>{document.querySelectorAll("[data-sync]").forEach(el=>{if(el.dataset.s!==stState)status(stState,stText)})});

/* ---------- локальное хранилище ---------- */
async function localLoad(){if(LOCAL)return (await LOCAL.load())||{};return lsGet(LS_DATA,{})}
function localSave(k,v){if(LOCAL)return LOCAL.save(k,v);const all=lsGet(LS_DATA,{});all[k]=v;lsSet(LS_DATA,all)}
function markDirty(k,on){if(on)dirty[k]=Date.now();else delete dirty[k];lsSet(LS_DIRTY,dirty)}
function emit(k,v){for(const cb of listeners)try{cb(k,clone(v))}catch(e){console.error(e)}}

/* ---------- облако ---------- */
async function pushKey(k){
  if(!sb||!user)return;if(pushing[k]){again[k]=true;return}
  pushing[k]=true;status("busy","Сохраняю…");
  try{const {error}=await sb.from("planner_docs").upsert({user_id:user.id,key:k,value:clone(data[k])??null,updated_at:new Date().toISOString()},{onConflict:"user_id,key"});
    if(error)throw error;markDirty(k,false);status("ok","Синхронизировано")}
  catch(e){console.warn(e);status("err",navigator.onLine===false?"Нет интернета — изменения сохранятся позже":"Не удалось сохранить в облако, повторю позже")}
  pushing[k]=false;if(again[k]){again[k]=false;pushKey(k)}
}
function schedulePush(k){clearTimeout(pushT[k]);pushT[k]=setTimeout(()=>pushKey(k),600)}
function pushDirty(){for(const k of Object.keys(dirty))pushKey(k)}

function applyRemote(k,v){if(dirty[k]||pushing[k])return;if(JSON.stringify(v)===JSON.stringify(data[k]))return;data[k]=clone(v);localSave(k,data[k]);emit(k,data[k])}

async function fetchAll(){const {data:rows,error}=await sb.from("planner_docs").select("key,value,updated_at");if(error)throw error;return rows||[]}
const hasData=v=>v!=null&&(Array.isArray(v)?v.length>0:typeof v==="object"?Object.keys(v).some(x=>{const y=v[x];return Array.isArray(y)?y.length:y&&typeof y==="object"?Object.keys(y).length:!!y}):!!v);

async function pull(first){
  if(!sb||!user)return;status("busy","Загружаю из облака…");
  let rows;try{rows=await fetchAll()}catch(e){status("err","Нет связи с облаком — показаны данные с устройства");return}
  const remote={};for(const r of rows)remote[r.key]=r.value;
  const remoteHas=KEYS.some(k=>hasData(remote[k])),localHas=KEYS.some(k=>hasData(data[k]));
  if(first&&!lsGet(LS_LINK+":"+user.id,false)){
    let choice="cloud";
    if(remoteHas&&localHas)choice=await askConflict();else if(localHas)choice="device";
    lsSet(LS_LINK+":"+user.id,true);
    if(choice==="device"){for(const k of KEYS)if(data[k]!=null){markDirty(k,true)}pushDirty();status("busy","Отправляю данные устройства в облако…");subscribe();return}
    for(const k of KEYS)markDirty(k,false);
  }
  for(const k of KEYS){if(k in remote)applyRemote(k,remote[k]);else if(data[k]!=null&&!dirty[k])markDirty(k,true)}
  pushDirty();if(!Object.keys(dirty).length)status("ok","Синхронизировано");
  subscribe();
}
function subscribe(){
  if(channel||!sb||!user)return;
  channel=sb.channel("planer-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"planner_docs",filter:"user_id=eq."+user.id},p=>{const r=p.new;if(r&&r.key&&KEYS.includes(r.key))applyRemote(r.key,r.value)}).subscribe();
}

/* ---------- вход ---------- */
function overlay(html){let o=document.getElementById("sync-ov");if(!o){o=document.createElement("div");o.id="sync-ov";o.className="sync-ov";document.body.appendChild(o)}o.innerHTML=`<div class="sync-box">${html}</div>`;o.hidden=false;return o}
function closeOverlay(){const o=document.getElementById("sync-ov");if(o)o.hidden=true}
function askConflict(){return new Promise(res=>{const o=overlay(`<h2>Данные есть и здесь, и в облаке</h2>
  <p>Что оставить? Выбранный вариант заменит другой. ${LOCAL?"Программа на Mac каждый день делает резервную копию, так что данные этого Mac не пропадут бесследно.":""}</p>
  <div class="sync-actions"><button class="btn" data-sc="cloud">Взять из облака</button><button class="btn pri" data-sc="device">Отправить данные ${LOCAL?"этого Mac":"этого устройства"} в облако</button></div>`);
  o.onclick=e=>{const b=e.target.closest("[data-sc]");if(!b)return;closeOverlay();res(b.dataset.sc)}})}
function showLogin(msg){
  const o=overlay(`<h2>Вход в планер</h2><p class="hint">Один аккаунт на всех устройствах — так данные будут общими на iPhone и Mac.</p>
   <form id="sync-login"><input type="email" id="sl-email" placeholder="Почта" autocomplete="username" required><input type="password" id="sl-pass" placeholder="Пароль (не меньше 6 символов)" autocomplete="current-password" required minlength="6">
   <p class="sync-msg" id="sl-msg">${msg||""}</p>
   <div class="sync-actions"><button class="btn pri" type="submit">Войти</button><button class="btn" type="button" id="sl-signup">Создать аккаунт</button></div></form>
   <button class="linkish sync-skip" id="sl-skip">Пока без синхронизации — данные только на этом устройстве</button>`);
  const em=o.querySelector("#sl-email"),pw=o.querySelector("#sl-pass"),m=o.querySelector("#sl-msg");
  const run=async up=>{if(!em.value||pw.value.length<6){m.textContent="Укажите почту и пароль от 6 символов";return}m.textContent=up?"Создаю аккаунт…":"Вхожу…";
    const r=up?await sb.auth.signUp({email:em.value.trim(),password:pw.value}):await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value});
    if(r.error){m.textContent=/invalid login/i.test(r.error.message)?"Неверная почта или пароль":/already registered/i.test(r.error.message)?"Такой аккаунт уже есть — нажмите «Войти»":"Ошибка: "+r.error.message;return}
    if(up&&!r.data.session){m.textContent="Аккаунт создан. Подтвердите почту по ссылке из письма и нажмите «Войти»";return}
    lsSet(LS_MODE,"sync");closeOverlay();await onUser(r.data.user||(r.data.session&&r.data.session.user))};
  o.querySelector("#sync-login").onsubmit=e=>{e.preventDefault();run(false)};
  o.querySelector("#sl-signup").onclick=()=>run(true);
  o.querySelector("#sl-skip").onclick=()=>{lsSet(LS_MODE,"local");closeOverlay();status("local","Без синхронизации")};
  setTimeout(()=>em.focus(),50);
}
function showAccount(){
  if(!configured){overlay(`<h2>Синхронизация не настроена</h2><p>В файле config.js не указан проект Supabase.</p><div class="sync-actions"><button class="btn" data-x>Закрыть</button></div>`).onclick=e=>{if(e.target.closest("[data-x]"))closeOverlay()};return}
  if(!user){showLogin();return}
  const o=overlay(`<h2>Синхронизация</h2><p>Вы вошли как <b>${(user.email||"").replace(/</g,"&lt;")}</b>.</p><p class="hint">${stText}</p>
   <div class="sync-actions"><button class="btn pri" data-a="now">Синхронизировать сейчас</button><button class="btn" data-a="out">Выйти</button><button class="btn" data-a="x">Закрыть</button></div>`);
  o.onclick=async e=>{const b=e.target.closest("[data-a]");if(!b)return;const a=b.dataset.a;closeOverlay();
    if(a==="now"){pushDirty();pull(false)}
    if(a==="out"){await sb.auth.signOut();user=null;if(channel){sb.removeChannel(channel);channel=null}lsSet(LS_MODE,"local");status("local","Вы вышли — данные только на этом устройстве")}}
}
async function onUser(u){if(!u)return;const firstForUser=!user||user.id!==u.id;user=u;if(firstForUser)await pull(true)}

/* ---------- интерфейс window.planner ---------- */
async function load(){
  data=await localLoad();if(!LOCAL)data=data||{};
  observer.observe(document.body,{childList:true,subtree:true});
  if(!configured){status("local","Данные только на этом устройстве");return clone(data)}
  try{sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,storageKey:"planer-auth",lock:async(n,t,fn)=>fn()}})}
  catch(e){console.error(e);status("err","Синхронизация не запустилась: "+e.message);return clone(data)}
  setTimeout(async()=>{
    let s=null;
    try{s=(await Promise.race([sb.auth.getSession(),new Promise((_,rej)=>setTimeout(()=>rej(new Error("нет ответа")),8000))])).data}
    catch(e){console.warn(e)}
    if(s&&s.session)await onUser(s.session.user);
    else if(lsGet(LS_MODE,"")!=="local")showLogin();
    else status("local","Без синхронизации — нажмите, чтобы войти");
    sb.auth.onAuthStateChange((ev,ses)=>{if(ses&&ses.user&&(!user||user.id!==ses.user.id))onUser(ses.user)});
  },30);
  return clone(data);
}
function save(k,v){data[k]=clone(v);localSave(k,data[k]);if(sb&&user){markDirty(k,true);schedulePush(k)}return Promise.resolve()}

const api=Object.assign({},LOCAL||{badge(){},notify(){},openDataFolder(){},onNav(){},onNewTask(){}},{
  platform:PLATFORM,load,save,onRemote:cb=>{listeners.push(cb)},syncMenu:showAccount});
window.plannerSync=api;   // на Mac window.planner защищён от подмены, поэтому отдельное имя

document.addEventListener("click",e=>{if(e.target.closest('[data-act="syncMenu"]'))showAccount()});
window.addEventListener("online",()=>{pushDirty();pull(false)});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&user){pushDirty();pull(false)}});
setInterval(()=>{if(user&&Object.keys(dirty).length)pushDirty()},60000);
window.addEventListener("pagehide",()=>{for(const k in pushT){clearTimeout(pushT[k])}pushDirty()});
})();
