// ═══════════════════════════════════════════════════════════
//  ROTINA — PAINEL DE COMANDO
// ═══════════════════════════════════════════════════════════
//  A tela deixou de ser uma pilha de blocos rolável. Agora são três
//  colunas fixas:
//
//    · à esquerda, as VISÕES: cada recorte que antes era um filtro solto
//      (hoje, atrasadas, a conferir, sem prazo, por tipo) virou um item
//      nomeado com contador. Só um fica ativo por vez, então sempre dá
//      para saber que recorte está na tela.
//    · no centro, a TABELA densa, agrupada pelo que vence primeiro
//      (ou por tipo, sócio e etapa, à escolha).
//    · à direita, o DETALHE da tarefa selecionada, com cliente, processo,
//      prazo fatal, histórico e as ações. Sem nada selecionado, mostra o
//      prazo fatal mais próximo e o que está esperando triagem.
//
//  Cumprimento de prazos, projetos e recados saíram do rodapé e viraram
//  painéis que ocupam o centro quando escolhidos no menu.
//
//  O que não mudou: o agrupamento por prazo, o registro de adiamento
//  (t.adiamentos / t.prazoOriginal), o fluxo de revisão e aprovação entre
//  os sócios e a leitura automática do DJEN.
// ═══════════════════════════════════════════════════════════

const LS_ROTINA_PREF='bgl_rotina_pref';
let rotinaPref=(()=>{try{const v=JSON.parse(localStorage.getItem(LS_ROTINA_PREF)||'{}');return v&&typeof v==='object'?v:{}}catch(e){return {}}})();
let rotinaBusca='', rotSel=null, rrAtalho='hoje', __rrIniciado=false;
const ROT_LIMITE=150;   // teto de linhas desenhadas de uma vez

function salvarPrefRotina(){try{localStorage.setItem(LS_ROTINA_PREF,JSON.stringify(rotinaPref))}catch(e){}}
function rotinaPessoa(){const p=rotinaPref.pessoa;return p&&RESP.includes(p)?p:'todos'}
function rotinaAgrupar(){return ['prazo','tipo','resp','etapa'].includes(rotinaPref.agrupar)?rotinaPref.agrupar:'prazo'}

// ─── VISÕES ───────────────────────────────────────────────
// Cada visão é um recorte nomeado da lista. `fn` diz quais tarefas entram;
// `painel` troca o centro da tela por um dos painéis (desempenho, projetos,
// recados); `acao` é um item que só dispara alguma coisa (abrir o DJEN).
function visoesRotina(){
  const h=hojeISO(), eu=EU&&EU.nome;
  const base=[
    {g:'Rotina'},
    {k:'mesa',lbl:'Minha mesa',ico:'inbox',fn:t=>t.status!=='concluido'},
    {k:'hoje',lbl:'Hoje',ico:'bolt',fn:t=>t.status!=='concluido'&&t.prazo===h},
    {k:'atrasadas',lbl:'Atrasadas',ico:'alert-triangle',alerta:true,fn:t=>t.status!=='concluido'&&t.prazo&&t.prazo<h},
    {k:'fatais',lbl:'Prazos fatais',ico:'flag',fn:t=>t.status!=='concluido'&&!!t.prazoFatal},
    {k:'semprazo',lbl:'Sem prazo',ico:'hourglass-low',fn:t=>t.status!=='concluido'&&!t.prazo},
    {k:'concluidas',lbl:'Concluídas',ico:'circle-check',fn:t=>t.status==='concluido'},
    {g:'Triagem'},
    {k:'djen',lbl:'DJEN a revisar',ico:'news',ambar:true,acao:()=>abrirPainelPublicacoes('revisar'),
      contar:()=>(typeof pubsAnalisar==='function'?pubsAnalisar().length:0)},
    {k:'conferir',lbl:'A conferir',ico:'alert-triangle',ambar:true,fn:t=>t.status!=='concluido'&&!!t.conferir},
    {k:'revmim',lbl:'Na minha revisão',ico:'eye',fn:t=>revPendenteRevisor(t)&&revisorDa(t)===eu},
    {k:'revenviar',lbl:'Para eu enviar',ico:'send',fn:t=>revAguardaEnvio(t)&&(!eu||t.resp===eu)},
    {g:'Por tipo'},
  ];
  tiposTarefa().filter(x=>x.key!=='followup').forEach(x=>{
    base.push({k:'tipo:'+x.key,lbl:x.lbl,cor:x.cor,fn:t=>t.status!=='concluido'&&t.tipo===x.key});
  });
  base.push({g:'Painéis'},
    {k:'desempenho',lbl:'Cumprimento de prazos',ico:'trending-up',painel:'desempenho'},
    {k:'projetos',lbl:'Projetos em andamento',ico:'rocket',painel:'projetos'},
    {k:'recados',lbl:'Recados do escritório',ico:'message',painel:'recados'});
  return base;
}
function visaoRotina(){
  const vs=visoesRotina().filter(v=>v.k);
  return vs.find(v=>v.k===rotinaPref.visao)||vs[0];
}
function mudarVisaoRotina(k){
  const v=visoesRotina().find(x=>x.k===k);
  if(!v)return;
  if(v.acao){v.acao();return;}
  rotinaPref.visao=k;
  if(v.painel==='projetos'){
    blocosRecolhidos['projetos:painel']=false;
    try{localStorage.setItem(LS_RECOLHIDAS,JSON.stringify(blocosRecolhidos))}catch(e){}
  }
  salvarPrefRotina();
  rotSel=null;
  renderRotina();
}
function mudarPessoaRotina(p){
  rotinaPref.pessoa=(rotinaPessoa()===p?'todos':p);
  salvarPrefRotina();__rrIniciado=false;rotSel=null;renderRotina();
}
function mudarAgruparRotina(a){rotinaPref.agrupar=a;salvarPrefRotina();renderRotina();}
function buscaRotina(v){rotinaBusca=v;renderRotina();}
function irParaDesempenho(){mudarVisaoRotina('desempenho')}
// mantida para quem chama de fora (avisos, atalhos antigos)
function filtroHorizonte(h){mudarVisaoRotina(h==='semana'?'mesa':h)}

// abre um lead diretamente a partir de uma tarefa
function abrirLeadDeTarefa(leadId,leadMod){
  navegarPara('trab');
  mudarTipoTriagem(leadMod);
  if(leadMod==='civel')abrirLeadCivel(leadId);else abrirLead(leadId);
}

// ─── FILTROS DE BASE ──────────────────────────────────────
// a tarefa aparece para o responsável; também para o outro sócio quando está
// aguardando a revisão/aprovação dele (fica "na mesa" dos dois)
function tarefaDaPessoa(t,p){
  if(p==='todos'||t.resp===p)return true;
  if(t.resp===RESP_DUPLA&&(p==='Cecília'||p==='Thallys'))return true;  // dados legados
  if(revPendenteRevisor(t)&&revisorDa(t)===p)return true;              // enviada para a revisão dele
  return false;
}
function tarefaCasaBusca(t,q){
  if(!q)return true;
  const p=processoPorId(t.pid);
  return [t.titulo,nomeCliente(t.cid),t.resp,tipoInfo(t.tipo).lbl,p&&p.num,p&&p.numCNJ,p&&p.ativo,p&&p.passivo].some(x=>semAcento(x).includes(q));
}
function tarefasDaRotina(){
  const pessoa=rotinaPessoa();
  return DB.tarefas.filter(t=>t.tipo!=='followup'&&tarefaDaPessoa(t,pessoa));
}

// ─── AGRUPAMENTO ──────────────────────────────────────────
function grupoDaTarefa(t,hoje,amanha,fim7){
  if(t.status==='concluido')return 'concluidas';
  if(!t.prazo)return 'semprazo';
  if(t.prazo<hoje)return 'atrasadas';
  if(t.prazo===hoje)return 'hoje';
  if(t.prazo===amanha)return 'amanha';
  if(t.prazo<=fim7)return 'semana';
  return 'proximas';
}
const GRUPOS_AGENDA=[
  {k:'atrasadas',lbl:'Atrasadas',cor:'var(--red)',dica:'conclua ou renegocie a data ainda hoje'},
  {k:'hoje',lbl:'Hoje',cor:'var(--amber)'},
  {k:'amanha',lbl:'Amanhã',cor:'var(--blue)'},
  {k:'semana',lbl:'Próximos 7 dias',cor:'var(--navy-soft)'},
  {k:'semprazo',lbl:'Sem prazo',cor:'var(--silver)',dica:'tarefa sem data tende a ficar para depois — defina uma'},
  {k:'proximas',lbl:'Mais adiante',cor:'var(--silver-dark)',fechado:true},
  {k:'concluidas',lbl:'Concluídas',cor:'var(--green)',fechado:true},
];
function ordenarAgenda(a,b){
  const pa=a.prazo||'9999',pb=b.prazo||'9999';
  if(pa!==pb)return pa<pb?-1:1;
  const fa=a.prazoFatal||'9999',fb=b.prazoFatal||'9999';
  if(fa!==fb)return fa<fb?-1:1;
  return (a.hora||'99')<(b.hora||'99')?-1:1;
}
// etapa do fluxo, usada como rótulo na linha e como critério de agrupamento
function etapaDaTarefa(t){
  if(t.status==='concluido')return {k:'concluida',lbl:'concluída',cls:'ok',ico:'circle-check'};
  if(t.conferir)return {k:'conferir',lbl:'conferir',cls:'conferir',ico:'alert-triangle'};
  if(t.revPede){
    const prox=revProximaAcao(t), quem=revisorDa(t);
    if(!prox)return {k:'revok',lbl:t.revEstado==='aprovado'?'aprovada':'revisada',cls:'ok',ico:'circle-check'};
    if(!t.revEnviado){
      if(EU&&EU.nome===t.resp)return {k:'enviar',lbl:'enviar p/ '+(prox==='aprovar'?'aprovação':'revisão'),cls:'enviar',ico:'send',
        acao:`enviarParaRevisao('${t.id}')`};
      return {k:'elaboracao',lbl:'em elaboração',cls:'',ico:'pencil'};
    }
    const souEu=EU&&EU.nome===quem;
    return {k:'revisar',lbl:souEu?(prox==='aprovar'?'aprovar':'revisar'):'aguarda '+quem,cls:'revisar',ico:'eye',
      acao:souEu?`marcarRevisao('${t.id}','${prox}')`:''};
  }
  if(t.status==='andamento')return {k:'andamento',lbl:'em andamento',cls:'andamento',ico:'player-play'};
  return {k:'pendente',lbl:'pendente',cls:'',ico:''};
}
const ORDEM_ETAPA=['conferir','revisar','enviar','andamento','elaboracao','pendente','revok','concluida'];
function agruparTarefas(ts){
  const modo=rotinaAgrupar();
  const hoje=hojeISO(), amanha=isoAdd(hoje,1), fim7=isoAdd(hoje,7);
  const mapa={};
  const push=(k,lbl,cor,dica,fechado,ordem)=>{
    if(!mapa[k])mapa[k]={k,lbl,cor,dica,fechado,ordem,itens:[]};
    return mapa[k];
  };
  if(modo==='prazo'){
    GRUPOS_AGENDA.forEach((g,i)=>push(g.k,g.lbl,g.cor,g.dica,!!g.fechado,i));
    ts.forEach(t=>mapa[grupoDaTarefa(t,hoje,amanha,fim7)].itens.push(t));
  }else if(modo==='tipo'){
    tiposTarefa().forEach((x,i)=>push('t:'+x.key,x.lbl,x.cor,'',false,i));
    ts.forEach(t=>{const i=tipoInfo(t.tipo);push('t:'+i.key,i.lbl,i.cor,'',false,99).itens.push(t)});
  }else if(modo==='resp'){
    RESP.forEach((r,i)=>push('r:'+r,r,'var(--navy-soft)','',false,i));
    ts.forEach(t=>push('r:'+(t.resp||'—'),t.resp||'Sem responsável','var(--silver)','',false,99).itens.push(t));
  }else{
    ts.forEach(t=>{
      const e=etapaDaTarefa(t);
      push('e:'+e.k,e.lbl,'var(--navy-soft)','',e.k==='concluida',ORDEM_ETAPA.indexOf(e.k)).itens.push(t);
    });
  }
  return Object.values(mapa).filter(g=>g.itens.length)
    .sort((a,b)=>a.ordem-b.ordem)
    .map(g=>{g.itens.sort(ordenarAgenda);return g});
}

// ─── RENDER PRINCIPAL ─────────────────────────────────────
function renderRotina(){
  const v=visaoRotina(), pessoa=rotinaPessoa();
  const base=tarefasDaRotina();
  const q=semAcento(rotinaBusca.trim());

  renderViewsRotina(base,v,pessoa);
  renderPlacarRotina(base);
  renderAvisosRotina();
  renderRapidaRotina(pessoa);

  const tab=document.getElementById('rotina-tabela');
  const pan=document.getElementById('rotina-painel');
  const det=document.getElementById('rot-detalhe');
  const sel=document.getElementById('rot-agrupar-wrap');
  const selIn=document.getElementById('rot-agrupar');
  if(selIn&&selIn.value!==rotinaAgrupar())selIn.value=rotinaAgrupar();

  if(v.painel){
    if(tab)tab.style.display='none';
    if(det)det.style.display='none';
    if(sel)sel.style.display='none';
    if(pan){
      pan.classList.add('on');
      ['desempenho','projetos','recados'].forEach(k=>{
        const el=document.getElementById('painel-'+k);
        if(el)el.classList.toggle('on',k===v.painel);
      });
    }
  }else{
    if(pan)pan.classList.remove('on');
    if(tab)tab.style.display='';
    if(det)det.style.display='';
    if(sel)sel.style.display='';
    renderTabelaRotina(base.filter(t=>v.fn(t)&&tarefaCasaBusca(t,q)));
    renderDetalheRotina();
  }
  renderCrumbRotina(v,base,q);

  renderChatGeral();
  renderProjetos();
  renderDesempenhoRotina();
}

function renderCrumbRotina(v,base,q){
  const el=document.getElementById('rot-crumb');
  if(!el)return;
  const pessoa=rotinaPessoa();
  let n='';
  if(!v.painel){
    const total=base.filter(t=>v.fn(t)&&tarefaCasaBusca(t,q)).length;
    n=' · '+total+' tarefa'+(total===1?'':'s');
  }
  el.innerHTML=`<i class="ti ti-chevron-right"></i><b>${esc(v.lbl)}</b>${n}`
    +(pessoa!=='todos'?` <span class="et" style="margin-left:4px">só ${esc(pessoa)}</span>`:'')
    +(q?` <span class="et" style="margin-left:4px">busca “${esc(rotinaBusca.trim())}”</span>`:'');
}

function renderViewsRotina(base,atual,pessoa){
  const el=document.getElementById('rot-views');
  if(!el)return;
  const contar=v=>v.contar?v.contar():(v.fn?base.filter(v.fn).length:null);
  let h='';
  visoesRotina().forEach(v=>{
    if(v.g){h+=`<div class="rv-grupo">${esc(v.g)}</div>`;return;}
    const n=contar(v);
    const cls=[v.k===atual.k?'on':'',v.alerta&&n?'alerta':'',v.ambar&&n?'ambar':'',(n===0&&v.fn&&v.k.startsWith('tipo:'))?'sumida':''].filter(Boolean).join(' ');
    const ico=v.cor?`<span class="rv-dot" style="background:${v.cor}"></span>`:`<i class="ti ti-${v.ico}"></i>`;
    h+=`<button type="button" class="rv ${cls}" onclick="mudarVisaoRotina('${v.k}')" title="${esc(v.lbl)}">
      ${ico}<span class="rv-tx">${esc(v.lbl)}</span>${n===null?'':`<span class="rv-n">${n}</span>`}</button>`;
  });
  h+=`<div class="rv-grupo">Filtrar por sócio</div>`;
  const abertas=DB.tarefas.filter(t=>t.tipo!=='followup'&&t.status!=='concluido');
  RESP.forEach(r=>{
    const av=corResp(r);
    h+=`<button type="button" class="rv ${pessoa===r?'on':''}" onclick="mudarPessoaRotina('${esc(r)}')" title="Ver só as tarefas de ${esc(r)}">
      <span class="rv-av" style="background:${av[0]};color:${av[1]}">${avatarResp(r)}</span>
      <span class="rv-tx">${esc(r)}</span>
      <span class="rv-n">${abertas.filter(t=>tarefaDaPessoa(t,r)).length}</span></button>`;
  });
  el.innerHTML=h;
}

function renderPlacarRotina(base){
  const el=document.getElementById('rotina-stats');
  if(!el)return;
  const hoje=hojeISO(), amanha=isoAdd(hoje,1), fim7=isoAdd(hoje,7);
  const abertas=base.filter(t=>t.status!=='concluido');
  const cont={atrasadas:0,hoje:0,amanha:0,semana:0,proximas:0,semprazo:0,concluidas:0};
  abertas.forEach(t=>cont[grupoDaTarefa(t,hoje,amanha,fim7)]++);
  const maisAntiga=abertas.reduce((m,t)=>t.prazo&&t.prazo<hoje&&(!m||t.prazo<m)?t.prazo:m,'');
  const fataisHoje=abertas.filter(t=>t.prazoFatal===hoje).length;
  const r30=resumoConclusao(base.filter(t=>t.status==='concluido'&&t.concluidoEm&&t.concluidoEm>=isoAdd(hoje,-30)));
  const pct=r30.pctNoPrazo;
  const corPct=pct===null?'var(--silver)':pct>=85?'var(--green)':pct>=65?'var(--amber)':'var(--red)';
  const visaoAtiva=rotinaPref.visao;
  const box=(k,c,lbl,val,sub,alerta,extra)=>`<button type="button" class="rp-box ${visaoAtiva===k?'sel':''}" data-c="${c}" data-alerta="${alerta?1:0}" onclick="mudarVisaoRotina('${k}')">
      <div class="rp-lbl">${lbl}</div><div class="rp-val">${val}</div>${extra||''}<div class="rp-sub">${sub}</div></button>`;
  el.innerHTML=
    box('atrasadas','red','Atrasadas',cont.atrasadas,maisAntiga?'a mais antiga venceu há '+diasEntreISO(maisAntiga,hoje)+'d':'nada vencido',cont.atrasadas>0)+
    box('hoje','amber','Para hoje',cont.hoje,fataisHoje?fataisHoje+' prazo'+(fataisHoje>1?'s':'')+' fata'+(fataisHoje>1?'is':'l')+' hoje':cont.hoje?'entregas do dia':'nada marcado para hoje',false)+
    box('mesa','blue','Em aberto',abertas.length,(cont.amanha+cont.semana)+' nos próximos 7 dias',false)+
    box('desempenho','green','No prazo · 30 dias',pct===null?'—':pct+'%',
      r30.comPrazo?r30.dentroDoPrazo+' de '+r30.comPrazo+' no prazo'+(r30.adiadas?' · '+r30.adiadas+' adiada'+(r30.adiadas>1?'s':''):''):'nenhuma conclusão com prazo',false,
      `<div class="rp-meter"><span style="width:${pct||0}%;background:${corPct}"></span></div>`);
}

function renderAvisosRotina(){
  const el=document.getElementById('rotina-avisos');
  if(!el)return;
  let h='';
  const nPub=typeof pubsAnalisar==='function'?pubsAnalisar().length:0;
  const nConf=tarefasConferir().filter(t=>tarefaDaPessoa(t,rotinaPessoa())).length;
  if(nPub)h+=`<div class="rot-aviso ambar"><i class="ti ti-news"></i><span><b>${nPub} publicaç${nPub>1?'ões':'ão'} do DJEN para revisar.</b>${nConf?' Os prazos já foram calculados e estão marcados “conferir”.':''}</span><button class="btn-sec" onclick="abrirPainelPublicacoes('revisar')">Revisar</button></div>`;
  else if(nConf&&rotinaPref.visao!=='conferir')h+=`<div class="rot-aviso ambar"><i class="ti ti-alert-triangle"></i><span><b>${nConf} prazo${nConf>1?'s':''} ou audiência${nConf>1?'s':''}</b> lido${nConf>1?'s':''} do DJEN aguardando conferência.</span><button class="btn-sec" onclick="mudarVisaoRotina('conferir')">Conferir</button></div>`;
  el.innerHTML=h;
}

// ─── TABELA ───────────────────────────────────────────────
function renderTabelaRotina(lista){
  const el=document.getElementById('rotina-tabela');
  if(!el)return;
  if(!lista.length){
    el.innerHTML=`<div class="rt-vazio"><i class="ti ti-circle-check"></i>${
      rotinaBusca.trim()?'Nenhuma tarefa encontrada para esta busca.':'Nada neste recorte.'}</div>`;
    return;
  }
  const grupos=agruparTarefas(lista);
  let desenhadas=0, cortou=false;
  let h=`<div class="rt-head"><span></span><span>Tarefa</span><span>Tipo</span><span>Resp</span><span>Etapa</span><span class="dir">Prazo</span><span></span></div>`;
  grupos.forEach(g=>{
    const chave='rt:'+rotinaAgrupar()+':'+g.k;
    const fechado=blocoRecolhido(chave,!!g.fechado);
    const itens=[];
    g.itens.forEach(t=>{
      if(fechado)return;
      if(desenhadas>=ROT_LIMITE){cortou=true;return;}
      desenhadas++;itens.push(rtRowHTML(t));
    });
    h+=`<button type="button" class="rt-grupo ${fechado?'fechado':''}" style="--c:${g.cor}" onclick="alternarBloco('${chave}',${!!g.fechado})">
        <span class="barra"></span><span class="tt">${esc(g.lbl)}</span><span class="n">${g.itens.length}</span>
        ${g.dica?`<span class="dica">${esc(g.dica)}</span>`:''}
        <i class="ti ti-chevron-down chev"></i></button>
      <div class="rt-corpo">${itens.join('')}</div>`;
  });
  if(cortou)h+=`<div class="rt-mais">Mostrando as ${ROT_LIMITE} primeiras. Use a busca ou um recorte do menu para filtrar.</div>`;
  el.innerHTML=h;
}

function rtRowHTML(t){
  const tp=tipoInfo(t.tipo), cli=nomeCliente(t.cid), p=processoPorId(t.pid), av=corResp(t.resp);
  const e=etapaDaTarefa(t), done=t.status==='concluido', h=hojeISO();
  const sub=[
    cli,
    p?(p.numCNJ||p.num):'',
    t.leadId?'lead':'',
    t.adiamentos?'adiada '+t.adiamentos+'x':'',
    t.conferir?'lido do DJEN':'',
    ehProjeto(t)?'projeto':'',
  ].filter(Boolean).join(' · ');

  let prazo;
  if(done){
    const ci=conclusaoInfo(t);
    prazo=`<b class="ok">${esc(ci.txt)}</b>`;
  }else if(!t.prazo){
    prazo=`<input type="date" onclick="event.stopPropagation()" onchange="event.stopPropagation();definirPrazoRapido('${t.id}',this.value)" title="Defina o prazo desta tarefa">`;
  }else{
    const cls=t.prazo<h?'late':t.prazo===h?'soon':'';
    prazo=`<b class="${cls}">${rotuloPrazoAgenda(t)}${t.hora?' · '+esc(t.hora):''}</b>`;
    if(t.prazoFatal){
      const df=diasEntreISO(h,t.prazoFatal);
      prazo+=`<span title="Prazo fatal do processo"><i class="ti ti-flag" style="font-size:11px"></i>${df<0?'fatal vencido':'fatal '+fmtDataCurta(t.prazoFatal)}${df>=0&&df<=2?(df===0?' HOJE':' · '+df+'d'):''}</span>`;
    }
  }
  const etapa=e.acao
    ? `<span class="et ${e.cls} acao" onclick="event.stopPropagation();${e.acao}" title="${esc(e.lbl)}"><i class="ti ti-${e.ico}"></i>${esc(e.lbl)}</span>`
    : `<span class="et ${e.cls}" title="${esc(revEstadoLbl(t)||e.lbl)}">${e.ico?`<i class="ti ti-${e.ico}"></i>`:''}${esc(e.lbl)}</span>`;

  return `<div class="rt-row ${rotSel===t.id?'sel':''} ${done?'feita':''}" id="rt-${t.id}" onclick="selecionarTarefaRotina('${t.id}')">
    <button class="rt-ck ${done?'on':''}" onclick="event.stopPropagation();${done?`reabrirTarefa('${t.id}')`:`concluirRapido('${t.id}')`}" title="${done?'Reabrir tarefa':'Concluir'}"><i class="ti ti-check"></i></button>
    <span class="rt-nome"><b>${esc(t.titulo)}</b>${sub?`<span>${esc(sub)}</span>`:''}</span>
    <span class="rt-tipo" style="--c:${tp.cor}"><i></i><span>${esc(tp.lbl)}</span></span>
    <span class="rt-av" style="background:${av[0]};color:${av[1]}" title="${esc(t.resp||'')}">${avatarResp(t.resp)}</span>
    <span class="rt-etapa">${etapa}</span>
    <span class="rt-prazo">${prazo}</span>
    <span class="rt-acoes"><button class="btn-ico" onclick="event.stopPropagation();abrirModalTarefa('${t.id}',null)" title="Abrir o formulário completo"><i class="ti ti-pencil"></i></button></span>
  </div>`;
}

function rotuloPrazoAgenda(t){
  const h=hojeISO();
  if(t.prazo===h)return 'Hoje';
  if(t.prazo===isoAdd(h,1))return 'Amanhã';
  if(t.prazo<h){const d=diasEntreISO(t.prazo,h);return 'há '+d+' dia'+(d>1?'s':'');}
  return fmtDataSem(t.prazo).replace(/\/\d{4}$/,'');
}
function selecionarTarefaRotina(id){
  rotSel=(rotSel===id?null:id);
  renderRotina();
}

// ─── PAINEL DE DETALHE ────────────────────────────────────
function renderDetalheRotina(){
  const el=document.getElementById('rot-detalhe');
  if(!el)return;
  const t=rotSel?DB.tarefas.find(x=>x.id===rotSel):null;
  el.innerHTML=t?detalheTarefaHTML(t):detalhePadraoRotina();
}

function detalheTarefaHTML(t){
  const tp=tipoInfo(t.tipo), c=t.cid&&DB.clientes.find(x=>x.id===t.cid), p=processoPorId(t.pid);
  const av=corResp(t.resp), h=hojeISO(), done=t.status==='concluido';
  const e=etapaDaTarefa(t), prox=revProximaAcao(t), quem=revisorDa(t);

  const lin=(k,v,onclick)=>`<div class="rd-lin"><span class="k">${k}</span>`
    +(onclick?`<span class="v link" onclick="${onclick}">${v}</span>`:`<span class="v">${v}</span>`)+`</div>`;
  let linhas='';
  if(c)linhas+=lin('Cliente',esc(c.curto||c.nome),`irParaCliente('${c.id}')`);
  if(p)linhas+=lin('Processo',esc(p.numCNJ||p.num||'sem número'),`irParaProcesso('${p.id}')`);
  if(t.leadId)linhas+=lin('Lead','abrir na Jornada Comercial',`abrirLeadDeTarefa('${t.leadId}','${t.leadMod}')`);
  linhas+=lin('Tipo',`<span class="rt-tipo" style="--c:${tp.cor}"><i></i><span>${esc(tp.lbl)}</span></span>`);
  linhas+=lin('Responsável',`<span class="rt-av" style="background:${av[0]};color:${av[1]}">${avatarResp(t.resp)}</span> ${esc(t.resp||'—')}`);
  if(t.revPede)linhas+=lin('Revisor',esc(quem)+' · '+(REV_PEDE_LBL[t.revPede]||t.revPede).toLowerCase());
  linhas+=lin('Prazo',t.prazo?esc(fmtDataSem(t.prazo))+(t.hora?' · '+esc(t.hora):''):'<span style="color:var(--t3);font-weight:500">sem prazo definido</span>');
  if(t.prazoFatal)linhas+=lin('Prazo fatal',esc(fmtDataSem(t.prazoFatal)));
  if(done)linhas+=lin('Concluída',esc(conclusaoInfo(t).txt.replace('✓ ','')));

  let alerta='';
  if(!done&&t.prazoFatal&&t.prazoFatal<=isoAdd(h,2)){
    const df=diasEntreISO(h,t.prazoFatal);
    alerta=`<div class="rd-alerta"><i class="ti ti-flag"></i><span><b>Prazo fatal ${df<0?'vencido':df===0?'hoje':'em '+df+' dia'+(df>1?'s':'')}</b>
      <span>${df<0?'o prazo do processo já passou — trate como emergência.':'não há folga: o que não sair hoje atrasa o processo.'}</span></span></div>`;
  }else if(!done&&t.conferir){
    alerta=`<div class="rd-alerta ambar"><i class="ti ti-alert-triangle"></i><span><b>Prazo lido do DJEN</b>
      <span>a data foi calculada automaticamente. Confira no processo antes de trabalhar nela.</span></span></div>`;
  }else if(!done&&revPendenteRevisor(t)&&(!EU||EU.nome!==quem)){
    alerta=`<div class="rd-alerta ambar"><i class="ti ti-eye"></i><span><b>Na mesa de ${esc(quem)}</b>
      <span>enviada para ${prox==='aprovar'?'aprovação':'revisão'}${t.revEnviadoEm?' em '+esc(fmtDataHora(t.revEnviadoEm)):''} — só pode ser concluída depois que ${esc(quem)} responder.</span></span></div>`;
  }else if(!done&&revAguardaEnvio(t)&&(!EU||EU.nome!==t.resp)){
    alerta=`<div class="rd-alerta ambar"><i class="ti ti-hourglass-low"></i><span><b>Ainda com ${esc(t.resp)}</b>
      <span>a peça precisa ser enviada para ${prox==='aprovar'?'aprovação':'revisão'} antes de ser concluída.</span></span></div>`;
  }else if(t.revPede&&!prox){
    alerta=`<div class="rd-alerta verde"><i class="ti ti-circle-check"></i><span><b>${t.revEstado==='aprovado'?'Aprovada':'Revisada'}${t.revPorQuem?' por '+esc(t.revPorQuem):''}</b>
      <span>liberada para conclusão.</span></span></div>`;
  }

  let acoes='';
  if(!done&&t.revPede&&prox&&!t.revEnviado&&(!EU||EU.nome===t.resp)){
    acoes+=`<button class="rd-b1" onclick="enviarParaRevisao('${t.id}')"><i class="ti ti-send"></i>Enviar para ${prox==='aprovar'?'aprovação':'revisão'} de ${esc(quem)}</button>`;
  }else if(!done&&revPendenteRevisor(t)&&EU&&EU.nome===quem){
    acoes+=`<button class="rd-b1" onclick="marcarRevisao('${t.id}','${prox}')"><i class="ti ti-eye"></i>Marcar como ${prox==='aprovar'?'aprovada':'revisada'}</button>`;
  }else if(!done&&revBloqueiaConclusao(t)){
    // trava do fluxo: concluir aqui só mostraria um aviso, então o botão diz o que falta
    const falta=t.revEnviado
      ? (prox==='aprovar'?'aprovação':'revisão')+' de '+quem
      : 'envio de '+t.resp;
    acoes+=`<button class="rd-b2" onclick="mostrarToast(avisoRevConclusao(DB.tarefas.find(x=>x.id==='${t.id}')))" style="height:34px">
      <i class="ti ti-lock"></i>Aguarda ${esc(falta)}</button>`;
  }else if(!done){
    acoes+=`<button class="rd-b1" onclick="concluirRapido('${t.id}')"><i class="ti ti-check"></i>Concluir tarefa</button>`;
  }else{
    acoes+=`<button class="rd-b1" onclick="reabrirTarefa('${t.id}')"><i class="ti ti-arrow-back-up"></i>Reabrir tarefa</button>`;
  }
  if(!done)acoes+=`<div class="dupla">
      <button class="rd-b2" onclick="alternarAndamento('${t.id}')"><i class="ti ti-player-${t.status==='andamento'?'pause':'play'}"></i>${t.status==='andamento'?'Pendente':'Em andamento'}</button>
      <button class="rd-b2" onclick="abrirModalTarefa('${t.id}',null)"><i class="ti ti-pencil"></i>Editar</button></div>`;
  else acoes+=`<button class="rd-b2" onclick="abrirModalTarefa('${t.id}',null)"><i class="ti ti-pencil"></i>Editar tarefa</button>`;

  let adiar='';
  if(!done){
    adiar=`<div class="rd-hist"><div class="rd-k">Adiar · fica registrado no cumprimento de prazos</div>
      <div class="rd-acoes" style="margin-top:8px">
        <div class="dupla">
          <button class="rd-b2" onclick="adiarTarefa('${t.id}','dia')">+1 dia</button>
          <button class="rd-b2" onclick="adiarTarefa('${t.id}','util')">Próximo dia útil</button>
        </div>
        <div class="dupla">
          <button class="rd-b2" onclick="adiarTarefa('${t.id}','semana')">+1 semana</button>
          <button class="rd-b2" onclick="abrirModalTarefa('${t.id}',null)">Outra data…</button>
        </div>
      </div></div>`;
  }

  const hist=[];
  if(t.criadoEm)hist.push(['Criada'+(t.criadoPor?' por '+esc(t.criadoPor):''),fmtDataHora(t.criadoEm)]);
  if(t.conferir)hist.push(['Prazo calculado a partir de publicação do DJEN','automático']);
  if(t.adiamentos)hist.push(['Adiada '+t.adiamentos+'x'+(t.adiadaPor?' por '+esc(t.adiadaPor):''),t.prazoOriginal?'data original '+fmtData(t.prazoOriginal):'']);
  if(t.revEnviadoEm)hist.push(['Enviada para '+(t.revPede==='aprovar'?'aprovação':'revisão'),fmtDataHora(t.revEnviadoEm)]);
  if(t.revEm)hist.push([(t.revEstado==='aprovado'?'Aprovada':'Revisada')+(t.revPorQuem?' por '+esc(t.revPorQuem):''),fmtDataHora(t.revEm)]);
  if(done&&t.concluidoEm)hist.push(['Concluída',fmtData(t.concluidoEm)]);

  return `<div class="rd-head"><div class="rd-k">Tarefa selecionada</div><h3>${esc(t.titulo)}</h3></div>
    <div class="rd-body">
      ${linhas}
      ${alerta}
      <div class="rd-acoes">${acoes}</div>
      ${adiar}
      ${hist.length?`<div class="rd-hist"><div class="rd-k">Histórico</div>
        ${hist.map(x=>`<div class="rd-hi"><i></i><span>${x[0]}${x[1]?`<time>${esc(x[1])}</time>`:''}</span></div>`).join('')}</div>`:''}
    </div>`;
}

// sem tarefa selecionada: o prazo fatal mais próximo e o que espera triagem
function detalhePadraoRotina(){
  const h=hojeISO();
  const fatais=DB.tarefas.filter(t=>t.tipo!=='followup'&&t.status!=='concluido'&&t.prazoFatal)
    .sort((a,b)=>a.prazoFatal<b.prazoFatal?-1:1);
  const f=fatais[0];
  let topo;
  if(f){
    const df=diasEntreISO(h,f.prazoFatal);
    topo=`<button type="button" class="rd-fatal" style="display:block;width:100%;text-align:left;border:none;cursor:pointer" onclick="selecionarTarefaRotina('${f.id}')">
      <div class="k">Prazo fatal mais próximo</div>
      <div class="num">${df<0?'VENCIDO':df===0?'HOJE':df+(df===1?' dia':' dias')}</div>
      <div class="k" style="opacity:.6">${esc(fmtDataSem(f.prazoFatal))}</div>
      <div class="tt">${esc(f.titulo)}</div>
      <div class="mt">${esc([nomeCliente(f.cid),f.resp].filter(Boolean).join(' · '))}</div></button>`;
  }else{
    topo=`<div class="rd-fatal calmo"><div class="k">Prazos fatais</div>
      <div class="num">Nenhum</div><div class="mt" style="font-size:12px">Nenhuma tarefa em aberto tem prazo fatal do processo.</div></div>`;
  }
  const nPub=typeof pubsAnalisar==='function'?pubsAnalisar().length:0;
  const nConf=tarefasConferir().filter(t=>tarefaDaPessoa(t,rotinaPessoa())).length;
  const eu=EU&&EU.nome;
  const nRev=DB.tarefas.filter(t=>revPendenteRevisor(t)&&revisorDa(t)===eu).length;
  const tr=[];
  if(nPub)tr.push(['amb','news',nPub+' publicaç'+(nPub>1?'ões':'ão')+' do DJEN','para revisar e transformar em prazo',`abrirPainelPublicacoes('revisar')`]);
  if(nConf)tr.push(['amb','alert-triangle',nConf+' prazo'+(nConf>1?'s':'')+' a conferir','lidos automaticamente — confira a data',`mudarVisaoRotina('conferir')`]);
  if(nRev)tr.push(['nav','eye',nRev+' peça'+(nRev>1?'s':'')+' na sua mesa','aguardando sua revisão ou aprovação',`mudarVisaoRotina('revmim')`]);

  const prox=fatais.slice(0,4).map(t=>{
    const df=diasEntreISO(h,t.prazoFatal);
    return `<button type="button" class="rd-mini ${df<=0?'urg':''}" onclick="selecionarTarefaRotina('${t.id}')">
      <span class="pt"></span><span class="tx"><b>${esc(t.titulo)}</b><span>${esc([nomeCliente(t.cid),t.resp].filter(Boolean).join(' · '))}</span></span>
      <span class="d">${df<0?'vencido':df===0?'hoje':fmtDataCurta(t.prazoFatal)}</span></button>`;
  }).join('');

  return topo
    +(tr.length?`<div class="rd-triagem">${tr.map(x=>`<button type="button" class="rd-tr ${x[0]}" onclick="${x[4]}">
        <i class="ti ti-${x[1]}"></i><span class="tx"><b>${esc(x[2])}</b><span>${esc(x[3])}</span></span>
        <i class="ti ti-chevron-right ir"></i></button>`).join('')}</div>`:'')
    +(prox?`<div class="rd-lista"><div class="k">Prazos fatais a seguir</div>${prox}</div>`:'')
    +`<div class="rd-lista" style="padding-top:0"><div class="rd-hi" style="color:var(--t3)"><i></i><span>Clique em uma linha da lista para ver cliente, processo, histórico e as ações da tarefa aqui.</span></div></div>`;
}

// ─── CRIAÇÃO RÁPIDA ───────────────────────────────────────
const RR_ATALHOS=[
  {k:'hoje',lbl:'Hoje',data:()=>hojeISO()},
  {k:'amanha',lbl:'Amanhã',data:()=>isoAdd(hojeISO(),1)},
  {k:'sexta',lbl:'Sexta',data:()=>proximaSexta()},
  {k:'semana',lbl:'+7d',data:()=>isoAdd(hojeISO(),7)},
];
// próximo dia de expediente para tarefas internas (sem recesso forense)
function proximoDiaTrabalho(iso){
  let d=isoAdd(iso,1),g=0;
  while((isoDow(d)===0||isoDow(d)===6||feriadosDoAno(+d.slice(0,4)).has(d))&&g++<15)d=isoAdd(d,1);
  return d;
}
function proximaSexta(){
  const h=hojeISO();let d=h,g=0;
  while(isoDow(d)!==5&&g++<7)d=isoAdd(d,1);
  return d;
}
function renderRapidaRotina(pessoa){
  const sel=document.getElementById('rr-resp');
  if(!sel)return;
  if(sel.options.length!==RESP.length)sel.innerHTML=RESP.map(r=>`<option>${esc(r)}</option>`).join('');
  if(!__rrIniciado){
    sel.value=pessoa!=='todos'?pessoa:(EU&&RESP.includes(EU.nome)?EU.nome:'Cecília');
    rrMarcarAtalho('hoje');
    __rrIniciado=true;
  }
  document.getElementById('rr-datas').innerHTML=RR_ATALHOS.map(a=>`<button type="button" class="${rrAtalho===a.k?'on':''}" onclick="rrMarcarAtalho('${a.k}')">${a.lbl}</button>`).join('');
}
function rrMarcarAtalho(k){
  rrAtalho=k;
  const a=RR_ATALHOS.find(x=>x.k===k);
  if(a)document.getElementById('rr-prazo').value=a.data();
  document.querySelectorAll('#rr-datas button').forEach((b,i)=>b.classList.toggle('on',RR_ATALHOS[i]&&RR_ATALHOS[i].k===k));
}
// tipo provável pelo título; o usuário corrige no formulário completo se precisar
function tipoPeloTitulo(titulo){
  const t=semAcento(titulo);
  const regras=[['audiencia',/audiencia/],['inicial',/inicial/],['peticao',/peti|contesta|recurso|manifesta|replica|embargo|memoria|razoes|impugna/],
    ['diligencia',/diligen|cartorio|protocol|despachar com|balcao/],['lead',/\blead\b|responder lead/]];
  const keys=tiposTarefa().map(x=>x.key);
  for(const [k,re] of regras)if(re.test(t)&&keys.includes(k))return k;
  return keys.includes('outro')?'outro':keys[0];
}
function criarTarefaRapida(){
  const inp=document.getElementById('rr-titulo');
  const titulo=inp.value.trim();
  if(!titulo){inp.focus();return;}
  const prazo=document.getElementById('rr-prazo').value;
  const resp=document.getElementById('rr-resp').value;
  const t={id:uid(),titulo,resp,tipo:tipoPeloTitulo(titulo),cid:null,prazo,hora:'',status:'pendente',concluidoEm:'',criadoEm:Date.now(),criadoPor:EU?EU.nome:''};
  DB.tarefas.push(t);
  inp.value='';
  salvarDB();refreshUI();
  mostrarToast('Incluída para '+resp+(prazo?' · '+fmtDataSem(prazo):' · sem prazo'),'Editar',()=>abrirModalTarefa(t.id,null));
  setTimeout(()=>inp.focus(),30);
}

// ─── AÇÕES RÁPIDAS ────────────────────────────────────────
function concluirRapido(id){
  const t=DB.tarefas.find(x=>x.id===id);if(!t)return;
  if(revBloqueiaConclusao(t)){mostrarToast(avisoRevConclusao(t));return;}
  const antes={status:t.status,concluidoEm:t.concluidoEm};
  aplicarStatusTarefa(t,'concluido');
  const row=document.getElementById('rt-'+id);
  if(row)row.classList.add('saindo');
  salvarDB();
  setTimeout(refreshUI,200);
  const ci=conclusaoInfo(t);
  const sufixo=ci&&ci.cat==='atrasada'?' com '+plural(ci.dias,' de atraso'):ci&&(ci.cat==='antecipada'||ci.cat==='noprazo')?' no prazo':'';
  mostrarToast('Concluída'+sufixo+': '+t.titulo,'Desfazer',()=>{
    t.status=antes.status;t.concluidoEm=antes.concluidoEm;salvarDB();refreshUI();
  });
}
function reabrirTarefa(id){
  const t=DB.tarefas.find(x=>x.id===id);if(!t)return;
  aplicarStatusTarefa(t,'pendente');
  salvarDB();refreshUI();
}
function alternarAndamento(id){
  const t=DB.tarefas.find(x=>x.id===id);if(!t)return;
  aplicarStatusTarefa(t,t.status==='andamento'?'pendente':'andamento');
  salvarDB();refreshUI();
}
function definirPrazoRapido(id,val){
  const t=DB.tarefas.find(x=>x.id===id);if(!t||!val)return;
  t.prazo=val;salvarDB();refreshUI();
}
function registrarAdiamento(t){
  if(!t.prazoOriginal)t.prazoOriginal=t.prazo;
  t.adiamentos=(t.adiamentos||0)+1;
  t.adiadaEm=Date.now();t.adiadaPor=EU?EU.nome:'';
}
function adiarTarefa(id,modo){
  const t=DB.tarefas.find(x=>x.id===id);if(!t)return;
  const h=hojeISO();
  const base=t.prazo&&t.prazo>=h?t.prazo:h;
  const nova=modo==='util'?proximoDiaTrabalho(base):modo==='semana'?isoAdd(base,7):isoAdd(base,1);
  if(t.prazoFatal&&nova>t.prazoFatal&&!confirm('A nova data ('+fmtData(nova)+') passa do PRAZO FATAL do processo ('+fmtData(t.prazoFatal)+').\n\nAdiar assim mesmo?'))return;
  const anterior={prazo:t.prazo,prazoOriginal:t.prazoOriginal,adiamentos:t.adiamentos,adiadaEm:t.adiadaEm,adiadaPor:t.adiadaPor};
  registrarAdiamento(t);
  t.prazo=nova;
  salvarDB();refreshUI();
  mostrarToast('Adiada para '+fmtDataSem(nova),'Desfazer',()=>{Object.assign(t,anterior);if(!t.prazoOriginal)delete t.prazoOriginal;if(!t.adiamentos)delete t.adiamentos;salvarDB();refreshUI();});
}

// ─── AVISO RÁPIDO (toast) ─────────────────────────────────
let __toastFn=null,__toastTimer=null;
function mostrarToast(txt,rotulo,fn){
  const el=document.getElementById('toast');
  if(!el)return;
  document.getElementById('toast-txt').textContent=txt;
  const b=document.getElementById('toast-btn');
  __toastFn=fn||null;
  b.style.display=fn?'':'none';
  b.textContent=rotulo||'Desfazer';
  el.classList.add('on');
  clearTimeout(__toastTimer);
  __toastTimer=setTimeout(()=>{el.classList.remove('on');__toastFn=null;},fn?7000:4500);
}
function toastAcao(){
  const fn=__toastFn;__toastFn=null;
  document.getElementById('toast').classList.remove('on');
  if(fn)fn();
}
