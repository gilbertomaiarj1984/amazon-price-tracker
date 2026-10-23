/** Página única do painel: HTML, CSS e JS inline, sem dependências nem recursos externos. */
export const PANEL_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rastreador de preços</title>
<style>
:root{--bg:#fff;--fg:#1d2329;--mut:#667085;--card:#f6f7f9;--bd:#e3e6ea;--amz:#1d6fd6;--ter:#d97a06;--usa:#2f9e6b;--gap:rgba(120,120,120,.18);--bad:#c0392b}
@media(prefers-color-scheme:dark){:root{--bg:#14171a;--fg:#e8eaed;--mut:#9aa3ad;--card:#1e2327;--bd:#2d343a;--amz:#5aa2ff;--ter:#f0a040;--usa:#4cc790;--gap:rgba(200,200,200,.14);--bad:#ff7b6b}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.4 system-ui,sans-serif}
main{max-width:900px;margin:0 auto;padding:16px}
h1{font-size:20px;margin:0 0 12px}
.saude{padding:10px 12px;border-radius:8px;background:var(--card);border:1px solid var(--bd);margin-bottom:16px;font-size:14px}
.saude b.ok{color:var(--usa)}.saude b.atrasado,.saude b.sem_rodada{color:var(--ter)}.saude b.falhando{color:var(--bad)}
.item{display:flex;gap:12px;align-items:center;padding:12px;margin-bottom:8px;border:1px solid var(--bd);border-radius:8px;background:var(--card);cursor:pointer}
.item:hover{border-color:var(--amz)}
.item .t{flex:1;min-width:0}.item .t div:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mut{color:var(--mut);font-size:13px}.preco{font-weight:600;font-variant-numeric:tabular-nums}
svg{display:block}.back{background:none;border:0;color:var(--amz);cursor:pointer;font-size:15px;padding:0 0 8px}
.dias button{margin-right:6px;padding:4px 12px;border:1px solid var(--bd);background:var(--card);color:var(--fg);border-radius:14px;cursor:pointer}
.dias button.on{background:var(--amz);color:#fff;border-color:var(--amz)}
table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--bd)}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.leg span{margin-right:14px;font-size:13px}.leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
tr.desc{color:var(--mut);text-decoration:line-through}
</style></head><body><main id="app"><h1>Rastreador de preços</h1><div id="v">Carregando…</div></main>
<script>
const $=s=>document.querySelector(s),v=$('#v');
const brl=n=>n==null?'—':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COR={amazon:'var(--amz)',terceiros:'var(--ter)',usado:'var(--usa)'},NOME={amazon:'Amazon',terceiros:'Terceiros',usado:'Usado'};
const ago=t=>{if(!t)return 'nunca';const m=Math.round((Date.now()-Date.parse(t))/60000);return m<1?'agora':m<60?m+' min atrás':m<1440?Math.round(m/60)+' h atrás':Math.round(m/1440)+' d atrás'};
const ST={ok:'Coletas em dia',atrasado:'Coletas atrasadas',sem_rodada:'Ainda sem rodada',falhando:'Coletas falhando'};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(r.status);return r.json()}
function spark(pts,w,h){if(pts.length<2)return '<svg width="'+w+'" height="'+h+'"></svg>';
 const xs=pts.map(p=>Date.parse(p.t)),ys=pts.map(p=>p.v),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const d=pts.map((p,i)=>(i?'L':'M')+((xs[i]-x0)/((x1-x0)||1)*w).toFixed(1)+' '+(h-2-(p.v-y0)/((y1-y0)||1)*(h-4)).toFixed(1)).join('');
 return '<svg width="'+w+'" height="'+h+'"><path d="'+d+'" fill="none" stroke="var(--amz)" stroke-width="1.5"/></svg>'}
async function lista(){const d=await get('/api/itens'),s=d.saude;
 let h='<div class="saude"><b class="'+s.status+'">'+ST[s.status]+'</b> · última rodada '+ago(s.ultimaRodada)+' (a cada '+s.intervaloMin+' min) · '+s.itens+' itens'+(s.pausados?', '+s.pausados+' pausados':'')+(s.comFalhas?', <span style="color:var(--bad)">'+s.comFalhas+' com falha</span>':'')+'</div>';
 for(const i of d.itens){const l=i.linhas;
  h+='<div class="item" data-asin="'+esc(i.asin)+'"><div class="t"><div>'+i.num+'. '+esc(i.titulo||i.asin)+(i.pausado?' (pausado)':'')+'</div><div class="mut">Amazon <span class="preco">'+(l.amazon.atual!=null?brl(l.amazon.atual):'não vende agora')+'</span>'+(l.terceiros.ligada?' · Terceiros <span class="preco">'+brl(l.terceiros.atual)+'</span>':'')+(l.usado.ligada?' · Usado <span class="preco">'+brl(l.usado.atual)+'</span>':'')+'</div></div>'+spark(i.mini,110,32)+'</div>'}
 if(!d.itens.length)h+='<p class="mut">Nenhum item rastreado. Cole um link da Amazon no bot do Telegram.</p>';
 v.innerHTML=h;v.querySelectorAll('.item').forEach(e=>e.onclick=()=>detalhe(e.dataset.asin,14))}
function grafico(d){const W=840,H=260,L=56,B=22,T=8,x0=Date.parse(d.desde),x1=Date.now();
 const todos=Object.entries(d.series).filter(([k])=>d.linhas[k].ligada).flatMap(([,a])=>a.map(p=>p.v));
 if(!todos.length)return '<p class="mut">Sem coletas neste período.</p>';
 let y0=Math.min(...todos),y1=Math.max(...todos);if(y0===y1){y0*=.95;y1*=1.05}const pad=(y1-y0)*.08;y0-=pad;y1+=pad;
 const X=t=>L+(Date.parse(t)-x0)/(x1-x0)*(W-L-8),Y=p=>T+(1-(p-y0)/(y1-y0))*(H-T-B);
 let s='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Histórico de preços">';
 for(let i=0;i<=4;i++){const p=y0+(y1-y0)*i/4,y=Y(p);s+='<line x1="'+L+'" x2="'+(W-8)+'" y1="'+y+'" y2="'+y+'" stroke="var(--bd)"/><text x="'+(L-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="var(--mut)">'+Math.round(p)+'</text>'}
 for(const g of d.semAmazon){const a=Math.max(L,X(g.de)),b=Math.min(W-8,X(g.ate));s+='<rect x="'+a+'" y="'+T+'" width="'+Math.max(2,b-a)+'" height="'+(H-T-B)+'" fill="var(--gap)"><title>Amazon não vendeu</title></rect>'}
 for(const k of ['amazon','terceiros','usado']){if(!d.linhas[k].ligada||!d.series[k].length)continue;
  const pts=d.series[k],path=pts.map((p,i)=>(i?'L':'M')+X(p.t).toFixed(1)+' '+Y(p.v).toFixed(1)).join('');
  s+='<path d="'+path+'" fill="none" stroke="'+COR[k]+'" stroke-width="2"/>'+pts.map(p=>'<circle cx="'+X(p.t).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="2.5" fill="'+COR[k]+'"><title>'+NOME[k]+' '+brl(p.v)+' · '+new Date(p.t).toLocaleString('pt-BR')+'</title></circle>').join('')}
 return s+'</svg>'}
async function detalhe(asin,dias){const d=await get('/api/itens/'+asin+'?dias='+dias);
 let h='<button class="back">← Itens</button><h2 style="font-size:17px;margin:0 0 4px">'+esc(d.titulo||d.asin)+'</h2><div class="mut">'+d.asin+'</div>';
 h+='<div class="dias" style="margin:12px 0">'+[7,14,30].map(n=>'<button data-n="'+n+'" class="'+(n===dias?'on':'')+'">'+n+' dias</button>').join('')+'</div>';
 h+='<div class="leg">'+['amazon','terceiros','usado'].filter(k=>d.linhas[k].ligada).map(k=>'<span><i style="background:'+COR[k]+'"></i>'+NOME[k]+' '+brl(d.linhas[k].atual)+(d.linhas[k].min!=null?' <span class="mut">(mín '+brl(d.linhas[k].min)+')</span>':'')+'</span>').join('')+'<span><i style="background:var(--gap)"></i>Amazon não vendeu</span></div>';
 h+=grafico(d);
 h+='<h3 style="font-size:15px;margin:16px 0 0">Ofertas na última coleta <span class="mut">'+(d.ofertasEm?ago(d.ofertasEm):'')+'</span></h3>';
 h+=d.ofertas.length?'<table><tr><th>Vendedor</th><th>Condição</th><th>Envio</th><th class="n">Preço</th><th class="n">Frete</th></tr>'+d.ofertas.map(o=>'<tr class="'+(o.descartada?'desc':'')+'"><td>'+esc(o.vendedor)+(o.descartada?' (suspeita)':'')+'</td><td>'+esc(o.condicao)+'</td><td>'+esc(o.envio)+'</td><td class="n">'+brl(o.preco)+'</td><td class="n">'+(o.frete==null?'—':brl(o.frete))+'</td></tr>').join('')+'</table>':'<p class="mut">Sem ofertas registradas.</p>';
 v.innerHTML=h;v.querySelector('.back').onclick=lista;v.querySelectorAll('.dias button').forEach(b=>b.onclick=()=>detalhe(asin,+b.dataset.n))}
lista().catch(()=>{v.textContent='Não foi possível carregar os dados.'});
</script></body></html>`;
