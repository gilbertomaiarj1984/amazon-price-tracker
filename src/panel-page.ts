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
.card{padding:12px;margin-bottom:12px;border:1px solid var(--bd);border-radius:8px;background:var(--card)}
.card h3{font-size:15px;margin:0 0 8px}
textarea,input[type=text]{box-sizing:border-box;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;padding:8px}
textarea{width:100%;resize:vertical}input.val{width:110px}
.btn{padding:6px 12px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);border-radius:6px;cursor:pointer;font:inherit;margin:4px 6px 0 0}
.btn:hover{border-color:var(--amz)}.btn.pri{background:var(--amz);color:#fff;border-color:var(--amz)}.btn.bad{color:var(--bad);border-color:var(--bad)}.btn:disabled{opacity:.5;cursor:wait}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:6px 0}.row .l{min-width:90px}
#aviso{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);max-width:90%;padding:10px 14px;border-radius:8px;background:var(--fg);color:var(--bg);font-size:14px;display:none}
#aviso.bad{background:var(--bad);color:#fff}
</style></head><body><main id="app"><h1>Rastreador de preços</h1><div id="v">Carregando…</div></main>
<script>
const $=s=>document.querySelector(s),v=$('#v');
const brl=n=>n==null?'—':n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const COR={amazon:'var(--amz)',terceiros:'var(--ter)',usado:'var(--usa)'},NOME={amazon:'Amazon',terceiros:'Terceiros',usado:'Usado'};
const ago=t=>{if(!t)return 'nunca';const m=Math.round((Date.now()-Date.parse(t))/60000);return m<1?'agora':m<60?m+' min atrás':m<1440?Math.round(m/60)+' h atrás':Math.round(m/1440)+' d atrás'};
const ST={ok:'Coletas em dia',atrasado:'Coletas atrasadas',sem_rodada:'Ainda sem rodada',falhando:'Coletas falhando'};
async function get(u){const r=await fetch(u);if(!r.ok)throw new Error(r.status);return r.json()}
let EDIT=false,ult='',tm;
async function api(m,u,b){const r=await fetch(u,{method:m,headers:{'content-type':'application/json','x-painel':'1'},body:b===undefined?undefined:JSON.stringify(b)});let j={};try{j=await r.json()}catch(e){}if(!r.ok)throw new Error(j.erro||('Erro '+r.status));return j}
function aviso(t,bad){let e=$('#aviso');if(!e){e=document.createElement('div');e.id='aviso';document.body.appendChild(e)}e.textContent=t;e.className=bad?'bad':'';e.style.display='block';clearTimeout(tm);tm=setTimeout(()=>e.style.display='none',bad?7000:3500)}
async function rodar(btn,fn){if(btn)btn.disabled=true;try{await fn()}catch(e){aviso(e.message,1)}finally{if(btn)btn.disabled=false}}
function spark(pts,w,h){if(pts.length<2)return '<svg width="'+w+'" height="'+h+'"></svg>';
 const xs=pts.map(p=>Date.parse(p.t)),ys=pts.map(p=>p.v),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
 const d=pts.map((p,i)=>(i?'L':'M')+((xs[i]-x0)/((x1-x0)||1)*w).toFixed(1)+' '+(h-2-(p.v-y0)/((y1-y0)||1)*(h-4)).toFixed(1)).join('');
 return '<svg width="'+w+'" height="'+h+'"><path d="'+d+'" fill="none" stroke="var(--amz)" stroke-width="1.5"/></svg>'}
async function lista(){const d=await get('/api/itens'),s=d.saude;
 let h='<div class="saude"><b class="'+s.status+'">'+ST[s.status]+'</b> · última rodada '+ago(s.ultimaRodada)+' (a cada '+s.intervaloMin+' min) · '+s.itens+' itens'+(s.pausados?', '+s.pausados+' pausados':'')+(s.comFalhas?', <span style="color:var(--bad)">'+s.comFalhas+' com falha</span>':'')+'</div>';
 EDIT=!!d.edicao;
 if(EDIT)h+='<div class="card"><h3>Rastrear produtos</h3><textarea id="txt" rows="3" maxlength="4000" placeholder="Cole um ou mais links da Amazon (um por linha, até 20)"></textarea><button class="btn pri" id="add">Rastrear</button><div id="res">'+ult+'</div></div><div class="card"><h3>Importar do Keepa</h3><div class="mut">Em keepa.com/manage use o botão de exportar (CSV) e escolha o arquivo aqui. Só ASINs; o alvo você define depois.</div><input type="file" id="arq" accept=".csv,.txt,text/csv,text/plain"><div id="imp"></div></div>';
 for(const i of d.itens){const l=i.linhas;
  h+='<div class="item" data-asin="'+esc(i.asin)+'"><div class="t"><div>'+i.num+'. '+esc(i.titulo||i.asin)+(i.pausado?' (pausado)':'')+(i.silenciadoAte?' (alertas silenciados)':'')+'</div><div class="mut">Amazon <span class="preco">'+(l.amazon.atual!=null?brl(l.amazon.atual):'não vende agora')+'</span>'+(l.terceiros.ligada?' · Terceiros <span class="preco">'+brl(l.terceiros.atual)+'</span>':'')+(l.usado.ligada?' · Usado <span class="preco">'+brl(l.usado.atual)+'</span>':'')+(l.amazon.alvo!=null?' · alvo '+brl(l.amazon.alvo):'')+'</div></div>'+spark(i.mini,110,32)+'</div>'}
 if(!d.itens.length)h+='<p class="mut">Nenhum item rastreado. Cole um link da Amazon acima ou no bot do Telegram.</p>';
 v.innerHTML=h;v.querySelectorAll('.item').forEach(e=>e.onclick=()=>detalhe(e.dataset.asin,14));
 if(EDIT){$('#add').onclick=e=>rodar(e.target,adicionar);$('#arq').onchange=e=>rodar(null,()=>importar(e.target));bindPickers(v)}}
async function importar(inp){const f=inp.files[0];if(!f)return;if(f.size>6000)throw new Error('Arquivo grande demais (máx. ~500 ASINs).');
 const r=await api('POST','/api/importar',{texto:await f.text()});inp.value='';
 let t=r.importados+' importados';if(r.duplicados)t+=', '+r.duplicados+' já rastreados/repetidos';if(r.invalidos)t+=', '+r.invalidos+' inválidos';if(r.outrosPaises)t+=', '+r.outrosPaises+' de outros países ignorados';if(r.acimaDoLimite)t+=', '+r.acimaDoLimite+' acima do limite de 200 (importe de novo depois)';
 ult='<div class="row">Importação: '+esc(t)+'. Os preços aparecem nas próximas rodadas.</div>';await lista()}
function tokens(t){const out=[];for(let x of t.split(/\\s+/)){if(!x)continue;if(/^(amzn\\.to|a\\.co)\\//i.test(x))x='https:'+'//'+x;if(/^https?:\\/\\//i.test(x)&&!out.includes(x))out.push(x)}return out}
async function adicionar(){const ls=tokens($('#txt').value);if(!ls.length)throw new Error('Cole pelo menos um link da Amazon.');
 const lim=ls.slice(0,20),res=[];let h='';
 for(let n=0;n<lim.length;n++){$('#res').textContent='Lendo '+(n+1)+' de '+lim.length+'…';
  try{res.push(...(await api('POST','/api/itens',{texto:lim[n]})).resultados)}catch(e){res.push({link:lim[n],status:'erro',erro:e.message})}}
 const novos=res.filter(r=>r.status==='novo');
 for(const r of res){h+='<div class="row">'+(r.status==='novo'?'✓ Novo: ':r.status==='existente'?'• Já rastreado: ':'✗ ')+(r.item?esc(r.item.titulo||r.item.asin):esc(r.link)+' — '+esc(r.erro))+'</div>'}
 if(ls.length>20)h+='<div class="mut">Só os primeiros 20 links foram usados.</div>';
 if(novos.length===1)h+=picker(novos[0].item.asin,novos[0].item.amazonAtual);
 else if(novos.length)h+='<div class="mut">Abra cada item para definir o preço-alvo.</div>';
 ult=h;$('#txt').value='';await lista()}
function picker(asin,atual){let h='<div class="card" data-picker="'+esc(asin)+'" style="margin-top:8px"><b>Qual o preço-alvo da linha Amazon?</b>'+(atual==null?'<div class="mut">A Amazon não vende este item agora; defina um alvo para quando ela voltar.</div>':'')+'<div class="row">';
 if(atual!=null)for(const p of [5,10,15]){const v=Math.round(atual*(1-p/100));h+='<button class="btn" data-v="'+v+'">−'+p+'% · '+brl(v)+'</button>'}
 return h+'<input type="text" class="val" inputmode="decimal" placeholder="ex.: 449"><button class="btn pri" data-custom="1">Definir</button><button class="btn" data-skip="1">Sem alvo por enquanto</button></div></div>'}
function bindPickers(root){root.querySelectorAll('[data-picker]').forEach(c=>{const asin=c.dataset.picker,set=(btn,val)=>rodar(btn,async()=>{await api('PUT','/api/itens/'+asin+'/alvo',{linha:'amazon',valor:val});ult='';aviso('Alvo definido: '+brl(typeof val==='number'?val:Number(String(val).replace(/[^0-9,.]/g,'').replace(',','.'))));await lista()});
 c.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>set(b,Number(b.dataset.v)));
 c.querySelector('[data-custom]').onclick=e=>{const t=c.querySelector('input').value.trim();if(!t)return aviso('Digite um valor.',1);set(e.target,t)};
 c.querySelector('[data-skip]').onclick=()=>{ult='';lista()}})}
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
 h+='<table><tr><th>Linha</th><th class="n">Atual</th><th class="n">Mínimo</th><th class="n">Máximo</th><th class="n">Variação</th><th class="n">Coletas</th></tr>'+['amazon','terceiros','usado'].filter(k=>d.linhas[k].ligada).map(k=>{const l=d.linhas[k];return '<tr><td>'+NOME[k]+'</td><td class="n">'+brl(l.atual)+'</td><td class="n">'+brl(l.min)+'</td><td class="n">'+brl(l.max)+'</td><td class="n">'+(l.variacao==null?'—':(l.variacao>0?'+':'')+l.variacao.toFixed(1)+'%')+'</td><td class="n">'+l.coletas+'</td></tr>'}).join('')+'</table><div class="mut">Últimos 30 dias.</div>';
 h+='<h3 style="font-size:15px;margin:16px 0 0">Ofertas na última coleta <span class="mut">'+(d.ofertasEm?ago(d.ofertasEm):'')+'</span></h3>';
 h+=d.ofertas.length?'<table><tr><th>Vendedor</th><th>Condição</th><th>Envio</th><th class="n">Preço</th><th class="n">Frete</th></tr>'+d.ofertas.map(o=>'<tr class="'+(o.descartada?'desc':'')+'"><td>'+esc(o.vendedor)+(o.descartada?' (suspeita)':'')+'</td><td>'+esc(o.condicao)+'</td><td>'+esc(o.envio)+'</td><td class="n">'+brl(o.preco)+'</td><td class="n">'+(o.frete==null?'—':brl(o.frete))+'</td></tr>').join('')+'</table>':'<p class="mut">Sem ofertas registradas.</p>';
 v.innerHTML=h;v.querySelector('.back').onclick=()=>{ult='';lista()};v.querySelectorAll('.dias button').forEach(b=>b.onclick=()=>detalhe(asin,+b.dataset.n));if(EDIT)acoes(d,dias)}
function acoes(d,dias){const L=d.linhas,box=document.createElement('div'),A='/api/itens/'+d.asin;
 let h='<div class="card" style="margin-top:16px"><h3>Preço-alvo</h3>';
 for(const k of ['amazon','terceiros','usado']){if(!L[k].ligada)continue;h+='<div class="row" data-k="'+k+'"><span class="l">'+NOME[k]+'</span><span class="mut">alvo: '+(L[k].alvo!=null?brl(L[k].alvo):'sem alvo')+'</span><input type="text" class="val" inputmode="decimal" placeholder="ex.: 449"><button class="btn pri" data-a="salvar">Salvar</button>'+(L[k].alvo!=null?'<button class="btn" data-a="limpar">Remover alvo</button>':'')+'</div>'}
 h+='<div class="mut">Você é avisado no Telegram quando o preço ficar igual ou abaixo do alvo.</div></div>';
 h+='<div class="card"><h3>Linhas de preço</h3>';
 for(const k of ['terceiros','usado'])h+='<div class="row"><span class="l">'+NOME[k]+'</span><span class="mut">'+(L[k].ligada?'ligada':'desligada')+'</span><button class="btn" data-l="'+k+'">'+(L[k].ligada?'Desligar':'Ligar')+'</button></div>';
 h+='<div class="mut">Ligar uma linha lê o produto agora e passa a usar 2 requisições por rodada.</div></div>';
 h+='<div class="card"><h3>Item</h3><div class="row"><button class="btn" data-p="1">'+(d.pausado?'Retomar coletas':'Pausar coletas')+'</button><button class="btn" data-s="1">'+(d.silenciadoAte?'Reativar alertas':'Silenciar alertas por 24 h')+'</button>'+(d.url&&d.url.startsWith('https:'+'//www.amazon.com.br/')?'<a class="btn" href="'+esc(d.url)+'" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Abrir na Amazon</a>':'')+'<button class="btn bad" data-r="1">Remover item</button></div>'+(d.silenciadoAte?'<div class="mut">Alertas silenciados até '+new Date(d.silenciadoAte).toLocaleString('pt-BR')+'</div>':'')+'</div>';
 box.innerHTML=h;v.appendChild(box);
 const re=()=>detalhe(d.asin,dias);
 box.querySelectorAll('.row[data-k]').forEach(r=>{const k=r.dataset.k,put=(b,val,msg)=>rodar(b,async()=>{await api('PUT',A+'/alvo',{linha:k,valor:val});aviso(msg);await re()});
  r.querySelector('[data-a=salvar]').onclick=e=>{const t=r.querySelector('input').value.trim();if(!t)return aviso('Digite um valor.',1);put(e.target,t,'Alvo salvo.')};
  const lp=r.querySelector('[data-a=limpar]');if(lp)lp.onclick=e=>put(e.target,null,'Alvo removido.')});
 box.querySelectorAll('[data-l]').forEach(b=>b.onclick=()=>rodar(b,async()=>{const k=b.dataset.l,on=!L[k].ligada;if(on)aviso('Lendo o produto…');const j=await api('PUT',A+'/linhas',{linha:k,ligada:on});aviso(on?(j.leitura==='ok'?'Linha ligada.':'Linha ligada, mas não consegui ler agora; entra na próxima rodada.'):'Linha desligada. O histórico fica guardado.',on&&j.leitura!=='ok');await re()}));
 box.querySelector('[data-p]').onclick=e=>rodar(e.target,async()=>{await api('PUT',A+'/pausa',{pausado:!d.pausado});aviso(d.pausado?'Coletas retomadas.':'Item pausado: sem coletas nem alertas.');await re()});
 box.querySelector('[data-s]').onclick=e=>rodar(e.target,async()=>{await api('PUT',A+'/silencio',{silenciado:!d.silenciadoAte});aviso(d.silenciadoAte?'Alertas reativados.':'Sem alertas por 24 h.');await re()});
 box.querySelector('[data-r]').onclick=e=>{if(!confirm('Remover este item e apagar o histórico?'))return;rodar(e.target,async()=>{await api('DELETE',A);aviso('Item removido. Os demais foram renumerados.');ult='';await lista()})}}
lista().catch(()=>{v.textContent='Não foi possível carregar os dados.'});
</script></body></html>`;
