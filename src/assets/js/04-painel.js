
// ═══════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════
// Card de destaque da tela inicial: o próximo prazo fatal em aberto.
// Fica no topo, antes do calendário, para responder de cara "o que não pode passar".
function renderPrazoFatalHero(){
  const el=document.getElementById('dash-prazo-fatal');
  if(!el)return;
  const hoje=hojeISO();
  const prox=DB.tarefas
    .filter(t=>t.status!=='concluido'&&t.prazoFatal&&t.prazoFatal>=hoje)
    .sort((a,b)=>a.prazoFatal<b.prazoFatal?-1:a.prazoFatal>b.prazoFatal?1:0)[0];
  if(!prox){
    el.innerHTML=`<div class="pf-hero vazio"><div class="pf-ico"><i class="ti ti-shield-check"></i></div>
      <div><div class="pf-lbl">Próximo prazo fatal</div><div class="pf-vazio-txt">Nenhum prazo fatal em aberto. Tudo sob controle.</div></div></div>`;
    return;
  }
  const dd=diasEntreISO(hoje,prox.prazoFatal);
  const p=processoPorId(prox.pid), cli=nomeCliente(prox.cid);
  const ctx=p?esc(rotuloProcesso(p)):(cli?esc(cli):'');
  const urg=dd<=2?'urg':dd<=5?'alerta':'';
  el.innerHTML=`<div class="pf-hero ${urg}" onclick="navegarPara('rotina')" title="Abrir a Rotina">
    <div class="pf-contagem"><span class="pf-num">${dd}</span><span class="pf-dias">${dd===1?'dia':'dias'}</span></div>
    <div class="pf-sep"></div>
    <div class="pf-corpo">
      <div class="pf-lbl">Próximo prazo fatal</div>
      <div class="pf-tit">${esc(prox.titulo)}</div>
      <div class="pf-meta">${ctx?ctx+' · ':''}${fmtDataSem(prox.prazoFatal)}${prox.resp?' · '+esc(prox.resp):''}</div>
    </div>
    <i class="ti ti-chevron-right pf-ir"></i>
  </div>`;
}
// Card da visão geral com o que aguarda a revisão/aprovação do sócio logado.
// Fica logo abaixo do próximo prazo fatal e some quando não há nada pendente.
function renderAprovacoesHero(){
  const el=document.getElementById('dash-aprovar');
  if(!el)return;
  const lista=(typeof tarefasPendentesRevisao==='function'?tarefasPendentesRevisao():[])
    .sort((a,b)=>(a.prazo||'9999')<(b.prazo||'9999')?-1:1);
  if(!lista.length){el.style.display='none';el.innerHTML='';return;}
  el.style.display='';
  el.innerHTML=`<div class="aprov-card">
    <div class="aprov-head"><span class="aprov-tit"><i class="ti ti-eye-check"></i> Para você revisar ou aprovar</span><span class="aprov-ct">${lista.length}</span></div>
    <div class="aprov-lista">${lista.map(aprovRowHTML).join('')}</div>
  </div>`;
}
function aprovRowHTML(t){
  const prox=revProximaAcao(t);
  const cli=nomeCliente(t.cid);
  const pi=prazoInfo(t);
  return `<div class="aprov-row">
    <div class="aprov-main" onclick="abrirModalTarefa('${t.id}',null)">
      <div class="aprov-nm">${esc(t.titulo)}</div>
      <div class="aprov-sub">${esc(t.resp)}${cli?' · '+esc(cli):''} · <span class="prazo-badge ${pi.cls}">${pi.txt}</span></div>
    </div>
    <button class="aprov-btn" onclick="event.stopPropagation();marcarRevisao('${t.id}','${prox}')">${prox==='aprovar'?'Aprovar':'Revisar'}</button>
  </div>`;
}
function renderDashboard(){
  renderPrazoFatalHero();
  renderAprovacoesHero();
  const ativosExt=DB.clientes.filter(c=>c.tipo==='externo'&&c.status==='Ativo');
  const arq=DB.clientes.filter(c=>c.status==='Arquivado');
  const socios=DB.clientes.filter(c=>c.tipo==='pessoal');
  const alcTotal=DB.clientes.reduce((a,c)=>a+clienteAlc(c),0);
  const prevTotal=DB.clientes.reduce((a,c)=>a+clientePrev(c),0);
  const procAtivos=DB.processos.filter(p=>p.status!=='Arquivado').length;
  const procArq=DB.processos.length-procAtivos;

  document.getElementById('dash-stats').innerHTML=`
    <div class="stat-card" data-c="green">
      <div class="stat-label">Clientes ativos</div>
      <div class="stat-val">${ativosExt.length+socios.length}</div>
      <div class="stat-sub">${ativosExt.length} externos · ${socios.length} sócios · ${arq.length} arquivados</div>
    </div>
    <div class="stat-card" data-c="blue" style="cursor:pointer" onclick="navegarPara('processos')" title="Abrir a aba Processos">
      <div class="stat-label">Processos</div>
      <div class="stat-val">${DB.processos.length}</div>
      <div class="stat-sub">${procAtivos} ativos · ${procArq} arquivados</div>
    </div>
    <div class="stat-card" data-c="green">
      <div class="stat-label">Recebido total</div>
      <div class="stat-val">${moneyK(alcTotal)}</div>
      <div class="stat-sub">${money(alcTotal)}</div>
    </div>
    <div class="stat-card" data-c="amber">
      <div class="stat-label">A receber (previsto)</div>
      <div class="stat-val">${moneyK(prevTotal)}</div>
      <div class="stat-sub">${money(prevTotal)}</div>
    </div>`;

  // leads realmente a responder (categoria derivada: exclui os que já avançaram no funil)
  const leadsResp=leads.filter(l=>leadCategoria(l)==='responder').length+leadsCivel.filter(l=>leadCategoria(l)==='responder').length;
  const tarefasAbertas=DB.tarefas.filter(t=>t.status!=='concluido').length;
  document.getElementById('alerts-row').innerHTML=
    (leadsResp?`<div class="alert-pill amber"><div class="alert-dot"></div>${leadsResp} lead${leadsResp>1?'s':''} a responder</div>`:'')+
    `<div class="alert-pill green"><div class="alert-dot"></div>${ativosExt.length+socios.length} clientes ativos · ${procAtivos} processos ativos</div>`+
    (tarefasAbertas?`<div class="alert-pill amber"><div class="alert-dot"></div>${tarefasAbertas} tarefa${tarefasAbertas>1?'s':''} em aberto na rotina</div>`:'')+
    `<div class="alert-pill amber"><div class="alert-dot"></div>${money(prevTotal)} previstos a receber</div>`;

  renderDashMetaContratos();
  renderDashPend(leadsResp);
  renderDesempenho();
  renderFaturamentoChart('dash-faturamento');
  renderCaixa('-dash');

  renderAgendaAudiencias();

  const maiores=DB.clientes.map(c=>({c,v:clienteAlc(c)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,3);
  document.getElementById('dash-fin').innerHTML=`
    <div class="fin-totais">
      <div class="fin-bloco"><div class="fin-label">Recebido</div><div class="fin-val g">${moneyK(alcTotal)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Previsto</div><div class="fin-val a">${moneyK(prevTotal)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Clientes c/ retorno</div><div class="fin-val">${DB.clientes.filter(c=>c.fin.length).length}</div></div>
    </div>
    <div class="fin-rec-label">Maiores retornos</div>
    ${maiores.map(x=>`<div class="fin-item" onclick="irParaCliente('${x.c.id}')">
      <span class="fin-item-nome">${esc(x.c.nome)}</span>
      <div class="fin-item-r"><span class="fin-item-val">${money(x.v)}</span><span class="fin-tipo ft-e">recebido</span></div>
    </div>`).join('')}`;
}

// gráfico de pendências (barras horizontais por tipo)
function renderDashPend(leadsResp){
  const cont={};
  DB.tarefas.filter(t=>t.status!=='concluido'&&t.tipo!=='followup').forEach(t=>{cont[t.tipo]=(cont[t.tipo]||0)+1;});
  cont.lead=(cont.lead||0)+leadsResp;
  const chaves=[...new Set([...tiposTarefa().map(x=>x.key),...Object.keys(cont)])];
  const itens=chaves.map(k=>({k,n:cont[k]||0,...tipoInfo(k)})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
  const el=document.getElementById('dash-pend');
  if(!itens.length){el.innerHTML='<div class="hbar-empty"><i class="ti ti-circle-check"></i>Tudo em dia — nenhuma pendência no escritório.</div>';return;}
  const max=Math.max(...itens.map(x=>x.n));
  el.innerHTML=itens.map(x=>`
    <div class="hbar-row" onclick="navegarPara('${x.k==='lead'?'trab':'rotina'}')">
      <div class="hbar-label">${x.lbl}</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(8,x.n/max*100)}%;background:${x.cor}">${x.n}</div></div>
    </div>`).join('');
}

// gráfico de desempenho (contratos fechados por mês, últimos 12)
function renderDesempenho(){
  const meses=[];const now=new Date();
  for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);meses.push({y:d.getFullYear(),m:d.getMonth(),n:0});}
  contratosFechadosTodos().forEach(x=>{
    const[ay,am]=x.data.split('-').map(Number);
    const alvo=meses.find(m=>m.y===ay&&m.m===(am-1));if(alvo)alvo.n++;
  });
  const max=Math.max(1,...meses.map(x=>x.n));
  const total=meses.reduce((a,x)=>a+x.n,0);
  const nomesM=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  document.getElementById('dash-desempenho').innerHTML=`
    <div class="vchart">
      ${meses.map(x=>`<div class="vcol" style="cursor:pointer" onclick="abrirClientesDoMes(${x.y},${x.m})" title="${x.n} contrato(s) em ${nomesM[x.m]}/${x.y} — clique para ver quais">
        <div class="vcol-num">${x.n||''}</div>
        <div class="vcol-bar" style="height:${x.n/max*100}%"></div>
        <div class="vcol-lbl">${nomesM[x.m]}</div>
      </div>`).join('')}
    </div>
    <div class="vchart-foot"><span>Últimos 12 meses</span><span><b style="color:var(--navy)">${total}</b> contratos fechados</span></div>`;
}
// abre a lista de clientes que entraram num mês específico (clique no gráfico de desempenho)
function abrirClientesDoMes(y,m){
  const nomesM=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const prefixo=y+'-'+String(m+1).padStart(2,'0');
  const doMes=contratosFechadosTodos().filter(x=>x.data.slice(0,7)===prefixo).sort((a,b)=>cmpNome(a.nome,b.nome));
  document.getElementById('cm-titulo').textContent='Contratos fechados em '+nomesM[m]+'/'+y;
  document.getElementById('cm-lista').innerHTML=doMes.length?doMes.map(x=>{
    const id=x.tipo==='contrato'?x.c.id:x.l.id;
    const cr=corDe(id);
    const abrir=x.tipo==='contrato'?`irParaCliente('${x.c.id}')`:`abrirLeadDeTarefa('${x.l.id}','${x.l._mod}')`;
    return `<div class="cli-row" onclick="fecharOverlay('overlay-mescli');${abrir}">
      <div class="cli-av" style="background:${cr[0]};color:${cr[1]};border-color:transparent">${iniciais(x.nome)}</div>
      <div class="cli-info"><div class="cli-nome">${esc(x.nome)}</div><div class="cli-area">${esc(x.titulo)} · ${fmtData(x.data)}</div></div>
      <span class="fin-item-val">${money(x.valor)}</span>
    </div>`;
  }).join(''):'<p style="font-size:13.5px;color:var(--t3);padding:10px 0">Nenhum contrato fechado neste mês.</p>';
  abrirOverlay('overlay-mescli');
}

// mapa mês→receita (soma dos valores recebidos com data), últimos 12 meses
function receitaPorMes(){
  const meses=[];const now=new Date();
  for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);meses.push({y:d.getFullYear(),m:d.getMonth(),v:0});}
  DB.clientes.forEach(c=>c.fin.forEach(f=>{
    if(f.t!=='alc'||!f.dt)return;
    const[ay,am]=f.dt.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));if(alvo)alvo.v+=f.v;
  }));
  return meses;
}
// gráfico de faturamento mensal — reutilizado no dashboard e no financeiro
function renderFaturamentoChart(elId){
  const el=document.getElementById(elId);
  if(!el)return;
  const meses=receitaPorMes();
  const max=Math.max(1,...meses.map(x=>x.v));
  const total=meses.reduce((a,x)=>a+x.v,0);
  const nomesM=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  el.innerHTML=`
    <div class="vchart">
      ${meses.map(x=>`<div class="vcol" style="cursor:pointer" onclick="abrirDetalheMes(${x.y},${x.m})" title="${money(x.v)} em ${nomesM[x.m]}/${x.y} — clique para detalhar">
        <div class="vcol-num">${x.v?moneyK(x.v):''}</div>
        <div class="vcol-bar" style="height:${Math.max(x.v/max*100,x.v>0?3:0)}%"></div>
        <div class="vcol-lbl">${nomesM[x.m]}</div>
      </div>`).join('')}
    </div>
    <div class="vchart-foot"><span>Últimos 12 meses · só com data de recebimento</span><span><b style="color:var(--navy)">${moneyK(total)}</b> faturado</span></div>`;
}
// abre o panorama de um mês específico do faturamento: entradas de clientes + saídas (clique no gráfico)
function abrirDetalheMes(y,m){
  const nomesM=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const prefixo=y+'-'+String(m+1).padStart(2,'0');
  document.getElementById('md-titulo').textContent='Faturamento de '+nomesM[m]+'/'+y;

  const entradas=[];
  DB.clientes.forEach(c=>c.fin.forEach(f=>{if(f.t==='alc'&&f.dt&&f.dt.slice(0,7)===prefixo)entradas.push({cliente:c,f});}));
  entradas.sort((a,b)=>cmpNome(a.cliente.nome,b.cliente.nome)||(b.f.v-a.f.v));

  const saidas=[];
  DB.clientes.forEach(c=>c.fin.forEach(f=>{if(f.t==='saida'&&f.dt&&f.dt.slice(0,7)===prefixo)saidas.push({cliente:c,desc:f.d,valor:f.v,data:f.dt});}));
  (DB.lancamentos||[]).forEach(l=>{if(l.tipo==='saida'&&l.data&&l.data.slice(0,7)===prefixo)saidas.push({cliente:null,desc:l.descricao,valor:l.valor,data:l.data});});
  // saídas de clientes em ordem alfabética; as gerais (sem cliente) no fim
  saidas.sort((a,b)=>{
    if(!!a.cliente!==!!b.cliente)return a.cliente?-1:1;
    if(a.cliente)return cmpNome(a.cliente.nome,b.cliente.nome)||(b.valor-a.valor);
    return b.valor-a.valor;
  });

  const totalEntradas=entradas.reduce((a,x)=>a+x.f.v,0);
  const totalSaidas=saidas.reduce((a,x)=>a+x.valor,0);
  document.getElementById('md-resumo').innerHTML=`
    <div class="fin-totais">
      <div class="fin-bloco"><div class="fin-label">Entradas</div><div class="fin-val g">${money(totalEntradas)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Saídas</div><div class="fin-val" style="color:var(--red-hi)">${money(totalSaidas)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Líquido</div><div class="fin-val">${money(totalEntradas-totalSaidas)}</div></div>
    </div>`;

  document.getElementById('md-entradas').innerHTML=entradas.length?entradas.map(x=>`
    <div class="fin-item" onclick="fecharOverlay('overlay-mesdet');irParaCliente('${x.cliente.id}')">
      <span class="fin-item-nome">${esc(x.cliente.nome)}${x.f.d?' <span style="color:var(--t3)">— '+esc(x.f.d)+'</span>':''}</span>
      <div class="fin-item-r"><span class="fin-item-val">${money(x.f.v)}</span><span style="font-size:11px;color:var(--t3)">${fmtData(x.f.dt)}</span></div>
    </div>`).join(''):'<p style="font-size:12.5px;color:var(--t3)">Nenhuma entrada neste mês.</p>';

  document.getElementById('md-saidas').innerHTML=saidas.length?saidas.map(x=>`
    <div class="fin-item" ${x.cliente?`onclick="fecharOverlay('overlay-mesdet');irParaCliente('${x.cliente.id}')"`:'style="cursor:default"'}>
      <span class="fin-item-nome">${x.cliente?esc(x.cliente.nome)+' — ':''}${esc(x.desc||'')}</span>
      <div class="fin-item-r"><span class="fin-item-val" style="color:var(--red-hi)">${money(x.valor)}</span><span style="font-size:11px;color:var(--t3)">${fmtData(x.data)}</span></div>
    </div>`).join(''):'<p style="font-size:12.5px;color:var(--t3)">Nenhuma saída neste mês.</p>';

  abrirOverlay('overlay-mesdet');
}
