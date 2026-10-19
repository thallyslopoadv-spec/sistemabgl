
// ═══════════════════════════════════════════════════════════
//  AGENDA DE AUDIÊNCIAS (calendário da visão geral)
//  Antes existia aqui o resumo "Rotina de hoje", que jogava audiência,
//  petição e prazo na mesma lista e não mostrava horário nenhum. Agora as
//  audiências ganham um calendário próprio, alimentado pelas tarefas da
//  Rotina do tipo "audiencia" (campo prazo = dia, campo hora = horário).
// ═══════════════════════════════════════════════════════════
const AGENDA_DOW=['dom','seg','ter','qua','qui','sex','sáb'];
const AGENDA_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
let agendaMesRef=null;   // {y, m} — m em base 0
let agendaDiaSel=null;   // 'AAAA-MM-DD' do dia clicado (null = mostra as próximas)

// Desde a aba Processos, o calendário mostra também os prazos processuais:
// a audiência entra no dia dela (t.prazo) e o prazo entra no dia em que
// vence (t.prazoFatal; sem fatal, a data de entrega). Ver dataEvento().
function audienciasTodas(){return (DB.tarefas||[]).filter(t=>t.tipo==='audiencia'||ehTarefaPrazo(t))}
function audienciaHoraOrd(t){return t.tipo==='audiencia'?(t.hora||'99:98'):'00:00'}
function audienciasNoDia(iso){
  return audienciasTodas().filter(t=>dataEvento(t)===iso)
    .sort((a,b)=>audienciaHoraOrd(a)<audienciaHoraOrd(b)?-1:1);
}
function audienciaAtrasada(t){const d=dataEvento(t);return t.status!=='concluido'&&!!d&&d<hojeISO()}
function isoDe(y,m,d){return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0')}
function agendaGarantirMes(){
  if(agendaMesRef)return;
  const h=new Date();
  agendaMesRef={y:h.getFullYear(),m:h.getMonth()};
}
function agendaMudarMes(delta){
  agendaGarantirMes();
  const d=new Date(agendaMesRef.y,agendaMesRef.m+delta,1);
  agendaMesRef={y:d.getFullYear(),m:d.getMonth()};
  agendaDiaSel=null;
  renderAgendaAudiencias();
}
function agendaIrParaHoje(){
  const h=new Date();
  agendaMesRef={y:h.getFullYear(),m:h.getMonth()};
  agendaDiaSel=hojeISO();
  renderAgendaAudiencias();
}
function agendaSelecionarDia(iso){
  agendaDiaSel=(agendaDiaSel===iso)?null:iso;
  renderAgendaAudiencias();
}
// abre o modal de tarefa já com o tipo "audiência" e, se veio de um dia do
// calendário, com a data preenchida — para marcar audiência sem sair da tela
function abrirNovaAudiencia(iso){
  abrirModalTarefa(null,null);
  const tp=document.getElementById('mt-tipo');
  if(tp&&[...tp.options].some(o=>o.value==='audiencia'))tp.value='audiencia';
  const dia=iso||agendaDiaSel||hojeISO();
  document.getElementById('mt-prazo').value=dia;
  document.getElementById('mt-titulo-in').value='Audiência — ';
  mtAtualizarHintFatal();
  if(typeof mtRecalcProjetoAuto==='function')mtRecalcProjetoAuto();
  if(typeof mtAtualizarHintConclusao==='function')mtAtualizarHintConclusao();
  setTimeout(()=>{
    const c=document.getElementById('mt-titulo-in');
    if(c){c.focus();c.setSelectionRange(c.value.length,c.value.length);}
  },120);
}
// bloco de uma audiência no painel lateral
function audienciaItemHTML(t){
  const cli=nomeCliente(t.cid);
  const concl=t.status==='concluido';
  const atras=audienciaAtrasada(t);
  const cls=concl?'ok':(atras?'atras':'');
  const ehAud=t.tipo==='audiencia';
  const de=dataEvento(t);
  const hora=ehAud?(t.hora?`<span class="aud-hora">${esc(t.hora)}</span>`:'<span class="aud-hora sem">sem horário</span>')
    :`<span class="aud-kind prazo">prazo${t.prazoFatal?' fatal':''}</span>`;
  const dia=de?`<span class="prazo-badge ${atras?'prazo-late':'prazo-ok'}">${diaSemanaDe(de)} ${fmtData(de)}</span>`:'<span class="prazo-badge prazo-sem">sem data</span>';
  const entrega=!ehAud&&t.prazoFatal&&t.prazo&&t.prazo!==t.prazoFatal?`<span style="font-size:11px;color:var(--t3)">entrega ${fmtData(t.prazo)}</span>`:'';
  return `<div class="aud-item ${cls}" onclick="abrirModalTarefa('${t.id}',null)" title="Clique para abrir na Rotina">
    <div class="aud-top">${hora}${dia}${entrega}</div>
    <div class="aud-tit">${esc(t.titulo)}</div>
    <div class="aud-meta">
      <span><i class="ti ti-user" style="font-size:12px"></i> ${esc(t.resp||'—')}</span>
      ${cli?`<span><i class="ti ti-briefcase" style="font-size:12px"></i> ${esc(cli)}</span>`:''}
      <span class="st-pill ${concl?'st-concluido':t.status==='andamento'?'st-andamento':'st-pendente'}" style="cursor:default">${ST_LBL[t.status]}</span>
    </div>
  </div>`;
}
function renderAgendaAudiencias(){
  const cal=document.getElementById('agenda-cal');
  if(!cal)return;
  agendaGarantirMes();
  const {y,m}=agendaMesRef;
  const hoje=hojeISO();
  const todas=audienciasTodas();
  const pendentes=todas.filter(t=>t.status!=='concluido');
  const atrasadas=pendentes.filter(audienciaAtrasada);
  const semData=pendentes.filter(t=>!dataEvento(t));

  document.getElementById('agenda-mes').textContent=AGENDA_MESES[m]+' de '+y;
  const sub=document.getElementById('agenda-sub');
  const nAud=pendentes.filter(t=>t.tipo==='audiencia').length, nPz=pendentes.length-nAud;
  if(sub)sub.textContent=pendentes.length
    ? [nAud?nAud+' audiência'+(nAud>1?'s':''):'',nPz?nPz+' prazo'+(nPz>1?'s':''):''].filter(Boolean).join(' · ')+' pendente'+(pendentes.length>1?'s':'')+(atrasadas.length?' · '+atrasadas.length+' vencido'+(atrasadas.length>1?'s':'')+' sem baixa':'')
    : 'nenhuma audiência ou prazo pendente';

  // grade do mês, começando no domingo
  const primeiro=new Date(y,m,1);
  const diasNoMes=new Date(y,m+1,0).getDate();
  const vazios=primeiro.getDay();
  let html=AGENDA_DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<vazios;i++)html+='<div class="cal-day vazio"></div>';
  for(let d=1;d<=diasNoMes;d++){
    const iso=isoDe(y,m,d);
    const evs=audienciasNoDia(iso);
    const dow=new Date(y,m,d).getDay();
    const temAtraso=evs.some(audienciaAtrasada);
    const cls=['cal-day'];
    const feriado=dow!==0&&dow!==6&&!diaUtil(iso);   // feriado ou recesso forense: prazo não corre
    if(dow===0||dow===6||feriado)cls.push('fds');
    if(evs.length)cls.push(temAtraso?'atras':evs.some(t=>t.tipo!=='audiencia'&&t.status!=='concluido')?'temprazo':'temev');
    if(iso===hoje)cls.push('hoje');
    if(iso===agendaDiaSel)cls.push('sel');
    const chips=evs.slice(0,2).map(t=>
      `<span class="cal-ev ${t.tipo==='audiencia'?'aud':'prazo'} ${t.status==='concluido'?'ok':''}">${t.tipo==='audiencia'?(t.hora?'<b>'+esc(t.hora)+'</b> ':''):'<b>Prazo</b> '}${esc(t.titulo)}</span>`).join('');
    const mais=evs.length>2?`<span class="cal-mais">+${evs.length-2}</span>`:'';
    // em tela estreita os rótulos não cabem: fica só a bolinha com a quantidade
    const contador=evs.length?`<span class="cal-count">${evs.length}</span>`:'';
    const tt=evs.length
      ? fmtData(iso)+' — '+evs.map(t=>(t.hora?t.hora+' ':'')+t.titulo).join(' · ')
      : fmtData(iso)+(feriado?' — feriado/suspensão: prazos não correm':' — sem audiência nem prazo');
    html+=`<button type="button" class="${cls.join(' ')}" onclick="agendaSelecionarDia('${iso}')" title="${esc(tt)}">
      <span class="cal-num">${d}</span>${chips}${mais}${contador}</button>`;
  }
  cal.innerHTML=html;

  // painel lateral: o dia clicado, ou as próximas audiências
  const tit=document.getElementById('agenda-side-tit');
  const shs=document.getElementById('agenda-side-sub');
  const lista=document.getElementById('agenda-side-lista');
  if(!lista)return;
  if(agendaDiaSel){
    const evs=audienciasNoDia(agendaDiaSel);
    tit.textContent=diaSemanaDe(agendaDiaSel)+', '+fmtData(agendaDiaSel);
    shs.innerHTML=(evs.length?evs.length+' compromisso'+(evs.length>1?'s':''):'nada marcado neste dia')+
      ' · <a onclick="agendaSelecionarDia(\''+agendaDiaSel+'\')" style="color:var(--navy);text-decoration:underline;cursor:pointer">ver as próximas</a>';
    lista.innerHTML=evs.length?evs.map(audienciaItemHTML).join('')
      :'<div class="hbar-empty"><i class="ti ti-calendar-off"></i>Dia livre de audiências e prazos.</div>';
    return;
  }
  const proximas=pendentes.filter(t=>dataEvento(t)&&dataEvento(t)>=hoje)
    .sort((a,b)=>(dataEvento(a)+audienciaHoraOrd(a))<(dataEvento(b)+audienciaHoraOrd(b))?-1:1).slice(0,7);
  tit.textContent='Próximas audiências e prazos';
  shs.textContent=proximas.length?'clique num dia do calendário para ver só ele':'nada marcado daqui pra frente';
  let side='';
  if(atrasadas.length)side+=`<div style="font-size:12px;font-weight:600;color:var(--red-hi);background:var(--red-bg);border:1px solid rgba(178,59,59,.24);border-radius:var(--rs);padding:9px 11px;margin-bottom:10px;line-height:1.45"><i class="ti ti-alert-triangle"></i> ${atrasadas.length} audiência${atrasadas.length>1?'s':''} já passou${atrasadas.length>1?'ram':''} e continua${atrasadas.length>1?'m':''} em aberto.</div>`;
  side+=proximas.length?proximas.map(audienciaItemHTML).join('')
    :'<div class="hbar-empty"><i class="ti ti-calendar-off"></i>Nenhuma audiência ou prazo marcado.</div>';
  if(semData.length)side+=`<div style="font-size:11.5px;color:var(--amber-hi);margin-top:6px"><i class="ti ti-alert-circle"></i> ${semData.length} audiência${semData.length>1?'s':''} ou prazo${semData.length>1?'s':''} sem data na Rotina.</div>`;
  lista.innerHTML=side;
}
function irParaCliente(id){navegarPara('crm');abrirCliente(id);}
