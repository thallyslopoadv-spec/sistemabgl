// ═══════════════════════════════════════════════════════════
//  PALETA DE COMANDOS (Ctrl K / Cmd K)
// ═══════════════════════════════════════════════════════════
// Uma busca só para tudo: telas, ações frequentes, clientes, processos e
// leads. Digitar filtra; setas navegam; Enter abre. Busca sem acento e sem
// diferença de maiúsculas, por qualquer pedaço do nome, do número do
// processo, das partes, do telefone ou das demandas.
const PALETA_TELAS=[
  {id:'dash',t:'Visão geral',i:'ti-layout-dashboard'},{id:'rotina',t:'Rotina',i:'ti-checklist'},
  {id:'processos',t:'Processos',i:'ti-gavel'},{id:'arquivados',t:'Arquivados',i:'ti-archive'},
  {id:'modelos',t:'Modelos',i:'ti-file-text'},
  {id:'crm',t:'Clientes',i:'ti-users'},{id:'fin',t:'Financeiro',i:'ti-wallet'},
  {id:'trab',t:'Atendimento',i:'ti-headset'},{id:'comercial',t:'Comercial',i:'ti-speakerphone'},
];
const PALETA_ACOES=[
  {t:'Nova tarefa',d:'Rotina',i:'ti-square-plus',fn:()=>abrirModalTarefa(null,null)},
  {t:'Marcar audiência',d:'Agenda',i:'ti-calendar-plus',fn:()=>abrirNovaAudiencia()},
  {t:'Novo lançamento financeiro',d:'Recebido, previsto ou saída',i:'ti-cash',fn:()=>abrirModalFin(null,null)},
  {t:'Novo cliente',d:'Carteira',i:'ti-user-plus',fn:()=>{navegarPara('crm');abrirModalCliente(null);}},
  {t:'Novo processo',d:'Processos',i:'ti-file-plus',fn:()=>abrirModalProc(null,null)},
  {t:'Novo lead trabalhista',d:'Atendimento',i:'ti-headset',fn:()=>{navegarPara('trab');abrirModalNovo('trab');}},
  {t:'Novo lead cível',d:'Atendimento',i:'ti-headset',fn:()=>{navegarPara('trab');abrirModalNovo('civel');}},
  {t:'Metas do mês',d:'Faturamento, honorários e contratos',i:'ti-target-arrow',fn:()=>abrirDetalheMetaContratos()},
  {t:'Sugerir links do Drive',d:'Preencher as pastas dos clientes',i:'ti-brand-google-drive',fn:()=>abrirSugestaoDrive(null)},
  {t:'Fazer backup dos dados',d:'Baixar cópia completa',i:'ti-cloud-download',fn:()=>abrirBackup()},
  {t:'Ocultar ou mostrar valores',d:'Máscara de valores na tela',i:'ti-eye',fn:()=>toggleMoney()},
];
let paletaItens=[], paletaSel=0, paletaModo='';

function abrirPaleta(modo){
  paletaModo=modo||'';
  const inp=document.getElementById('paleta-inp');
  inp.value='';
  inp.placeholder=paletaModo==='acoes'?'O que você quer criar?':'Buscar cliente, processo, lead, tela ou ação…';
  document.getElementById('paleta').classList.add('open');
  renderPaleta();
  inp.focus();   // na hora: com atraso, quem digita logo após o Ctrl K perde as primeiras letras
}
function fecharPaleta(){
  document.getElementById('paleta').classList.remove('open');
  document.getElementById('paleta-inp').blur();
}
function paletaAberta(){return document.getElementById('paleta').classList.contains('open')}

function paletaCasa(q,...campos){
  if(!q)return true;
  const alvo=semAcento(campos.filter(Boolean).join(' '));
  return q.split(/\s+/).every(p=>alvo.includes(p));
}
function paletaResultados(q){
  const grupos=[];
  const telas=PALETA_TELAS.filter(x=>paletaCasa(q,x.t)).map(x=>({t:x.t,d:'Ir para a tela',i:x.i,fn:()=>navegarPara(x.id)}));
  const acoes=PALETA_ACOES.filter(x=>paletaCasa(q,x.t,x.d));
  if(paletaModo==='acoes'){grupos.push(['Criar',acoes]);return grupos;}
  if(!q){grupos.push(['Ações rápidas',acoes.slice(0,5)],['Telas',telas]);return grupos;}
  const cli=ordenarPorNome(DB.clientes.filter(c=>paletaCasa(q,c.nome,c.curto,c.demandas))).slice(0,6)
    .map(c=>({t:c.nome,d:(c.status==='Arquivado'?'Arquivado · ':'')+(c.demandas||'Cliente'),av:c,fn:()=>irParaCliente(c.id)}));
  const procs=DB.processos.filter(p=>paletaCasa(q,p.num,p.numCNJ,p.ativo,p.passivo,nomeCliente(p.cid))).slice(0,6)
    .map(p=>({t:p.numCNJ||p.num||'Processo sem número',d:[p.ativo,p.passivo].filter(Boolean).join(' × '),i:'ti-gavel',mono:true,fn:()=>irParaProcesso(p.id)}));
  const lds=[...leads.map(l=>[l,'trab']),...leadsCivel.map(l=>[l,'civel'])]
    .filter(([l])=>paletaCasa(q,l.nome,l.tel)).slice(0,6)
    .map(([l,mod])=>({t:l.nome,d:'Lead '+(mod==='civel'?'cível':'trabalhista')+(l.statusCRM?' · '+l.statusCRM:''),i:'ti-headset',fn:()=>abrirLeadDeTarefa(l.id,mod)}));
  const mods=modelosCatalogo().filter(m=>paletaCasa(q,m.codigo,m.titulo,m.areaNome)).slice(0,6)
    .map(m=>({t:m.codigo+' · '+m.titulo,d:m.areaNome+(modeloUrl(m.codigo)?'':' · sem link'),i:'ti-file-text',fn:()=>abrirModelo(m.codigo)}));
  if(cli.length)grupos.push(['Clientes',cli]);
  if(procs.length)grupos.push(['Processos',procs]);
  if(lds.length)grupos.push(['Leads',lds]);
  if(mods.length)grupos.push(['Modelos',mods]);
  if(telas.length)grupos.push(['Telas',telas]);
  if(acoes.length)grupos.push(['Ações',acoes]);
  return grupos;
}
function renderPaleta(){
  const q=semAcento(document.getElementById('paleta-inp').value.trim());
  const grupos=paletaResultados(q);
  paletaItens=grupos.flatMap(g=>g[1]);
  paletaSel=0;
  const el=document.getElementById('paleta-lista');
  if(!paletaItens.length){
    el.innerHTML=`<div class="paleta-vazio"><i class="ti ti-search-off"></i>Nada encontrado para “${esc(document.getElementById('paleta-inp').value)}”.</div>`;
    return;
  }
  let n=0;
  el.innerHTML=grupos.map(([nome,itens])=>`<div class="paleta-grupo">${nome}</div>`+itens.map(x=>{
    const k=n++;
    const ico=x.av
      ?`<span class="paleta-av" style="background:${corDe(x.av.id)[0]};color:${corDe(x.av.id)[1]}">${iniciais(x.av.nome)}</span>`
      :`<span class="paleta-ico"><i class="ti ${x.i}"></i></span>`;
    return `<div class="paleta-item${k===0?' sel':''}" data-k="${k}" onmousemove="paletaMarcar(${k})" onclick="paletaExecutar(${k})">
      ${ico}<span class="paleta-txt"><b class="${x.mono?'mono':''}">${esc(x.t)}</b>${x.d?`<span>${esc(x.d)}</span>`:''}</span><i class="ti ti-corner-down-left paleta-enter"></i></div>`;
  }).join('')).join('');
}
function paletaMarcar(k){
  if(k===paletaSel)return;
  paletaSel=k;
  document.querySelectorAll('#paleta-lista .paleta-item').forEach(e=>e.classList.toggle('sel',Number(e.dataset.k)===k));
}
function paletaExecutar(k){
  const x=paletaItens[k];
  if(!x||!paletaAberta())return;
  fecharPaleta();
  x.fn();
}
function teclaPaleta(e){
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    if(!paletaItens.length)return;
    paletaMarcar((paletaSel+(e.key==='ArrowDown'?1:-1)+paletaItens.length)%paletaItens.length);
    const el=document.querySelector('#paleta-lista .paleta-item.sel');
    if(el)el.scrollIntoView({block:'nearest'});
  }else if(e.key==='Enter'){e.preventDefault();paletaExecutar(paletaSel);}
  else if(e.key==='Escape'){e.preventDefault();fecharPaleta();}
}
// atalho global: só com o sistema aberto (depois do login)
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){
    if(!EU||document.getElementById('screen-dashboard').style.display==='none')return;
    e.preventDefault();
    if(paletaAberta())fecharPaleta();else abrirPaleta();
  }else if(e.key==='Escape'&&paletaAberta()){
    fecharPaleta();
  }
});
