import { ULTIMO_PR } from "./versao.ts";

/** Página única do painel: HTML, CSS e JS inline, sem dependências nem recursos externos. */
export const PANEL_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rastreador de preços</title>
<style>
:root{--bg:#f1f3f5;--sf:#fcfcfb;--sf2:#f3f5f6;--fg:#10161b;--fg2:#47525b;--mut:#66707a;--bd:#dfe3e6;--grid:#e6e9ec;--axis:#c3c9ce;--acc:#1c5cab;--accsoft:#e4eefb;--amz:#2a78d6;--ter:#eb6834;--usa:#1baf7a;--good:#006300;--okb:#0a8a0a;--lar:#c25a00;--larbg:rgba(230,120,0,.18);--verm:#c62828;--goodbg:rgba(12,163,12,.16);--warn:#7a5200;--warnbg:rgba(250,178,25,.22);--bad:#b02a2a;--badbg:rgba(208,59,59,.16);--gap:rgba(16,22,27,.07);--sh:0 1px 2px rgba(16,22,27,.06),0 10px 28px rgba(16,22,27,.07)}
@media(prefers-color-scheme:dark){:root{--bg:#0d0d0d;--sf:#1a1a19;--sf2:#232322;--fg:#f0efec;--fg2:#c3c2b7;--mut:#9b9a93;--bd:#2f2f2d;--grid:#2c2c2a;--axis:#383835;--acc:#6da7ec;--accsoft:#1c2a3d;--amz:#3987e5;--ter:#d95926;--usa:#199e70;--good:#3fc13f;--okb:#3fc13f;--lar:#ff9f45;--larbg:rgba(255,159,69,.2);--verm:#ff6b6b;--warn:#fab219;--bad:#ec6a6a;--gap:rgba(240,239,236,.08);--sh:0 1px 2px rgba(0,0,0,.4),0 10px 28px rgba(0,0,0,.4)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
button,input{font:inherit;color:inherit}button{cursor:pointer}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
main{max-width:1240px;margin:0 auto;padding:12px 16px 48px}
h1{font-size:22px;margin:0 0 14px;letter-spacing:-.01em}
.num,.preco{font-variant-numeric:tabular-nums}.mut{color:var(--mut);font-size:13px}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.cd{background:var(--sf);border:1px solid var(--bd);border-radius:12px}
.saude{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:center;font-size:13.5px}#topo{padding:10px 14px;margin-bottom:12px;display:grid;gap:8px}#topo .saude{padding-bottom:8px;border-bottom:1px solid var(--bd)}
#menu{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}.mb{display:flex;flex-wrap:wrap;gap:6px}.mbtn{border:1px solid var(--bd);background:var(--sf);border-radius:8px;padding:6px 12px;font-size:14px;font-weight:600}.mbtn:hover{background:var(--sf2)}.mbtn[aria-expanded=true]{background:var(--accsoft);color:var(--acc);border-color:var(--acc)}.mbtn b{font-weight:700;color:var(--acc)}
#pns{position:relative;z-index:30}#pns .pn{position:absolute;left:0;right:0;top:-6px;max-height:min(62vh,540px);overflow:auto;padding:14px;margin:0;box-shadow:var(--sh)}#pns .pn[hidden]{display:none}
.saude b{font-weight:600}.saude .st-ok{color:var(--good)}.saude .st-atrasado,.saude .st-sem_rodada{color:var(--warn)}.saude .st-falhando{color:var(--bad)}
.split{display:grid;grid-template-columns:minmax(0,350px) minmax(0,1fr);gap:20px;align-items:start}
.esq{display:grid;gap:12px;min-width:0}
.pill{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;border-radius:999px;padding:2px 9px;background:var(--sf2);color:var(--fg2);white-space:nowrap}
.pill.below{background:var(--goodbg);color:var(--good)}.pill.warn{background:var(--larbg);color:var(--lar)}.pill.hot{background:var(--badbg);color:var(--bad)}.pill.gap{background:var(--warnbg);color:var(--warn)}.pill.paused{color:var(--mut)}.pill.fail{background:var(--badbg);color:var(--bad)}
.lista{display:grid;gap:8px}
.itw{border:1px solid var(--bd);background:var(--sf);border-radius:12px;overflow:hidden}.itw:hover{background:var(--sf2)}.itw.grp,.itw.grp:hover{background:var(--accsoft);border:2px solid var(--acc);border-left-width:8px;box-shadow:5px 5px 0 -1px var(--accsoft),5px 5px 0 0 var(--acc)}.itw.grp .ti b{font-size:15px;font-weight:700;color:var(--acc)}.gtag{display:block;font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--acc);margin-bottom:1px}.pill.gp{background:var(--acc);color:var(--sf)}.gmem{margin:2px 0 6px 14px;padding-left:12px;border-left:3px solid var(--acc);display:grid;gap:8px}.itw.in{border:2px solid var(--okb)}.itw.warn{border:2px solid var(--lar)}.itw.hot{border:2px solid var(--verm)}.itw.in .alv{border-top-color:var(--okb)}.itw.warn .alv{border-top-color:var(--lar)}.itw.hot .alv{border-top-color:var(--verm)}.itw.sel{box-shadow:0 0 0 3px var(--accsoft),0 0 0 4px var(--acc)}
.item.gi{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"t s";padding:6px 10px;gap:8px}.itw.grp .item.gi .ti b{font-size:14px}
.item{display:grid;grid-template-columns:52px minmax(0,1fr) auto;grid-template-areas:"f t p" "f s sp";gap:4px 10px;align-items:center;width:100%;text-align:left;padding:10px;border:0;background:none}
.alv{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;padding:0 10px 10px;border-top:1px dashed var(--bd);padding-top:8px;font-size:13px}.alv .val{width:84px}.alv .mut{margin-right:2px}
.item .foto{grid-area:f;width:52px;height:52px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px;overflow:hidden}
.item .foto img{max-width:100%;max-height:100%;object-fit:contain}.item .foto span{font-size:22px;color:#c3c8ce}
.item .ti{grid-area:t;min-width:0}.item .ti b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;font-size:14px;line-height:1.3}
.item .pr{grid-area:p;font-weight:700;font-size:16px;text-align:right}.item .stt{grid-area:s;display:flex;flex-wrap:wrap;gap:4px}.item .sp{grid-area:sp}
.det{padding:18px;min-width:0}
.dh{display:flex;gap:14px;justify-content:space-between;flex-wrap:wrap;align-items:flex-start}
.dh .foto{width:84px;height:84px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:10px;overflow:hidden;flex:none}
.dh .foto img{max-width:100%;max-height:100%;object-fit:contain}.dh .foto span{font-size:32px;color:#c3c8ce}
.dh h2{margin:0;font-size:19px;line-height:1.3;max-width:62ch;text-wrap:balance}.dh .meta{color:var(--mut);font-size:12.5px;margin-top:4px;display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center}
.act{display:flex;gap:6px;flex-wrap:wrap}
.btn{display:inline-block;padding:6px 12px;border:1px solid var(--bd);background:var(--sf);color:var(--fg);border-radius:8px;font-size:14px;font-weight:600;text-decoration:none}
.btn:hover{background:var(--sf2)}.btn.pri{background:var(--acc);color:var(--sf);border-color:var(--acc)}.btn.pri:hover{filter:brightness(1.08)}.btn.bad{color:var(--bad)}.btn.sm{padding:3px 9px;font-size:13px}.btn:disabled{opacity:.5;cursor:wait}
.tw{overflow-x:auto;margin-top:14px}
table{border-collapse:collapse;width:100%;font-size:13.5px}th{font-size:12px;font-weight:600;color:var(--mut);text-align:left;padding:6px 10px 6px 0;white-space:nowrap;border-bottom:1px solid var(--bd)}
td{padding:8px 10px 8px 0;border-bottom:1px solid var(--grid);vertical-align:middle;white-space:nowrap}td.n,th.n{text-align:right}
tr.desc td{color:var(--mut);text-decoration:line-through}tr.best td{font-weight:600}
.key{display:inline-block;width:18px;height:0;border-top:3px solid var(--c);border-radius:2px;vertical-align:middle;margin-right:6px}
input[type=text],textarea{border:1px solid var(--bd);border-radius:6px;background:var(--sf);color:var(--fg);padding:5px 8px}
textarea{width:100%;resize:vertical;padding:8px}input.val{width:96px;text-align:right}
.bar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin:18px 0 8px}
.seg{display:inline-flex;border:1px solid var(--bd);border-radius:8px;overflow:hidden}.seg button{background:var(--sf);border:0;padding:5px 12px;font-size:13px;font-weight:600;color:var(--fg2)}
.seg button+button{border-left:1px solid var(--bd)}.seg button[aria-pressed=true]{background:var(--accsoft);color:var(--acc)}
.chart{position:relative;width:100%;outline-offset:4px}.chart svg{display:block;width:100%;touch-action:pan-y}
.tip{position:absolute;pointer-events:none;background:var(--sf);border:1px solid var(--bd);border-radius:8px;box-shadow:var(--sh);padding:8px 10px;font-size:12.5px;min-width:150px;z-index:2;top:8px}
.tip .h{color:var(--mut);font-size:12px;margin-bottom:4px}.tip .r{display:flex;gap:8px;justify-content:space-between}
.leg{margin-top:6px;font-size:13px;color:var(--fg2)}.leg span{margin-right:14px}.leg i.g{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;background:var(--gap);border:1px solid var(--axis)}
.sh{font-size:14px;font-weight:700;margin:22px 0 0}
.cp{padding:12px;margin-bottom:12px}.cp h3{font-size:15px;margin:0 0 8px}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:6px 0}
#menuq{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;flex:1 1 320px;min-width:0}#menuq .row,#pn-fil .row{margin:0;flex-wrap:nowrap}#menuq .row.q{flex:1 1 220px}#menuq .row.q input{flex:1}#menuq #fcount{white-space:nowrap;margin-left:auto}#menuq input[type=text],#pn-fil input[type=text]{min-width:0}#pn-fil{flex-wrap:wrap;gap:10px 18px;align-items:center}#pn-fil:not([hidden]){display:flex}select{border:1px solid var(--bd);border-radius:6px;background:var(--sf);color:var(--fg);padding:5px 6px;min-width:0;max-width:100%}#menuq .val,#pn-fil .val{width:84px}
#aviso{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:90%;padding:10px 14px;border-radius:8px;background:var(--fg);color:var(--sf);font-size:14px;display:none;z-index:9}
#aviso.bad{background:var(--bad);color:#fff}
.vazio{padding:40px 16px;text-align:center;color:var(--mut)}
.gs{padding:0}.gs .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.gs .chip{border:1px dashed var(--axis);background:var(--sf2);border-radius:999px;padding:3px 10px;font-size:13px;font-weight:600;color:var(--fg2)}.gs .chip.on{border-style:solid;border-color:var(--acc);color:var(--acc)}
.over{outline:2px dashed var(--acc);outline-offset:2px;background:var(--accsoft)}.itw.drag{opacity:.45}.itw[draggable=true] .item{cursor:grab}
@media(min-width:901px){html,body{height:100%}main{height:100vh;display:flex;flex-direction:column;padding-bottom:12px}.split{flex:1;min-height:0;align-items:stretch;grid-template-rows:minmax(0,1fr)}.det{min-height:0;overflow-y:auto;overscroll-behavior:contain}.esq{display:flex;flex-direction:column;min-height:0;background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:8px}#lst{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:6px 12px 12px 6px}}
@media(max-width:900px){.split{grid-template-columns:minmax(0,1fr)}}
</style></head><body><main><header id="topo" class="cd"><div id="saude" class="saude">Carregando…</div>
<div id="menu"><div class="mb"><button type="button" class="mbtn" data-pn="add" aria-expanded="false" hidden>＋ Rastrear produtos</button><button type="button" class="mbtn" data-pn="grp" aria-expanded="false" hidden>▦ Grupos <b id="ngrp"></b></button><button type="button" class="mbtn" data-pn="fil" aria-expanded="false">⚙ Filtros <b id="nfil"></b></button></div><div id="menuq"></div></div></header>
<div id="pns"><div class="cd pn" id="pn-add" hidden></div><div class="cd pn" id="pn-grp" hidden></div><div class="cd pn" id="pn-fil" hidden></div></div>
<div class="split"><div class="esq" id="esq"><div id="lst"></div></div><div class="cd det" id="dir"><div class="vazio">Carregando…</div></div></div></main>
<script>
const $=s=>document.querySelector(s);
const brl=n=>n==null?'—':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=n=>(n>0?'+':n<0?'−':'')+Math.abs(n).toFixed(1).replace('.',',')+'%';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COR={amazon:'var(--amz)',terceiros:'var(--ter)',usado:'var(--usa)'},NOME={amazon:'Amazon',terceiros:'Terceiros',usado:'Usado'},LK=['amazon','terceiros','usado'];
const ago=t=>{if(!t)return 'nunca';const m=Math.round((Date.now()-Date.parse(t))/60000);return m<1?'agora':m<60?m+' min atrás':m<1440?Math.round(m/60)+' h atrás':Math.round(m/1440)+' d atrás'};
const hhmm=t=>new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const dm=t=>new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
const dt=t=>dm(t)+' '+hhmm(t);
const ST={ok:'Coletas em dia',atrasado:'Coletas atrasadas',sem_rodada:'Ainda sem rodada',falhando:'Coletas falhando'};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(r.status);return r.json()}
let tm;
async function api(m,u,b){const r=await fetch(u,{method:m,headers:{'content-type':'application/json','x-painel':'1'},body:b===undefined?undefined:JSON.stringify(b)});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.erro||('Erro '+r.status));return j}
function aviso(t,bad){let e=$('#aviso');if(!e){e=document.createElement('div');e.id='aviso';document.body.appendChild(e)}e.textContent=t;e.className=bad?'bad':'';e.style.display='block';clearTimeout(tm);tm=setTimeout(()=>e.style.display='none',bad?7000:3500)}
async function rodar(btn,fn){if(btn)btn.disabled=true;try{await fn()}catch(e){aviso(e.message,1)}finally{if(btn)btn.disabled=false}}
const hashAsin=()=>{const h=location.hash.slice(1);return /^[A-Z0-9]{10}$/.test(h)?h:null};
const S={abertos:new Set(),itens:[],grupos:[],gsel:null,gdet:null,edit:false,sel:hashAsin(),dias:14,visao:'grafico',det:null,ult:'',saude:null,hover:null};
const MOTIVOS={captcha:'captcha da Amazon',http_503:'Amazon respondeu 503',http_error:'erro HTTP',vazio:'página vazia',html_inesperado:'página em formato inesperado',erro_rede:'falha de rede'};
const motivo=m=>MOTIVOS[m]||m||'motivo desconhecido';
/* nunca = ainda sem leitura; erro = leitura falhou e nada foi gravado; ok = leu (a Amazon pode não ter oferta) */
const lido=i=>i.linhas.amazon.coletas||(i.ultimaColeta&&i.ultimaColeta.ok)?'ok':i.ultimaColeta?'erro':'nunca';
/* preço exibido: o da Amazon, ou o do melhor terceiro quando ela não vende */
const ap=i=>{const a=i.linhas.amazon,t=i.linhas.terceiros;return a.atual!=null?a.atual:(t.automatico?t.atual:null)};
function status(i){const a=i.linhas.amazon,v=ap(i);
 if(i.pausado)return{k:'paused',t:'Pausado'};
 if(!a.coletas&&!i.ultimaColeta)return{k:'',t:'Aguardando 1ª coleta'};
 if(!a.coletas&&!i.ultimaColeta.ok)return{k:'gap',t:'Erro na coleta ('+motivo(i.ultimaColeta.motivo)+')'};
 if(v==null)return{k:'gap',t:'Amazon sem oferta (confirmado)'};
 if(a.alvo==null)return{k:'',t:a.atual==null?'Amazon sem oferta · só terceiro':'Sem alvo'};
 if(v<=a.alvo)return{k:'below',t:'▼ Dentro do alvo'};
 const p=(v-a.alvo)/a.alvo*100;return{k:p>LIMITE_LARANJA?'hot':'warn',t:'▲ '+p.toFixed(1).replace('.',',')+'% acima do alvo'}}
const LIMITE_LARANJA=20;/* % acima do alvo, (atual − alvo) / alvo: até aqui laranja, acima disso vermelho */
const pill=s=>'<span class="pill '+s.k+'">'+esc(s.t)+'</span>';
function foto(i,cls){return '<div class="foto">'+(i.imagem?'<img src="'+esc(i.imagem)+'" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=\\'🛒\\'">':'<span>🛒</span>')+'</div>'}
function degraus(pts,w,h,cor){if(pts.length<2)return '<svg class="sp" width="'+w+'" height="'+h+'"></svg>';
 const xs=pts.map(p=>Date.parse(p.t)),ys=pts.map(p=>p.v),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const X=t=>(2+(t-x0)/((x1-x0)||1)*(w-4)).toFixed(1),Y=v=>(3+(y1-v)/((y1-y0)||1)*(h-6)).toFixed(1);
 const d=pts.map((p,i)=>i?'H'+X(xs[i])+'V'+Y(p.v):'M'+X(xs[i])+','+Y(p.v)).join('');
 const l=pts[pts.length-1];
 return '<svg class="sp" width="'+w+'" height="'+h+'"><path d="'+d+'" fill="none" stroke="'+cor+'" stroke-width="1.8" stroke-linejoin="round"/><circle cx="'+X(xs[xs.length-1])+'" cy="'+Y(l.v)+'" r="2.6" fill="'+cor+'"/></svg>'}

function renderSaude(){const s=S.saude;if(!s)return;
 const abaixo=S.itens.filter(i=>status(i).k==='below').length;
 const prox=s.ultimaRodada?hhmm(Date.parse(s.ultimaRodada)+s.intervaloMin*60000):null;
 $('#saude').innerHTML='<span class="pill" title="Último PR no ar">PR #${ULTIMO_PR}</span><span><b class="st-'+s.status+'">'+ST[s.status]+'</b></span><span><b>Última coleta</b> '+(s.ultimaRodada?dt(s.ultimaRodada)+' ('+ago(s.ultimaRodada)+')':'nunca')+'</span>'+(prox?'<span><b>Próxima</b> ~'+prox+'</span>':'')+'<span>a cada '+s.intervaloMin+' min</span>'
  +(s.rodadasFalhasSeguidas>0?'<span class="pill fail">! '+s.rodadasFalhasSeguidas+' rodadas seguidas com falha</span>':'')
  +'<span><b>Itens</b> '+s.itens+(s.pausados?' · '+s.pausados+' pausados':'')+(s.comFalhas?' · <span style="color:var(--bad)">'+s.comFalhas+' com falha</span>':'')+' · '+abaixo+' dentro do alvo</span>'}

const FK='painel-filtros-v1',F0={q:'',st:'',gr:'',ln:'',min:'',max:'',ord:'num',dir:'asc'};
let F=Object.assign({},F0);try{Object.assign(F,JSON.parse(localStorage.getItem(FK)||'{}'))}catch(e){}
const salvaF=()=>{try{localStorage.setItem(FK,JSON.stringify(F))}catch(e){}};
const sem=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const nv=t=>{const n=Number(String(t).replace(/[^0-9,.]/g,'').replace(',','.'));return t===''||!isFinite(n)?null:n};
function dist(i){const a=i.linhas.amazon,v=ap(i);return v!=null&&a.alvo!=null?(v-a.alvo)/a.alvo*100:null}
function queda(i){const m=i.mini;return m.length>1&&m[0].v?(m[m.length-1].v-m[0].v)/m[0].v*100:null}
function ultima(i){const m=i.mini;return m.length?Date.parse(m[m.length-1].t):null}
function preco(i){const a=i.linhas.amazon;if(a.atual!=null)return a.atual;const o=['terceiros','usado'].map(k=>i.linhas[k].atual).filter(v=>v!=null);return o.length?Math.min(...o):null}
const gmap=()=>Object.fromEntries(S.grupos.map(g=>[String(g.id),g.nome]));
const gnome=id=>(S.grupos.find(g=>g.id===id)||{}).nome;
const FILTROS={'':'Todos os status',dentro:'Dentro do alvo',acima:'Acima do alvo',semalvo:'Sem alvo',pausado:'Pausados',falha:'Com falha na coleta',semoferta:'Amazon sem oferta',semcoleta:'Sem coleta ainda'};
function passa(i){const a=i.linhas.amazon,t=sem(i.titulo)+' '+i.asin.toLowerCase()+' '+sem(i.grupoId!=null?gnome(i.grupoId):'');
 if(F.q&&!F.q.split(/\\s+/).every(w=>t.includes(sem(w))))return false;
 switch(F.st){case 'dentro':if(!(ap(i)!=null&&a.alvo!=null&&ap(i)<=a.alvo))return false;break;
  case 'acima':if(!(ap(i)!=null&&a.alvo!=null&&ap(i)>a.alvo))return false;break;
  case 'semalvo':if(a.alvo!=null)return false;break;case 'pausado':if(!i.pausado)return false;break;
  case 'falha':if(!(i.falhasSeguidas>0))return false;break;case 'semoferta':if(!(lido(i)==='ok'&&a.atual==null))return false;break;
  case 'semcoleta':if(lido(i)==='ok')return false;break}
 if(F.gr==='none'?i.grupoId!=null:F.gr&&String(i.grupoId)!==F.gr)return false;
 if(F.ln&&!i.linhas[F.ln].ligada)return false;
 const p=F.ln?i.linhas[F.ln].atual:preco(i),mn=nv(F.min),mx=nv(F.max);
 if((mn!=null||mx!=null)&&p==null)return false;
 if(mn!=null&&p<mn)return false;if(mx!=null&&p>mx)return false;return true}
const ORD={num:['Ordem de cadastro',i=>i.num],nome:['Nome',i=>sem(i.titulo||i.asin)],preco:['Preço atual',preco],dist:['Distância até o alvo (%)',dist],var30:['Variação 30 dias',i=>i.linhas.amazon.variacao],queda:['Queda recente (7 dias)',queda],coleta:['Última coleta',ultima],criado:['Data de cadastro',i=>Date.parse(i.criadoEm)]};
function visiveis(){const f=ORD[F.ord]||ORD.num,sg=F.dir==='desc'?-1:1;
 return S.itens.filter(passa).map(i=>({i,k:f[1](i)})).sort((x,y)=>{
  if(x.k==null||y.k==null)return x.k==null&&y.k==null?x.i.num-y.i.num:x.k==null?1:-1;
  const c=typeof x.k==='string'?x.k.localeCompare(y.k,'pt-BR'):x.k-y.k;return c?c*sg:x.i.num-y.i.num}).map(o=>o.i)}
function nFiltros(){const n=[F.st,F.gr,F.ln,F.min,F.max].filter(Boolean).length;const b=$('#nfil');if(b)b.textContent=n?'('+n+')':''}
function initFiltros(){const el=$('#pn-fil');
 const opt=(o,v)=>Object.entries(o).map(([k,l])=>'<option value="'+k+'"'+(k===v?' selected':'')+'>'+esc(Array.isArray(l)?l[0]:l)+'</option>').join('');
 $('#menuq').innerHTML='<div class="row q"><input type="text" id="fq" placeholder="Buscar por título ou ASIN" value="'+esc(F.q)+'" aria-label="Buscar"></div>'
  +'<div class="row"><select id="ford" aria-label="Ordenar por">'+opt(ORD,F.ord)+'</select><button type="button" class="btn sm" id="fdir" title="Inverter ordem">'+(F.dir==='desc'?'↓ Decrescente':'↑ Crescente')+'</button></div><div class="mut" id="fcount"></div>';
 el.innerHTML='<div class="row"><span class="mut">Status</span><select id="fst" aria-label="Status">'+opt(FILTROS,F.st)+'</select></div><div class="row"><span class="mut">Grupo</span><select id="fgr" aria-label="Grupo">'+opt(Object.assign({'':'Todos os grupos',none:'Sem grupo'},gmap()),F.gr)+'</select></div><div class="row"><span class="mut">Linha</span><select id="fln" aria-label="Linha de preço">'+opt({'':'Qualquer linha',terceiros:'Com Terceiros ligada',usado:'Com Usado ligada'},F.ln)+'</select></div>'
  +'<div class="row"><span class="mut">Preço</span><input type="text" class="val" id="fmin" inputmode="decimal" placeholder="mín" value="'+esc(F.min)+'" aria-label="Preço mínimo"><input type="text" class="val" id="fmax" inputmode="decimal" placeholder="máx" value="'+esc(F.max)+'" aria-label="Preço máximo"></div>'
  +'<div class="row"><button type="button" class="btn sm" id="flimpa">Limpar filtros</button></div><div id="fagr"></div>';
 nFiltros();
 const mudou=()=>{F.q=$('#fq').value;F.st=$('#fst').value;F.gr=$('#fgr').value;F.ln=$('#fln').value;F.min=$('#fmin').value.trim();F.max=$('#fmax').value.trim();F.ord=$('#ford').value;salvaF();nFiltros();renderEsq()};
 for(const id of ['fq','fmin','fmax'])$('#'+id).oninput=mudou;for(const id of ['fst','fgr','fln','ford'])$('#'+id).onchange=mudou;
 $('#fdir').onclick=e=>{F.dir=F.dir==='desc'?'asc':'desc';e.target.textContent=F.dir==='desc'?'↓ Decrescente':'↑ Crescente';salvaF();renderEsq()};
 $('#flimpa').onclick=()=>{F=Object.assign({},F0);salvaF();initFiltros();renderEsq()}}
function setHtml(el,h){if(el._h!==h){el.innerHTML=h;el._h=h}}
function setPn(n){S.pn=n;for(const k of ['add','grp','fil'])$('#pn-'+k).hidden=n!==k;document.querySelectorAll('.mbtn').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.pn===n)))}
function renderEsq(){let h='',add='',grp='';
 if(S.edit)add+='<div><textarea id="txt" rows="3" maxlength="4000" placeholder="Cole um ou mais links da Amazon (um por linha, até 20)"></textarea><button class="btn pri" id="add">Rastrear</button><div id="res">'+S.ult+'</div>'
  +'<h3 style="font-size:14px;margin:14px 0 4px">Importar do Keepa</h3><div class="mut">Em keepa.com/manage use o botão de exportar (CSV) e escolha o arquivo aqui. Só ASINs; o alvo você define depois.</div><input type="file" id="arq" accept=".csv,.txt,text/csv,text/plain"><div id="imp"></div></div>';
 if(S.edit)grp+='<div class="gs"><b style="font-size:14px">Grupos</b> <span class="mut">Arraste um item sobre outro item ou sobre um grupo para agrupar.</span><div class="chips">'+S.grupos.map(g=>'<button type="button" class="chip'+(S.gsel===g.id?' on':'')+'" data-g="'+g.id+'">▦ '+esc(g.nome)+' ('+S.itens.filter(i=>i.grupoId===g.id).length+')</button>').join('')+'<button type="button" class="chip" data-g="none" title="Solte aqui para tirar o item do grupo">✕ Sem grupo</button></div></div>';
 h='<div class="lista">';const vis=visiveis();
 const card=i=>{const a=i.linhas.amazon,st=status(i);
  const tags=(i.linhas.terceiros.automatico?'<span class="pill" title="A Amazon não vende; este é o melhor terceiro">Terceiro: '+esc(i.linhas.terceiros.vendedor||'?')+'</span>':'')+(i.silenciadoAte?'<span class="pill">alertas silenciados</span>':'')+(i.falhasSeguidas>0?'<span class="pill fail">falha na coleta</span>':'')+'';
  const cor=a.coletas?COR.amazon:COR.terceiros;
  const al=a.alvo,chips=ap(i)!=null?[5,10,15].map(p=>{const v=Math.round(ap(i)*(1-p/100));return '<button type="button" class="btn sm" data-cv="'+v+'" title="'+brl(v)+'">−'+p+'%</button>'}).join(''):'';
  const alv=S.edit?'<div class="alv" data-asin="'+esc(i.asin)+'"><span class="mut">Alvo</span><input type="text" class="val" inputmode="decimal" placeholder="ex.: 449" value="'+(al!=null?String(al).replace('.',','):'')+'" aria-label="Alvo da Amazon do item '+i.num+'"><button type="button" class="btn sm pri" data-cs="1">Definir</button>'+chips+(al!=null?'<button type="button" class="btn sm" data-cx="1" title="Remover alvo">×</button>':'')+'</div>':'';
  return '<div class="itw'+(!(i.falhasSeguidas>0)&&{below:' in',warn:' warn',hot:' hot'}[st.k]||'')+(i.asin===S.sel?' sel':'')+'"'+(S.edit?' draggable="true" data-dr="'+esc(i.asin)+'"':'')+'><button type="button" class="item" data-asin="'+esc(i.asin)+'" aria-pressed="'+(i.asin===S.sel)+'">'+foto(i)
   +'<span class="ti"><b>'+esc(i.titulo||i.asin)+'</b></span><span class="pr num">'+(ap(i)!=null?brl(ap(i)):'—')+'</span>'
   +'<span class="stt">'+pill(st)+tags+'</span>'+degraus(i.mini,80,26,cor)+'</button>'+alv+'</div>'};
 const vistos=new Set();
 for(const i of vis){
  if(i.grupoId==null||!gnome(i.grupoId)){h+=card(i);continue}
  if(vistos.has(i.grupoId))continue;vistos.add(i.grupoId);
  const gid=i.grupoId,todos=S.itens.filter(x=>x.grupoId===gid),aqui=vis.filter(x=>x.grupoId===gid);
  const buscando=!!F.q.trim(),aberto=S.abertos.has(gid)||F.gr===String(gid)||(buscando&&aqui.length>0);
  const dentro=todos.filter(x=>!(x.falhasSeguidas>0)&&status(x).k==='below').length;
  h+='<div class="itw grp'+(S.gsel===gid?' sel':'')+'" data-dg="'+gid+'"><button type="button" class="item gi" data-gid="'+gid+'" aria-pressed="'+(S.gsel===gid)+'" aria-expanded="'+aberto+'">'
   +'<span class="ti"><span class="gtag">'+(aberto?'▾':'▸')+' GRUPO</span><b>'+esc(gnome(gid))+'</b></span><span class="stt"><span class="pill gp">▦ '+(buscando&&aqui.length!==todos.length?aqui.length+' de '+todos.length:todos.length)+' itens</span>'+(dentro?'<span class="pill below" title="Itens do grupo dentro do alvo">● '+dentro+' dentro do alvo</span>':'')+'</span></button></div>';
  if(aberto)h+='<div class="gmem">'+aqui.map(card).join('')+'</div>'}
 h+='</div>';
 if(!S.itens.length)h+='<div class="cd vazio">Nenhum item rastreado. Cole um link da Amazon acima ou no bot do Telegram.</div>';
 else if(!vis.length)h+='<div class="cd vazio">Nenhum item com esses filtros.</div>';
 const sc=$('#lst').scrollTop;setHtml($('#pn-add'),add);setHtml($('#pn-grp'),grp);$('#lst').innerHTML=h;for(const b of document.querySelectorAll('.mbtn[data-pn=add],.mbtn[data-pn=grp]'))b.hidden=!S.edit;const ng=$('#ngrp');if(ng)ng.textContent=S.grupos.length?'('+S.grupos.length+')':'';$('#lst').scrollTop=sc;
 if(!S.rolou&&S.sel){const el=$('#lst .itw.sel');if(el){S.rolou=1;el.scrollIntoView({block:'nearest'})}}
 const ct=$('#fcount');if(ct)ct.textContent=vis.length+' de '+S.itens.length+' itens';
 const ag=$('#fagr');if(ag){ag.innerHTML=S.edit&&F.q.trim()&&vis.length>=2&&vis.length<=30?'<button type="button" class="btn sm" id="agr">▦ Agrupar os '+vis.length+' itens desta busca</button>':'';
  const b=$('#agr');if(b)b.onclick=()=>{const n=(prompt('Nome do grupo para estes '+vis.length+' itens (sugestão pelos títulos, pode editar):',sugerirNome(vis))||'').trim();if(!n)return;
   const mov=vis.filter(i=>i.grupoId!=null).length;if(mov&&!confirm(mov+' desses itens já estão em outro grupo e serão movidos. Continuar?'))return;
   rodar(b,async()=>{const g=await api('POST','/api/grupos',{nome:n});for(const i of vis)await api('PUT','/api/itens/'+i.asin+'/grupo',{grupoId:g.id});aviso('Grupo criado com '+vis.length+' itens.');S.sel=null;F.q='';$('#fq').value='';F.gr=String(g.id);salvaF();abrirGrupo(g.id);await carregar()})}}
 $('#esq').querySelectorAll('.item').forEach(e=>e.onclick=()=>selecionar(e.dataset.asin));
 if(S.edit)ligarDrag();
 document.querySelectorAll('#pn-grp [data-g]').forEach(b=>b.onclick=()=>{if(b.dataset.g!=='none'){setPn(null);abrirGrupo(Number(b.dataset.g))}});
 $('#lst').querySelectorAll('[data-gid]').forEach(b=>b.onclick=()=>{const g=Number(b.dataset.gid);if(b.getAttribute('aria-expanded')==='true'&&S.abertos.has(g)){S.abertos.delete(g);if(S.gsel===g){S.gsel=null;detalhe()}renderEsq()}else abrirGrupo(g)});
 $('#lst').querySelectorAll('.alv').forEach(c=>{const asin=c.dataset.asin,inp=c.querySelector('input'),
  set=(b,val,msg)=>rodar(b,async()=>{await api('PUT','/api/itens/'+asin+'/alvo',{linha:'amazon',valor:val});aviso(msg);await carregar()});
  c.querySelector('[data-cs]').onclick=e=>{const t=inp.value.trim();if(!t)return aviso('Digite um valor.',1);set(e.target,t,'Alvo salvo.')};
  inp.onkeydown=e=>{if(e.key==='Enter')c.querySelector('[data-cs]').click()};
  c.querySelectorAll('[data-cv]').forEach(b=>b.onclick=()=>set(b,Number(b.dataset.cv),'Alvo salvo.'));
  const x=c.querySelector('[data-cx]');if(x)x.onclick=()=>set(x,null,'Alvo removido.')});
 if(S.edit){$('#add').onclick=e=>rodar(e.target,adicionar);$('#arq').onchange=e=>rodar(null,()=>importar(e.target));bindPickers($('#pn-add'))}}

async function importar(inp){const f=inp.files[0];if(!f)return;if(f.size>6000)throw new Error('Arquivo grande demais (máx. ~500 ASINs).');
 const r=await api('POST','/api/importar',{texto:await f.text()});inp.value='';
 let t=r.importados+' importados';if(r.duplicados)t+=', '+r.duplicados+' já rastreados/repetidos';if(r.invalidos)t+=', '+r.invalidos+' inválidos';if(r.outrosPaises)t+=', '+r.outrosPaises+' de outros países ignorados';if(r.acimaDoLimite)t+=', '+r.acimaDoLimite+' acima do limite de 200 (importe de novo depois)';
 S.ult='<div class="row">Importação: '+esc(t)+'. Os preços aparecem nas próximas rodadas.</div>';await carregar()}
function tokens(t){const out=[];for(let x of t.split(/\\s+/)){if(!x)continue;if(/^(amzn\\.to|a\\.co)\\//i.test(x))x='https:'+'//'+x;if(/^https?:\\/\\//i.test(x)&&!out.includes(x))out.push(x)}return out}
async function adicionar(){const ls=tokens($('#txt').value);if(!ls.length)throw new Error('Cole pelo menos um link da Amazon.');
 const lim=ls.slice(0,20),res=[];let h='';
 for(let n=0;n<lim.length;n++){$('#res').textContent='Lendo '+(n+1)+' de '+lim.length+'…';
  try{res.push(...(await api('POST','/api/itens',{texto:lim[n]})).resultados)}catch(e){res.push({link:lim[n],status:'erro',erro:e.message})}}
 const novos=res.filter(r=>r.status==='novo');
 for(const r of res){h+='<div class="row">'+(r.status==='novo'?'✓ Novo: ':r.status==='existente'?'• Já rastreado: ':'✗ ')+(r.item?esc(r.item.titulo||r.item.asin):esc(r.link)+' — '+esc(r.erro))+'</div>'}
 if(ls.length>20)h+='<div class="mut">Só os primeiros 20 links foram usados.</div>';
 if(novos.length===1)h+=picker(novos[0].item.asin,novos[0].item.amazonAtual);
 else if(novos.length)h+='<div class="mut">Selecione cada item para definir o preço-alvo.</div>';
 S.ult=h;$('#txt').value='';if(novos.length)S.sel=novos[novos.length-1].item.asin;await carregar()}
function picker(asin,atual){let h='<div class="cd cp" data-picker="'+esc(asin)+'" style="margin-top:8px"><b>Qual o preço-alvo da linha Amazon?</b>'+(atual==null?'<div class="mut">A Amazon não vende este item agora; defina um alvo para quando ela voltar.</div>':'')+'<div class="row">';
 if(atual!=null)for(const p of [5,10,15]){const v=Math.round(atual*(1-p/100));h+='<button class="btn" data-v="'+v+'">−'+p+'% · '+brl(v)+'</button>'}
 return h+'<input type="text" class="val" inputmode="decimal" placeholder="ex.: 449"><button class="btn pri" data-custom="1">Definir</button><button class="btn" data-skip="1">Sem alvo por enquanto</button></div></div>'}
function bindPickers(root){root.querySelectorAll('[data-picker]').forEach(c=>{const asin=c.dataset.picker,set=(btn,val)=>rodar(btn,async()=>{await api('PUT','/api/itens/'+asin+'/alvo',{linha:'amazon',valor:val});S.ult='';aviso('Alvo definido: '+brl(typeof val==='number'?val:Number(String(val).replace(/[^0-9,.]/g,'').replace(',','.'))));await carregar()});
 c.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>set(b,Number(b.dataset.v)));
 c.querySelector('[data-custom]').onclick=e=>{const t=c.querySelector('input').value.trim();if(!t)return aviso('Digite um valor.',1);set(e.target,t)};
 c.querySelector('[data-skip]').onclick=()=>{S.ult='';renderEsq()}})}

/* gráfico em degraus: linhas, faixas sem Amazon, alvos tracejados e cursor com os valores de todas as linhas */
const ativa=l=>l.ligada||!!l.automatico;
function tempos(d){const s=new Set();for(const k of LK)if(ativa(d.linhas[k]))for(const p of d.series[k])s.add(p.t);return [...s].sort()}
function valorEm(d,k,t){const p=d.series[k].find(x=>x.t===t);return p?p.v:null}
function grafico(d){const host=$('#chart');if(!host)return;const W=host.clientWidth||840,H=290,L=62,R=14,T=14,B=28,x0=Date.parse(d.desde),x1=Date.now();
 const ls=LK.filter(k=>ativa(d.linhas[k]));
 let vals=ls.flatMap(k=>d.series[k].map(p=>p.v));
 if(!vals.length){host.innerHTML='<p class="mut">Sem coletas neste período.</p>';return}
 for(const k of ls)if(d.linhas[k].alvo!=null)vals.push(d.linhas[k].alvo);
 let y0=Math.min(...vals),y1=Math.max(...vals);const sp=Math.max(y1-y0,y1*.05);y0-=sp*.12;y1+=sp*.12;
 const pw=W-L-R,ph=H-T-B,X=t=>L+(Date.parse(t)-x0)/(x1-x0)*pw,Y=v=>T+(1-(v-y0)/(y1-y0))*ph;
 let s='';
 for(let i=0;i<=4;i++){const p=y0+(y1-y0)*i/4,y=Y(p);s+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="var(--grid)"/><text x="'+(L-8)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="11.5" fill="var(--mut)">R$ '+Math.round(p).toLocaleString('pt-BR')+'</text>'}
 for(const g of d.semAmazon){const a=Math.max(L,X(g.de)),b=Math.min(L+pw,X(g.ate));s+='<rect x="'+a.toFixed(1)+'" y="'+T+'" width="'+Math.max(2,b-a).toFixed(1)+'" height="'+ph+'" fill="var(--gap)"><title>Amazon não vendeu</title></rect>'+(b-a>96?'<text x="'+(a+8).toFixed(1)+'" y="'+(T+14)+'" font-size="11.5" fill="var(--mut)">Amazon sem oferta</text>':'')}
 s+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+(T+ph)+'" y2="'+(T+ph)+'" stroke="var(--axis)"/>';
 const passo=S.dias<=7?1:S.dias<=14?2:5;
 for(let n=0;n*passo<=S.dias;n++){const t=x1-n*passo*86400000;if(t<x0)break;const x=L+(t-x0)/(x1-x0)*pw;s+='<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(n===0?'end':'middle')+'" font-size="11.5" fill="var(--mut)">'+(n===0?'agora':dm(t))+'</text>'}
 for(const k of ls){const a=d.linhas[k].alvo;if(a==null)continue;s+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+Y(a).toFixed(1)+'" y2="'+Y(a).toFixed(1)+'" stroke="'+COR[k]+'" stroke-width="1.5" stroke-dasharray="5 4"/><text x="'+(L+pw-4)+'" y="'+(Y(a)-5).toFixed(1)+'" text-anchor="end" font-size="11.5" fill="var(--fg2)">Alvo '+(k==='amazon'?'':NOME[k]+' ')+brl(a)+'</text>'}
 for(const k of ls.slice().reverse()){const pts=d.series[k];if(!pts.length)continue;
  const path=pts.map((p,i)=>i?'H'+X(p.t).toFixed(1)+'V'+Y(p.v).toFixed(1):'M'+X(p.t).toFixed(1)+','+Y(p.v).toFixed(1)).join(''),l=pts[pts.length-1];
  s+='<path d="'+path+'" fill="none" stroke="'+COR[k]+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+(pts.length===1?'<circle cx="'+X(l.t).toFixed(1)+'" cy="'+Y(l.v).toFixed(1)+'" r="3" fill="'+COR[k]+'"/>':'')+'<circle cx="'+X(l.t).toFixed(1)+'" cy="'+Y(l.v).toFixed(1)+'" r="4.5" fill="'+COR[k]+'" stroke="var(--sf)" stroke-width="2"/>'}
 const ts=tempos(d);
 s+='<g id="hv"></g><rect x="'+L+'" y="0" width="'+pw+'" height="'+(T+ph)+'" fill="transparent" data-hit="1"/>';
 host.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="Histórico de preços. Use as setas para ler cada coleta.">'+s+'</svg><div class="tip" id="tip" hidden></div>';
 const hover=()=>{const hv=host.querySelector('#hv'),tp=host.querySelector('#tip');
  if(S.hover==null||!ts[S.hover]){hv.innerHTML='';tp.hidden=true;return}
  const t=ts[S.hover],hx=X(t);let g='<line x1="'+hx.toFixed(1)+'" x2="'+hx.toFixed(1)+'" y1="'+T+'" y2="'+(T+ph)+'" stroke="var(--fg2)"/>',linhas='';
  for(const k of ls){const v=valorEm(d,k,t);if(v!=null)g+='<circle cx="'+hx.toFixed(1)+'" cy="'+Y(v).toFixed(1)+'" r="4.5" fill="'+COR[k]+'" stroke="var(--sf)" stroke-width="2"/>';
   linhas+='<div class="r"><span><i class="key" style="--c:'+COR[k]+'"></i>'+NOME[k]+'</span><b class="num">'+(v==null?'sem oferta':brl(v))+'</b></div>'}
  hv.innerHTML=g;tp.innerHTML='<div class="h">'+dt(t)+'</div>'+linhas;tp.hidden=false;
  tp.style.left=Math.max(0,hx+14>W-170?hx-184:hx+14).toFixed(0)+'px'};
 hover();
 const idx=e=>{const r=host.querySelector('svg').getBoundingClientRect(),f=Math.max(0,Math.min(1,((e.clientX-r.left)-L)/pw)),tt=x0+f*(x1-x0);let b=0,bd=Infinity;ts.forEach((t,i)=>{const dd=Math.abs(Date.parse(t)-tt);if(dd<bd){bd=dd;b=i}});return b};
 const hit=host.querySelector('[data-hit]');
 hit.onpointermove=hit.onpointerdown=e=>{S.hover=idx(e);hover()};
 hit.onpointerleave=e=>{if(e.pointerType==='mouse'){S.hover=null;hover()}};
 host.onkeydown=e=>{if(!ts.length)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();const c=S.hover==null?ts.length-1:S.hover;S.hover=Math.max(0,Math.min(ts.length-1,c+(e.key==='ArrowLeft'?-1:1)));hover()}else if(e.key==='Escape'){S.hover=null;hover()}}}

function tabelaColetas(d){const ts=tempos(d).slice(-24).reverse(),ls=LK.filter(k=>ativa(d.linhas[k]));
 if(!ts.length)return '<p class="mut">Sem coletas neste período.</p>';
 return '<div class="tw"><table><tr><th>Coleta</th>'+ls.map(k=>'<th class="n">'+NOME[k]+'</th>').join('')+'</tr>'+ts.map(t=>'<tr><td class="num">'+dt(t)+'</td>'+ls.map(k=>{const v=valorEm(d,k,t);return '<td class="n num">'+(v==null?'<span class="mut">sem oferta</span>':brl(v))+'</td>'}).join('')+'</tr>').join('')+'</table></div><div class="mut" style="margin-top:6px">Últimas 24 coletas do período.</div>'}

function melhores(of){const m={};for(const o of of){if(o.descartada)continue;const t=o.preco+(o.frete||0);if(m[o.condicao]==null||t<m[o.condicao])m[o.condicao]=t}return m}
const libera=d=>{const t=d.consultaLiberadaEm?new Date(d.consultaLiberadaEm).getTime()-Date.now():0;return t>0?Math.ceil(t/60000):0};
function renderDir(){if(S.gsel!=null)return renderGrupo();const d=S.det,it=S.itens.find(x=>x.asin===S.sel);
 if(!d||!it){$('#dir').innerHTML='<div class="vazio">'+(S.itens.length?'Selecione um item.':'Nenhum item selecionado.')+'</div>';return}
 const L=d.linhas,st=status(it),url=d.url&&d.url.startsWith('https:'+'//www.amazon.com.br/')?d.url:null;
 let h='<div class="dh"><div style="display:flex;gap:14px;min-width:0">'+foto(it)+'<div><h2>'+esc(d.titulo||d.asin)+'</h2><div class="meta"><span class="mono">#'+d.num+' · '+esc(d.asin)+'</span>'+pill(st)+(d.silenciadoAte?'<span class="pill">alertas silenciados até '+esc(new Date(d.silenciadoAte).toLocaleString('pt-BR'))+'</span>':'')+'</div></div></div>';
 h+='<div class="act">'+(url?'<a class="btn sm" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">Abrir na Amazon</a>':'')+(S.edit?'<button class="btn sm" data-q="1"'+(libera(d)?' disabled':'')+'>'+(libera(d)?'Consultar em '+libera(d)+' min':'Consultar agora')+'</button><button class="btn sm" data-p="1">'+(d.pausado?'Retomar':'Pausar')+'</button><button class="btn sm" data-s="1">'+(d.silenciadoAte?'Reativar alertas':'Silenciar 24 h')+'</button><button class="btn sm bad" data-r="1">Remover</button>':'')+'</div></div>';
 h+='<div class="row" style="margin-top:12px"><span class="mut">Grupo</span>'+(S.edit?'<select id="dg" aria-label="Grupo do item"><option value="">Sem grupo</option>'+S.grupos.map(g=>'<option value="'+g.id+'"'+(g.id===it.grupoId?' selected':'')+'>'+esc(g.nome)+'</option>').join('')+'<option value="new">+ Novo grupo…</option></select>':'<b>'+esc(gnome(it.grupoId)||'—')+'</b>')+(it.grupoId!=null?'<button type="button" class="btn sm" data-vg="1">Ver grupo</button>':'')+'</div>';
 h+='<div class="tw"><table><tr><th>Linha de preço</th><th class="n">Agora</th><th class="n">Alvo</th><th class="n">Mín 30 d</th><th class="n">Máx 30 d</th><th class="n">Variação</th>'+(S.edit?'<th>Coleta</th>':'')+'</tr>';
 LK.forEach((k,idx)=>{const l=L[k],on=ativa(l);
  h+='<tr data-k="'+k+'"><td><i class="key" style="--c:'+COR[k]+'"></i><b style="font-weight:600">'+NOME[k]+'</b>'+(idx===0?' <span class="pill">principal</span>':'')+'</td>'
   +'<td class="n num">'+(on?(l.atual!=null?brl(l.atual)+(l.automatico?'<div class="mut">'+(l.ligada?'':'Automático (Amazon sem oferta) · ')+esc(l.vendedor||'?')+(l.automatico.envio==='amazon'?' · enviado pela Amazon':l.automatico.envio==='terceiro'?' · enviado pelo vendedor':'')+'</div>':''):idx===0&&lido(it)==='nunca'?'<span class="mut">aguardando</span>':idx===0&&lido(it)==='erro'?'<span class="mut">erro na coleta</span>':'<span class="mut">sem oferta</span>'):'<span class="mut">—</span>')+'</td>'
   +'<td class="n">'+(S.edit?'<input type="text" class="val" inputmode="decimal" data-alvo="'+k+'" value="'+(l.alvo!=null?String(l.alvo).replace('.',','):'')+'" placeholder="sem alvo" aria-label="Alvo da linha '+NOME[k]+'"'+(l.ligada?'':' disabled')+'>':(l.alvo!=null?brl(l.alvo):'—'))+'</td>'
   +'<td class="n num">'+(on?brl(l.min):'—')+'</td><td class="n num">'+(on?brl(l.max):'—')+'</td><td class="n num">'+(on&&l.variacao!=null?pct(l.variacao):'—')+'</td>'
   +(S.edit?'<td>'+(idx===0?'<span class="mut">sempre</span>':'<label><input type="checkbox" data-linha="'+k+'" '+(l.ligada?'checked':'')+'> coletar</label>')+'</td>':'')+'</tr>'});
 h+='</table></div>'+(S.edit?'<div class="mut" style="margin-top:6px">Aviso no Telegram quando o preço ficar igual ou abaixo do alvo. Deixe o campo vazio para remover o alvo. Ligar Terceiros ou Usado usa 2 requisições por rodada.</div>':'');
 h+='<div class="bar"><div class="seg">'+[7,14,30].map(n=>'<button type="button" data-n="'+n+'" aria-pressed="'+(n===S.dias)+'">'+n+' dias</button>').join('')+'</div><div class="seg"><button type="button" data-vz="grafico" aria-pressed="'+(S.visao==='grafico')+'">Gráfico</button><button type="button" data-vz="tabela" aria-pressed="'+(S.visao==='tabela')+'">Tabela</button></div></div>';
 if(S.visao==='grafico')h+='<div class="chart" id="chart" tabindex="0"></div><div class="leg">'+LK.filter(k=>ativa(L[k])).map(k=>'<span><i class="key" style="--c:'+COR[k]+'"></i>'+NOME[k]+'</span>').join('')+'<span><i class="g"></i>Amazon não vendeu</span><span><i class="key" style="--c:var(--fg2);border-top-style:dashed"></i>Alvo</span></div>';
 else h+=tabelaColetas(d);
 h+='<div class="sh">Ofertas na última coleta <span class="mut">'+(d.ofertasEm?ago(d.ofertasEm):'')+'</span></div>';
 const best=melhores(d.ofertas);
 h+=d.ofertas.length?'<div class="tw"><table><tr><th>Vendedor</th><th>Condição</th><th>Envio</th><th class="n">Preço</th><th class="n">Frete</th><th class="n">Total</th></tr>'+d.ofertas.map(o=>{const tot=o.preco+(o.frete||0),menor=!o.descartada&&best[o.condicao]===tot;return '<tr class="'+(o.descartada?'desc':menor?'best':'')+'"><td>'+esc(o.vendedor)+(o.descartada?' <span class="pill fail" style="text-decoration:none">descartada (suspeita)</span>':'')+(menor?' <span class="pill below">menor</span>':'')+'</td><td>'+esc(o.condicao)+'</td><td>'+esc(o.envio)+'</td><td class="n num">'+brl(o.preco)+'</td><td class="n num">'+(o.frete==null?'—':o.frete?brl(o.frete):'grátis')+'</td><td class="n num">'+brl(tot)+'</td></tr>'}).join('')+'</table></div>':'<p class="mut">'+(lido(it)==='nunca'?'Ainda sem leitura desta página.':lido(it)==='erro'?'A última leitura falhou ('+esc(motivo(it.ultimaColeta.motivo))+'), então não há ofertas registradas. Tente Consultar agora.':'Lido sem nenhuma oferta (nem Amazon, nem outros vendedores ligados).')+'</p>';
 $('#dir').innerHTML=h;
 const dir=$('#dir'),A='/api/itens/'+d.asin,re=()=>detalhe();
 dir.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{S.dias=+b.dataset.n;S.hover=null;detalhe()});
 dir.querySelectorAll('[data-vz]').forEach(b=>b.onclick=()=>{S.visao=b.dataset.vz;S.hover=null;renderDir()});
 if(S.visao==='grafico'){grafico(d);if(window.ResizeObserver){S.ro&&S.ro.disconnect();S.ro=new ResizeObserver(()=>grafico(d));S.ro.observe($('#chart'))}}
 const vg=dir.querySelector('[data-vg]');if(vg)vg.onclick=()=>abrirGrupo(it.grupoId);
 if(!S.edit)return;
 const dg=dir.querySelector('#dg');if(dg)dg.onchange=()=>rodar(dg,async()=>{let v=dg.value;
  if(v==='new'){const n=(prompt('Nome do novo grupo (sugestão pelo título, pode editar):',sugerirNome([it]))||'').trim();if(!n){dg.value=it.grupoId==null?'':String(it.grupoId);return}v=String((await api('POST','/api/grupos',{nome:n})).id)}
  await api('PUT',A+'/grupo',{grupoId:v===''?null:Number(v)});aviso(v===''?'Item fora de grupos.':'Item colocado no grupo.');await carregar()});
 dir.querySelectorAll('[data-alvo]').forEach(i=>{const k=i.dataset.alvo,salvar=()=>{const t=i.value.trim();if((t===''?null:t)===(L[k].alvo!=null?String(L[k].alvo).replace('.',','):null))return;rodar(i,async()=>{await api('PUT',A+'/alvo',{linha:k,valor:t===''?null:t});aviso(t===''?'Alvo removido.':'Alvo salvo.');await carregar()})};
  i.onchange=salvar;i.onkeydown=e=>{if(e.key==='Enter')i.blur()}});
 dir.querySelectorAll('[data-linha]').forEach(b=>b.onchange=()=>rodar(b,async()=>{const k=b.dataset.linha,on=b.checked;if(on)aviso('Lendo o produto…');const j=await api('PUT',A+'/linhas',{linha:k,ligada:on});aviso(on?(j.leitura==='ok'?'Linha ligada.':'Linha ligada, mas não consegui ler agora; entra na próxima rodada.'):'Linha desligada. O histórico fica guardado.',on&&j.leitura!=='ok');await carregar()}));
 dir.querySelector('[data-q]').onclick=e=>rodar(e.target,async()=>{aviso('Consultando a Amazon… pode levar alguns segundos.');const j=await api('POST',A+'/consultar');aviso(j.consulta==='ok'?'Consulta feita: preços atualizados.':'Não consegui ler agora'+(j.detalhe?' ('+j.detalhe+')':'')+'. A próxima rodada tenta de novo.',j.consulta!=='ok');S.ult='';await carregar()});
 dir.querySelector('[data-p]').onclick=e=>rodar(e.target,async()=>{await api('PUT',A+'/pausa',{pausado:!d.pausado});aviso(d.pausado?'Coletas retomadas.':'Item pausado: sem coletas nem alertas.');await carregar()});
 dir.querySelector('[data-s]').onclick=e=>rodar(e.target,async()=>{await api('PUT',A+'/silencio',{silenciado:!d.silenciadoAte});aviso(d.silenciadoAte?'Alertas reativados.':'Sem alertas por 24 h.');await carregar()});
 dir.querySelector('[data-r]').onclick=e=>{if(!confirm('Remover este item e apagar o histórico?'))return;rodar(e.target,async()=>{await api('DELETE',A);aviso('Item removido. Os demais foram renumerados.');S.sel=null;S.ult='';await carregar()})}}

/* sugestão de nome: palavras que todos os títulos têm em comum (na ordem do primeiro); sem nenhuma, as 4 primeiras palavras */
function sugerirNome(its){const ts=its.map(i=>String(i.titulo||i.asin).replace(/[()\\[\\]{},;:|]/g,' ').split(/\\s+/).filter(Boolean));if(!ts.length)return '';
 const outros=ts.slice(1).map(t=>new Set(t.map(sem))),com=ts[0].filter(w=>w.length>1&&outros.every(o=>o.has(sem(w))));
 const n=(com.length?com:ts[0].slice(0,4)).slice(0,6).join(' ');return n.length>60?n.slice(0,60).trim():n}
/* arrastar e soltar: item sobre item agrupa os dois; item sobre um grupo (ou "Sem grupo") move o item */
async function colocar(asin,gid,msg){await api('PUT','/api/itens/'+asin+'/grupo',{grupoId:gid});aviso(msg);await carregar()}
function soltarEmItem(src,dst){const a=S.itens.find(i=>i.asin===src),b=S.itens.find(i=>i.asin===dst);if(!a||!b||a===b)return;
 if(b.grupoId!=null){if(a.grupoId===b.grupoId)return;return rodar(null,()=>colocar(a.asin,b.grupoId,'Item colocado em '+gnome(b.grupoId)+'.'))}
 if(a.grupoId!=null)return rodar(null,()=>colocar(b.asin,a.grupoId,'Item colocado em '+gnome(a.grupoId)+'.'));
 const n=(prompt('Nome do grupo para estes 2 itens (sugestão pelos títulos, pode editar):',sugerirNome([a,b]))||'').trim();if(!n)return;
 rodar(null,async()=>{const g=await api('POST','/api/grupos',{nome:n});await api('PUT','/api/itens/'+a.asin+'/grupo',{grupoId:g.id});await colocar(b.asin,g.id,'Grupo criado com 2 itens.');abrirGrupo(g.id)})}
/* rola sozinho quando o item arrastado chega perto da borda de cima ou de baixo: primeiro a lista da esquerda (no desktop ela rola por dentro), senão a página */
let dragX=null,dragY=null,dragTm=null;
document.addEventListener('dragover',e=>{dragX=e.clientX;dragY=e.clientY});
const passoBorda=(y,topo,base)=>{const z=70,f=d=>Math.min(60,Math.ceil(d/2)+3);return y<topo+z?-f(topo+z-y):y>base-z?f(y-(base-z)):0};
function autoRolar(on){clearInterval(dragTm);dragTm=null;if(!on)return;dragX=dragY=null;
 dragTm=setInterval(()=>{if(!S.drag){autoRolar(false);return}if(dragY==null)return;
  for(const el of [$('#lst')]){if(!el||el.scrollHeight<=el.clientHeight)continue;const r=el.getBoundingClientRect();
   if(dragX>=r.left&&dragX<=r.right&&dragY>=r.top-40&&dragY<=r.bottom+40){const v=passoBorda(dragY,r.top,r.bottom);if(v){const a=el.scrollTop;el.scrollTop+=v;if(el.scrollTop!==a)return}}}
  const v=passoBorda(dragY,0,innerHeight);if(v)scrollBy(0,v)},16)}
function ligarDrag(){const alvo=(el,fn)=>{el.ondragover=e=>{if(!S.drag)return;e.preventDefault();el.classList.add('over')};el.ondragleave=()=>el.classList.remove('over');
  el.ondrop=e=>{e.preventDefault();el.classList.remove('over');const src=S.drag;S.drag=null;if(src)fn(src)}};
 $('#lst').querySelectorAll('[data-dr]').forEach(el=>{el.ondragstart=e=>{S.drag=el.dataset.dr;S.pnAntes=S.pn;setPn('grp');autoRolar(true);el.classList.add('drag');try{e.dataTransfer.setData('text/plain',S.drag);e.dataTransfer.effectAllowed='move'}catch(x){}};
  el.ondragend=()=>{S.drag=null;autoRolar(false);setPn(S.pnAntes||null);el.classList.remove('drag');document.querySelectorAll('.over').forEach(o=>o.classList.remove('over'))};
  alvo(el,src=>soltarEmItem(src,el.dataset.dr))});
 $('#lst').querySelectorAll('[data-dg]').forEach(b=>alvo(b,src=>{const it=S.itens.find(i=>i.asin===src);if(it&&it.grupoId!==Number(b.dataset.dg))rodar(null,()=>colocar(src,Number(b.dataset.dg),'Item colocado no grupo.'))}));
 document.querySelectorAll('#pn-grp [data-g]').forEach(b=>alvo(b,src=>{const g=b.dataset.g;if(g==='none'){const it=S.itens.find(i=>i.asin===src);if(it&&it.grupoId!=null)rodar(null,()=>colocar(src,null,'Item fora de grupos.'))}else rodar(null,()=>colocar(src,Number(g),'Item colocado no grupo.'))}))}
const GC=['#2a78d6','#eb6834','#1baf7a','#8a5cd6','#c9a100','#d6407a','#5c6b78','#0aa5b5'];
function abrirGrupo(id){S.abertos.add(id);S.gsel=id;S.gdet=null;S.hover=null;renderEsq();detalhe();if(innerWidth<=900)$('#dir').scrollIntoView({behavior:'smooth',block:'start'})}
function grupoGrafico(g){const host=$('#gchart');if(!host)return;const W=host.clientWidth||840,H=270,L=62,R=14,T=14,B=28,x0=Date.parse(g.desde),x1=Date.now();
 const vals=g.itens.flatMap(i=>i.serie.map(p=>p.v));if(!vals.length){host.innerHTML='<p class="mut">Sem coletas neste período.</p>';return}
 let y0=Math.min(...vals),y1=Math.max(...vals);const sp=Math.max(y1-y0,y1*.05);y0-=sp*.12;y1+=sp*.12;
 const pw=W-L-R,ph=H-T-B,X=t=>L+(Date.parse(t)-x0)/(x1-x0)*pw,Y=v=>T+(1-(v-y0)/(y1-y0))*ph;let s='';
 for(let i=0;i<=4;i++){const p=y0+(y1-y0)*i/4,y=Y(p);s+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'" stroke="var(--grid)"/><text x="'+(L-8)+'" y="'+(y+4).toFixed(1)+'" text-anchor="end" font-size="11.5" fill="var(--mut)">R$ '+Math.round(p).toLocaleString('pt-BR')+'</text>'}
 s+='<line x1="'+L+'" x2="'+(L+pw)+'" y1="'+(T+ph)+'" y2="'+(T+ph)+'" stroke="var(--axis)"/>';
 const passo=S.dias<=7?1:S.dias<=14?2:5;
 for(let n=0;n*passo<=S.dias;n++){const t=x1-n*passo*86400000;if(t<x0)break;const x=L+(t-x0)/(x1-x0)*pw;s+='<text x="'+x.toFixed(1)+'" y="'+(H-8)+'" text-anchor="'+(n===0?'end':'middle')+'" font-size="11.5" fill="var(--mut)">'+(n===0?'agora':dm(t))+'</text>'}
 g.itens.forEach((it,k)=>{const pts=it.serie;if(!pts.length)return;const c=GC[k%GC.length],l=pts[pts.length-1];
  s+='<path d="'+pts.map((p,i)=>i?'H'+X(p.t).toFixed(1)+'V'+Y(p.v).toFixed(1):'M'+X(p.t).toFixed(1)+','+Y(p.v).toFixed(1)).join('')+'" fill="none" stroke="'+c+'" stroke-width="2" stroke-linejoin="round"/><circle cx="'+X(l.t).toFixed(1)+'" cy="'+Y(l.v).toFixed(1)+'" r="4.5" fill="'+c+'" stroke="var(--sf)" stroke-width="2"><title>'+esc((it.titulo||it.asin)+': '+brl(l.v))+'</title></circle>'});
 host.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="Histórico de preços de cada item do grupo">'+s+'</svg>'}
function renderGrupo(){const g=S.gdet,dir=$('#dir');if(!g){dir.innerHTML='<div class="vazio">Carregando…</div>';return}
 let h='<div class="dh"><div><h2>Grupo: '+esc(g.nome)+'</h2><div class="meta"><span>'+g.itens.length+(g.itens.length===1?' item':' itens')+'</span>'+(g.menorPreco!=null?'<span>Menor preço agora <b>'+brl(g.menorPreco)+'</b></span>':'')+'</div></div><div class="act">'+(S.edit?'<button class="btn sm" data-gr="1">Renomear</button><button class="btn sm bad" data-gd="1">Apagar grupo</button>':'')+'</div></div>';
 if(!g.itens.length)h+='<p class="mut" style="margin-top:14px">Nenhum item neste grupo. Abra um item e escolha este grupo no campo Grupo.</p>';
 else{h+='<div class="tw"><table><tr><th>Item</th><th class="n">Agora</th><th class="n">vs. menor</th><th class="n">Alvo</th><th class="n">Mín</th><th class="n">Máx</th></tr>';
  g.itens.forEach((it,k)=>{const menor=it.asin===g.menorAsin,dv=it.atual!=null&&g.menorPreco?(it.atual-g.menorPreco)/g.menorPreco*100:null;
   h+='<tr class="'+(menor?'best':'')+'"><td style="white-space:normal;min-width:200px"><i class="key" style="--c:'+GC[k%GC.length]+'"></i><a href="#'+esc(it.asin)+'" data-op="'+esc(it.asin)+'">'+esc(it.titulo||it.asin)+'</a>'+(it.pausado?' <span class="pill paused">Pausado</span>':'')+(menor?' <span class="pill below">menor</span>':'')+'<div class="mut">'+(it.linha==='amazon'?'Amazon':'Terceiros')+'</div></td><td class="n num">'+(it.atual!=null?brl(it.atual):'<span class="mut">sem oferta</span>')+'</td><td class="n num">'+(dv==null?'—':menor?'—':pct(dv))+'</td><td class="n num">'+(it.alvo!=null?brl(it.alvo):'—')+'</td><td class="n num">'+brl(it.min)+'</td><td class="n num">'+brl(it.max)+'</td></tr>'});
  h+='</table></div>';
  h+='<div class="bar"><div class="seg">'+[7,14,30].map(n=>'<button type="button" data-n="'+n+'" aria-pressed="'+(n===S.dias)+'">'+n+' dias</button>').join('')+'</div></div><div class="chart" id="gchart"></div><div class="leg">'+g.itens.map((it,k)=>'<span><i class="key" style="--c:'+GC[k%GC.length]+'"></i>'+esc((it.titulo||it.asin).slice(0,40))+'</span>').join('')+'</div>'}
 dir.innerHTML=h;
 dir.querySelectorAll('[data-op]').forEach(a=>a.onclick=e=>{e.preventDefault();selecionar(a.dataset.op)});
 dir.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>{S.dias=+b.dataset.n;detalhe()});
 grupoGrafico(g);
 const gr=dir.querySelector('[data-gr]');if(gr)gr.onclick=()=>{const n=(prompt('Novo nome do grupo. Sugestão pelos itens: '+sugerirNome(g.itens),g.nome)||'').trim();if(!n||n===g.nome)return;rodar(gr,async()=>{await api('PUT','/api/grupos/'+g.id,{nome:n});aviso('Grupo renomeado.');await carregar()})};
 const gd=dir.querySelector('[data-gd]');if(gd)gd.onclick=()=>{if(!confirm('Apagar o grupo? Os itens continuam rastreados, só ficam sem grupo.'))return;rodar(gd,async()=>{await api('DELETE','/api/grupos/'+g.id);aviso('Grupo apagado.');S.gsel=null;F.gr='';salvaF();await carregar()})}}
async function detalhe(){if(S.gsel!=null){try{S.gdet=await get('/api/grupos/'+S.gsel+'?dias='+S.dias)}catch(e){S.gdet=null;S.gsel=null}renderDir();return}
 if(!S.sel){S.det=null;renderDir();return}
 try{S.det=await get('/api/itens/'+S.sel+'?dias='+S.dias)}catch(e){S.det=null;S.sel=null}
 renderDir()}
function selecionar(asin){S.sel=asin;S.gsel=null;S.hover=null;try{history.replaceState(null,'','#'+asin)}catch(e){}renderEsq();detalhe();if(innerWidth<=900)$('#dir').scrollIntoView({behavior:'smooth',block:'start'})}
async function carregar(){const d=await get('/api/itens');S.itens=d.itens;S.grupos=d.grupos||[];if(S.gsel!=null&&!S.grupos.some(g=>g.id===S.gsel))S.gsel=null;S.edit=!!d.edicao;S.saude=d.saude;
 if(!S.itens.some(i=>i.asin===S.sel))S.sel=S.itens.length?S.itens[0].asin:null;
 if(F.gr&&F.gr!=='none'&&!S.grupos.some(g=>String(g.id)===F.gr))F.gr='';
 initFiltros();renderSaude();renderEsq();if(!S.pnInit){S.pnInit=1;if(S.edit&&!S.itens.length)setPn('add')}await detalhe()}
document.querySelectorAll('.mbtn').forEach(b=>b.onclick=()=>setPn(S.pn===b.dataset.pn?null:b.dataset.pn));
document.addEventListener('click',e=>{if(S.pn&&!e.target.closest('#topo,#pns'))setPn(null)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.pn&&!S.drag)setPn(null)});
initFiltros();
carregar().catch(()=>{$('#dir').innerHTML='<div class="vazio">Não foi possível carregar os dados.</div>'});
setInterval(()=>{if(document.hidden||document.activeElement&&/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;carregar().catch(()=>{})},120000);
</script></body></html>`;
