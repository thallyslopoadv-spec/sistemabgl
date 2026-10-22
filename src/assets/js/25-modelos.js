// ═══════════════════════════════════════════════════════════
//  MODELOS — peças e documentos-padrão do escritório no Drive
// ═══════════════════════════════════════════════════════════
// O catálogo vem embutido (24-modelos-catalogo.js) ou, se um mais novo tiver
// sido importado em Configurações, de DB.driveCatalogo. Nenhum link fica no
// código: eles vêm do catálogo importado (campo url) ou do mapa do Drive
// (DB.driveMapa.modelos), ambos guardados no Gist. Modelo sem link aparece
// desabilitado: o mapa está velho ou o arquivo é novo.
const MODELOS_ICONES=['ti-building','ti-user','ti-file-plus','ti-file-text','ti-arrow-back-up','ti-coin',
  'ti-files','ti-heart-handshake','ti-shield','ti-mail','ti-clipboard-check','ti-briefcase'];
let modArea=-1, modSub='', modBusca='', modSubs=[];

// o catálogo importado só vale se não for mais velho que o embutido; um
// catálogo antigo no Gist esconderia os títulos e códigos novos
function modelosCatalogoImportadoValido(){
  const c=DB&&DB.driveCatalogo;
  return !!(c&&Array.isArray(c.modelos)&&c.modelos.length&&dataCatalogo(c.geradoEm)>=MODELOS_GERADO_EM);
}
function modelosCatalogo(){
  const lista=modelosCatalogoImportadoValido()?DB.driveCatalogo.modelos:MODELOS_EMBUTIDOS;
  return lista.map(([codigo,area,sub,titulo,formato,campos,areaNome])=>({codigo,area,sub,titulo,formato,campos:campos||[],areaNome:areaNome||MODELOS_AREAS[area]||'Outros'}))
    .sort((a,b)=>a.codigo.localeCompare(b.codigo));
}
function modeloCampoDesc(c){
  // o dicionário embutido vem antes: um dicionário antigo importado no Gist
  // não pode sobrepor descrições revistas; ele só cobre campos que faltem
  return MODELOS_CAMPOS[c]||((DB&&DB.driveCampos)||{})[c]||'';
}
// Código → link. Ordem: mapa do Drive, com os códigos renomeados traduzidos
// quando o mapa é anterior ao catálogo (o arquivo no Drive é o mesmo), e por
// cima os links do catálogo importado. Refeito só quando um dos dois muda.
let __modLinks=null,__modLinksChave='';
function modelosLinks(){
  const m=driveMapa(),c=DB&&DB.driveCatalogo;
  const chave=(m?m.importadoEm+'|'+m.geradoEm:'')+'#'+(c?c.importadoEm+'|'+c.geradoEm:'');
  if(__modLinks&&chave===__modLinksChave)return __modLinks;
  const catalogoData=modelosCatalogoImportadoValido()?dataCatalogo(c.geradoEm):MODELOS_GERADO_EM;
  const traduzir=(links,data)=>{
    if(!data||data>=catalogoData)return links;
    Object.entries(MODELOS_RENOMEADOS).forEach(([antes,depois])=>{
      if(links[antes]){links[depois]=links[antes];delete links[antes];}
    });
    return links;
  };
  const links=traduzir({...((m&&m.modelos)||{})},m&&dataCatalogo(m.geradoEm));
  if(c&&Array.isArray(c.modelos)){
    const doCatalogo={};
    c.modelos.forEach(x=>{if(linkModeloValido(x[7]))doCatalogo[x[0]]=x[7];});
    Object.assign(links,traduzir(doCatalogo,dataCatalogo(c.geradoEm)));
  }
  __modLinks=links;__modLinksChave=chave;
  return links;
}
function modeloUrl(codigo){return (DB&&modelosLinks()[codigo])||''}
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
  document.getElementById('mod-sub').textContent=todos.length+' modelos · '+(comLink?comLink+' com link no Drive':'links do Drive ainda não importados');
  const btnPasta=document.getElementById('mod-pasta');
  btnPasta.style.display=m&&m.pastaModelos?'':'none';
  document.getElementById('mod-aviso').innerHTML=!comLink
    ?`<div class="mod-alerta"><i class="ti ti-plug-connected-x"></i><span>Os modelos aparecem desabilitados porque os links do Drive ainda não foram importados (mapa_links_drive.json ou catalogo_modelos.json).</span><button class="det-add" onclick="abrirConfiguracoes()"><i class="ti ti-upload"></i> Importar</button></div>`
    :comLink<todos.length?`<div class="mod-alerta"><i class="ti ti-alert-triangle"></i><span>${todos.length-comLink} modelo${todos.length-comLink>1?'s':''} sem link: rode o gerador de links do Drive de novo e importe o catálogo ou o mapa atualizado.</span></div>`:'';

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
  if(!url){alert('Este modelo ainda não tem link.\n\nRode o gerador de links do Drive de novo e importe o catálogo ou o mapa atualizado em Configurações → Google Drive.');return;}
  abrirLinkExterno(url);
}
function abrirPastaModelos(){const m=driveMapa();if(m&&m.pastaModelos)abrirLinkExterno(m.pastaModelos);}

RENDERIZADORES.modelos=()=>renderModelos();
