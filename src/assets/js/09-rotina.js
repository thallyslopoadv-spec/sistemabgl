
// ═══════════════════════════════════════════════════════════
//  ROTINA (tarefas por sócio)
// ═══════════════════════════════════════════════════════════
let rotinaFiltro='todos';
let rotinaCat={}; // categoria (tipo) selecionada por coluna/responsável
function rotinaFiltroCat(resp,val){rotinaCat[resp]=val;renderRotina();}
function filtroRotina(f,btn){
  rotinaFiltro=f;
  // :not(.desemp-chips) — o painel de cumprimento de prazos tem os próprios chips
  document.querySelectorAll('#rot-status-chips .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderRotina();
}
// abre um lead diretamente a partir de uma tarefa (Rotina)
function abrirLeadDeTarefa(leadId,leadMod){
  navegarPara('trab');
  mudarTipoTriagem(leadMod);
  if(leadMod==='civel')abrirLeadCivel(leadId);else abrirLead(leadId);
}
function taskCard(t){
  const pi=prazoInfo(t);const cli=nomeCliente(t.cid);
  const done=t.status==='concluido'?'done':'';
  const stCls=t.status==='concluido'?'st-concluido':t.status==='andamento'?'st-andamento':'st-pendente';
  const leadChip=t.leadId?`<span class="task-cli" onclick="abrirLeadDeTarefa('${t.leadId}','${t.leadMod}')" title="Abrir lead na Jornada Comercial"><i class="ti ti-user" style="font-size:11px"></i> lead</span>`:'';
  return `<div class="task-card ${done}">
    <div class="task-titulo">${esc(t.titulo)}</div>
    <div class="task-meta">
      <span class="task-tipo">${tipoInfo(t.tipo).lbl}</span>
      ${cli?`<span class="task-cli" onclick="irParaCliente('${t.cid}')">${esc(cli)}</span>`:''}
      ${leadChip}
      ${seloProjeto(t)}
      <span class="prazo-badge ${pi.cls}"${pi.titulo?` title="${esc(pi.titulo)}"`:''}>${pi.txt}</span>
      ${t.hora?`<span class="prazo-badge prazo-ok" title="Horário"><i class="ti ti-clock" style="font-size:11px"></i>${esc(t.hora)}</span>`:''}
    </div>
    <div class="task-foot">
      <span class="st-pill ${stCls}" onclick="cicloTarefa('${t.id}')" title="Clique para avançar o status">${ST_LBL[t.status]}</span>
      <button class="btn-ico" onclick="abrirModalTarefa('${t.id}',null)" title="Editar tarefa"><i class="ti ti-pencil"></i></button>
    </div>
  </div>`;
}
// ═══════════════════════════════════════════════════════════
//  ROTINA — AGENDA POR PRAZO
//  A lista principal agrupa as tarefas pelo que vence primeiro
//  (atrasadas, hoje, amanhã, próximos 7 dias…). A ideia é que a
//  pergunta "o que eu preciso entregar agora?" se responda olhando
//  o topo da tela, sem varrer quatro colunas.
//  · conclusão em um clique (com "desfazer")
//  · adiar é possível, mas fica registrado (t.adiamentos, t.prazoOriginal)
//    e aparece no placar e no relatório de cumprimento
//  · tarefa sem prazo fica em grupo próprio, pedindo uma data
//  O quadro por responsável continua disponível ("Por responsável").
// ═══════════════════════════════════════════════════════════
const LS_ROTINA_PREF='bgl_rotina_pref';
let rotinaPref=(()=>{try{const v=JSON.parse(localStorage.getItem(LS_ROTINA_PREF)||'{}');return v&&typeof v==='object'?v:{}}catch(e){return {}}})();
let rotinaHorizonte=null, rotinaBusca='', rrAtalho='hoje', __rrIniciado=false;
function salvarPrefRotina(){try{localStorage.setItem(LS_ROTINA_PREF,JSON.stringify(rotinaPref))}catch(e){}}
function rotinaModo(){return rotinaPref.modo==='board'?'board':'agenda'}
function rotinaPessoa(){const p=rotinaPref.pessoa;return p&&RESP.includes(p)?p:'todos'}
function mudarModoRotina(m){rotinaPref.modo=m;salvarPrefRotina();renderRotina();}
function mudarPessoaRotina(p){rotinaPref.pessoa=p;salvarPrefRotina();__rrIniciado=false;renderRotina();}
function buscaRotina(v){rotinaBusca=v;renderRotina();}
function filtroHorizonte(h){
  rotinaHorizonte=rotinaHorizonte===h?null:h;
  if(rotinaModo()!=='agenda'){rotinaPref.modo='agenda';salvarPrefRotina();}
  renderRotina();
}
// a tarefa aparece para o responsável; também para o outro sócio quando está
// aguardando a revisão/aprovação dele (fica "na mesa" dos dois)
function tarefaDaPessoa(t,p){
  if(p==='todos'||t.resp===p)return true;
  if(t.resp===RESP_DUPLA&&(p==='Cecília'||p==='Thallys'))return true;  // dados legados
  if(t.revPede&&revProximaAcao(t)&&revisorDa(t)===p)return true;
  return false;
}
function tarefaCasaBusca(t,q){
  if(!q)return true;
  const p=processoPorId(t.pid);
  return [t.titulo,nomeCliente(t.cid),t.resp,tipoInfo(t.tipo).lbl,p&&p.num,p&&p.numCNJ,p&&p.ativo,p&&p.passivo].some(x=>semAcento(x).includes(q));
}
function grupoDaTarefa(t,hoje,amanha,fim7){
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

// ─── PLACAR, AVISOS E FILTROS ─────────────────────────────
function renderRotina(){
  const pessoa=rotinaPessoa(), modo=rotinaModo();
  const hoje=hojeISO(), amanha=isoAdd(hoje,1), fim7=isoAdd(hoje,7);
  const todas=DB.tarefas.filter(t=>t.tipo!=='followup'&&tarefaDaPessoa(t,pessoa));
  const abertas=todas.filter(t=>t.status!=='concluido');
  const cont={atrasadas:0,hoje:0,amanha:0,semana:0,proximas:0,semprazo:0};
  abertas.forEach(t=>cont[grupoDaTarefa(t,hoje,amanha,fim7)]++);
  const maisAntiga=abertas.reduce((m,t)=>t.prazo&&t.prazo<hoje&&(!m||t.prazo<m)?t.prazo:m,'');
  const fataisHoje=abertas.filter(t=>t.prazoFatal===hoje).length;
  const r30=resumoConclusao(todas.filter(t=>t.status==='concluido'&&t.concluidoEm&&t.concluidoEm>=isoAdd(hoje,-30)));
  const pct=r30.pctNoPrazo;
  const corPct=pct===null?'var(--silver)':pct>=85?'var(--green)':pct>=65?'var(--amber)':'var(--red)';
  const box=(h,c,lbl,val,sub,alerta,extra)=>`<button type="button" class="rp-box ${rotinaHorizonte===h?'sel':''}" data-c="${c}" data-alerta="${alerta?1:0}" onclick="${h==='desempenho'?'irParaDesempenho()':`filtroHorizonte('${h}')`}">
      <div class="rp-lbl">${lbl}</div><div class="rp-val">${val}</div>${extra||''}<div class="rp-sub">${sub}</div></button>`;
  const st=document.getElementById('rotina-stats');
  if(st)st.innerHTML=
    box('atrasadas','red','Atrasadas',cont.atrasadas,maisAntiga?'a mais antiga venceu há '+diasEntreISO(maisAntiga,hoje)+'d':'nada vencido',cont.atrasadas>0)+
    box('hoje','amber','Para hoje',cont.hoje,fataisHoje?fataisHoje+' prazo'+(fataisHoje>1?'s':'')+' fata'+(fataisHoje>1?'is':'l')+' hoje':cont.hoje?'entregas do dia':'nada marcado para hoje',false)+
    box('semana','blue','Próximos 7 dias',cont.amanha+cont.semana,cont.amanha+' para amanhã',false)+
    box('semprazo','','Sem prazo',cont.semprazo,cont.semprazo?'defina uma data':'todas com data',false)+
    box('desempenho','green','No prazo · 30 dias',pct===null?'—':pct+'%',
      r30.comPrazo?r30.dentroDoPrazo+' de '+r30.comPrazo+' no prazo'+(r30.adiadas?' · '+r30.adiadas+' adiada'+(r30.adiadas>1?'s':''):''):'nenhuma conclusão com prazo',false,
      `<div class="rp-meter"><span style="width:${pct||0}%;background:${corPct}"></span></div>`);

  renderFataisSemana();
  renderAvisosRotina(pessoa);
  renderPessoasRotina(pessoa,hoje);
  renderRapidaRotina(pessoa);
  document.getElementById('rot-modo-agenda').classList.toggle('on',modo==='agenda');
  document.getElementById('rot-modo-board').classList.toggle('on',modo==='board');
  document.getElementById('rot-status-chips').style.display=modo==='board'?'flex':'none';
  const ag=document.getElementById('rotina-agenda'),bd=document.getElementById('rotina-board');
  if(modo==='board'){ag.innerHTML='';ag.style.display='none';bd.style.display='';renderRotinaBoard(pessoa);}
  else{bd.innerHTML='';bd.style.display='none';ag.style.display='';renderAgendaRotina(pessoa);}

  renderChatGeral();
  renderProjetos();
  renderDesempenhoRotina();
}
function irParaDesempenho(){
  const el=document.getElementById('rotina-desempenho');
  if(el)el.closest('.modulo-card').scrollIntoView({behavior:'smooth',block:'start'});
}
function renderAvisosRotina(pessoa){
  const el=document.getElementById('rotina-avisos');
  if(!el)return;
  let h='';
  const nPub=pubsAnalisar().length;
  const nConf=tarefasConferir().filter(t=>tarefaDaPessoa(t,pessoa)).length;
  if(nPub)h+=`<div class="rot-aviso ambar"><i class="ti ti-news"></i><span><b>${nPub} publicaç${nPub>1?'ões':'ão'} do DJEN para revisar.</b>${nConf?' Os prazos já foram calculados e estão na lista abaixo, marcados “conferir”.':''}</span><button class="btn-sec" onclick="abrirPainelPublicacoes('revisar')">Revisar</button></div>`;
  else if(nConf)h+=`<div class="rot-aviso ambar"><i class="ti ti-alert-triangle"></i><span><b>${nConf} prazo${nConf>1?'s':''} ou audiência${nConf>1?'s':''}</b> lido${nConf>1?'s':''} do DJEN aguardando conferência.</span><button class="btn-sec" onclick="filtroHorizonte('conferir')">${rotinaHorizonte==='conferir'?'Mostrar tudo':'Conferir'}</button></div>`;
  if(rotinaHorizonte&&rotinaHorizonte!=='conferir'){
    const nome={atrasadas:'atrasadas',hoje:'para hoje',semana:'dos próximos 7 dias',semprazo:'sem prazo'}[rotinaHorizonte]||rotinaHorizonte;
    h+=`<div class="rot-aviso azul"><i class="ti ti-filter"></i><span>Mostrando só as tarefas <b>${nome}</b>.</span><button class="btn-sec" onclick="filtroHorizonte('${rotinaHorizonte}')">Mostrar tudo</button></div>`;
  }
  el.innerHTML=h;
}
// Seletor de pessoas em "stories" (círculos): clicar filtra a rotina para as
// tarefas daquela pessoa — inclusive as que ela precisa revisar/aprovar.
function renderPessoasRotina(pessoa,hoje){
  const el=document.getElementById('rot-pessoas');
  if(!el)return;
  const abertas=DB.tarefas.filter(t=>t.tipo!=='followup'&&t.status!=='concluido');
  const atras=p=>abertas.filter(t=>tarefaDaPessoa(t,p)&&t.prazo&&t.prazo<hoje).length;
  const story=(key,sel,conteudo,bg,cor,n,a)=>`
    <button type="button" class="rot-story ${sel?'on':''}" onclick="mudarPessoaRotina('${key}')" title="${a?a+' atrasada'+(a>1?'s':''):'nenhuma atrasada'}">
      <span class="rot-story-ring${a?' alerta':''}"><span class="rot-story-av" style="background:${bg};color:${cor}">${conteudo}</span>${a?'<span class="rot-story-dot"></span>':''}</span>
      <span class="rot-story-nm">${key==='todos'?'Todos':esc(key)}</span>
      <span class="rot-story-n">${n}</span>
    </button>`;
  el.className='rot-stories';
  el.innerHTML=
    story('todos',pessoa==='todos','<i class="ti ti-users"></i>','var(--navy)','var(--cream)',abertas.length,0)+
    RESP.map(r=>{const av=corResp(r);return story(r,pessoa===r,avatarResp(r),av[0],av[1],abertas.filter(t=>tarefaDaPessoa(t,r)).length,atras(r));}).join('');
}
// Linha do tempo horizontal dos prazos fatais da semana (próximos 7 dias).
function renderFataisSemana(){
  const el=document.getElementById('rot-fatais');
  if(!el)return;
  const hoje=hojeISO(), fim=isoAdd(hoje,7);
  const fatais=DB.tarefas
    .filter(t=>t.status!=='concluido'&&t.prazoFatal&&t.prazoFatal>=hoje&&t.prazoFatal<=fim)
    .sort((a,b)=>a.prazoFatal<b.prazoFatal?-1:a.prazoFatal>b.prazoFatal?1:0);
  if(!fatais.length){
    el.innerHTML=`<div class="rot-fatais-vazio"><i class="ti ti-shield-check"></i> Nenhum prazo fatal nos próximos 7 dias.</div>`;
    return;
  }
  const pts=fatais.slice(0,6).map((t,i)=>{
    const dd=diasEntreISO(hoje,t.prazoFatal);
    const sel=i===0;
    return `<button type="button" class="rot-fatal-pt ${sel?'urg':''}" onclick="abrirModalTarefa('${t.id}',null)" title="${esc(t.titulo)}">
      <span class="rfp-marca"></span>
      <span class="rfp-dia">${(+t.prazoFatal.slice(8,10))}<small>${diaSemanaCurto(t.prazoFatal)}</small></span>
      <span class="rfp-tt">${esc(t.titulo)}</span>
      <span class="rfp-sub">${dd===0?'hoje':dd===1?'amanhã':'em '+dd+' dias'}${nomeCliente(t.cid)?' · '+esc(nomeCliente(t.cid)):''}</span>
    </button>`;
  }).join('<span class="rot-fatal-liga"></span>');
  el.innerHTML=`<div class="rot-fatais-head">Prazos fatais da semana</div><div class="rot-fatais-trilha">${pts}</div>`;
}

// ─── CRIAÇÃO RÁPIDA ───────────────────────────────────────
const RR_ATALHOS=[
  {k:'hoje',lbl:'Hoje',data:()=>hojeISO()},
  {k:'amanha',lbl:'Amanhã',data:()=>isoAdd(hojeISO(),1)},
  {k:'sexta',lbl:'Sexta',data:()=>proximaSexta()},
  {k:'semana',lbl:'+7d',data:()=>isoAdd(hojeISO(),7)},
];
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

// ─── AGENDA ───────────────────────────────────────────────
function ordenarAgenda(a,b){
  const pa=a.prazo||'9999',pb=b.prazo||'9999';
  if(pa!==pb)return pa<pb?-1:1;
  const fa=a.prazoFatal||'9999',fb=b.prazoFatal||'9999';
  if(fa!==fb)return fa<fb?-1:1;
  return (a.hora||'99')<(b.hora||'99')?-1:1;
}
function renderAgendaRotina(pessoa){
  const el=document.getElementById('rotina-agenda');
  if(!el)return;
  const hoje=hojeISO(), amanha=isoAdd(hoje,1), fim7=isoAdd(hoje,7);
  const q=semAcento(rotinaBusca.trim());
  const todas=DB.tarefas.filter(t=>t.tipo!=='followup'&&tarefaDaPessoa(t,pessoa)&&tarefaCasaBusca(t,q));
  let abertas=todas.filter(t=>t.status!=='concluido');
  if(rotinaHorizonte==='conferir')abertas=abertas.filter(t=>t.conferir);
  const grupos={};
  abertas.forEach(t=>{const g=grupoDaTarefa(t,hoje,amanha,fim7);(grupos[g]=grupos[g]||[]).push(t);});
  const visivel=k=>!rotinaHorizonte||rotinaHorizonte==='conferir'||rotinaHorizonte===k||(rotinaHorizonte==='semana'&&k==='amanha');
  let html='';
  GRUPOS_AGENDA.forEach(g=>{
    const ts=(grupos[g.k]||[]).sort(ordenarAgenda);
    if(!ts.length||!visivel(g.k))return;
    html+=grupoAgendaHTML(g.k,g.lbl,g.cor,ts,g.dica,!!g.fechado);
  });
  if(!html)html=`<div class="ag-vazio"><i class="ti ti-circle-check"></i>${q?'Nenhuma tarefa encontrada para esta busca.':rotinaHorizonte?'Nada neste recorte.':'Nenhuma tarefa em aberto. Tudo em dia.'}</div>`;
  if(!rotinaHorizonte){
    const recentes=todas.filter(t=>t.status==='concluido'&&t.concluidoEm&&t.concluidoEm>=isoAdd(hoje,-7))
      .sort((a,b)=>(b.concluidoEm||'').localeCompare(a.concluidoEm||''));
    if(recentes.length)html+=grupoAgendaHTML('concluidas','Concluídas nos últimos 7 dias','var(--green)',recentes,'clique no círculo para reabrir',true);
  }
  el.innerHTML=html;
}
function grupoAgendaHTML(k,lbl,cor,ts,dica,fechadoPadrao){
  const chave='ag:'+k;
  const fechado=blocoRecolhido(chave,fechadoPadrao);
  return `<div class="ag-grupo ${fechado?'recolhida':''}" data-g="${k}">
    <div class="ag-head" style="--c:${cor}" onclick="alternarBloco('${chave}',${fechadoPadrao})">
      ${chevron()}<span class="ag-tit">${lbl}</span><span class="ag-ct">${ts.length}</span>
      ${dica?`<span class="ag-dica">${dica}</span>`:''}
    </div>
    <div class="ag-corpo">${ts.map(agRowHTML).join('')}</div>
  </div>`;
}
function rotuloPrazoAgenda(t){
  const h=hojeISO();
  if(t.prazo===h)return 'Hoje';
  if(t.prazo===isoAdd(h,1))return 'Amanhã';
  if(t.prazo<h){const d=diasEntreISO(t.prazo,h);return 'há '+d+' dia'+(d>1?'s':'')+' · '+fmtDataCurta(t.prazo);}
  return fmtDataSem(t.prazo).replace(/\/\d{4}$/,'');
}
// chip de revisão/aprovação: mostra em quem está parado e deixa marcar com um clique
function revChipHTML(t){
  if(!t||!t.revPede||t.status==='concluido'&&!t.revEstado)return '';
  const prox=revProximaAcao(t);
  if(!prox){
    return `<span class="ag-chip rev-ok" title="${esc(revEstadoLbl(t))}"><i class="ti ti-circle-check" style="font-size:11px"></i> ${t.revEstado==='aprovado'?'aprovada':'revisada'}</span>`;
  }
  const quem=revisorDa(t);
  const souEu=EU&&EU.nome===quem;
  const rotulo=prox==='aprovar'?'aprovar':'revisar';
  const dica=souEu?`Clique para marcar como ${prox==='aprovar'?'aprovada':'revisada'}`:`Aguarda ${rotulo} de ${quem}`;
  const onclick=souEu?` onclick="event.stopPropagation();marcarRevisao('${t.id}','${prox}')"` : '';
  return `<span class="ag-chip rev-pend ${souEu?'rev-eu':''}"${onclick} title="${esc(dica)}"><i class="ti ti-eye" style="font-size:11px"></i> ${souEu?rotulo:'p/ '+quem}</span>`;
}
function agRowHTML(t){
  const tp=tipoInfo(t.tipo), cli=nomeCliente(t.cid), p=processoPorId(t.pid), av=corResp(t.resp);
  const done=t.status==='concluido', and=t.status==='andamento';
  const h=hojeISO();
  let prazo;
  if(done){
    const ci=conclusaoInfo(t);
    prazo=`<div class="d" style="color:var(--green-hi)">${esc(ci.txt)}</div>`;
  }else if(!t.prazo){
    prazo=`<input type="date" onchange="definirPrazoRapido('${t.id}',this.value)" title="Defina o prazo desta tarefa">`;
  }else{
    const cls=t.prazo<h?'late':t.prazo===h?'soon':'';
    prazo=`<div class="d ${cls}">${rotuloPrazoAgenda(t)}${t.hora?' · '+esc(t.hora):''}</div>`;
    if(t.prazoFatal){
      const df=diasEntreISO(h,t.prazoFatal);
      prazo+=`<div class="f" title="Prazo fatal do processo">${df<0?'fatal vencido em ':'fatal '}${fmtDataSem(t.prazoFatal).replace(/\/\d{4}$/,'')}${df>=0&&df<=2?' — '+(df===0?'HOJE':df+'d'):''}</div>`;
    }
    if(t.adiamentos)prazo+=`<div class="s" title="Prazo original: ${esc(fmtData(t.prazoOriginal||''))}">adiada ${t.adiamentos}x</div>`;
  }
  const chips=[
    `<span class="ag-tipo"><i style="background:${tp.cor}"></i>${esc(tp.lbl)}</span>`,
    `<span class="ag-av" style="background:${av[0]};color:${av[1]}" title="${esc(t.resp)}">${avatarResp(t.resp)}</span>`,
    revChipHTML(t),
    and?'<span class="ag-chip andamento">em andamento</span>':'',
    t.conferir?`<span class="ag-chip conferir" onclick="abrirModalTarefa('${t.id}',null)" title="Lido automaticamente do DJEN — confira"><i class="ti ti-alert-triangle" style="font-size:11px"></i> conferir</span>`:'',
    p?`<span class="ag-chip proc" onclick="irParaProcesso('${p.id}')" title="${esc(rotuloProcesso(p))}">${esc(p.numCNJ||p.num)}</span>`:'',
    cli?`<span class="ag-chip" onclick="irParaCliente('${t.cid}')">${esc(cli)}</span>`:'',
    t.leadId?`<span class="ag-chip" onclick="abrirLeadDeTarefa('${t.leadId}','${t.leadMod}')"><i class="ti ti-user" style="font-size:11px"></i> lead</span>`:'',
    seloProjeto(t),
  ].join('');
  const acoes=done
    ?`<button class="btn-ico" onclick="abrirModalTarefa('${t.id}',null)" title="Editar"><i class="ti ti-pencil"></i></button>`
    :`<button class="btn-ico" onclick="alternarAndamento('${t.id}')" title="${and?'Voltar para pendente':'Marcar como em andamento'}"><i class="ti ti-${and?'player-pause':'player-play'}"></i></button>
      <span class="ag-menu" id="agm-${t.id}">
        <button class="btn-ico" onclick="event.stopPropagation();abrirMenuAdiar('${t.id}')" title="Adiar"><i class="ti ti-clock-pause"></i></button>
        <span class="ag-menu-pop">
          <div class="nota">O adiamento fica registrado e entra no relatório de cumprimento.</div>
          <button onclick="adiarTarefa('${t.id}','dia')">+1 dia</button>
          <button onclick="adiarTarefa('${t.id}','util')">Próximo dia útil</button>
          <button onclick="adiarTarefa('${t.id}','semana')">+1 semana</button>
          <div class="sep"></div>
          <button onclick="fecharMenusAdiar();abrirModalTarefa('${t.id}',null)">Escolher outra data…</button>
        </span>
      </span>
      <button class="btn-ico" onclick="abrirModalTarefa('${t.id}',null)" title="Editar"><i class="ti ti-pencil"></i></button>`;
  return `<div class="ag-row ${done?'done':''} ${and?'andamento':''}" id="ag-${t.id}">
    <button class="ag-check" onclick="${done?`reabrirTarefa('${t.id}')`:`concluirRapido('${t.id}')`}" title="${done?'Reabrir tarefa':'Concluir'}"><i class="ti ti-check"></i></button>
    <div class="ag-main">
      <div class="ag-tt" onclick="abrirModalTarefa('${t.id}',null)">${esc(t.titulo)}</div>
      <div class="ag-meta">${chips}</div>
    </div>
    <div class="ag-prazo">${prazo}</div>
    <div class="ag-acoes">${acoes}</div>
  </div>`;
}

// ─── AÇÕES RÁPIDAS ────────────────────────────────────────
function concluirRapido(id){
  const t=DB.tarefas.find(x=>x.id===id);if(!t)return;
  const antes={status:t.status,concluidoEm:t.concluidoEm};
  aplicarStatusTarefa(t,'concluido');
  const row=document.getElementById('ag-'+id);
  if(row)row.classList.add('saindo');
  salvarDB();
  setTimeout(refreshUI,220);
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
function abrirMenuAdiar(id){
  const m=document.getElementById('agm-'+id);
  const abrir=m&&!m.classList.contains('open');
  fecharMenusAdiar();
  if(abrir)m.classList.add('open');
}
function fecharMenusAdiar(){document.querySelectorAll('.ag-menu.open').forEach(m=>m.classList.remove('open'))}
document.addEventListener('click',e=>{if(!e.target.closest('.ag-menu'))fecharMenusAdiar();});
function adiarTarefa(id,modo){
  fecharMenusAdiar();
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

// ─── QUADRO POR RESPONSÁVEL (visão anterior) ──────────────
function renderRotinaBoard(pessoa){
  const q=semAcento(rotinaBusca.trim());
  const atividades=DB.tarefas.filter(t=>t.tipo!=='followup'&&tarefaCasaBusca(t,q));
  const board=document.getElementById('rotina-board');
  if(!board)return;
  board.innerHTML=(pessoa&&pessoa!=='todos'?[pessoa]:RESP).map(r=>{
    const av=corResp(r);
    let ts=atividades.filter(t=>t.resp===r);
    if(rotinaFiltro!=='todos')ts=ts.filter(t=>t.status===rotinaFiltro);
    // categorias (tipos de tarefa) presentes, para o filtro por coluna
    const cats=[...new Set(ts.map(t=>tipoInfo(t.tipo).lbl))].sort();
    let catSel=rotinaCat[r]||'todos';
    if(catSel!=='todos'&&!cats.includes(catSel))catSel='todos';
    let tsView=catSel==='todos'?ts:ts.filter(t=>tipoInfo(t.tipo).lbl===catSel);
    tsView.sort((a,b)=>{
      const o={pendente:0,andamento:1,concluido:2};
      if(o[a.status]!==o[b.status])return o[a.status]-o[b.status];
      // concluídas: as mais recentes primeiro (pela data em que foram concluídas)
      if(a.status==='concluido')return (b.concluidoEm||'').localeCompare(a.concluidoEm||'');
      return (a.prazo||'9999')<(b.prazo||'9999')?-1:1;
    });
    const abertas=ts.filter(t=>t.status!=='concluido').length;

    // Com o filtro "Todas", as tarefas já concluídas não são despejadas junto
    // com as abertas: viram um card fechado no fim da coluna, que abre com um
    // clique. Nos filtros específicos (Pendentes, Em andamento, Concluídas) a
    // lista continua inteira, porque ali o usuário já pediu aquele recorte.
    const separarConcluidas=(rotinaFiltro==='todos');
    const emAberto=separarConcluidas?tsView.filter(t=>t.status!=='concluido'):tsView;
    const concluidas=separarConcluidas?tsView.filter(t=>t.status==='concluido'):[];

    const chaveCol='rotina:'+r;
    const colFechada=blocoRecolhido(chaveCol,false);
    const chaveConc='rotina-concluidas:'+r;
    const concFechada=blocoRecolhido(chaveConc,true);

    return `<div class="rot-col ${colFechada?'recolhida':''}">
      <div class="rot-col-head clicavel" onclick="alternarBloco('${chaveCol}',false)" title="${colFechada?'Clique para abrir':'Clique para recolher'}">
        ${chevron()}
        <div class="av" style="background:${av[0]};color:${av[1]}">${avatarResp(r)}</div>
        <span class="nm">${r}</span>
        <span class="ct">${abertas} aberta${abertas!==1?'s':''}</span>
      </div>
      <div class="rot-col-corpo">
        <div style="padding:10px 10px 8px">
          <select onchange="rotinaFiltroCat('${r}',this.value)" style="width:100%;font-size:12px;padding:6px 8px;border-radius:8px;border:1px solid var(--border-hi);background:var(--surface);color:var(--t2)">
            <option value="todos" ${catSel==='todos'?'selected':''}>Todas as categorias</option>
            ${cats.map(cat=>`<option value="${esc(cat)}" ${catSel===cat?'selected':''}>${esc(cat)}</option>`).join('')}
          </select>
        </div>
        <div class="rot-list">
          ${emAberto.length?emAberto.map(taskCard).join(''):'<div class="rot-empty">Nenhuma tarefa em aberto</div>'}
          <button class="btn-nova-tarefa" style="width:100%;justify-content:center;background:transparent;border:1px dashed var(--border-hi);color:var(--t3)" onclick="abrirModalTarefa(null,'${r}')"><i class="ti ti-plus"></i>Adicionar</button>
          ${concluidas.length?`
          <div class="rot-sub ${concFechada?'recolhida':''}">
            <div class="rot-sub-head" onclick="alternarBloco('${chaveConc}',true)" title="${concFechada?'Clique para ver as concluídas':'Clique para recolher'}">
              ${chevron()}<span>Concluídas (${concluidas.length})</span>
            </div>
            <div class="rot-sub-corpo">${concluidas.map(taskCard).join('')}</div>
          </div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
