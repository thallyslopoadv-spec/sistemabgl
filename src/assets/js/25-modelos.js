// ═══════════════════════════════════════════════════════════
//  MODELOS — peças e documentos-padrão do escritório no Drive
// ═══════════════════════════════════════════════════════════
// O catálogo vem embutido (24-modelos-catalogo.js) ou, se tiver sido
// importado depois, de DB.driveCatalogo. Os links saem do mapa do Drive
// importado em Configurações (DB.driveMapa.modelos, por código). Modelo
// sem link aparece desabilitado: o mapa está velho ou o arquivo é novo.
const MODELOS_ICONES=['ti-building','ti-user','ti-file-plus','ti-file-text','ti-arrow-back-up','ti-coin',
  'ti-files','ti-heart-handshake','ti-shield','ti-mail','ti-clipboard-check','ti-briefcase'];
let modArea=-1, modSub='', modBusca='', modSubs=[];

function modelosCatalogo(){
  const lista=DB&&DB.driveCatalogo&&Array.isArray(DB.driveCatalogo.modelos)?DB.driveCatalogo.modelos:MODELOS_EMBUTIDOS;
  return lista.map(([codigo,area,sub,titulo,formato,campos,areaNome])=>({codigo,area,sub,titulo,formato,campos:campos||[],areaNome:areaNome||MODELOS_AREAS[area]||'Outros'}));
}
function modeloCampoDesc(c){
  const d=(DB&&DB.driveCampos)||MODELOS_CAMPOS;
  return d[c]||MODELOS_CAMPOS[c]||'';
}
function modeloUrl(codigo){const m=driveMapa();return (m&&m.modelos&&m.modelos[codigo])||''}
// "03 Contratos de Trabalho/Produção" → "Contratos de Trabalho › Produção"
function modeloSubRotulo(s){return s.split('/').map(x=>x.replace(/^\d+\s+/,'')).join(' › ')}
function modeloCasaBusca(m,q){
  if(!q)return true;
  const alvo=semAcento([m.codigo,m.titulo,m.areaNome,m.sub,...m.campos,...m.campos.map(modeloCampoDesc)].join(' '));
  return q.split(/\s+/).every(p=>alvo.includes(p));
}

function filtroModelosArea(a){modArea=a;modSub='';renderModelos();}
function filtroModelosSub(i){const s=modSubs[i]||'';modSub=modSub===s?'':s;renderModelos();}
function buscaModelos(v){modBusca=v;renderModelos();}

function renderModelos(){
  const el=document.getElementById('mod-lista');
  if(!el||!DB)return;
  const todos=modelosCatalogo();
  const m=driveMapa();
  const comLink=todos.filter(x=>modeloUrl(x.codigo)).length;
  document.getElementById('mod-sub').textContent=todos.length+' modelos · '+(m?comLink+' com link no Drive':'links do Drive ainda não importados');
  const btnPasta=document.getElementById('mod-pasta');
  btnPasta.style.display=m&&m.pastaModelos?'':'none';
  document.getElementById('mod-aviso').innerHTML=!m
    ?`<div class="mod-alerta"><i class="ti ti-plug-connected-x"></i><span>Os modelos aparecem desabilitados porque o mapa de links do Drive ainda não foi importado.</span><button class="det-add" onclick="abrirConfiguracoes()"><i class="ti ti-upload"></i> Importar mapa</button></div>`
    :comLink<todos.length?`<div class="mod-alerta"><i class="ti ti-alert-triangle"></i><span>${todos.length-comLink} modelo${todos.length-comLink>1?'s':''} sem link: rode o gerador de links do Drive de novo e importe o mapa atualizado.</span></div>`:'';

  // filtros por área, com a contagem do que casa com a busca
  const q=semAcento(modBusca.trim());
  const achados=todos.filter(x=>modeloCasaBusca(x,q));
  const areas=[...new Set(todos.map(x=>x.areaNome))];
  const ordem=n=>{const i=MODELOS_AREAS.indexOf(n);return i<0?99:i};
  areas.sort((a,b)=>ordem(a)-ordem(b));
  if(modArea!==-1&&!areas[modArea])modArea=-1;
  const n=a=>achados.filter(x=>x.areaNome===a).length;
  document.getElementById('mod-areas').innerHTML=
    `<button class="chip${modArea===-1?' active':''}" onclick="filtroModelosArea(-1)">Todas <span class="mod-n">${achados.length}</span></button>`+
    areas.map((a,i)=>`<button class="chip${modArea===i?' active':''}" onclick="filtroModelosArea(${i})"${n(a)?'':' disabled'}>${esc(a)} <span class="mod-n">${n(a)}</span></button>`).join('');
  const areaSel=modArea===-1?null:areas[modArea];
  const subs=modSubs=areaSel?[...new Set(todos.filter(x=>x.areaNome===areaSel&&x.sub).map(x=>x.sub))].sort():[];
  const subsEl=document.getElementById('mod-subs');
  subsEl.style.display=subs.length?'':'none';
  subsEl.innerHTML=subs.map((s,i)=>`<button class="chip${modSub===s?' active':''}" onclick="filtroModelosSub(${i})">${esc(modeloSubRotulo(s))}</button>`).join('');

  let lista=achados;
  if(areaSel)lista=lista.filter(x=>x.areaNome===areaSel);
  if(modSub)lista=lista.filter(x=>x.sub===modSub||x.sub.startsWith(modSub+'/'));
  if(!lista.length){
    el.innerHTML=`<div class="mod-vazio"><i class="ti ti-search-off"></i>Nenhum modelo encontrado${modBusca?' para “'+esc(modBusca)+'”':''}.</div>`;
    return;
  }
  // seções por área e, dentro delas, por subpasta
  const grupos=[];
  lista.forEach(x=>{
    const chave=x.areaNome+'|'+x.sub;
    let g=grupos.find(y=>y.chave===chave);
    if(!g){g={chave,area:x.areaNome,sub:x.sub,itens:[]};grupos.push(g);}
    g.itens.push(x);
  });
  grupos.sort((a,b)=>ordem(a.area)-ordem(b.area)||a.sub.localeCompare(b.sub));
  let areaAtual='';
  el.innerHTML=grupos.map(g=>{
    let cab='';
    if(g.area!==areaAtual){
      areaAtual=g.area;
      const i=MODELOS_AREAS.indexOf(g.area);
      cab=`<h2 class="mod-area"><i class="ti ${MODELOS_ICONES[i]||'ti-folder'}"></i>${esc(g.area)}<span>${lista.filter(x=>x.areaNome===g.area).length}</span></h2>`;
    }
    return cab+(g.sub?`<div class="mod-subtit">${esc(modeloSubRotulo(g.sub))}</div>`:'')
      +`<div class="mod-grid">${g.itens.map(cardModelo).join('')}</div>`;
  }).join('');
}
function cardModelo(x){
  const url=modeloUrl(x.codigo);
  const fmt=(x.formato||'').toUpperCase();
  const campos=x.campos.map(c=>{
    const d=modeloCampoDesc(c);
    return `<li><code title="${esc(d)}">{{${esc(c)}}}</code><span>${esc(d||'sem descrição no dicionário')}</span></li>`;
  }).join('');
  const titulo=url?'Abrir no Google Drive':'Sem link: rode o gerador de links de novo';
  return `<div class="mod-card${url?'':' mod-off'}"${url?` role="link" tabindex="0" onclick="abrirModelo('${x.codigo}')" onkeydown="if(event.key==='Enter'&&event.target===this)abrirModelo('${x.codigo}')"`:' aria-disabled="true"'} title="${titulo}">
    <div class="mod-topo">
      <span class="mod-cod">${esc(x.codigo)}</span>
      <span class="mod-fmt mod-fmt-${esc(x.formato)}">${esc(fmt)}</span>
    </div>
    <div class="mod-tit">${esc(x.titulo)}</div>
    <div class="mod-pe">
      ${x.campos.length?`<button class="mod-campos-btn" onclick="event.stopPropagation();this.closest('.mod-card').classList.toggle('aberto')" aria-label="Ver campos"><i class="ti ti-braces"></i>${x.campos.length} campo${x.campos.length>1?'s':''}<i class="ti ti-chevron-down mod-chev"></i></button>`:'<span class="mod-semcampo">sem campos</span>'}
      <span class="mod-abrir">${url?'Abrir ↗':'<i class="ti ti-link-off"></i> rodar o gerador de links de novo'}</span>
    </div>
    ${campos?`<ul class="mod-campos" onclick="event.stopPropagation()">${campos}</ul>`:''}
  </div>`;
}
function abrirModelo(codigo){
  const url=modeloUrl(codigo);
  if(!url){alert('Este modelo ainda não tem link.\n\nRode o gerador de links do Drive de novo e importe o mapa atualizado em Configurações → Google Drive.');return;}
  abrirLinkExterno(url);
}
function abrirPastaModelos(){const m=driveMapa();if(m&&m.pastaModelos)abrirLinkExterno(m.pastaModelos);}

RENDERIZADORES.modelos=()=>renderModelos();
