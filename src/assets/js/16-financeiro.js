
// ═══════════════════════════════════════════════════════════
//  FINANCEIRO (VIEW)
// ═══════════════════════════════════════════════════════════
// a tabela abre nos recebidos do mês corrente; "todo o período" é escolha explícita
let finFiltro='alc', finBusca='', finPeriodo='mesAtual';
const PERIODO_LBL={mesAtual:'mês atual',tudo:'todo o período',mes:'últimos 30 dias','3m':'últimos 3 meses','6m':'últimos 6 meses','12m':'últimos 12 meses',ano:'ano atual'};
function filtroFin(f,btn){
  finFiltro=f;
  renderFin();
}
function buscaFin(v){finBusca=v;renderFin();}
function setFinPeriodo(v){
  finPeriodo=v;
  renderFin();
}
// atalho pedido no Financeiro: todos os recebimentos já registrados, sem recorte de mês
function verTodosRecebidos(){
  finFiltro='alc';
  finPeriodo='tudo';
  finBusca='';
  const busca=document.getElementById('fin-search');
  if(busca)busca.value='';
  blocosRecolhidos['fin:honorarios']=false;
  try{localStorage.setItem(LS_RECOLHIDAS,JSON.stringify(blocosRecolhidos))}catch(e){}
  renderFin();
}
// deixa os controles refletindo o estado atual (chips, select e aviso de período)
function sincronizarControlesFin(){
  document.querySelectorAll('#fin-chips .chip[data-f]').forEach(b=>
    b.classList.toggle('active',b.dataset.f===finFiltro));
  const sel=document.getElementById('fin-periodo');
  if(sel)sel.value=finPeriodo;
  const hint=document.getElementById('fin-periodo-hint');
  if(hint)hint.style.display=(finPeriodo==='tudo')?'none':'block';
}
// data do lançamento dentro do período selecionado?
function periodoMatch(dt){
  if(finPeriodo==='tudo')return true;
  if(!dt)return false;
  if(finPeriodo==='mesAtual')return dt.slice(0,7)===hojeISO().slice(0,7);
  const d=new Date(dt), now=new Date();
  if(finPeriodo==='ano')return d.getFullYear()===now.getFullYear();
  const meses={mes:1,'3m':3,'6m':6,'12m':12}[finPeriodo];
  const corte=new Date(now.getFullYear(),now.getMonth()-meses,now.getDate());
  return d>=corte&&d<=now;
}

function renderFin(){
  const ext=DB.clientes.filter(c=>c.tipo==='externo');
  const pes=DB.clientes.filter(c=>c.tipo==='pessoal');
  const alcExt=ext.reduce((a,c)=>a+clienteAlc(c),0), prevExt=ext.reduce((a,c)=>a+clientePrev(c),0);
  const alcPes=pes.reduce((a,c)=>a+clienteAlc(c),0), prevPes=pes.reduce((a,c)=>a+clientePrev(c),0);

  // faturado (recebido) no período selecionado
  let fatPeriodo=0, nFatPeriodo=0;
  DB.clientes.forEach(c=>c.fin.forEach(f=>{if(f.t==='alc'&&periodoMatch(f.dt)){fatPeriodo+=f.v;nFatPeriodo++;}}));
  const nEsquecidos=creditosEsquecidos().length;

  renderFaturamentoChart('fin-faturamento');
  renderCaixa('');
  renderProLabore();
  renderFundoEscritorio();
  renderCustos();
  renderLancamentos();

  document.getElementById('fin-stats').innerHTML=`
    <div class="stat-card" data-c="green">
      <div class="stat-label">Faturado · ${PERIODO_LBL[finPeriodo]}</div>
      <div class="stat-val">${moneyK(fatPeriodo)}</div>
      <div class="stat-sub">${nFatPeriodo} recebimento${nFatPeriodo!==1?'s':''}${finPeriodo!=='tudo'?' com data':''}</div>
    </div>
    <div class="stat-card" data-c="amber">
      <div class="stat-label">A receber (previsto)</div>
      <div class="stat-val">${moneyK(prevExt+prevPes)}</div>
      <div class="stat-sub">${money(prevExt+prevPes)}${nEsquecidos?' · <span style="color:var(--red-hi)">'+nEsquecidos+' esquecido'+(nEsquecidos>1?'s':'')+'</span>':''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Clientes externos</div>
      <div class="stat-val">${moneyK(alcExt)}</div>
      <div class="stat-sub">recebido · previsto ${money(prevExt)}</div>
    </div>
    <div class="stat-card" data-c="blue">
      <div class="stat-label">Demandas pessoais (sócios)</div>
      <div class="stat-val">${moneyK(alcPes)}</div>
      <div class="stat-sub">recebido · previsto ${money(prevPes)}</div>
    </div>`;

  sincronizarControlesFin();
  const painelHon=document.getElementById('hon-panel');
  if(painelHon)painelHon.classList.toggle('recolhida',blocoRecolhido('fin:honorarios',true));

  let rows=[];
  DB.clientes.forEach(c=>c.fin.forEach(f=>rows.push({c,f})));
  const total=rows.length;
  if(finFiltro!=='todos')rows=rows.filter(r=>r.f.t===finFiltro);
  if(finPeriodo!=='tudo')rows=rows.filter(r=>periodoMatch(r.f.dt));
  if(finBusca){
    const q=finBusca.toLowerCase();
    rows=rows.filter(r=>r.c.nome.toLowerCase().includes(q)||r.f.d.toLowerCase().includes(q));
  }
  // ordem alfabética por cliente; dentro do mesmo cliente, maiores valores primeiro
  rows.sort((a,b)=>cmpNome(a.c.nome,b.c.nome)||(b.f.v-a.f.v));
  // cabeçalho do painel: o essencial mesmo com o card fechado
  const FILTRO_LBL={todos:'lançamentos',alc:'recebimentos',prev:'previstos',saida:'saídas'};
  const somaRows=rows.reduce((a,r)=>a+r.f.v,0);
  const badgeH=document.getElementById('hon-badge');
  if(badgeH)badgeH.textContent=rows.length+' '+(rows.length===1?FILTRO_LBL[finFiltro].replace(/s$/,''):FILTRO_LBL[finFiltro]);
  const resumoH=document.getElementById('hon-resumo');
  if(resumoH)resumoH.textContent=PERIODO_LBL[finPeriodo]+' · '+money(somaRows)
    +(rows.length!==total?' · de '+total+' lançamentos registrados':'');

  const el=document.getElementById('fin-rows');
  if(!rows.length){
    el.innerHTML='<div class="fin-empty">Nenhum lançamento em '+PERIODO_LBL[finPeriodo]+' neste filtro.'
      +(finPeriodo!=='tudo'?' Use “Ver todos os recebidos” ou troque o período.':'')+'</div>';
    return;
  }
  el.innerHTML=rows.map(({c,f})=>{
    const cr=corDe(c.id);
    return `<div class="fin-row hoverable" onclick="irParaCliente('${c.id}')" title="Abrir ficha de ${esc(c.curto)}">
      <div class="fin-c-cli">
        <div class="lead-av" style="width:32px;height:32px;font-size:11px;background:${cr[0]};color:${cr[1]}">${iniciais(c.nome)}</div>
        <span class="nm">${esc(c.nome)}</span>
      </div>
      <div class="fin-c-desc">${esc(f.d)}${contratosDe(c).length>1&&contratoDe(c,f.contratoId)?`<span class="ct-chip">${esc(contratoDe(c,f.contratoId).titulo)}</span>`:''}</div>
      <div class="fin-c-data">${f.dt?fmtData(f.dt):'—'}</div>
      <div class="fin-c-tipo"><span class="fin-tipo ${f.t==='alc'?'ft-e':f.t==='saida'?'ft-saida':'ft-a'}">${f.t==='alc'?'recebido':f.t==='saida'?'saída':'previsto'}</span></div>
      <div class="fin-c-val" style="color:${f.t==='saida'?'var(--red-hi)':'inherit'}">${f.t==='saida'?'− ':''}${money(f.v)}</div>
      <div class="fin-c-act row-act">
        <button class="btn-ico ${f.comprovante?'ok':''}" onclick="event.stopPropagation();abrirComprovanteFin('${c.id}','${f.id}')" title="${f.comprovante?'Ver comprovante':'Anexar comprovante (Google Drive)'}"><i class="ti ti-paperclip"></i></button>
        <button class="btn-ico" onclick="event.stopPropagation();abrirModalFin('${c.id}','${f.id}')" title="Editar lançamento"><i class="ti ti-pencil"></i></button>
      </div>
    </div>`;
  }).join('');
}
