// ═══════════════════════════════════════════════════════════
//  ASSESSORIAS — contratos de assessoria mensal
// ═══════════════════════════════════════════════════════════
//  Uma assessoria é um contrato recorrente com um cliente da carteira:
//  o escritório entrega um número combinado de consultas por mês e
//  recebe uma mensalidade. As duas coisas precisam de controle, e são
//  as duas que esta tela mostra lado a lado:
//
//    · COTA E CONSULTAS — quantas consultas o cliente tem direito por
//      mês, quantas já pediu, em que estado está cada uma (aberta, em
//      andamento, concluída) e o que estourou a cota.
//    · PARCELAS — mensalidades com data de vencimento e baixa de
//      pagamento.
//
//  As parcelas NÃO vivem aqui: são lançamentos do próprio cliente
//  (cliente.fin), marcados com assessoriaId. Assim a mensalidade entra
//  no Financeiro, na ficha do cliente e nas metas do mês sem virar um
//  caixa paralelo. O que a assessoria guarda é o vínculo e a data de
//  vencimento original (assessoriaVenc), que não se perde quando o
//  lançamento vira "recebido" e a data passa a ser a do pagamento.
//
//  Campos de DB.assessorias[]:
//    id · cid (cliente) · contratoId · titulo · status · inicio · fim
//    resp · consultasCiclo · acumula · valor · diaVencimento · escopo
//    obs · criadoEm · criadoPor · consultas[]
//  Campos de uma consulta:
//    id · titulo · tipo · solicitante · canal · solicitadoEm
//    competencia (AAAA-MM) · prazo · status · resp · descricao
//    entregaEm · tarefaId
// ═══════════════════════════════════════════════════════════

const ASS_STATUS=['Ativa','Suspensa','Encerrada'];
const TIPOS_CONSULTA=[
  {k:'consulta',  lbl:'Consulta',           cor:'#2f5d94'},
  {k:'parecer',   lbl:'Parecer',            cor:'#16243d'},
  {k:'documento', lbl:'Contrato/documento', cor:'#6b4f9e'},
  {k:'reuniao',   lbl:'Reunião',            cor:'#2f7d3f'},
  {k:'diligencia',lbl:'Diligência',         cor:'#8a93a6'},
  {k:'outro',     lbl:'Outro',              cor:'#828b9c'},
];
const CANAIS_CONSULTA=['WhatsApp','E-mail','Telefone','Reunião','Presencial','Outro'];
const ST_CONSULTA={aberta:'Aberta',andamento:'Em andamento',concluida:'Concluída',cancelada:'Cancelada'};
const MESES_CURTO=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

let assSel=null, assFiltroComp='', assFiltroSt='abertas';

// ─── AJUDANTES ────────────────────────────────────────────
function assessorias(){return Array.isArray(DB.assessorias)?DB.assessorias:(DB.assessorias=[])}
function assessoriaPorId(id){return id?assessorias().find(a=>a.id===id)||null:null}
function assessoriasDoCliente(cid){return assessorias().filter(a=>a.cid===cid)}
function clienteDaAssessoria(a){return a&&a.cid?DB.clientes.find(c=>c.id===a.cid)||null:null}
function tipoConsulta(k){return TIPOS_CONSULTA.find(x=>x.k===k)||TIPOS_CONSULTA[TIPOS_CONSULTA.length-1]}
function compDe(iso){return (iso||'').slice(0,7)}
function compHoje(){return compDe(hojeISO())}
function fmtComp(comp){
  if(!comp||comp.length<7)return '—';
  return MESES_CURTO[(+comp.slice(5,7))-1]+'/'+comp.slice(0,4);
}
function compAdd(comp,n){
  const y=+comp.slice(0,4), m=(+comp.slice(5,7))-1+n;
  const d=new Date(Date.UTC(y,m,1));
  return d.toISOString().slice(0,7);
}
// quantos ciclos mensais já correram desde o início (o mês de início conta como 1)
function ciclosDecorridos(a){
  const ini=compDe(a.inicio)||compHoje();
  const fim=a.fim&&compDe(a.fim)<compHoje()?compDe(a.fim):compHoje();
  const n=(+fim.slice(0,4)-+ini.slice(0,4))*12+(+fim.slice(5,7)-+ini.slice(5,7))+1;
  return Math.max(1,n);
}
function consultasDe(a){return Array.isArray(a.consultas)?a.consultas:(a.consultas=[])}
function consultasValidas(a){return consultasDe(a).filter(c=>c.status!=='cancelada')}
// cota do mês: quantas consultas o cliente tem direito, quantas já usou
function cotaAssessoria(a,comp){
  comp=comp||compHoje();
  const cota=+a.consultasCiclo||0;
  const usadas=consultasValidas(a).filter(c=>c.competencia===comp).length;
  return {comp,cota,usadas,
    saldo:cota?cota-usadas:null,
    excedente:cota?Math.max(0,usadas-cota):0};
}
// saldo acumulado: só vale quando a assessoria acumula o que não foi usado
function saldoAcumuladoAss(a){
  if(!a.acumula||!(+a.consultasCiclo))return null;
  return (+a.consultasCiclo)*ciclosDecorridos(a)-consultasValidas(a).length;
}
// valor em texto para os campos de formulário (2500 → "2.500,00")
function numBR(v){return (+v||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}
// vencimento da parcela: enquanto está em aberto vale a data do lançamento (que
// o modal de financeiro pode corrigir); depois de paga, a data vira a do
// pagamento, então vale o vencimento original guardado na parcela
function vencParcela(f){return f.t==='alc'?(f.assessoriaVenc||f.dt||''):(f.dt||f.assessoriaVenc||'')}
function parcelasDaAssessoria(a){
  const c=clienteDaAssessoria(a);
  if(!c||!Array.isArray(c.fin))return [];
  return c.fin.filter(f=>f.assessoriaId===a.id)
    .sort((x,y)=>(vencParcela(x)||'9999').localeCompare(vencParcela(y)||'9999'));
}
function statusParcela(f){
  if(f.t==='alc')return 'paga';
  const v=vencParcela(f);
  return v&&v<hojeISO()?'vencida':'aberta';
}
function parcelasVencidas(){
  let n=0,v=0;
  assessorias().forEach(a=>parcelasDaAssessoria(a).forEach(f=>{
    if(statusParcela(f)==='vencida'){n++;v+=f.v||0;}
  }));
  return {n,v};
}
function consultasAbertas(a){return consultasDe(a).filter(c=>c.status==='aberta'||c.status==='andamento')}

// ─── TELA ─────────────────────────────────────────────────
function renderAssessorias(){
  const lista=assessorias();
  if(assSel&&!assessoriaPorId(assSel))assSel=null;
  if(!assSel&&lista.length)assSel=lista[0].id;
  renderAssStats(lista);
  renderAssLista(lista);
  renderAssDetalhe();
  atualizarBadgeAssessorias();
}
function atualizarBadgeAssessorias(){
  const b=document.getElementById('nav-assessorias-badge');
  if(!b)return;
  const {n}=parcelasVencidas();
  b.textContent=n;
  b.style.display=n?'':'none';
}
function renderAssStats(lista){
  const el=document.getElementById('ass-stats');
  if(!el)return;
  const ativas=lista.filter(a=>a.status==='Ativa');
  const comp=compHoje();
  let cota=0,usadas=0,andamento=0;
  ativas.forEach(a=>{
    const k=cotaAssessoria(a,comp);
    cota+=k.cota;usadas+=k.usadas;
    andamento+=consultasDe(a).filter(c=>c.status==='andamento').length;
  });
  let aberto=0,vencido=0,nVenc=0,mensal=0;
  lista.forEach(a=>{
    if(a.status==='Ativa')mensal+=+a.valor||0;
    parcelasDaAssessoria(a).forEach(f=>{
      const s=statusParcela(f);
      if(s!=='paga')aberto+=f.v||0;
      if(s==='vencida'){vencido+=f.v||0;nVenc++;}
    });
  });
  const pct=cota?Math.min(100,Math.round(usadas/cota*100)):0;
  const box=(c,l,v,s,extra)=>`<div class="ass-num" style="--c:${c}"><div class="l">${l}</div><div class="v">${v}</div>${extra||''}<div class="s">${s}</div></div>`;
  el.innerHTML=
    box('var(--navy)','Assessorias ativas',ativas.length,
      mensal?money(mensal)+' por mês':'sem mensalidade informada')+
    box('var(--blue)','Consultas em '+fmtComp(comp),cota?usadas+' / '+cota:usadas,
      cota?(usadas>cota?(usadas-cota)+' além da cota':(cota-usadas)+' ainda disponíveis'):'sem cota definida',
      cota?`<div class="barra"><i style="width:${pct}%;background:${usadas>cota?'var(--red)':'var(--blue)'}"></i></div>`:'')+
    box('var(--amber)','Em andamento',andamento,andamento?'consultas já iniciadas':'nenhuma consulta em execução')+
    box(nVenc?'var(--red)':'var(--green)','A receber',money(aberto),
      nVenc?nVenc+' parcela'+(nVenc>1?'s':'')+' vencida'+(nVenc>1?'s':'')+' · '+money(vencido):'nenhuma parcela vencida');
}
function renderAssLista(lista){
  const el=document.getElementById('ass-lista');
  if(!el)return;
  const ordenada=[...lista].sort((a,b)=>{
    const o={Ativa:0,Suspensa:1,Encerrada:2};
    if(o[a.status]!==o[b.status])return (o[a.status]??3)-(o[b.status]??3);
    return cmpNome(nomeCliente(a.cid)||a.titulo,nomeCliente(b.cid)||b.titulo);
  });
  const itens=ordenada.map(a=>{
    const c=clienteDaAssessoria(a), k=cotaAssessoria(a), ab=consultasAbertas(a).length;
    const venc=parcelasDaAssessoria(a).filter(f=>statusParcela(f)==='vencida').length;
    return `<button type="button" class="ass-item ${assSel===a.id?'on':''}" onclick="abrirAssessoria('${a.id}')">
      <div class="l1"><span class="nome">${esc(c?(c.curto||c.nome):'Cliente removido')}</span>
        <span class="ass-tag ${a.status.toLowerCase()}" style="margin-left:auto">${a.status}</span></div>
      <div class="l2">${esc(a.titulo||'Assessoria mensal')}${a.valor?' · '+money(a.valor)+'/mês':''}</div>
      <div class="l3">${medidorCotaHTML(k)}
        ${ab?`<span class="ass-tag">${ab} em aberto</span>`:''}
        ${venc?`<span class="ass-tag alerta"><i class="ti ti-alert-triangle"></i>${venc} vencida${venc>1?'s':''}</span>`:''}</div>
    </button>`;
  }).join('');
  el.innerHTML=`<div class="ass-lista-head"><b>Contratos</b><span class="n">${lista.length}</span>
      <button class="btn-nova-tarefa" onclick="abrirModalAssessoria(null)"><i class="ti ti-plus"></i>Nova</button></div>`
    +(itens||`<div class="ass-vazio"><i class="ti ti-briefcase"></i>Nenhuma assessoria cadastrada.<br>Clique em <b>Nova</b> para incluir a primeira.</div>`);
}
// medidor de cota: um tracinho por consulta contratada; o que passou fica vermelho
function medidorCotaHTML(k){
  if(!k.cota)return `<span class="cota"><span class="txt">${k.usadas} consulta${k.usadas===1?'':'s'} no mês</span></span>`;
  const traco=[];
  for(let i=0;i<k.cota;i++)traco.push(`<i class="${i<k.usadas?'usada':''}"></i>`);
  for(let i=0;i<k.excedente;i++)traco.push('<i class="extra"></i>');
  return `<span class="cota" title="${k.usadas} de ${k.cota} consultas usadas em ${fmtComp(k.comp)}">${traco.join('')}
    <span class="txt">${k.usadas}/${k.cota}</span></span>`;
}

function renderAssDetalhe(){
  const el=document.getElementById('ass-det');
  if(!el)return;
  const a=assessoriaPorId(assSel);
  if(!a){
    el.innerHTML=`<div class="ass-bloco"><div class="ass-vazio" style="padding:54px 24px">
      <i class="ti ti-briefcase"></i>
      <b style="display:block;font-size:15px;color:var(--t);margin-bottom:6px">Nenhuma assessoria cadastrada</b>
      Cadastre o contrato de assessoria mensal para controlar as consultas entregues e as parcelas da mensalidade.<br><br>
      <button class="btn-nova-tarefa" onclick="abrirModalAssessoria(null)"><i class="ti ti-plus"></i>Nova assessoria</button>
    </div></div>`;
    return;
  }
  const c=clienteDaAssessoria(a);
  const comp=assFiltroComp||compHoje();
  const k=cotaAssessoria(a,comp);
  const acum=saldoAcumuladoAss(a);
  const andamento=consultasDe(a).filter(x=>x.status==='andamento').length;
  const parcelas=parcelasDaAssessoria(a);
  let aberto=0,vencido=0,nVenc=0,pago=0;
  parcelas.forEach(f=>{
    const s=statusParcela(f);
    if(s==='paga')pago+=f.v||0;else aberto+=f.v||0;
    if(s==='vencida'){vencido+=f.v||0;nVenc++;}
  });
  const pct=k.cota?Math.min(100,Math.round(k.usadas/k.cota*100)):0;

  const capa=`<div class="ass-capa">
    <div class="tx">
      <div class="k">Assessoria mensal</div>
      <h2>${esc(a.titulo||'Assessoria jurídica mensal')}</h2>
      ${c?`<span class="cli" onclick="irParaCliente('${c.id}')"><i class="ti ti-user"></i>${esc(c.nome)}<i class="ti ti-external-link" style="font-size:13px"></i></span>`
        :'<span class="cli">Cliente removido do sistema</span>'}
      <div class="meta">
        <span><i class="ti ti-circle-dot" style="font-size:14px"></i>${esc(a.status)}</span>
        ${a.valor?`<span><i class="ti ti-cash" style="font-size:14px"></i>${money(a.valor)} por mês${a.diaVencimento?' · vence dia '+a.diaVencimento:''}</span>`:''}
        ${a.consultasCiclo?`<span><i class="ti ti-messages" style="font-size:14px"></i>${a.consultasCiclo} consulta${a.consultasCiclo>1?'s':''} por mês${a.acumula?' · acumula saldo':''}</span>`:''}
        ${a.resp?`<span><i class="ti ti-user-check" style="font-size:14px"></i>${esc(a.resp)}</span>`:''}
        ${a.inicio?`<span><i class="ti ti-calendar" style="font-size:14px"></i>desde ${esc(fmtData(a.inicio))}</span>`:''}
      </div>
    </div>
    <div class="acoes">
      <button class="ab forte" onclick="abrirModalConsulta('${a.id}',null)"><i class="ti ti-plus"></i>Registrar consulta</button>
      <button class="ab" onclick="abrirModalParcelas('${a.id}')"><i class="ti ti-receipt"></i>Gerar parcelas</button>
      <button class="ab" onclick="abrirModalAssessoria('${a.id}')"><i class="ti ti-pencil"></i>Editar</button>
    </div>
  </div>`;

  const nums=`<div class="ass-nums">
    <div class="ass-num" style="--c:var(--blue)">
      <div class="l">Consultas em ${fmtComp(comp)}</div>
      <div class="v">${k.cota?k.usadas+' / '+k.cota:k.usadas}</div>
      ${k.cota?`<div class="barra"><i style="width:${pct}%;background:${k.excedente?'var(--red)':'var(--blue)'}"></i></div>`:''}
      <div class="s">${k.cota?(k.excedente?k.excedente+' além do contratado':(k.saldo)+' ainda disponíveis'):'cota não definida'}${acum!==null?' · saldo acumulado '+acum:''}</div>
    </div>
    <div class="ass-num" style="--c:var(--amber)">
      <div class="l">Em aberto</div><div class="v">${consultasAbertas(a).length}</div>
      <div class="s">${andamento} em andamento · ${consultasAbertas(a).length-andamento} aguardando início</div>
    </div>
    <div class="ass-num" style="--c:${nVenc?'var(--red)':'var(--navy)'}">
      <div class="l">A receber</div><div class="v">${money(aberto)}</div>
      <div class="s">${nVenc?nVenc+' parcela'+(nVenc>1?'s':'')+' vencida'+(nVenc>1?'s':'')+' · '+money(vencido):parcelas.length?'nenhuma parcela vencida':'nenhuma parcela gerada'}</div>
    </div>
    <div class="ass-num" style="--c:var(--green)">
      <div class="l">Já recebido</div><div class="v">${money(pago)}</div>
      <div class="s">${parcelas.filter(f=>f.t==='alc').length} de ${parcelas.length} parcela${parcelas.length===1?'':'s'} paga${parcelas.filter(f=>f.t==='alc').length===1?'':'s'}</div>
    </div>
  </div>`;

  el.innerHTML=capa+nums+blocoConsultasHTML(a)+blocoParcelasHTML(a,parcelas)+blocoEscopoHTML(a);
}

// ─── CONSULTAS E PEDIDOS ──────────────────────────────────
function blocoConsultasHTML(a){
  const todas=consultasDe(a);
  // meses presentes + o mês corrente, para o seletor de competência
  const comps=[...new Set(todas.map(c=>c.competencia).filter(Boolean).concat([compHoje()]))].sort().reverse();
  let lista=[...todas];
  if(assFiltroComp)lista=lista.filter(c=>c.competencia===assFiltroComp);
  if(assFiltroSt==='abertas')lista=lista.filter(c=>c.status==='aberta'||c.status==='andamento');
  else if(assFiltroSt==='concluidas')lista=lista.filter(c=>c.status==='concluida');
  lista.sort((x,y)=>{
    const o={andamento:0,aberta:1,concluida:2,cancelada:3};
    if(o[x.status]!==o[y.status])return o[x.status]-o[y.status];
    return (y.solicitadoEm||'').localeCompare(x.solicitadoEm||'');
  });
  const hoje=hojeISO();
  // posição da consulta dentro da própria competência: deixa visível qual foi a
  // 5ª de um mês que contratou 4 (essa aparece em vermelho, fora da cota)
  const ordem={};
  [...todas].filter(c=>c.status!=='cancelada')
    .sort((x,y)=>(x.solicitadoEm||'').localeCompare(y.solicitadoEm||''))
    .forEach(c=>{
      const cp=c.competencia||'';
      ordem[c.id]=(ordem['#'+cp]=(ordem['#'+cp]||0)+1);
    });
  const linhas=lista.map(cs=>{
    const tp=tipoConsulta(cs.tipo), feita=cs.status==='concluida'||cs.status==='cancelada';
    const atrasada=!feita&&cs.prazo&&cs.prazo<hoje;
    const sub=[cs.solicitante,cs.canal,cs.competencia?'competência '+fmtComp(cs.competencia):''].filter(Boolean).join(' · ');
    let data;
    if(cs.status==='concluida')data=`<b style="color:var(--green-hi)">entregue ${esc(fmtDataCurta(cs.entregaEm||cs.solicitadoEm))}</b><span>pedida em ${esc(fmtDataCurta(cs.solicitadoEm))}</span>`;
    else if(cs.prazo)data=`<b class="${atrasada?'late':''}">${atrasada?'venceu '+fmtDataCurta(cs.prazo):'até '+fmtDataCurta(cs.prazo)}</b><span>pedida em ${esc(fmtDataCurta(cs.solicitadoEm))}</span>`;
    else data=`<b>${esc(fmtDataCurta(cs.solicitadoEm))}</b><span>sem prazo</span>`;
    const pos=ordem[cs.id]||0;
    const fora=!!(a.consultasCiclo&&pos>a.consultasCiclo);
    return `<div class="cs-row ${feita?'feita':''}">
      <span class="cs-n ${fora?'fora':''}" title="${pos?pos+'ª consulta de '+fmtComp(cs.competencia||''):'cancelada'}${fora?' — além da cota de '+a.consultasCiclo:''}">${pos||'—'}</span>
      <span class="cs-tt"><b>${esc(cs.titulo)}</b>${sub?`<span>${esc(sub)}</span>`:''}</span>
      <span class="cs-tipo" style="--c:${tp.cor}"><i></i><span>${esc(tp.lbl)}</span></span>
      <button class="cs-st ${cs.status}" onclick="cicloConsulta('${a.id}','${cs.id}')" title="Clique para avançar o estado">${ST_CONSULTA[cs.status]||cs.status}</button>
      <span class="cs-data">${data}</span>
      <span class="cs-acoes">
        ${cs.tarefaId?`<button class="btn-ico" onclick="irParaTarefaDaConsulta('${cs.tarefaId}')" title="Abrir a tarefa na Rotina"><i class="ti ti-checklist"></i></button>`
          :`<button class="btn-ico" onclick="criarTarefaDaConsulta('${a.id}','${cs.id}')" title="Criar tarefa na Rotina"><i class="ti ti-subtask"></i></button>`}
        <button class="btn-ico" onclick="abrirModalConsulta('${a.id}','${cs.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
      </span>
    </div>`;
  }).join('');
  const k=cotaAssessoria(a,assFiltroComp||compHoje());
  return `<div class="ass-bloco">
    <div class="ass-bloco-head">
      <h3>Consultas e pedidos</h3>
      <span class="sub">o que o cliente pediu e em que pé está</span>
      <div class="dir">
        <select onchange="assMudarComp(this.value)" title="Competência">
          <option value="">Todas as competências</option>
          ${comps.map(cp=>`<option value="${cp}" ${assFiltroComp===cp?'selected':''}>${fmtComp(cp)}</option>`).join('')}
        </select>
        <select onchange="assMudarStatus(this.value)" title="Situação">
          <option value="abertas" ${assFiltroSt==='abertas'?'selected':''}>Em aberto</option>
          <option value="concluidas" ${assFiltroSt==='concluidas'?'selected':''}>Concluídas</option>
          <option value="todas" ${assFiltroSt==='todas'?'selected':''}>Todas</option>
        </select>
        <button class="btn-nova-tarefa" onclick="abrirModalConsulta('${a.id}',null)"><i class="ti ti-plus"></i>Registrar</button>
      </div>
    </div>
    ${linhas||`<div class="ass-bloco-vazio">${todas.length?'Nenhuma consulta neste recorte.':'Nenhuma consulta registrada ainda. Clique em <b>Registrar</b> quando o cliente pedir a primeira.'}</div>`}
    <div class="ass-rodape">
      <span>Em ${fmtComp(k.comp)}: <b>${k.usadas}</b> usada${k.usadas===1?'':'s'}${k.cota?' de <b>'+k.cota+'</b> contratadas':''}</span>
      ${k.cota?(k.excedente?`<span class="ass-tag alerta"><i class="ti ti-alert-triangle"></i>${k.excedente} além da cota</span>`
        :`<span class="ass-tag cota">${k.saldo} ainda disponível${k.saldo===1?'':'is'}</span>`):''}
      <span style="margin-left:auto">Total no contrato: <b>${consultasValidas(a).length}</b> consulta${consultasValidas(a).length===1?'':'s'}</span>
    </div>
  </div>`;
}
function assMudarComp(v){assFiltroComp=v;renderAssDetalhe();}
function assMudarStatus(v){assFiltroSt=v;renderAssDetalhe();}
function abrirAssessoria(id){assSel=id;assFiltroComp='';renderAssessorias();}
// aberta → em andamento → concluída → aberta
function cicloConsulta(aid,cid){
  const a=assessoriaPorId(aid);
  const cs=a&&consultasDe(a).find(x=>x.id===cid);
  if(!cs)return;
  const ordem=['aberta','andamento','concluida'];
  const i=ordem.indexOf(cs.status);
  cs.status=ordem[(i+1)%ordem.length];
  cs.entregaEm=cs.status==='concluida'?(cs.entregaEm||hojeISO()):'';
  // a tarefa vinculada acompanha o estado da consulta
  if(cs.tarefaId){
    const t=DB.tarefas.find(x=>x.id===cs.tarefaId);
    if(t)aplicarStatusTarefa(t,cs.status==='concluida'?'concluido':cs.status==='andamento'?'andamento':'pendente');
  }
  salvarDB();refreshUI();
  if(typeof mostrarToast==='function')mostrarToast(cs.titulo+' · '+ST_CONSULTA[cs.status].toLowerCase());
}
// a consulta vira uma tarefa da Rotina, com o prazo combinado
function criarTarefaDaConsulta(aid,cid){
  const a=assessoriaPorId(aid);
  const cs=a&&consultasDe(a).find(x=>x.id===cid);
  if(!cs)return;
  const c=clienteDaAssessoria(a);
  const t={id:uid(),
    titulo:'Assessoria — '+cs.titulo,
    resp:cs.resp||a.resp||(EU&&RESP.includes(EU.nome)?EU.nome:RESP[0]),
    tipo:cs.tipo==='reuniao'?'outro':cs.tipo==='diligencia'?'diligencia':'outro',
    cid:a.cid||null, prazo:cs.prazo||'', hora:'',
    status:cs.status==='andamento'?'andamento':'pendente', concluidoEm:'',
    criadoEm:Date.now(), criadoPor:EU?EU.nome:'', assessoriaId:a.id, consultaId:cs.id};
  DB.tarefas.push(t);
  cs.tarefaId=t.id;
  salvarDB();refreshUI();
  if(typeof mostrarToast==='function')mostrarToast('Tarefa criada na Rotina para '+t.resp+(c?' · '+c.curto:''),'Abrir',()=>irParaTarefaDaConsulta(t.id));
}
function irParaTarefaDaConsulta(tid){
  const t=DB.tarefas.find(x=>x.id===tid);
  if(!t){alert('A tarefa vinculada a esta consulta não existe mais.');return;}
  navegarPara('rotina');
  if(typeof mudarVisaoRotina==='function')mudarVisaoRotina('mesa');
  if(typeof selecionarTarefaRotina==='function'&&rotSel!==tid)selecionarTarefaRotina(tid);
}

// ─── PARCELAS ─────────────────────────────────────────────
function blocoParcelasHTML(a,parcelas){
  const hoje=hojeISO();
  const linhas=parcelas.map(f=>{
    const st=statusParcela(f);
    const venc=vencParcela(f);
    const dias=venc&&st!=='paga'?diasEntreISO(venc,hoje):0;
    return `<div class="pc-row">
      <span class="pc-tt"><b>${esc(f.d)}</b><span>${f.assessoriaComp?'competência '+fmtComp(f.assessoriaComp):''}${f.t==='alc'&&f.dt?' · pago em '+fmtData(f.dt):''}</span></span>
      <span class="pc-venc ${st==='vencida'?'late':''}">${venc?esc(fmtData(venc)):'—'}
        <small>${st==='vencida'?'há '+dias+' dia'+(dias>1?'s':''):st==='paga'?'vencimento':venc?'a vencer':''}</small></span>
      <span class="pc-val">${money(f.v)}</span>
      ${st==='paga'
        ? `<span class="pc-st paga"><i class="ti ti-check"></i>Paga</span>`
        : `<button class="pc-st ${st}" onclick="baixarParcela('${a.id}','${f.id}')" title="Marcar como paga hoje"><i class="ti ti-${st==='vencida'?'alert-triangle':'clock'}"></i>${st==='vencida'?'Vencida':'Em aberto'}</button>`}
      <span class="pc-acoes">
        ${st==='paga'?`<button class="btn-ico" onclick="reabrirParcela('${a.id}','${f.id}')" title="Desfazer a baixa"><i class="ti ti-arrow-back-up"></i></button>`:''}
        <button class="btn-ico" onclick="abrirModalFin('${a.cid}','${f.id}')" title="Editar lançamento"><i class="ti ti-pencil"></i></button>
        <button class="btn-ico" onclick="excluirParcela('${a.id}','${f.id}')" title="Excluir parcela"><i class="ti ti-trash"></i></button>
      </span>
    </div>`;
  }).join('');
  const prox=parcelas.filter(f=>statusParcela(f)!=='paga')[0];
  return `<div class="ass-bloco">
    <div class="ass-bloco-head">
      <h3>Financeiro da assessoria</h3>
      <span class="sub">mensalidades · os lançamentos são os mesmos da ficha do cliente</span>
      <div class="dir">
        <button class="btn-nova-tarefa" onclick="abrirModalParcelas('${a.id}')"><i class="ti ti-plus"></i>Gerar parcelas</button>
      </div>
    </div>
    ${linhas||`<div class="ass-bloco-vazio">Nenhuma parcela gerada. Clique em <b>Gerar parcelas</b> para lançar as mensalidades com data de vencimento.</div>`}
    ${parcelas.length?`<div class="ass-rodape">
      ${prox?`<span>Próxima parcela: <b>${esc(fmtDataSem(vencParcela(prox)))}</b> · ${money(prox.v)}</span>`:'<span>Todas as parcelas estão pagas.</span>'}
      <span style="margin-left:auto">${parcelas.length} parcela${parcelas.length>1?'s':''} · total ${money(parcelas.reduce((s,f)=>s+(f.v||0),0))}</span>
    </div>`:''}
  </div>`;
}
function baixarParcela(aid,fid){
  const a=assessoriaPorId(aid), c=clienteDaAssessoria(a);
  const f=c&&c.fin.find(x=>x.id===fid);
  if(!f)return;
  const venc=vencParcela(f);
  if(!confirm('Marcar "'+f.d+'" ('+fmt(f.v)+') como PAGA hoje?'+(venc?'\n\nVencimento: '+fmtData(venc):'')))return;
  f.t='alc';f.dt=hojeISO();
  salvarDB();refreshUI();
  if(typeof avisarFundoEscritorio==='function')avisarFundoEscritorio(f.v);
}
function reabrirParcela(aid,fid){
  const a=assessoriaPorId(aid), c=clienteDaAssessoria(a);
  const f=c&&c.fin.find(x=>x.id===fid);
  if(!f)return;
  f.t='prev';f.dt=f.assessoriaVenc||f.dt;
  salvarDB();refreshUI();
}
function excluirParcela(aid,fid){
  const a=assessoriaPorId(aid), c=clienteDaAssessoria(a);
  const f=c&&c.fin.find(x=>x.id===fid);
  if(!f)return;
  if(!confirm('Excluir a parcela "'+f.d+'" ('+fmt(f.v)+')?\n\nO lançamento sai também da ficha do cliente e do Financeiro.'))return;
  c.fin=c.fin.filter(x=>x.id!==fid);
  salvarDB();refreshUI();
}

// ─── ESCOPO ───────────────────────────────────────────────
function blocoEscopoHTML(a){
  if(!a.escopo&&!a.obs)return '';
  return `<div class="ass-bloco">
    <div class="ass-bloco-head"><h3>Escopo e observações</h3><span class="sub">o que está incluído no contrato</span></div>
    ${a.escopo?`<div class="ass-texto">${esc(a.escopo)}</div>`:''}
    ${a.obs?`<div class="ass-texto" style="border-top:${a.escopo?'1px solid var(--border)':'none'};color:var(--t3)">${esc(a.obs)}</div>`:''}
  </div>`;
}

// ─── MODAL: ASSESSORIA ────────────────────────────────────
let maCtx={id:null,status:'Ativa',acumula:false};
function abrirModalAssessoria(id){
  const a=assessoriaPorId(id);
  maCtx={id:id||null,status:a?a.status:'Ativa',acumula:a?!!a.acumula:false};
  document.getElementById('ma-titulo').textContent=a?'Editar assessoria':'Nova assessoria';
  const sel=document.getElementById('ma-cliente');
  const ativos=ordenarPorNome(DB.clientes.filter(c=>c.status!=='Arquivado'||(a&&a.cid===c.id)));
  sel.innerHTML='<option value="">Selecione o cliente…</option>'+ativos.map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  sel.value=a?a.cid||'':'';
  sel.disabled=!!a;   // trocar o cliente levaria junto as parcelas; melhor criar outra
  const resp=document.getElementById('ma-resp');
  resp.innerHTML=RESP.map(r=>`<option>${esc(r)}</option>`).join('');
  resp.value=a?(a.resp||RESP[0]):(EU&&RESP.includes(EU.nome)?EU.nome:RESP[0]);
  document.getElementById('ma-objeto').value=a?a.titulo||'':'Assessoria jurídica mensal';
  document.getElementById('ma-inicio').value=a?a.inicio||'':hojeISO();
  document.getElementById('ma-fim').value=a?a.fim||'':'';
  document.getElementById('ma-consultas').value=a?(a.consultasCiclo||''):4;
  document.getElementById('ma-valor').value=a&&a.valor?numBR(a.valor):'';
  document.getElementById('ma-dia').value=a?(a.diaVencimento||''):10;
  document.getElementById('ma-escopo').value=a?a.escopo||'':'';
  document.getElementById('ma-obs').value=a?a.obs||'':'';
  document.getElementById('ma-del').style.display=a?'':'none';
  maStatus(maCtx.status);maAcumula(maCtx.acumula);
  abrirOverlay('overlay-assessoria');
  setTimeout(()=>{(a?document.getElementById('ma-objeto'):sel).focus()},40);
}
function maStatus(s){
  maCtx.status=s;
  ASS_STATUS.forEach(x=>{
    const b=document.getElementById('ma-st-'+x.toLowerCase());
    if(b)b.classList.toggle('on',x===s);
  });
}
function maAcumula(v){
  maCtx.acumula=!!v;
  document.getElementById('ma-ac-sim').classList.toggle('on',maCtx.acumula);
  document.getElementById('ma-ac-nao').classList.toggle('on',!maCtx.acumula);
}
function salvarAssessoria(){
  const cid=document.getElementById('ma-cliente').value;
  const titulo=document.getElementById('ma-objeto').value.trim();
  if(!cid){alert('Escolha o cliente da assessoria.\n\nSe ele ainda não está cadastrado, cadastre-o antes em Clientes.');return;}
  if(!titulo){alert('Informe o objeto do contrato (ex.: Assessoria jurídica mensal).');return;}
  const valorTxt=document.getElementById('ma-valor').value.trim();
  const valor=valorTxt?parseValor(valorTxt):0;
  if(valorTxt&&!(valor>0)){alert('Valor mensal inválido (ex.: 2.500,00). Deixe em branco se ainda não houver valor fechado.');return;}
  const dia=+document.getElementById('ma-dia').value||0;
  if(dia&&(dia<1||dia>31)){alert('O dia de vencimento precisa estar entre 1 e 31.');return;}
  const dados={
    cid, titulo, status:maCtx.status,
    inicio:document.getElementById('ma-inicio').value,
    fim:document.getElementById('ma-fim').value,
    resp:document.getElementById('ma-resp').value,
    consultasCiclo:+document.getElementById('ma-consultas').value||0,
    acumula:maCtx.acumula, valor, diaVencimento:dia,
    escopo:document.getElementById('ma-escopo').value.trim(),
    obs:document.getElementById('ma-obs').value.trim(),
  };
  const a=assessoriaPorId(maCtx.id);
  if(a){
    Object.assign(a,dados);
  }else{
    const nova={id:uid(),...dados,contratoId:null,consultas:[],criadoEm:Date.now(),criadoPor:EU?EU.nome:''};
    // a assessoria também vira um contrato do cliente: assim os lançamentos
    // das mensalidades ficam separados dos honorários dos processos
    const c=DB.clientes.find(x=>x.id===cid);
    if(c){
      if(!Array.isArray(c.contratos))c.contratos=[];
      const ct=novoContrato({titulo,inicio:dados.inicio,status:dados.status==='Encerrada'?'Encerrado':'Ativo',
        obs:'Assessoria mensal'+(valor?' · '+fmt(valor)+'/mês':'')});
      c.contratos.push(ct);
      nova.contratoId=ct.id;
      if(dados.status==='Ativa'&&c.status==='Arquivado')c.status='Ativo';
    }
    assessorias().push(nova);
    assSel=nova.id;
  }
  salvarDB();
  fecharOverlay('overlay-assessoria');
  navegarPara('assessorias');
  refreshUI();
}
function excluirAssessoria(){
  const a=assessoriaPorId(maCtx.id);
  if(!a)return;
  const parcelas=parcelasDaAssessoria(a);
  if(!confirm('Excluir a assessoria "'+(a.titulo||'')+'"?\n\n'
    +'  · '+consultasDe(a).length+' consulta(s) registrada(s)\n'
    +'  · '+parcelas.length+' parcela(s) no financeiro do cliente\n\n'
    +'As parcelas continuam na ficha do cliente; só perdem o vínculo com a assessoria.\n'
    +'Se o contrato apenas acabou, prefira mudar o status para "Encerrada".'))return;
  parcelas.forEach(f=>{delete f.assessoriaId;});
  DB.assessorias=assessorias().filter(x=>x.id!==a.id);
  assSel=null;
  salvarDB();
  fecharOverlay('overlay-assessoria');
  refreshUI();
}

// ─── MODAL: CONSULTA ──────────────────────────────────────
let mcoCtx={aid:null,id:null,status:'aberta'};
function abrirModalConsulta(aid,cid){
  const a=assessoriaPorId(aid);
  if(!a)return;
  const cs=cid?consultasDe(a).find(x=>x.id===cid):null;
  mcoCtx={aid,id:cid||null,status:cs?cs.status:'aberta'};
  document.getElementById('mco-titulo').textContent=cs?'Editar consulta':'Registrar consulta';
  document.getElementById('mco-cliente-nome').textContent=nomeCliente(a.cid)||'—';
  const tp=document.getElementById('mco-tipo');
  tp.innerHTML=TIPOS_CONSULTA.map(t=>`<option value="${t.k}">${esc(t.lbl)}</option>`).join('');
  tp.value=cs?cs.tipo||'consulta':'consulta';
  const cn=document.getElementById('mco-canal');
  cn.innerHTML='<option value="">—</option>'+CANAIS_CONSULTA.map(c=>`<option>${esc(c)}</option>`).join('');
  cn.value=cs?cs.canal||'':'WhatsApp';
  const rs=document.getElementById('mco-resp');
  rs.innerHTML=RESP.map(r=>`<option>${esc(r)}</option>`).join('');
  rs.value=cs?(cs.resp||a.resp||RESP[0]):(a.resp||(EU&&RESP.includes(EU.nome)?EU.nome:RESP[0]));
  document.getElementById('mco-obj').value=cs?cs.titulo||'':'';
  document.getElementById('mco-solicitante').value=cs?cs.solicitante||'':'';
  document.getElementById('mco-data').value=cs?cs.solicitadoEm||hojeISO():hojeISO();
  document.getElementById('mco-comp').value=cs?cs.competencia||compHoje():compHoje();
  document.getElementById('mco-prazo').value=cs?cs.prazo||'':'';
  document.getElementById('mco-desc').value=cs?cs.descricao||'':'';
  document.getElementById('mco-del').style.display=cs?'':'none';
  const tar=document.getElementById('mco-tarefa-wrap');
  tar.style.display=cs&&cs.tarefaId?'none':'';
  document.getElementById('mco-tarefa').checked=false;
  mcoStatus(mcoCtx.status);
  mcoAvisoCota();
  abrirOverlay('overlay-consulta');
  setTimeout(()=>document.getElementById('mco-obj').focus(),40);
}
function mcoStatus(s){
  mcoCtx.status=s;
  ['aberta','andamento','concluida','cancelada'].forEach(x=>{
    const b=document.getElementById('mco-st-'+x);
    if(b)b.classList.toggle('on',x===s);
  });
}
// aviso de cota: mostra, já no momento do registro, se este pedido estoura o mês
function mcoAvisoCota(){
  const el=document.getElementById('mco-cota');
  const a=assessoriaPorId(mcoCtx.aid);
  if(!el||!a)return;
  const comp=document.getElementById('mco-comp').value||compHoje();
  const k=cotaAssessoria(a,comp);
  const nova=mcoCtx.id?0:1;
  if(!k.cota){el.innerHTML='Esta assessoria não tem cota mensal definida — a consulta é só registrada.';el.className='mco-cota';return;}
  const depois=k.usadas+nova;
  if(depois>k.cota){
    el.innerHTML=`<b>Atenção:</b> em ${fmtComp(comp)} o cliente já usou ${k.usadas} de ${k.cota} consultas. Esta passa a cota em ${depois-k.cota}.`;
    el.className='mco-cota alerta';
  }else{
    el.innerHTML=`Em ${fmtComp(comp)}: ${k.usadas} de ${k.cota} usadas. Com esta, ficam ${k.cota-depois} disponíveis.`;
    el.className='mco-cota';
  }
}
function salvarConsulta(){
  const a=assessoriaPorId(mcoCtx.aid);
  if(!a)return;
  const titulo=document.getElementById('mco-obj').value.trim();
  if(!titulo){alert('Descreva o que o cliente pediu (ex.: Análise de contrato de locação).');return;}
  const dados={
    titulo, tipo:document.getElementById('mco-tipo').value,
    solicitante:document.getElementById('mco-solicitante').value.trim(),
    canal:document.getElementById('mco-canal').value,
    solicitadoEm:document.getElementById('mco-data').value||hojeISO(),
    competencia:document.getElementById('mco-comp').value||compHoje(),
    prazo:document.getElementById('mco-prazo').value,
    resp:document.getElementById('mco-resp').value,
    descricao:document.getElementById('mco-desc').value.trim(),
    status:mcoCtx.status,
  };
  let cs=mcoCtx.id?consultasDe(a).find(x=>x.id===mcoCtx.id):null;
  if(cs){
    Object.assign(cs,dados);
  }else{
    cs={id:uid(),...dados,entregaEm:'',tarefaId:null,criadoEm:Date.now(),criadoPor:EU?EU.nome:''};
    consultasDe(a).push(cs);
  }
  if(cs.status==='concluida'&&!cs.entregaEm)cs.entregaEm=hojeISO();
  if(cs.status!=='concluida')cs.entregaEm='';
  const criarTarefa=document.getElementById('mco-tarefa').checked&&!cs.tarefaId;
  salvarDB();
  fecharOverlay('overlay-consulta');
  if(criarTarefa)criarTarefaDaConsulta(a.id,cs.id);
  else refreshUI();
}
function excluirConsulta(){
  const a=assessoriaPorId(mcoCtx.aid);
  const cs=a&&consultasDe(a).find(x=>x.id===mcoCtx.id);
  if(!cs)return;
  if(!confirm('Excluir a consulta "'+cs.titulo+'"?\n\nEla deixa de contar na cota do mês.'+(cs.tarefaId?'\nA tarefa criada na Rotina NÃO é excluída.':'')))return;
  a.consultas=consultasDe(a).filter(x=>x.id!==cs.id);
  salvarDB();
  fecharOverlay('overlay-consulta');
  refreshUI();
}

// ─── MODAL: GERAR PARCELAS ────────────────────────────────
let mpcCtx={aid:null};
function abrirModalParcelas(aid){
  const a=assessoriaPorId(aid);
  if(!a)return;
  mpcCtx={aid};
  const c=clienteDaAssessoria(a);
  if(!c){alert('Esta assessoria está sem cliente vinculado. Edite o contrato antes de gerar parcelas.');return;}
  document.getElementById('mpc-cliente-nome').textContent=c.curto||c.nome;
  document.getElementById('mpc-qtd').value=12;
  document.getElementById('mpc-valor').value=a.valor?numBR(a.valor):'';
  // primeiro vencimento: o próximo dia de vencimento ainda não gerado
  const jaTem=parcelasDaAssessoria(a).map(f=>f.assessoriaComp).filter(Boolean);
  let comp=compHoje();
  while(jaTem.includes(comp))comp=compAdd(comp,1);
  document.getElementById('mpc-venc').value=vencimentoDaComp(a,comp);
  mpcPrevia();
  abrirOverlay('overlay-parcelas');
}
function vencimentoDaComp(a,comp){
  const dia=Math.min(+a.diaVencimento||10,28);
  return comp+'-'+String(dia).padStart(2,'0');
}
function mpcPrevia(){
  const el=document.getElementById('mpc-previa');
  const a=assessoriaPorId(mpcCtx.aid);
  if(!el||!a)return;
  const n=Math.max(1,Math.min(36,+document.getElementById('mpc-qtd').value||0));
  const v=parseValor(document.getElementById('mpc-valor').value||'0');
  const venc=document.getElementById('mpc-venc').value;
  if(!venc||!(v>0)){el.textContent='Informe o primeiro vencimento e o valor da parcela.';return;}
  const ultima=isoAddMeses(venc,n-1);
  el.innerHTML=`<b>${n}</b> parcela${n>1?'s':''} de <b>${fmt(v)}</b>, de ${fmtData(venc)} a ${fmtData(ultima)}.
    Total: <b>${fmt(v*n)}</b>. Entram na ficha do cliente como “a receber”.`;
}
function gerarParcelasAssessoria(){
  const a=assessoriaPorId(mpcCtx.aid);
  const c=clienteDaAssessoria(a);
  if(!a||!c)return;
  const n=Math.max(1,Math.min(36,+document.getElementById('mpc-qtd').value||0));
  const v=parseValor(document.getElementById('mpc-valor').value||'0');
  const venc=document.getElementById('mpc-venc').value;
  if(!venc){alert('Informe a data do primeiro vencimento.');return;}
  if(!(v>0)){alert('Informe o valor da parcela (ex.: 2.500,00).');return;}
  const existentes=parcelasDaAssessoria(a).map(f=>f.assessoriaComp).filter(Boolean);
  let criadas=0, puladas=0;
  for(let i=0;i<n;i++){
    const d=isoAddMeses(venc,i);
    const comp=compDe(d);
    if(existentes.includes(comp)){puladas++;continue;}
    c.fin.push({id:uid(),
      d:(a.titulo||'Assessoria mensal')+' — '+fmtComp(comp),
      v, t:'prev', dt:d, criadoEm:Date.now(),
      contratoId:a.contratoId||null,
      assessoriaId:a.id, assessoriaComp:comp, assessoriaVenc:d,
      dependeTerceiro:false,dataPrevistaRecebimento:'',aceiteVerbal:false,alvara:false});
    existentes.push(comp);criadas++;
  }
  salvarDB();
  fecharOverlay('overlay-parcelas');
  refreshUI();
  if(typeof mostrarToast==='function')
    mostrarToast(criadas+' parcela'+(criadas===1?'':'s')+' gerada'+(criadas===1?'':'s')
      +(puladas?' · '+puladas+' competência'+(puladas>1?'s':'')+' já existia'+(puladas>1?'m':''):''));
}

// ─── FICHA DO CLIENTE ─────────────────────────────────────
// bloco que aparece na ficha quando o cliente tem assessoria
function assessoriaDoClienteHTML(cid){
  const lista=assessoriasDoCliente(cid);
  if(!lista.length)return '';
  return lista.map(a=>{
    const k=cotaAssessoria(a);
    const venc=parcelasDaAssessoria(a).filter(f=>statusParcela(f)==='vencida').length;
    return `<div class="cli-ass" onclick="irParaAssessoria('${a.id}')" title="Abrir em Assessorias">
      <i class="ti ti-briefcase"></i>
      <span class="tx"><b>${esc(a.titulo||'Assessoria mensal')}</b>
        <span>${esc(a.status)}${a.valor?' · '+money(a.valor)+'/mês':''}${a.consultasCiclo?' · '+k.usadas+' de '+k.cota+' consultas em '+fmtComp(k.comp):''}</span></span>
      ${venc?`<span class="ass-tag alerta"><i class="ti ti-alert-triangle"></i>${venc} vencida${venc>1?'s':''}</span>`:''}
      <i class="ti ti-chevron-right" style="color:var(--t3)"></i>
    </div>`;
  }).join('');
}
function irParaAssessoria(id){
  navegarPara('assessorias');
  abrirAssessoria(id);
}
