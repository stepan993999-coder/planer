/* Только для версии на iPhone/в браузере: нижняя панель, меню «Ещё», загрузка из файла, долгое нажатие. */
(function(){
"use strict";
const $=s=>document.querySelector(s);
const P=()=>window.Planer;
const MORE=["loans","goals","habits","notes"];
let importData=null,importName="";

function syncTabs(v){const sh=$("#sheet");const open=sh&&!sh.hidden;
  document.querySelectorAll(".tabbar [data-v],.tabbar [data-act=more]").forEach(b=>{const on=b.dataset.act==="more"?(open||MORE.includes(v)):(!open&&b.dataset.v===v);if(on)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
  document.querySelectorAll(".sheet [data-v]").forEach(b=>{if(b.dataset.v===v)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")})}

window.PlanerHooks={
  afterNav:v=>syncTabs(v),
  beforeGo:()=>{const sh=$("#sheet");if(sh)sh.hidden=true},
  banner:()=>{if(!importData)return"";const d=importData,n=k=>Array.isArray(d[k])?d[k].length:0,tx=d.finance&&Array.isArray(d.finance.tx)?d.finance.tx.length:0,e=P().esc;
    return `<div class="banner"><p><b>Загрузить «${e(importName)}»?</b> В файле: задач ${n("tasks")}, событий ${n("events")}, операций ${tx}, целей ${n("goals")}, привычек ${n("habits")}. Данные из файла заменят соответствующие разделы на всех ваших устройствах.</p>
    <div style="display:flex;gap:8px"><button class="btn" data-act="importCancel">Отмена</button><button class="btn pri" data-act="importDo">Заменить</button></div></div>`}
};

document.addEventListener("click",e=>{
  const a=e.target.closest("[data-act]");if(!a)return;const act=a.dataset.act;
  if(act==="more"){const sh=$("#sheet");sh.hidden=!sh.hidden;syncTabs(P().ui.view)}
  else if(act==="importFile"){const sh=$("#sheet");if(sh)sh.hidden=true;$("#importFile").click()}
  else if(act==="importCancel"){importData=null;P().render()}
  else if(act==="importDo"){const d=importData;importData=null;const {S,KEYS,clone,save,migrate,render,toast}=P();
    for(const k in KEYS){if(d[k]==null)continue;S[k]=Array.isArray(KEYS[k])?clone(d[k]):Object.assign(clone(KEYS[k]),clone(d[k]));save(k)}
    migrate();render();toast("Данные загружены из файла")}
});
document.addEventListener("change",e=>{const t=e.target;if(t.id!=="importFile")return;const f=t.files&&t.files[0];t.value="";if(!f)return;
  const r=new FileReader();r.onload=()=>{let d=null;try{d=JSON.parse(r.result)}catch(err){}
    if(!d||typeof d!=="object"||!Object.keys(P().KEYS).some(k=>k in d)){P().toast("В этом файле нет данных планера");return}
    importData=d;importName=f.name;P().go("overview")};r.readAsText(f)});

/* долгое нажатие на клетку привычки — минус один */
let lpT=null,lpFired=false;
document.addEventListener("touchstart",e=>{const a=e.target.closest('.hc[data-act="habit"]');if(!a)return;lpFired=false;clearTimeout(lpT);
  lpT=setTimeout(()=>{lpFired=true;P().habitAdd(a.dataset.id,a.dataset.d,-1);if(navigator.vibrate)navigator.vibrate(12)},480)},{passive:true});
document.addEventListener("touchend",()=>clearTimeout(lpT),{passive:true});
document.addEventListener("touchmove",()=>clearTimeout(lpT),{passive:true});
document.addEventListener("click",e=>{if(lpFired&&e.target.closest(".hc")){lpFired=false;e.preventDefault();e.stopPropagation()}},true);

/* обновления: при возвращении в приложение проверяем, не вышла ли новая версия */
let appVer=null;
async function readVer(){try{const r=await fetch("version.json?t="+Date.now(),{cache:"no-store"});if(r.ok)return (await r.json()).v}catch(e){}return null}
readVer().then(v=>{appVer=v});
async function checkUpdate(){const v=await readVer();if(!v||!appVer||v===appVer)return;const ae=document.activeElement;
  if(ae&&/INPUT|TEXTAREA/.test(ae.tagName)&&ae.value){P().toast("Вышло обновление планера — оно применится при следующем открытии");appVer=v;return}
  location.reload()}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkUpdate()});
setInterval(()=>{if(document.visibilityState==="visible")checkUpdate()},10*60*1000);

/* офлайн-режим: кэш файлов приложения */
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
