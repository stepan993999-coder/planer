/* Расчёт плана погашения кредитов — те же формулы, что в таблице Excel
   (листы «Кредиты», «Исходный план», «План», «Учёт»). Чистые функции, без интерфейса. */
(function(root){
"use strict";
const HORIZON=120;

function monthKey(y,m){return y+"-"+String(m+1).padStart(2,"0")}
function addMonths(key,n){const [y,m]=key.split("-").map(Number);const d=new Date(y,m-1+n,1);return monthKey(d.getFullYear(),d.getMonth())}
function monthsBetween(a,b){const [ay,am]=a.split("-").map(Number),[by,bm]=b.split("-").map(Number);return (by-ay)*12+(bm-am)}

/* Сначала обязательные платежи по всем кредитам, затем весь остаток бюджета — по порядку списка. */
function waterfall(owed,mins,total){
  const pay=owed.map((o,i)=>Math.min(mins[i],o));
  let rem=Math.max(0,total-pay.reduce((a,b)=>a+b,0));
  for(let i=0;i<owed.length;i++){const add=Math.min(owed[i]-pay[i],rem);pay[i]+=add;rem-=add}
  return pay;
}

/* L: {list:[{id,cat,balance,rate,min}], budget, start:"YYYY-MM", target:"YYYY-MM", mode:"reduce"|"early", appBal:{"YYYY-MM":{loanId:number}}}
   tx: [{date,cat,amount}], catType(name)->"Доход"|"Обязательный"|"Кредит"|"Другой", today: Date */
function compute(L,tx,catType,today,catDir){catDir=catDir||(t=>t.dir||"out");
  const loans=L.list||[];const n=loans.length;
  const months=[];for(let i=0;i<HORIZON;i++)months.push(addMonths(L.start,i));
  const todayKey=monthKey(today.getFullYear(),today.getMonth());
  const initTotal=loans.reduce((a,l)=>a+(+l.balance||0),0);

  /* факт по месяцам из операций */
  const fact={};for(const m of months)fact[m]={count:0,inc:0,obl:0,oth:0,credit:0,debt:0,paid:loans.map(()=>0),cashIn:0,cashOut:0,cardOut:0};
  for(const t of tx){const m=(t.date||"").slice(0,7);const f=fact[m];if(!f)continue;f.count++;const a=+t.amount||0;const ty=catType(t.cat);if(ty==="Перевод")continue;
    const isIn=ty==="Доход"||(ty==="Долг"&&catDir(t)==="in");
    if(ty==="Доход")f.inc+=a;else if(ty==="Долг")f.debt+=isIn?a:-a;else if(ty==="Обязательный")f.obl+=a;else if(ty==="Кредит")f.credit+=a;else f.oth+=a;
    const li=loans.findIndex(l=>l.cat===t.cat);if(li>=0)f.paid[li]+=a;
    if(t.pay==="Наличные"){if(isIn)f.cashIn+=a;else f.cashOut+=a}else if(t.pay==="Карта"&&!isIn)f.cardOut+=a}

  /* исходный план: бюджет каждый месяц одинаковый */
  const orig=[];{let bal=loans.map(l=>+l.balance||0);
    for(let i=0;i<HORIZON;i++){const ints=bal.map((b,j)=>b*(+loans[j].rate||0)/12);const owed=bal.map((b,j)=>b+ints[j]);
      const total=bal.reduce((a,b)=>a+b,0);const pay=total<1?bal.map(()=>0):waterfall(owed,loans.map(l=>+l.min||0),+L.budget||0);
      const end=owed.map((o,j)=>Math.max(0,o-pay[j]));
      orig.push({month:months[i],start:bal,interest:ints,pay,end,payTotal:pay.reduce((a,b)=>a+b,0),endTotal:end.reduce((a,b)=>a+b,0)});bal=end}}

  /* план с учётом факта */
  const plan=[];{let bal=loans.map(l=>+l.balance||0);
    for(let i=0;i<HORIZON;i++){const m=months[i];const f=fact[m];
      const ended=todayKey>m; // сегодня не раньше первого числа следующего месяца
      const status=f.count>0&&ended?"факт":f.count>0?"идёт":"план";
      const left=Math.max(1,monthsBetween(m,L.target)+1);
      const totalStart=bal.reduce((a,b)=>a+b,0);
      let dev=i===0?totalStart-initTotal:totalStart-orig[i-1].endTotal;
      if(L.mode==="early")dev=Math.max(0,dev);
      const need=totalStart<1?0:Math.max(0,(+L.budget||0)+dev/left);
      const ints=bal.map((b,j)=>b*(+loans[j].rate||0)/12);const owed=bal.map((b,j)=>b+ints[j]);
      const pay=status==="факт"?f.paid.slice():waterfall(owed,loans.map(l=>+l.min||0),need);
      const ab=(L.appBal||{})[m]||{};
      const end=owed.map((o,j)=>status==="факт"&&typeof ab[loans[j].id]==="number"?ab[loans[j].id]:Math.max(0,o-pay[j]));
      plan.push({month:m,status,left,dev,need,start:bal,interest:ints,pay,end,payTotal:pay.reduce((a,b)=>a+b,0),endTotal:end.reduce((a,b)=>a+b,0),origEnd:orig[i].endTotal});
      bal=end}}

  /* учёт: долг по факту (из прошлого месяца + проценты − внесено, или остаток из приложения) */
  const acct=[];{let v=loans.map(l=>+l.balance||0);
    for(let i=0;i<HORIZON;i++){const m=months[i];const f=fact[m];const ab=(L.appBal||{})[m]||{};
      v=v.map((x,j)=>typeof ab[loans[j].id]==="number"?ab[loans[j].id]:Math.max(0,x*(1+(+loans[j].rate||0)/12)-f.paid[j]));
      const has=f.count>0;const debt=v.reduce((a,b)=>a+b,0);const p=plan[i];
      let status="";if(p.status==="факт")status=debt<1?"долгов нет":debt>orig[i].endTotal+1000?"отстаёте":debt<orig[i].endTotal-1000?"опережаете":"по плану";else if(has)status="месяц идёт";
      const paid=f.paid.reduce((a,b)=>a+b,0);
      acct.push({month:m,has,count:f.count,inc:f.inc,obl:f.obl,oth:f.oth,paid:f.paid.slice(),paidTotal:paid,need:p.need,diff:paid-p.need,left:f.inc-f.obl-f.oth-paid+f.debt,debt:f.debt,
        debtByLoan:v.slice(),debt:debt,origDebt:orig[i].endTotal,status,cashIn:f.cashIn,cashOut:f.cashOut,cardOut:f.cardOut})}}

  const filled=acct.filter(a=>a.has);
  const cur=plan.find(p=>p.status!=="факт");
  const closeRow=plan.find(p=>p.endTotal<1);
  return {months,orig,plan,acct,
    summary:{initTotal,paidTotal:acct.reduce((a,r)=>a+(r.has?r.paidTotal:0),0),
      debtNow:filled.length?filled[filled.length-1].debt:initTotal,
      debtByLoanNow:filled.length?filled[filled.length-1].debtByLoan:loans.map(l=>+l.balance||0),
      closedMonths:plan.filter(p=>p.status==="факт").length,
      needNow:cur?cur.need:0,curMonth:cur?cur.month:null,curPlan:cur||null,
      closeMonth:closeRow?closeRow.month:null,
      overpay:plan.reduce((a,p)=>a+p.interest.reduce((x,y)=>x+y,0),0),
      origOverpay:orig.reduce((a,p)=>a+p.interest.reduce((x,y)=>x+y,0),0),
      minTotal:loans.reduce((a,l)=>a+(+l.min||0),0)}};
}

/* В каком месяце (номер от начала плана) закроются долги по исходному плану при платеже B; -1 — не закроются за горизонт */
function origCloseIdx(L,B){const loans=L.list||[];let bal=loans.map(l=>+l.balance||0);if(bal.reduce((a,b)=>a+b,0)<1)return 0;
  for(let i=0;i<HORIZON;i++){const owed=bal.map((b,j)=>b*(1+(+loans[j].rate||0)/12));const pay=waterfall(owed,loans.map(l=>+l.min||0),B);bal=owed.map((o,j)=>Math.max(0,o-pay[j]));if(bal.reduce((a,b)=>a+b,0)<1)return i}return -1}
function closeMonthFor(L,B){const i=origCloseIdx(L,B);return i<0?null:addMonths(L.start,i)}
/* Минимальный платёж в месяц (с шагом 100 ₽), чтобы закрыть всё к месяцу target включительно; null — дата раньше начала */
function neededBudget(L,target){const k=monthsBetween(L.start,target);if(k<0)return null;const total=(L.list||[]).reduce((a,l)=>a+(+l.balance||0),0);
  let lo=0,hi=Math.max(1000,total*1.7);for(let n=0;n<60;n++){const mid=(lo+hi)/2;const ci=origCloseIdx(L,mid);if(ci>=0&&ci<=k)hi=mid;else lo=mid}return Math.ceil(hi/100)*100}
const api={compute,waterfall,addMonths,monthsBetween,monthKey,HORIZON,origCloseIdx,closeMonthFor,neededBudget};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.PlanerCalc=api;
})(typeof window!=="undefined"?window:this);
