
// ═══════════════════════════════════════════════════════════
//  CRM COMERCIAL — Dashboard + Jornada do lead (importado da
//  planilha CRM_BGL_Dashboard.xlsx, mesma lógica das fórmulas)
// ═══════════════════════════════════════════════════════════
function mesChaveDe(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function todosLeadsCRM(){
  return [...leads.map(l=>({...l,_mod:'trab'})),...leadsCivel.map(l=>({...l,_mod:'civel'}))];
}
// leads que realmente percorreram o funil comercial. Exclui os retroativos — criados só
// para vincular clientes antigos ao CRM — para que não contem como "lead do mês" nem
// distorçam conversão, ticket médio, funil, origem e áreas.
function leadsCRMFunil(){ return todosLeadsCRM().filter(l=>!l.retroativo); }
// "Data Ultimo Contato" = mais recente entre a criação do lead e seus follow-ups (=MAX(A2,V2,X2) na planilha)
function leadUltimaAtividade(l){
  let max=l.criadoEm||0;
  (l.followups||[]).forEach(f=>{if(f.data){const t=new Date(f.data+'T00:00:00').getTime();if(t>max)max=t;}});
  return max;
}
// leads em etapa terminal (Ganho/Perdido) saem da contagem de "parado" (mesma regra da fórmula AG da planilha)
function leadDiasSemContato(l){
  if(l.convertido||l.fechouCRM==='Sim'||l.statusCRM==='Ganho'||l.statusCRM==='Perdido')return null;
  return Math.floor((Date.now()-leadUltimaAtividade(l))/86400000);
}
function leadFollowupAtrasado(l){const d=leadDiasSemContato(l);return d!==null&&d>=CRM_FOLLOWUP_DIAS}

// ─── PRAZOS DO FUNIL DE VENDAS (regras de negócio) ───
// horas úteis (seg-sex, 08h-18h) entre dois instantes — usado só pro limite de 4h em "Novo"
function horasUteisEntre(inicioTs,fimTs){
  if(!inicioTs||!fimTs||fimTs<=inicioTs)return 0;
  let horas=0;
  const HORA_INICIO=8,HORA_FIM=18;
  const fimLimitado=Math.min(fimTs,inicioTs+1000*60*60*24*30); // teto de segurança (30 dias) pra nunca travar
  let cursor=new Date(inicioTs);
  const fim=new Date(fimLimitado);
  // avança em passos de até 1h simulando o relógio, contando só dentro do expediente
  while(cursor<fim){
    const prox=new Date(Math.min(cursor.getTime()+3600000,fim.getTime()));
    const dia=cursor.getDay(),h=cursor.getHours();
    if(dia>=1&&dia<=5&&h>=HORA_INICIO&&h<HORA_FIM)horas+=(prox.getTime()-cursor.getTime())/3600000;
    cursor=prox;
  }
  return horas;
}
function leadEtapaAtiva(l){return ETAPAS_ATIVAS.includes(l.statusCRM)}
// info de prazo da etapa atual: {vencido, texto} — cobre o limite por etapa, o caso
// específico de 24h entre reunião marcada e proposta enviada, e o teto de 15 dias corridos
function leadPrazoEtapaInfo(l){
  if(!leadEtapaAtiva(l))return null;
  const agora=Date.now();
  // teto geral do funil: 15 dias corridos desde a criação do lead
  const diasNoFunil=(agora-(l.criadoEm||agora))/86400000;
  if(diasNoFunil>PRAZO_TETO_FUNIL_DIAS){
    return {vencido:true,texto:'Mais de '+PRAZO_TETO_FUNIL_DIAS+'d corridos no funil (teto geral)'};
  }
  // regra específica: até 24h entre a reunião marcada e o envio da proposta
  if(l.statusCRM==='Reunião marcada'&&l.reuniaoDataHora){
    const reuniaoTs=new Date(l.reuniaoDataHora).getTime();
    if(reuniaoTs<=agora){
      const hDesde=(agora-reuniaoTs)/3600000;
      if(hDesde>PRAZO_REUNIAO_PROPOSTA_H)return {vencido:true,texto:'Mais de 24h após a reunião sem proposta enviada'};
    }
  }
  const prazo=PRAZO_ETAPA[l.statusCRM];
  if(!prazo)return null;
  const entrada=l.etapaEntradaEm||l.criadoEm||agora;
  if(prazo.h!==undefined){
    const hUteis=horasUteisEntre(entrada,agora);
    if(hUteis>prazo.h)return {vencido:true,texto:'Mais de '+prazo.h+'h úteis em "'+l.statusCRM+'"'};
    return {vencido:false,texto:hUteis.toFixed(1)+'h úteis em "'+l.statusCRM+'" (limite '+prazo.h+'h)'};
  }
  const dias=(agora-entrada)/86400000;
  if(dias>prazo.d)return {vencido:true,texto:'Mais de '+prazo.d+'d em "'+l.statusCRM+'"'};
  return {vencido:false,texto:Math.floor(dias)+'d em "'+l.statusCRM+'" (limite '+prazo.d+'d)'};
}
function leadProximaAcaoVencida(l){
  if(!leadEtapaAtiva(l))return false;
  if(!l.proximaAcaoEm)return true; // obrigatório: sem data definida já conta como pendência
  return new Date(l.proximaAcaoEm).getTime()<Date.now();
}
// resumo usado na lista de leads: algum alerta de prazo ativo (etapa estourada ou próxima ação vencida/ausente)?
function leadTemAlertaPrazo(l){
  const info=leadPrazoEtapaInfo(l);
  return (info&&info.vencido)||leadProximaAcaoVencida(l);
}
// ═══ RÉGUA PRÉ-PROPOSTA ═══════════════════════════════════════════
// Leads ativos que ainda NÃO enviaram proposta (Novo/Qualificado/Reunião marcada, sem a
// cadência pós-proposta) são os que mais somem. Esta régua NÃO mexe em CADENCIA_FOLLOWUP:
// apenas define proximaAcaoEm, para alimentar a Fila de hoje. A âncora é o último toque
// (data do último follow-up, ou criadoEm); a partir dela, os passos são +2 (lembrete leve
// com próximo passo), +5 (elemento novo/reunião rápida por vídeo), +8 (encerramento com
// takeaway) e +11 (baixa com motivo). Vale igual para trabalhista e cível.
const ETAPAS_PRE_PROPOSTA=['Novo','Qualificado','Reunião marcada'];
const REGUA_PRE_PROPOSTA_DIAS=[2,5,8,11];
function leadPreProposta(l){return ETAPAS_PRE_PROPOSTA.includes(l.statusCRM)&&!l.followupCadenciaGerada;}
function leadAncoraPreProposta(l){
  const datas=(l.followups||[]).map(f=>f.data).filter(Boolean).sort();
  if(datas.length)return new Date(datas[datas.length-1]+'T12:00:00').getTime();
  return l.criadoEm||Date.now();
}
// proximaAcaoEm = primeiro passo ainda no futuro; se todos já passaram, usa o último (baixa),
// que fica vencido e puxa o lead para a Fila de hoje
function calcularProximaAcaoPreProposta(l){
  const base=leadAncoraPreProposta(l), agora=Date.now();
  let ts=null;
  for(const d of REGUA_PRE_PROPOSTA_DIAS){const c=base+d*86400000;if(c>agora){ts=c;break;}}
  if(ts===null)ts=base+REGUA_PRE_PROPOSTA_DIAS[REGUA_PRE_PROPOSTA_DIAS.length-1]*86400000;
  const d=new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T09:00';
}
function atualizarProximaAcaoPreProposta(l){
  if(!leadPreProposta(l))return false;
  l.proximaAcaoEm=calcularProximaAcaoPreProposta(l);
  return true;
}
// ═══ FILA DE HOJE (tela inicial do módulo de Atendimento) ═════════
let atendAba='fila';
function mudarAtendAba(aba){
  atendAba=aba;
  const bf=document.getElementById('atendaba-fila'), bp=document.getElementById('atendaba-painel');
  if(bf)bf.classList.toggle('active',aba==='fila');
  if(bp)bp.classList.toggle('active',aba==='painel');
  const ff=document.getElementById('atend-fila'), fp=document.getElementById('atend-painel');
  if(ff)ff.style.display=aba==='fila'?'block':'none';
  if(fp)fp.style.display=aba==='painel'?'block':'none';
  if(aba==='fila')renderFilaHoje();
}
// entra na fila se está em ETAPAS_ATIVAS e a próxima ação está vencida/em branco
// (leadProximaAcaoVencida cobre ambos) ou marcada para hoje
function leadNaFilaHoje(l){
  if(!leadEtapaAtiva(l))return false;
  if(leadProximaAcaoVencida(l))return true;
  return (l.proximaAcaoEm||'').slice(0,10)===hojeISO();
}
function filaHojeOrdenada(){
  const arr=[...leads.map(l=>({l,mod:'trab'})),...leadsCivel.map(l=>({l,mod:'civel'}))].filter(x=>leadNaFilaHoje(x.l));
  arr.sort((a,b)=>{
    const ka=a.l.proximaAcaoEm||'', kb=b.l.proximaAcaoEm||'';
    if(!ka&&!kb)return (a.l.criadoEm||0)-(b.l.criadoEm||0); // sem data = mais atrasado, vem primeiro
    if(!ka)return -1; if(!kb)return 1;
    return ka<kb?-1:(ka>kb?1:0); // do mais antigo (mais atrasado) para o mais recente
  });
  return arr;
}
function abrirLeadDaFila(leadId,leadMod){
  mudarAtendAba('painel');
  abrirLeadDeTarefa(leadId,leadMod); // mesmo mecanismo de abertura da jornada
}
function renderFilaHoje(){
  const el=document.getElementById('fila-hoje-lista'); if(!el)return;
  const arr=filaHojeOrdenada();
  const sub=document.getElementById('fila-hoje-sub');
  if(sub)sub.textContent=arr.length?(arr.length+' lead'+(arr.length>1?'s':'')+' aguardando ação'):'tudo em dia';
  if(!arr.length){el.innerHTML='<div class="hbar-empty"><i class="ti ti-circle-check"></i>Nenhum lead na fila de hoje. Tudo em dia.</div>';return;}
  el.innerHTML=arr.map(({l,mod})=>{
    const vencida=leadProximaAcaoVencida(l);
    const dataTxt=l.proximaAcaoEm?fmtData(l.proximaAcaoEm.slice(0,10)):'sem data';
    const ultima=l.ultimoTipoResposta?' · última resposta: '+esc(TIPO_RESPOSTA_LBL[l.ultimoTipoResposta]):'';
    return `<div style="display:flex;align-items:center;gap:12px;padding:11px 2px;border-bottom:1px solid var(--border)">
      <span style="flex:1;min-width:0">
        <b style="color:var(--navy);font-size:14px">${esc(l.nome)}</b>
        <div style="font-size:12px;color:var(--t3);margin-top:2px">${esc(l.statusCRM||'—')} · ${mod==='civel'?'Cível':'Trabalhista'}${ultima}</div>
      </span>
      <span class="prazo-badge ${vencida?'prazo-late':'prazo-ok'}" style="flex-shrink:0">${dataTxt}</span>
      <button class="btn-nova-tarefa" style="flex-shrink:0" onclick="abrirLeadDaFila('${l.id}','${mod}')"><i class="ti ti-arrow-right"></i>Abrir jornada</button>
    </div>`;
  }).join('');
}
// ─── METAS DO ESCRITÓRIO ──────────────────────────────────
// Três metas de dinheiro, além da de quantidade de contratos:
//   recebido   → faturamento: o que de fato entrou no mês (sem alvarás judiciais)
//   faturamento→ honorários fechados no mês (valor dos contratos fechados). O nome
//                da chave ficou "faturamento" por compatibilidade com metas já salvas.
//   trimestre  → honorários fechados no trimestre civil (jan–mar, abr–jun…)
// Padrões calibrados pela faixa atual do escritório: R$ 6 a 7 mil/mês recebidos
// de clientes, sem alvarás. A meta de recebido fica um pouco acima do teto dessa
// faixa; a de honorários fechados, acima da de recebido, porque parte do que se
// fecha entra parcelado ou não chega a entrar; a trimestral é três meses disso.
const META_PADRAO={contratos:3,honorarios:8000,recebido:7500,trimestre:24000};
function metaCRMDoMes(chave){
  const m=(DB.metasCRM||{})[chave];
  return {
    contratos:m&&typeof m.contratos==='number'?m.contratos:META_PADRAO.contratos,
    faturamento:m&&typeof m.faturamento==='number'?m.faturamento:META_PADRAO.honorarios,
    recebido:m&&typeof m.recebido==='number'?m.recebido:META_PADRAO.recebido,
  };
}
function chaveTrimestre(chaveMes){const[y,m]=chaveMes.split('-').map(Number);return y+'-T'+(Math.floor((m-1)/3)+1)}
function mesesDoTrimestre(chaveTri){const[y,t]=chaveTri.split('-T').map(Number);return [1,2,3].map(i=>y+'-'+String((t-1)*3+i).padStart(2,'0'))}
function nomeTrimestre(chaveTri){const[y,t]=chaveTri.split('-T');return t+'º trimestre de '+y}
function metaTrimestre(chaveTri){
  const m=(DB.metasCRM||{})[chaveTri];
  return m&&typeof m.honorarios==='number'?m.honorarios:META_PADRAO.trimestre;
}
function mesChaveDesloca(chave,n){const[y,m]=chave.split('-').map(Number);const d=new Date(y,m-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
// alvará judicial: marcado no lançamento; lançamentos antigos sem a marcação
// são reconhecidos pela palavra "alvará" na descrição
function ehAlvara(f){return f.alvara===true||(f.alvara===undefined&&semAcento(f.d).includes('alvara'))}
// recebido de clientes no mês, separando o que fica fora da meta de faturamento
function recebidoDoMes(chave){
  const r={meta:0,n:0,alvaras:0,socios:0};
  (DB.clientes||[]).forEach(c=>(c.fin||[]).forEach(f=>{
    if(f.t!=='alc'||!f.dt||f.dt.slice(0,7)!==chave)return;
    if(ehAlvara(f))r.alvaras+=f.v;
    else if(c.tipo==='pessoal')r.socios+=f.v;
    else{r.meta+=f.v;r.n++;}
  }));
  return r;
}
function honorariosFechadosDoMes(chave){return contratosFechadosDoMes(chave).reduce((a,x)=>a+x.valor,0)}
// média dos últimos n meses já encerrados (o mês corrente fica de fora por estar incompleto)
function mediaUltimosMeses(n,fn){
  const atual=mesChaveDe(Date.now());
  let soma=0;for(let i=1;i<=n;i++)soma+=fn(mesChaveDesloca(atual,-i));
  return soma/n;
}
// um lead conta como "contrato fechado" se foi ganho no funil OU convertido em cliente
// (o botão "fechar contrato" converte sem passar pelo statusCRM "Ganho")
function leadFechado(l){return l.fechouCRM==='Sim'||l.convertido===true||l.statusCRM==='Ganho';}
function calcularKPIsCRM(){
  const todos=leadsCRMFunil();
  const mesAtual=mesChaveDe(Date.now());
  const leadsMes=todos.filter(l=>mesChaveDe(l.criadoEm)===mesAtual).length;
  const fechados=todos.filter(leadFechado);
  const taxaConversao=todos.length?fechados.length/todos.length:0;
  const ticketMedio=fechados.length?fechados.reduce((a,l)=>a+(l.valorHonorarioEstimado||0),0)/fechados.length:0;
  const parados=todos.filter(leadFollowupAtrasado);
  // meta do mês: todo contrato fechado no mês, venha ou não do funil
  const fechadosMes=contratosFechadosDoMes(mesAtual);
  const faturamentoFechadoMes=fechadosMes.reduce((a,x)=>a+x.valor,0);
  const pipelineAberto=todos.filter(l=>l.statusCRM!=='Ganho'&&l.statusCRM!=='Perdido');
  const previsaoPipeline=pipelineAberto.reduce((a,l)=>a+(l.valorHonorarioEstimado||0)*(l.probabilidadeFechamento||0),0);
  const meta=metaCRMDoMes(mesAtual);
  return {leadsMes,taxaConversao,ticketMedio,parados,faturamentoFechadoMes,previsaoPipeline,
    metaContratos:meta.contratos,metaFaturamento:meta.faturamento,contratosFechadosMes:fechadosMes.length,mesAtual};
}
function dadosOrigemCRM(){
  const cont={};CATEGORIAS_ORIGEM.forEach(c=>cont[c]=0);
  leadsCRMFunil().forEach(l=>{if(l.categoriaOrigem)cont[l.categoriaOrigem]=(cont[l.categoriaOrigem]||0)+1;});
  return CATEGORIAS_ORIGEM.map(c=>({lbl:c,n:cont[c]||0}));
}
function dadosObjecaoCRM(){
  const cont={};CATEGORIAS_OBJECAO.forEach(c=>cont[c]=0);
  leadsCRMFunil().forEach(l=>{if(l.categoriaObjecao)cont[l.categoriaObjecao]=(cont[l.categoriaObjecao]||0)+1;});
  return CATEGORIAS_OBJECAO.map(c=>({lbl:c,n:cont[c]||0}));
}
function dadosFunilCRM(){
  const todos=leadsCRMFunil();
  return [
    {lbl:'Entrou em contato',n:todos.length},
    {lbl:'Reunião agendada',n:todos.filter(l=>l.reuniaoAgendadaTexto).length},
    {lbl:'Compareceu',n:todos.filter(l=>l.compareceu==='Sim').length},
    {lbl:'Proposta enviada',n:todos.filter(l=>l.propostaEnviada==='Sim').length},
    {lbl:'Fechou',n:todos.filter(l=>l.fechouCRM==='Sim').length},
  ];
}
// áreas jurídicas mais procuradas pelos leads (para o gráfico de barras verticais)
function dadosAreasCRM(){
  const cont={};
  leadsCRMFunil().forEach(l=>{const a=(l.area||'').trim();if(a)cont[a]=(cont[a]||0)+1;});
  return Object.keys(cont).map(a=>({lbl:a,n:cont[a]})).sort((x,y)=>y.n-x.n).slice(0,8);
}
// indicador semanal de propostas enviadas por sócio (regra de negócio, painel comercial)
function normalizarSocio(resp){
  const r=(resp||'').toLowerCase();
  if(r.includes('thallys'))return 'Thallys';
  if(r.includes('cec'))return 'Cecília';
  return 'Escritório';
}
function inicioDaSemana(){
  const d=new Date();
  const diff=(d.getDay()+6)%7; // segunda-feira como início
  d.setHours(0,0,0,0);
  d.setDate(d.getDate()-diff);
  return d.getTime();
}
function dadosPropostasSemanaPorSocio(){
  const desde=inicioDaSemana();
  const cont={};
  todosLeadsCRM().forEach(l=>{
    if(l.propostaEnviadaEm&&l.propostaEnviadaEm>=desde){
      const s=normalizarSocio(l.responsavel);
      cont[s]=(cont[s]||0)+1;
    }
  });
  return Object.keys(cont).map(s=>({lbl:s,n:cont[s]})).sort((x,y)=>y.n-x.n);
}
// barras horizontais com contagem e porcentagem (origem / objeções)
function renderHbarCRM(elId,itens,mostrarPct){
  const el=document.getElementById(elId);if(!el)return;
  const total=itens.reduce((a,x)=>a+x.n,0);
  if(!total){el.innerHTML='<div class="hbar-empty"><i class="ti ti-chart-bar"></i>Sem dados suficientes ainda.</div>';return;}
  const max=Math.max(...itens.map(x=>x.n));
  el.innerHTML=itens.map((x,i)=>{
    const pct=Math.round(x.n/total*100);
    const val=mostrarPct?`${x.n} · ${pct}%`:`${x.n}`;
    return `<div class="hbar-row" style="cursor:default">
      <div class="hbar-label">${esc(x.lbl)}</div>
      <div class="hbar-track">${x.n?`<div class="hbar-fill" style="width:${Math.max(6,x.n/max*100)}%;min-width:6px;background:${CRM_PALETA[i%CRM_PALETA.length]}"></div>`:''}</div>
      <div class="hbar-val">${val}</div>
    </div>`;
  }).join('');
}
// gráfico de barras verticais (áreas mais procuradas)
function renderAreasCRM(elId,itens){
  const el=document.getElementById(elId);if(!el)return;
  if(!itens.length){el.innerHTML='<div class="hbar-empty"><i class="ti ti-chart-bar"></i>Sem áreas registradas ainda.</div>';return;}
  const max=Math.max(1,...itens.map(x=>x.n));
  el.innerHTML=`<div class="vchart">
    ${itens.map(x=>{
      const curto=x.lbl.length>13?x.lbl.slice(0,12)+'…':x.lbl;
      return `<div class="vcol" title="${esc(x.lbl)}: ${x.n} lead(s)">
        <div class="vcol-num">${x.n}</div>
        <div class="vcol-bar" style="height:${Math.max(x.n/max*100,4)}%"></div>
        <div class="vcol-lbl">${esc(curto)}</div>
      </div>`;
    }).join('')}
  </div>`;
}
// gráfico de funil de conversão — barras horizontais decrescentes com taxa de conversão
function renderFunilCRM(elId,itens){
  const el=document.getElementById(elId);if(!el)return;
  const topo=itens.length?itens[0].n:0;
  if(!topo){el.innerHTML='<div class="hbar-empty"><i class="ti ti-filter"></i>Sem dados suficientes ainda.</div>';return;}
  el.innerHTML=`<div class="funil">${itens.map((x,i)=>{
    const pctTopo=Math.round(x.n/topo*100);
    const anterior=i>0?itens[i-1].n:x.n;
    const conv=anterior>0?Math.round(x.n/anterior*100):0;
    const cor=CRM_PALETA_HEX[i%CRM_PALETA_HEX.length];
    return `<div class="funil-stage">
      <div class="funil-top"><span class="funil-lbl">${esc(x.lbl)}</span>${i>0?`<span class="funil-conv" title="conversão a partir da etapa anterior">▼ ${conv}%</span>`:''}</div>
      <div class="funil-bar-wrap"><div class="funil-bar" style="width:${Math.max(pctTopo,6)}%;background:${cor}"><span class="funil-n">${x.n}</span></div><span class="funil-pct">${pctTopo}%</span></div>
    </div>`;
  }).join('')}</div>`;
}
// ─── META DE CONTRATOS DO MÊS: de onde sai a contagem ───
// Um lead entra na conta quando está marcado como fechado (leadFechado: etapa
// "Ganho" no funil, conversão em cliente ou o campo "fechou"). O mês é o do
// fechamento (ganhoEm); quando esse carimbo não existe — leads fechados antes
// dessa regra —, cai na data de entrada do lead, e isso fica sinalizado.
function nomeMesChave(chave){
  const nomes=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const[ano,mes]=chave.split('-');
  return nomes[Number(mes)-1]+' de '+ano;
}
function contratosFechadosDoMes(chave){
  const mes=chave||mesChaveDe(Date.now());
  return contratosFechadosTodos().filter(x=>x.data.slice(0,7)===mes);
}
// barra de uma meta em dinheiro: realizado × meta, com a marca de onde o
// realizado deveria estar se o ritmo fosse linear ao longo do período
function metaBarraHTML(titulo,sub,real,meta,ritmo,detalhe){
  const pct=meta>0?Math.round(real/meta*100):0;
  const largura=Math.min(100,pct);
  const esperado=Math.round(ritmo*100);
  const noRitmo=pct>=esperado;
  const cor=pct>=100?'var(--green)':noRitmo?'var(--navy)':'var(--amber)';
  const falta=Math.max(0,meta-real);
  const status=pct>=100?'meta batida':(noRitmo?'no ritmo':'abaixo do ritmo')+' · faltam '+money(falta);
  return `<div class="meta-bloco">
    <div class="meta-bloco-top">
      <div><div class="meta-bloco-tit">${titulo}</div><div class="meta-bloco-sub">${esc(sub)}</div></div>
      <div class="meta-bloco-val"><b>${money(real)}</b> de ${money(meta)}</div>
    </div>
    <div class="hbar-track meta-track">
      <div class="hbar-fill" style="width:${Math.max(largura,largura>0?8:0)}%;background:${cor}">${pct}%</div>
      ${pct<100?`<span class="meta-ritmo" style="left:${esperado}%" title="Ritmo esperado até hoje: ${esperado}%"></span>`:''}
    </div>
    <div class="meta-bloco-pe"><span>${esc(detalhe)}</span><span style="color:${pct>=100?'var(--green-hi)':noRitmo?'var(--t3)':'var(--amber-hi)'}">${status}</span></div>
  </div>`;
}
// card de meta de contratos na página inicial (visão geral)
function renderDashMetaContratos(){
  const body=document.getElementById('dash-meta-body');
  if(!body)return;
  const k=calcularKPIsCRM();
  const itens=contratosFechadosDoMes(k.mesAtual);
  const pct=k.metaContratos>0?Math.min(100,Math.round(k.contratosFechadosMes/k.metaContratos*100)):0;
  const cor=pct>=100?'var(--green)':pct>=50?'var(--amber)':'var(--navy)';
  const sub=document.getElementById('dash-meta-sub');
  if(sub)sub.textContent=k.contratosFechadosMes+' de '+k.metaContratos+' em '+nomeMesChave(k.mesAtual);
  const chips=itens.length
    ? itens.map(x=>`<span class="meta-chip" title="${esc(x.titulo)}">${esc(x.nome)}</span>`).join('')
    : '<span class="meta-chip vazio">nenhum contrato fechado ainda neste mês</span>';
  body.innerHTML=`<div class="hbar-row" style="cursor:default">
    <div class="hbar-label" style="width:auto;margin-right:10px;font-weight:700;color:var(--navy)">${pct}%</div>
    <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(pct,pct>0?8:0)}%;background:${cor}">${k.contratosFechadosMes}/${k.metaContratos}</div></div>
  </div>
  <div class="meta-chips">${chips}</div>
  <div class="meta-mini">${metasResumoMini(k).map(m=>`<span><b style="color:${m.pct>=100?'var(--green-hi)':'var(--navy)'}">${m.pct}%</b> ${m.rot}</span>`).join('')}</div>
  <div style="font-size:12px;color:var(--t3);margin-top:10px;line-height:1.5">
    Conta todo contrato fechado no mês, pela data de início, venha do funil ou da ficha do cliente.
    <b style="color:var(--navy)">Clique no card para ver as metas de faturamento e de honorários, e contrato por contrato.</b>
  </div>`;
}
// percentuais das três metas em dinheiro, para o resumo do card
function metasResumoMini(k){
  const meta=metaCRMDoMes(k.mesAtual), tri=chaveTrimestre(k.mesAtual);
  const honTri=mesesDoTrimestre(tri).reduce((a,m)=>a+honorariosFechadosDoMes(m),0);
  const p=(r,m)=>m>0?Math.round(r/m*100):0;
  return [
    {rot:'do faturamento',pct:p(recebidoDoMes(k.mesAtual).meta,meta.recebido)},
    {rot:'dos honorários do mês',pct:p(k.faturamentoFechadoMes,meta.faturamento)},
    {rot:'dos honorários do trimestre',pct:p(honTri,metaTrimestre(tri))},
  ];
}
// detalhe do card: mostra exatamente quais leads foram contados e por quê
function abrirDetalheMetaContratos(){
  const k=calcularKPIsCRM();
  const itens=contratosFechadosDoMes(k.mesAtual);
  const pct=k.metaContratos>0?Math.min(100,Math.round(k.contratosFechadosMes/k.metaContratos*100)):0;
  const cor=pct>=100?'var(--green)':pct>=50?'var(--amber)':'var(--navy)';
  const semData=itens.filter(x=>x.estimada).length;

  const metaMes=metaCRMDoMes(k.mesAtual);
  const rec=recebidoDoMes(k.mesAtual);
  const tri=chaveTrimestre(k.mesAtual), mesesTri=mesesDoTrimestre(tri);
  const honTri=mesesTri.reduce((a,m)=>a+honorariosFechadosDoMes(m),0);
  // quanto do período já passou: referência de ritmo para cada barra
  const hoje=new Date();
  const diasMes=new Date(hoje.getFullYear(),hoje.getMonth()+1,0).getDate();
  const ritmoMes=hoje.getDate()/diasMes;
  const iniTri=new Date(hoje.getFullYear(),mesesTri[0].split('-')[1]-1,1), fimTri=new Date(hoje.getFullYear(),Number(mesesTri[2].split('-')[1]),0);
  const ritmoTri=Math.min(1,(hoje-iniTri+86400000)/(fimTri-iniTri+86400000));
  const foraMeta=[rec.alvaras?money(rec.alvaras)+' em alvarás':'',rec.socios?money(rec.socios)+' de demandas dos sócios':''].filter(Boolean).join(' e ');

  document.getElementById('mmd-mes').textContent=nomeMesChave(k.mesAtual);
  document.getElementById('mmd-sub').textContent='Faturamento, honorários fechados no mês e no trimestre, e quantidade de contratos.';
  document.getElementById('mmd-resumo').innerHTML=
    metaBarraHTML('Faturamento do mês','recebido de clientes, sem alvarás',rec.meta,metaMes.recebido,ritmoMes,
      rec.n+' recebimento'+(rec.n!==1?'s':'')+(foraMeta?' · fora da meta: '+foraMeta:''))+
    metaBarraHTML('Honorários fechados no mês','valor dos contratos fechados',k.faturamentoFechadoMes,metaMes.faturamento,ritmoMes,
      k.contratosFechadosMes+' contrato'+(k.contratosFechadosMes!==1?'s':''))+
    metaBarraHTML('Honorários fechados no trimestre',nomeTrimestre(tri),honTri,metaTrimestre(tri),ritmoTri,
      mesesTri.map(m=>nomeMesChave(m).split(' ')[0]+' '+money(honorariosFechadosDoMes(m))).join(' · '))+
    `<div class="meta-qtd">
      <span>Contratos fechados no mês: <b>${k.contratosFechadosMes} de ${k.metaContratos}</b></span>
      <div class="hbar-track" style="height:10px"><div class="hbar-fill" style="min-width:0;width:${pct}%;background:${cor}"></div></div>
    </div>`;
  document.getElementById('mmd-explica').innerHTML=
    'Como a contagem é feita: entra no mês <b>todo contrato fechado</b>, venha de onde vier — fechado pelo funil do CRM, '+
    'cadastrado direto na ficha do cliente ou um novo contrato de cliente que já estava na carteira. Vale a <b>data de início do contrato</b>. '+
    'Lead marcado como ganho que ainda não virou contrato de nenhum cliente também entra, uma vez só. '+
    'Os honorários usam o valor informado no contrato; sem ele, o total lançado no contrato; sem lançamentos, o estimado no lead. '+
    'Demandas pessoais dos sócios ficam de fora.'+
    (semData?'<br><span style="color:var(--amber-hi)"><i class="ti ti-alert-circle"></i> '+semData+' contrato'+(semData>1?'s':'')+' sem data de início: contado'+(semData>1?'s':'')+' pela data de fechamento do lead ou de entrada do cliente.</span>':'');

  document.getElementById('mmd-lista').innerHTML=itens.length?itens.map(x=>{
    const abrir=x.tipo==='contrato'
      ?`fecharOverlay('overlay-metadetalhe');irParaCliente('${x.c.id}')`
      :`fecharOverlay('overlay-metadetalhe');abrirLeadDeTarefa('${x.l.id}','${x.l._mod}')`;
    let origem;
    if(x.tipo==='lead')origem='lead do funil';
    else if(x.ct.leadId)origem='contrato · veio do funil';
    else origem='contrato · cadastrado na ficha';
    return `<div class="meta-contrato" onclick="${abrir}" title="${x.tipo==='contrato'?'Abrir a ficha do cliente':'Abrir a jornada deste lead'}">
      <div class="meta-contrato-info">
        <div class="meta-contrato-nome">${esc(x.nome)}</div>
        <div class="meta-contrato-meta">${esc(x.titulo)}<br>${x.estimada?'sem data de início · contado em ':'início em '}${fmtData(x.data)} · ${origem}</div>
      </div>
      <span class="meta-origem ${x.estimada?'est':''}">${x.estimada?'data estimada':'data confirmada'}</span>
      <span class="fin-item-val">${money(x.valor)}</span>
    </div>`;
  }).join(''):'<p style="font-size:13px;color:var(--t3);padding:12px 0;line-height:1.55">Nenhum contrato fechado neste mês. Contratos entram aqui pela data de início, seja o fechamento feito no funil do CRM, seja o contrato cadastrado na ficha do cliente.</p>';

  abrirOverlay('overlay-metadetalhe');
}
function renderDashboardCRM(){
  const kEl=document.getElementById('crm-kpis');
  if(!kEl)return; // painel ainda não está na tela (defensivo)
  const k=calcularKPIsCRM();
  const clsFollow=k.parados.length?'red':'green';
  kEl.innerHTML=`
    <div class="stat-card" data-c="blue"><div class="stat-label">Leads no mês</div><div class="stat-val">${k.leadsMes}</div></div>
    <div class="stat-card" data-c="green"><div class="stat-label">Taxa de conversão</div><div class="stat-val">${Math.round(k.taxaConversao*100)}%</div></div>
    <div class="stat-card" data-c="amber"><div class="stat-label">Ticket médio (fechados)</div><div class="stat-val">${moneyK(k.ticketMedio)}</div></div>
    <div class="stat-card" data-c="${clsFollow}" ${k.parados.length?'style="cursor:pointer" onclick="abrirFollowupPendentes()" title="Ver os leads com follow-up pendente"':''}>
      <div class="stat-label">Follow-ups atrasados${k.parados.length?' <i class="ti ti-external-link" style="font-size:10px"></i>':''}</div><div class="stat-val">${k.parados.length}</div></div>`;
  renderHbarCRM('crm-origem',dadosOrigemCRM(),true);
  renderHbarCRM('crm-objecao',dadosObjecaoCRM(),true);
  renderAreasCRM('crm-areas',dadosAreasCRM());
  renderFunilCRM('crm-funil',dadosFunilCRM());
  renderHbarCRM('crm-propostas-socio',dadosPropostasSemanaPorSocio(),false);
}
// lista de follow-ups pendentes num modal compacto (aberta pelo card do dashboard)
function abrirFollowupPendentes(){
  const parados=todosLeadsCRM().filter(leadFollowupAtrasado).sort((a,b)=>leadDiasSemContato(b)-leadDiasSemContato(a));
  const el=document.getElementById('followup-lista');
  document.getElementById('followup-sub').textContent=parados.length
    ? parados.length+' lead'+(parados.length>1?'s':'')+' sem contato há '+CRM_FOLLOWUP_DIAS+'+ dias'
    : 'Nenhum follow-up pendente. Tudo em dia.';
  el.innerHTML=parados.length?parados.map(l=>{
    const dias=leadDiasSemContato(l);
    return `<div class="lead-item hoverable" onclick="fecharOverlay('overlay-followup');mudarTipoTriagem('${l._mod}');${l._mod==='civel'?'abrirLeadCivel':'abrirLead'}('${l.id}')">
      <div class="lead-info"><div class="lead-nome">${esc(l.nome)}</div><div class="lead-meta">${esc(l.area||'')}${l.responsavel?' · '+esc(l.responsavel):''}</div></div>
      <div class="lead-pill pill-fail">${dias}d sem contato</div>
    </div>`;
  }).join(''):'<p style="font-size:13.5px;color:var(--t3);padding:10px 0">Nenhum follow-up pendente.</p>';
  abrirOverlay('overlay-followup');
}
function toggleCrmDash(){
  const body=document.getElementById('crm-dash-body');
  const chevron=document.getElementById('crm-dash-chevron');
  const aberto=body.style.display!=='none';
  body.style.display=aberto?'none':'block';
  chevron.className=aberto?'ti ti-chevron-down':'ti ti-chevron-up';
}
function abrirModalMetaCRM(){
  const chave=mesChaveDe(Date.now());
  const meta=metaCRMDoMes(chave);
  const tri=chaveTrimestre(chave);
  document.getElementById('mcrm-mes').textContent='Metas de '+nomeMesChave(chave)+' e do '+nomeTrimestre(tri)+'. As referências abaixo de cada campo são a média dos meses já encerrados.';
  document.getElementById('mcrm-contratos').value=meta.contratos;
  document.getElementById('mcrm-faturamento').value=meta.faturamento;
  document.getElementById('mcrm-recebido').value=meta.recebido;
  document.getElementById('mcrm-trimestre').value=metaTrimestre(tri);
  const rec3=mediaUltimosMeses(3,m=>recebidoDoMes(m).meta), rec6=mediaUltimosMeses(6,m=>recebidoDoMes(m).meta);
  const hon3=mediaUltimosMeses(3,honorariosFechadosDoMes), hon6=mediaUltimosMeses(6,honorariosFechadosDoMes);
  document.getElementById('mcrm-ref-recebido').textContent='Média recebida: '+money(rec3)+' (3 meses) · '+money(rec6)+' (6 meses)';
  document.getElementById('mcrm-ref-hon').textContent='Média fechada: '+money(hon3)+' (3 meses) · '+money(hon6)+' (6 meses)';
  document.getElementById('mcrm-ref-tri').textContent='Três meses no ritmo atual: '+money(hon3*3);
  abrirOverlay('overlay-metacrm');
}
function salvarMetaCRM(){
  const chave=mesChaveDe(Date.now());
  if(!DB.metasCRM)DB.metasCRM={};
  const num=id=>Math.max(0,Number(document.getElementById(id).value)||0);
  DB.metasCRM[chave]={contratos:num('mcrm-contratos'),faturamento:num('mcrm-faturamento'),recebido:num('mcrm-recebido')};
  DB.metasCRM[chaveTrimestre(chave)]={honorarios:num('mcrm-trimestre')};
  salvarDB();
  fecharOverlay('overlay-metacrm');
  renderDashboardCRM();
  renderDashMetaContratos();
}

// ─── JORNADA COMERCIAL: preenchimento e leitura dos campos no detalhe do lead ───
// ─── TRANSIÇÃO DE ETAPA NO FUNIL DE VENDAS (regras de negócio) ───
function jrMudarStatusCRM(el){
  const civel=!!el.closest('#tri-layout-civel');
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj)return;
  const novo=el.value, anterior=obj.statusCRM||'Novo';
  if(novo===anterior)return;
  if(novo==='Qualificado'&&!(obj.valorHonorarioEstimado>0)){
    alert('Para avançar para "Qualificado" é obrigatório informar o honorário estimado (campo "Valor estimado (R$)", na seção Honorários e objeção).');
    el.value=anterior;
    return;
  }
  if(novo==='Perdido'){
    el.value=anterior; // só efetiva depois de confirmar o motivo obrigatório no modal
    abrirModalMotivoPerda(obj.id,civel?'civel':'trab','jornada');
    return;
  }
  aplicarTransicaoEtapa(obj,novo,civel);
}
function aplicarTransicaoEtapa(obj,novo,civel){
  obj.statusCRM=novo;
  obj.etapaEntradaEm=Date.now();
  if(novo==='Proposta enviada'){
    obj.propostaEnviada='Sim'; // mantém o botão "Proposta enviada? Sim" em sincronia com o funil
    const sufP=civel?'-civel':'';
    [['jr-proposta-sim','Sim'],['jr-proposta-nao','Nao']].forEach(([id,v])=>{const b=document.getElementById(id+sufP);if(b)b.classList.toggle('on',obj.propostaEnviada===v);});
  }
  if(novo==='Ganho'){obj.fechouCRM='Sim';if(!obj.ganhoEm)obj.ganhoEm=Date.now();}
  const suf=civel?'-civel':'';
  const sel=document.getElementById('jr-status-crm'+suf);
  if(sel)sel.value=novo;
  const wrap=document.getElementById('jr-motivo-perda-wrap'+suf);
  if(wrap)wrap.style.display=novo==='Perdido'?'block':'none';
  if(document.getElementById('jr-proxima-acao'+suf))document.getElementById('jr-proxima-acao'+suf).value=obj.proximaAcaoEm||'';
  aplicarBadgeEtapa(obj,suf);
  civel?marcarDirtyCivel():marcarDirty();
}
// modal de motivo de perda (obrigatório): usado tanto ao mudar o status na Jornada
// quanto ao concluir a tarefa do dia 15 da cadência de follow-up, de fora da ficha do lead
let mvpCtx=null;
function abrirModalMotivoPerda(id,mod,origem,tarefaId){
  mvpCtx={id,mod,origem,tarefaId};
  const arr=mod==='civel'?leadsCivel:leads;
  const l=arr.find(x=>x.id===id);
  document.getElementById('mvp-sub').textContent=l?('Lead: '+l.nome):'';
  document.getElementById('mvp-motivo').value=(l&&l.motivoPerda)||'';
  abrirOverlay('overlay-motivoperda');
}
function confirmarMotivoPerda(){
  const motivo=document.getElementById('mvp-motivo').value;
  if(!motivo){alert('Selecione o motivo da perda antes de confirmar.');return;}
  if(!mvpCtx)return;
  const arr=mvpCtx.mod==='civel'?leadsCivel:leads;
  const obj=arr.find(x=>x.id===mvpCtx.id);
  if(obj){
    obj.motivoPerda=motivo;
    aplicarTransicaoEtapa(obj,'Perdido',mvpCtx.mod==='civel');
    if(mvpCtx.origem==='jornada'){
      if(leadAtual&&leadAtual.id===obj.id)aplicarJornadaUI(leadAtual);
      if(leadCivelAtual&&leadCivelAtual.id===obj.id)aplicarJornadaUICivel(leadCivelAtual);
    }else{
      salvarDB(); // veio de uma tarefa concluída na Rotina, fora do fluxo de "Salvar" da ficha
      refreshUI();
    }
  }
  fecharOverlay('overlay-motivoperda');
  mvpCtx=null;
}
// converte um timestamp em data ISO (YYYY-MM-DD)
function dataISOdePrazo(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
// badge de prazo da etapa (estouro) no topo da Jornada — ao lado do badge de "sem contato"
function aplicarBadgeEtapa(l,suf){
  const badge=document.getElementById('jr-etapa-badge'+suf);
  if(badge){
    const info=leadPrazoEtapaInfo(l);
    if(!info){badge.style.display='none';}
    else{
      badge.style.display='inline-flex';
      badge.className='prazo-badge '+(info.vencido?'prazo-late':'prazo-ok');
      badge.textContent=info.texto;
    }
  }
  // destaque visual no campo de próxima ação quando vencida ou não preenchida
  const campoProxima=document.getElementById('jr-proxima-acao'+suf);
  if(campoProxima){
    const vencida=leadProximaAcaoVencida(l);
    campoProxima.readOnly=false;
    campoProxima.style.borderColor=vencida?'var(--red-hi)':'';
    campoProxima.style.background=vencida?'var(--red-bg)':'';
    campoProxima.title=vencida?(l.proximaAcaoEm?'Próxima ação vencida':'Próxima ação obrigatória — ainda não definida'):'';
  }
}
function jrField(el,campo,isNumber){
  const civel=!!el.closest('#tri-layout-civel');
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj)return;
  obj[campo]=isNumber?(Number(el.value)||0):el.value;
  if(campo==='proximaAcaoEm'||campo==='reuniaoDataHora')aplicarBadgeEtapa(obj,civel?'-civel':'');
  civel?marcarDirtyCivel():marcarDirty();
}
function jrSeg(btn,campo){
  const civel=!!btn.closest('#tri-layout-civel');
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj)return;
  const val=btn.dataset.val;
  obj[campo]=(obj[campo]===val)?'':val; // clique de novo desmarca
  [...btn.parentElement.children].forEach(b=>b.classList.toggle('on',b===btn&&obj[campo]===val));
  // marcar "Proposta enviada? Sim" avança o funil para "Proposta enviada" se ainda estiver antes
  if(campo==='propostaEnviada'&&obj.propostaEnviada==='Sim'){
    const suf=civel?'-civel':'';
    const ordemAtual=STATUS_CRM_OPCOES.indexOf(obj.statusCRM);
    const ordemProposta=STATUS_CRM_OPCOES.indexOf('Proposta enviada');
    if(ordemAtual>=0&&ordemAtual<ordemProposta){
      obj.statusCRM='Proposta enviada';
      obj.etapaEntradaEm=Date.now();
      const sel=document.getElementById('jr-status-crm'+suf);
      if(sel)sel.value='Proposta enviada';
      aplicarBadgeEtapa(obj,suf);
    }
  }
  civel?marcarDirtyCivel():marcarDirty();
}
function jrAddFollowup(civel){
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj)return;
  if(!Array.isArray(obj.followups))obj.followups=[];
  obj.followups.push({data:hojeISO(),resultado:''});
  atualizarProximaAcaoPreProposta(obj); // âncora move para o novo toque; régua recalculada
  civel?aplicarJornadaUICivel(obj):aplicarJornadaUI(obj);
  civel?marcarDirtyCivel():marcarDirty();
}
function jrRemoverFollowup(idx,civel){
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj||!obj.followups)return;
  obj.followups.splice(idx,1);
  atualizarProximaAcaoPreProposta(obj); // âncora volta ao toque anterior/criação
  civel?aplicarJornadaUICivel(obj):aplicarJornadaUI(obj);
  civel?marcarDirtyCivel():marcarDirty();
}
function jrFollowupCampo(idx,campo,val,civel){
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj||!obj.followups||!obj.followups[idx])return;
  obj.followups[idx][campo]=val;
  if(campo==='data'){
    atualizarProximaAcaoPreProposta(obj); // mudou a data do toque → recalcula a régua
    const suf=civel?'-civel':'';
    const campoP=document.getElementById('jr-proxima-acao'+suf);
    if(campoP)campoP.value=obj.proximaAcaoEm||'';
    aplicarBadgeEtapa(obj,suf);
  }
  civel?marcarDirtyCivel():marcarDirty();
}
function renderFollowupsUI(l,suf){
  const el=document.getElementById('jr-followups'+suf);
  if(!el)return;
  const civel=suf==='-civel';
  const fups=l.followups||[];
  el.innerHTML=fups.length?fups.map((f,i)=>`
    <div class="jr-followup-row">
      <input type="date" value="${f.data||''}" onchange="jrFollowupCampo(${i},'data',this.value,${civel})">
      <input type="text" value="${esc(f.resultado||'')}" placeholder="Resultado do contato…" oninput="jrFollowupCampo(${i},'resultado',this.value,${civel})">
      <button type="button" class="btn-ico" onclick="jrRemoverFollowup(${i},${civel})" title="Remover"><i class="ti ti-trash" style="font-size:13px"></i></button>
      <select style="grid-column:1/-1" onchange="jrFollowupTipo(${i},this.value,${civel})" title="Ao escolher, o sistema ajusta o estágio/próxima ação automaticamente">
        <option value="">Tipo de resposta…</option>
        ${TIPO_RESPOSTA.map(([v,lbl])=>`<option value="${v}" ${f.tipo===v?'selected':''}>${lbl}</option>`).join('')}
      </select>
    </div>`).join(''):'<p style="font-size:12.5px;color:var(--t3);margin-bottom:8px">Nenhum follow-up registrado ainda.</p>';
  const dias=leadDiasSemContato(l);
  const badge=document.getElementById('jr-parado-badge'+suf);
  if(badge){
    if(dias===null){badge.style.display='none';}
    else{
      badge.style.display='inline-flex';
      const atrasado=dias>=CRM_FOLLOWUP_DIAS;
      badge.className='prazo-badge '+(atrasado?'prazo-late':'prazo-ok');
      badge.textContent=(dias===0?'Contato hoje':dias+'d sem contato')+(atrasado?' · follow-up pendente':'');
    }
  }
}
// ═══ TIPO DE RESPOSTA DO FOLLOW-UP (ação automática) ══════════════
// Campo fechado por follow-up. Ao escolher, o sistema age sozinho (mantém/muda estágio e
// agenda a próxima ação). O tipo escolhido fica guardado no lead (ultimoTipoResposta) para
// selecionar o modelo de mensagem. Vale igual para trabalhista e cível.
const TIPO_RESPOSTA=[
  ['nao_respondeu','Não respondeu'],
  ['cordial_evasiva','Respondeu cordial mas evasiva'],
  ['prazo_financeiro','Pediu prazo — financeiro'],
  ['prazo_logistico','Pediu prazo — logístico'],
  ['objecao_preco','Objeção de preço'],
  ['quer_agendar','Quer agendar'],
  ['recusou','Recusou'],
];
const TIPO_RESPOSTA_LBL=Object.fromEntries(TIPO_RESPOSTA);
function fmtProximaISO(ts){const d=new Date(ts);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T09:00';}
// "próximo passo da régua" pré-proposta: o passo seguinte ao primeiro-futuro atual
function calcularProximoPassoReguaPreProposta(l){
  const base=leadAncoraPreProposta(l), agora=Date.now();
  const steps=REGUA_PRE_PROPOSTA_DIAS.map(d=>base+d*86400000);
  let idx=steps.findIndex(ts=>ts>agora);
  if(idx===-1)idx=steps.length-1; else idx=Math.min(idx+1,steps.length-1);
  return fmtProximaISO(steps[idx]);
}
function jrFollowupTipo(idx,val,civel){
  const obj=civel?leadCivelAtual:leadAtual;
  if(!obj||!obj.followups||!obj.followups[idx])return;
  obj.followups[idx].tipo=val;
  if(idx===obj.followups.length-1)obj.ultimoTipoResposta=val; // tipo da última resposta
  if(val)aplicarAcaoTipoResposta(obj,val,civel);
  civel?marcarDirtyCivel():marcarDirty();
}
function aplicarAcaoTipoResposta(obj,tipo,civel){
  const suf=civel?'-civel':'', agora=Date.now();
  let recarrega=false;
  switch(tipo){
    case 'nao_respondeu':
      obj.proximaAcaoEm=leadPreProposta(obj)?calcularProximoPassoReguaPreProposta(obj):fmtProximaISO(agora+2*86400000);
      break;
    case 'cordial_evasiva': obj.proximaAcaoEm=fmtProximaISO(agora+2*86400000); break;
    case 'prazo_logistico': obj.proximaAcaoEm=fmtProximaISO(agora+3*86400000); break;
    case 'prazo_financeiro':{
      const est=prompt('Data estimada pelo cliente (AAAA-MM-DD). Deixe vazio para +30 dias:','');
      if(est&&/^\d{4}-\d{2}-\d{2}$/.test(est))obj.proximaAcaoEm=est+'T09:00';
      else obj.proximaAcaoEm=fmtProximaISO(agora+30*86400000);
      break;}
    case 'objecao_preco':
      aplicarTransicaoEtapa(obj,'Em negociação',civel); recarrega=true; break;
    case 'quer_agendar':{
      const dh=prompt('Data e hora da reunião (AAAA-MM-DDTHH:MM):', obj.reuniaoDataHora||'');
      if(dh){obj.reuniaoDataHora=dh; obj.proximaAcaoEm=dh;}
      aplicarTransicaoEtapa(obj,'Reunião marcada',civel); recarrega=true; break;}
    case 'recusou':
      abrirModalMotivoPerda(obj.id,civel?'civel':'trab','jornada'); // modal cuida da baixa + refresh
      return;
  }
  const cp=document.getElementById('jr-proxima-acao'+suf);
  if(cp)cp.value=obj.proximaAcaoEm||'';
  if(recarrega){civel?aplicarJornadaUICivel(obj):aplicarJornadaUI(obj);}
  else aplicarBadgeEtapa(obj,suf);
  if(typeof renderFilaHoje==='function')renderFilaHoje();
}
// ═══ MODELOS DE MENSAGEM (estágio × tipo da última resposta) ══════
// Marcadores [nome] [data] [problema] preenchidos a partir dos campos do lead quando existirem.
// Inclui encerramento com takeaway e reativação com duas opções (presencial e vídeo).
const MODELOS=[
  {tipo:'nao_respondeu', titulo:'Lembrete leve (sem resposta)',
   texto:'Oi [nome], tudo bem? Passando rapidinho sobre [problema]. Consigo te trazer um próximo passo concreto ainda esta semana — quer que eu seja?'},
  {tipo:'cordial_evasiva', titulo:'Reforço com valor',
   texto:'[nome], entendo que a rotina aperta. Deixo simples: o próximo passo em [problema] eu conduzo por você. Posso te retomar em [data]?'},
  {tipo:'prazo_financeiro', titulo:'Prazo financeiro — reagendar',
   texto:'Sem problema, [nome]. Deixo reservado para retomarmos em [data]. Se antes disso algo mudar, me chama que a gente ajusta as condições de [problema].'},
  {tipo:'prazo_logistico', titulo:'Prazo logístico',
   texto:'Combinado, [nome]. Retomo em [data] para acertarmos os detalhes de [problema]. Qualquer coisa antes, estou à disposição.'},
  {tipo:'objecao_preco', titulo:'Objeção de preço — negociação',
   texto:'[nome], faz sentido pensar no investimento. Posso te mostrar como estruturar o valor de [problema] de um jeito que caiba no seu momento. Topa uma conversa rápida?'},
  {tipo:'quer_agendar', titulo:'Confirmação de reunião',
   texto:'Ótimo, [nome]! Reunião marcada para [data]. Vou te enviar o lembrete. Pode separar os documentos de [problema] que a gente avança rápido.'},
  {tipo:'recusou', titulo:'Encerramento com takeaway',
   texto:'Entendo, [nome]. Encerro seu atendimento por aqui para não te incomodar. Fica um ponto de atenção sobre [problema]: se a situação evoluir, guarde os documentos e me chame que retomo de onde paramos.'},
];
// modelo de encerramento com takeaway (também usado quando o estágio é "Perdido")
const MODELO_ENCERRAMENTO={titulo:'Encerramento com takeaway',
  texto:'[nome], vou encerrar seu atendimento por aqui. Registro um ponto importante sobre [problema] para você guardar: se houver qualquer novidade, é só me chamar que retomamos sem recomeçar do zero.'};
// modelo de reativação com duas opções (lead frio / sem tipo recente)
const MODELO_REATIVACAO={titulo:'Reativação (presencial ou vídeo)',
  presencial:'Oi [nome], retomando seu caso de [problema]. Consigo te receber presencialmente para destravar isso — quer que eu reserve um horário?',
  video:'Oi [nome], retomando seu caso de [problema]. Dá para resolvermos por uma call de vídeo rápida, sem você se deslocar. Prefere assim?'};
function preencherMarcadores(txt,l){
  const alvo=l.reuniaoDataHora||l.proximaAcaoEm||'';
  const map={nome:l.nome, problema:l.problema, data:alvo?fmtData(alvo.slice(0,10)):''};
  return txt.replace(/\[(\w+)\]/g,(m,k)=>(map[k]!==undefined&&map[k]!=='')?map[k]:m); // mantém o marcador se o campo não existe
}
function modeloParaLead(l){
  if(l.statusCRM==='Perdido')return {titulo:MODELO_ENCERRAMENTO.titulo,texto:preencherMarcadores(MODELO_ENCERRAMENTO.texto,l)};
  const m=l.ultimoTipoResposta?MODELOS.find(x=>x.tipo===l.ultimoTipoResposta):null;
  if(m)return {titulo:m.titulo,texto:preencherMarcadores(m.texto,l)};
  // sem tipo de resposta recente: oferece reativação nas duas opções
  return {titulo:MODELO_REATIVACAO.titulo,
    texto:'▸ Presencial: '+preencherMarcadores(MODELO_REATIVACAO.presencial,l)+'\n\n▸ Vídeo: '+preencherMarcadores(MODELO_REATIVACAO.video,l)};
}
function renderModeloLead(l,suf){
  const el=document.getElementById('jr-modelo'+suf); if(!el)return;
  const m=modeloParaLead(l);
  const tipoLbl=l.ultimoTipoResposta?TIPO_RESPOSTA_LBL[l.ultimoTipoResposta]:'—';
  const mid='jrmod'+suf;
  el.innerHTML=`
    <div style="font-size:12px;color:var(--t3);margin-bottom:6px">Última resposta: <b style="color:var(--navy)">${esc(tipoLbl)}</b> · Estágio: <b style="color:var(--navy)">${esc(l.statusCRM||'—')}</b></div>
    <div style="font-size:12.5px;font-weight:600;color:var(--navy);margin-bottom:6px">${esc(m.titulo)}</div>
    <div id="${mid}" style="white-space:pre-wrap;background:var(--surface2);border-radius:8px;padding:10px;font-size:12.5px;color:var(--t2);margin:0 0 8px">${esc(m.texto)}</div>
    <button type="button" class="btn-novo-lead" onclick="copiarDe('${mid}')"><i class="ti ti-copy"></i>Copiar mensagem</button>`;
}
// copia o texto de um elemento para a área de transferência, com feedback no botão
function copiarDe(id){
  const el=document.getElementById(id); if(!el)return;
  const txt=el.textContent;
  const btn=(typeof event!=='undefined'&&event&&event.target)?event.target.closest('button'):null;
  const ok=()=>{if(btn){const o=btn.innerHTML;btn.innerHTML='<i class="ti ti-check"></i> Copiado';setTimeout(()=>btn.innerHTML=o,1400);}};
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(ok).catch(()=>ok());}
  else{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(e){}ta.remove();ok();}
}
// mostra/esconde os blocos avançados da jornada (Origem, Honorários, Aprendizado)
let jrAvancado={'':false,'-civel':false};
function jrToggleAvancado(suf){
  jrAvancado[suf]=!jrAvancado[suf];
  document.querySelectorAll('.jr-avancado'+(suf==='-civel'?'-civel':'-trab')).forEach(el=>el.style.display=jrAvancado[suf]?'block':'none');
  const btn=document.getElementById('jr-expandir'+suf);
  if(btn)btn.innerHTML=jrAvancado[suf]?'<i class="ti ti-chevron-up"></i>Recolher campos completos':'<i class="ti ti-chevron-down"></i>Expandir campos completos';
}
function _aplicarJornadaCore(l,suf){
  const g=id=>document.getElementById(id+suf);
  if(!g('jr-origem'))return; // pane ainda não renderizada
  g('jr-origem').value=l.categoriaOrigem||'';
  g('jr-origem-texto').value=l.origemTexto||'';
  g('jr-area').value=l.area||'';
  g('jr-responsavel').value=l.responsavel||'';
  g('jr-motivo').value=l.motivoBusca||'';
  g('jr-problema').value=l.problema||'';
  g('jr-honorarios-texto').value=l.honorariosTexto||'';
  g('jr-valor-estimado').value=l.valorHonorarioEstimado||'';
  g('jr-probabilidade').value=(l.probabilidadeFechamento!==undefined&&l.probabilidadeFechamento!==null)?l.probabilidadeFechamento:'';
  g('jr-objecao').value=l.objecaoPrincipal||'';
  g('jr-cat-objecao').value=l.categoriaObjecao||'';
  g('jr-inseguranca').value=l.inseguranca||'';
  g('jr-canal-followup').value=l.canalFollowup||'';
  g('jr-entrou-contato').value=l.entrouContatoTexto||'';
  g('jr-reuniao-agendada').value=l.reuniaoAgendadaTexto||'';
  g('jr-status-crm').value=l.statusCRM||'Novo';
  g('jr-motivo-perda-ganho').value=l.motivoPerdaGanho||'';
  g('jr-licoes').value=l.licoes||'';
  g('jr-reuniao-datahora').value=l.reuniaoDataHora||'';
  g('jr-proxima-acao').value=l.proximaAcaoEm||'';
  const wrapMotivo=g('jr-motivo-perda-wrap');
  if(wrapMotivo)wrapMotivo.style.display=l.statusCRM==='Perdido'?'block':'none';
  g('jr-motivo-perda').value=l.motivoPerda||'';
  ['1','2','3','4','5'].forEach(n=>{const b=document.getElementById('jr-urg-'+n+suf);if(b)b.classList.toggle('on',String(l.urgencia)===n);});
  [['jr-hobst-sim','Sim'],['jr-hobst-nao','Nao'],['jr-hobst-talvez','Talvez']].forEach(([id,v])=>{const b=document.getElementById(id+suf);if(b)b.classList.toggle('on',l.honorariosObstaculo===v);});
  [['jr-compareceu-sim','Sim'],['jr-compareceu-nao','Nao']].forEach(([id,v])=>{const b=document.getElementById(id+suf);if(b)b.classList.toggle('on',l.compareceu===v);});
  [['jr-proposta-sim','Sim'],['jr-proposta-nao','Nao']].forEach(([id,v])=>{const b=document.getElementById(id+suf);if(b)b.classList.toggle('on',l.propostaEnviada===v);});
  [['jr-fechou-sim','Sim'],['jr-fechou-nao','Nao']].forEach(([id,v])=>{const b=document.getElementById(id+suf);if(b)b.classList.toggle('on',l.fechouCRM===v);});
  renderFollowupsUI(l,suf);
  aplicarBadgeEtapa(l,suf);
  // ao abrir o lead, mantém o estado atual do "expandir" (blocos avançados recolhidos por padrão)
  document.querySelectorAll('.jr-avancado'+(suf==='-civel'?'-civel':'-trab')).forEach(el=>el.style.display=jrAvancado[suf]?'block':'none');
}
function aplicarJornadaUI(l){_aplicarJornadaCore(l,'')}
function aplicarJornadaUICivel(l){_aplicarJornadaCore(l,'-civel')}

// ─── CONVERSÃO: LEAD → CLIENTE ────────────────────────────
// ─── CONTRATOS FECHADOS (meta do mês e gráfico de desempenho) ───
// Regra: todo contrato fechado conta, venha de onde vier — do funil do CRM, do
// cadastro manual na ficha do cliente ou de um cliente antigo que voltou. A
// fonte é a lista de contratos dos clientes. Lead marcado como ganho que ainda
// não virou contrato de nenhum cliente também conta, para o fechamento não se
// perder enquanto a conversão não é feita; lead já ligado a um contrato não
// conta de novo. Demandas pessoais dos sócios não são contratos de honorários.
function isoDeTs(ts){const d=new Date(ts);return isoDe(d.getFullYear(),d.getMonth(),d.getDate())}
function leadPorId(id,mod){
  const lista=mod==='civel'?leadsCivel:mod==='trab'?leads:[...leads,...leadsCivel];
  return id?lista.find(l=>l.id===id)||null:null;
}
// data do contrato: a de início; sem ela, a do fechamento do lead; sem nenhuma,
// para o primeiro contrato do cliente, a entrada do cliente (ou o processo mais antigo)
function dataDoContrato(c,ct){
  if(ct.inicio)return {data:ct.inicio,estimada:false};
  const l=leadPorId(ct.leadId,ct.leadMod);
  if(l&&(l.ganhoEm||l.criadoEm))return {data:isoDeTs(l.ganhoEm||l.criadoEm),estimada:true};
  if(contratosDe(c)[0]===ct){const e=getEntrada(c);if(e)return {data:e,estimada:true};}
  return {data:'',estimada:true};
}
// valor do contrato: o informado no próprio contrato; sem ele, o total lançado
// nele (recebido + previsto); sem lançamentos, o honorário estimado no lead
function valorDoContrato(c,ct){
  if(ct.valor>0)return ct.valor;
  const lancado=finDoContrato(c,ct.id).filter(f=>f.t!=='saida').reduce((a,f)=>a+f.v,0);
  if(lancado>0)return lancado;
  const l=leadPorId(ct.leadId,ct.leadMod);
  return (l&&l.valorHonorarioEstimado)||0;
}
function contratosFechadosTodos(){
  const itens=[], leadsComContrato=new Set();
  (DB.clientes||[]).forEach(c=>{
    contratosDe(c).forEach(ct=>{
      if(ct.leadId)leadsComContrato.add(ct.leadId);
      if(c.tipo==='pessoal')return;
      const {data,estimada}=dataDoContrato(c,ct);
      if(!data)return;
      itens.push({tipo:'contrato',c,ct,data,estimada,valor:valorDoContrato(c,ct),nome:c.nome,titulo:ct.titulo});
    });
  });
  leadsCRMFunil().filter(leadFechado).forEach(l=>{
    if(leadsComContrato.has(l.id))return;
    if(l.clienteId&&clientePorId(l.clienteId))return;   // já é cliente: conta pelo contrato dele
    itens.push({tipo:'lead',l,data:isoDeTs(l.ganhoEm||l.criadoEm),estimada:!l.ganhoEm,valor:l.valorHonorarioEstimado||0,nome:l.nome,titulo:'Lead ganho no funil (ainda sem contrato no cliente)'});
  });
  return itens.sort((a,b)=>b.data.localeCompare(a.data));
}

// ─── FECHAMENTO DE CONTRATO COM CLIENTE QUE JÁ ESTÁ NA CARTEIRA ───
// Antes, todo "fechar contrato" criava um cadastro de cliente novo — um cliente
// que volta para o 2º ou 3º contrato aparecia duplicado. Agora, se já existe um
// cliente com o mesmo nome (ou nome que começa igual, ex.: "Padaria Exemplo" e
// "Padaria Exemplo Ltda"), o sistema pergunta se o fechamento é um novo contrato dele.
function nomeComparavel(s){return semAcento(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function clientesComMesmoNome(nome){
  const n=nomeComparavel(nome);
  if(n.length<3)return [];
  return ordenarPorNome(DB.clientes.filter(c=>{
    const k=nomeComparavel(c.nome);
    return k===n||k.startsWith(n+' ')||n.startsWith(k+' ');
  }));
}
function clienteParaNovoContrato(nome){
  const cands=clientesComMesmoNome(nome);
  if(!cands.length)return null;
  if(cands.length===1){
    const c=cands[0];
    return confirm('Já existe na carteira o cliente "'+c.nome+'" ('+contratosDe(c).length+' contrato(s) registrado(s)).\n\n'+
      'OK: registrar este fechamento como um NOVO CONTRATO desse cliente.\n'+
      'Cancelar: criar um cadastro de cliente separado.')?c:null;
  }
  const r=prompt('Há '+cands.length+' clientes com nome parecido na carteira:\n\n'+
    cands.map((c,i)=>(i+1)+'. '+c.nome+' ('+contratosDe(c).length+' contrato(s))').join('\n')+
    '\n\nDigite o número do cliente para registrar este fechamento como um novo contrato dele, ou deixe em branco para criar um cadastro separado.','');
  const i=parseInt(r,10);
  return (i>=1&&i<=cands.length)?cands[i-1]:null;
}
// converte o lead: novo contrato num cliente existente ou um cliente novo
function registrarContratoDoLead(lead,mod,objeto){
  const existente=clienteParaNovoContrato(lead.nome);
  const ct=novoContrato({titulo:objeto,inicio:hojeISO(),leadId:lead.id,leadMod:mod});
  let c;
  if(existente){
    c=existente;
    if(!Array.isArray(c.contratos))c.contratos=[];
    c.contratos.push(ct);
    c.status='Ativo';
    if(!c.leadVinculadoId){c.leadVinculadoId=lead.id;c.leadVinculadoMod=mod;}
  }else{
    c={
      id:uid(),nome:lead.nome,curto:lead.nome.trim().split(/\s+/)[0],tel:lead.tel||'',
      tipo:'externo',status:'Ativo',demandas:objeto,entrada:hojeISO(),fin:[],
      leadVinculadoId:lead.id,leadVinculadoMod:mod, // vínculo lead-contrato: já nasce vinculado, sem pendência
      contratos:[ct],
    };
    DB.clientes.push(c);
  }
  DB.tarefas.push({id:uid(),cid:c.id,titulo:existente?'Elaborar contrato — '+objeto:'Elaborar contrato e petição inicial',tipo:'inicial',resp:(EU&&RESP.includes(EU.nome)?EU.nome:'Cecília'),status:'pendente',prazo:''});
  return {c,existente:!!existente};
}
function fecharContrato(){
  if(!leadAtual||leadAtual.convertido)return;
  if(!confirm('Marcar contrato FECHADO com "'+leadAtual.nome+'"?\n\nO lead será transferido para a carteira de clientes (ativo).'))return;
  const {c:novo,existente}=registrarContratoDoLead(leadAtual,'trab',
    'Reclamatória Trabalhista'+(leadAtual.statusLabel&&leadAtual.statusLabel!=='Pendente'?' (triagem: '+leadAtual.statusLabel+')':''));
  salvarDB();
  // marca o lead como convertido e fechado (conta como contrato do mês)
  leadAtual.convertido=true;
  leadAtual.clienteId=novo.id;
  leadAtual.statusAtendimento='convertido';
  leadAtual.fechouCRM='Sim';
  leadAtual.statusCRM='Ganho';
  leadAtual.ganhoEm=Date.now();
  salvarStorage();
  renderLeads(document.getElementById('trab-search').value);
  abrirLead(leadAtual.id);
  refreshUI();
  if(confirm('Contrato fechado! '+(existente?'Registrado como novo contrato de "'+novo.nome+'".':'"'+novo.nome+'" já está na carteira de clientes.')+'\n\nDeseja abrir a ficha do cliente agora?'))irParaCliente(novo.id);
}

function aplicarChecklist(){
  if(!leadAtual)return;
  const ck=leadAtual.checklist||{};
  document.querySelectorAll('#tri-layout-trab .ck-item').forEach(el=>{
    const{type,idx}=el.dataset;
    const v=(ck[type]||{})[idx];
    el.dataset.state=v||'';
    const box=el.querySelector('.ck-box');
    if(v==='ok')box.innerHTML='✓';
    else if(v==='fail')box.innerHTML='✕';
    else box.innerHTML='';
  });
}

function toggleItem(el){
  if(!leadAtual)return;
  const{type,idx}=el.dataset;
  if(!leadAtual.checklist)leadAtual.checklist={};
  const ck=leadAtual.checklist;
  if(!ck[type])ck[type]={};
  if(type==='kill'){
    const cur=ck[type][idx];
    if(!cur)ck[type][idx]='ok';
    else if(cur==='ok')ck[type][idx]='fail';
    else delete ck[type][idx];
  } else {
    if(!ck[type][idx])ck[type][idx]='ok';
    else delete ck[type][idx];
  }
  aplicarChecklist();
  calcularScore();
  marcarDirty();
}

function calcularScore(){
  if(!leadAtual)return;
  const ck=leadAtual.checklist||{};
  const kN=document.querySelectorAll('#tri-layout-trab [data-type="kill"]').length;
  const rN=document.querySelectorAll('#tri-layout-trab [data-type="risk"]').length;
  const pN=document.querySelectorAll('#tri-layout-trab [data-type="plus"]').length;
  const kOk=Object.values(ck.kill||{}).filter(v=>v==='ok').length;
  const hasFail=Object.values(ck.kill||{}).some(v=>v==='fail');
  const rOk=Object.values(ck.risk||{}).filter(v=>v==='ok').length;
  const pOk=Object.values(ck.plus||{}).filter(v=>v==='ok').length;
  const touched=Object.keys(ck.kill||{}).length+Object.keys(ck.risk||{}).length+Object.keys(ck.plus||{}).length;
  const bar=document.getElementById('score-bar');
  const num=document.getElementById('score-num');
  ['sb-ok','sb-warn','sb-fail'].forEach(i=>document.getElementById(i).classList.remove('show'));
  if(!touched){num.textContent='—';bar.style.width='0%';leadAtual.score=null;leadAtual.statusLabel='Pendente';return;}
  if(hasFail){
    num.textContent='Inviável';bar.style.width='5%';bar.style.background='var(--red)';
    document.getElementById('sb-fail').classList.add('show');
    leadAtual.score=0;leadAtual.statusLabel='Inviável';return;
  }
  const s=Math.round((kOk/kN)*50+(rOk/rN)*30+(pOk/pN)*20);
  num.textContent=s+'%';bar.style.width=s+'%';
  bar.style.background=s>=65?'var(--green)':s>=40?'var(--amber)':'var(--red)';
  if(s>=65){document.getElementById('sb-ok').classList.add('show');leadAtual.statusLabel='Viável';}
  else if(s>=40){document.getElementById('sb-warn').classList.add('show');leadAtual.statusLabel='Atenção';}
  else{document.getElementById('sb-fail').classList.add('show');leadAtual.statusLabel='Inviável';}
  leadAtual.score=s;
}

function marcarDirty(){
  dirty=true;
  document.getElementById('btn-salvar').disabled=false;
  document.getElementById('save-status').textContent='';
}
function salvarLead(silencioso=false){
  if(!leadAtual)return;
  leadAtual.obs=document.getElementById('ck-obs').value;
  leadAtual.atualizadoEm=Date.now();
  const idx=leads.findIndex(l=>l.id===leadAtual.id);
  if(idx>=0)leads[idx]=leadAtual;
  salvarStorage();
  dirty=false;
  document.getElementById('btn-salvar').disabled=true;
  if(!silencioso){
    const ss=document.getElementById('save-status');
    ss.textContent='Salvo ✓';
    setTimeout(()=>{ss.textContent=''},2500);
  }
  renderLeads(document.getElementById('trab-search').value);
  renderDashboardCRM();
}
function confirmarExclusao(){
  if(!leadAtual||!confirm('Excluir o lead de '+leadAtual.nome+'?'))return;
  leads=leads.filter(l=>l.id!==leadAtual.id);
  salvarStorage();
  leadAtual=null;
  dirty=false;
  document.getElementById('detalhe-empty').style.display='flex';
  document.getElementById('detalhe-content').style.display='none';
  renderLeads();
}

function mudarAba(id,btn){
  document.querySelectorAll('#tri-layout-trab .pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#tri-layout-trab .aba-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('pane-'+id).classList.add('active');
  btn.classList.add('active');
}

let novoLeadTipo='trab';
function abrirModalNovo(tipo){
  novoLeadTipo=tipo||'trab';
  document.getElementById('nl-nome').value='';
  document.getElementById('nl-tel').value='';
  document.getElementById('overlay-novo').classList.add('open');
  setTimeout(()=>document.getElementById('nl-nome').focus(),100);
}
function fecharModalNovo(){
  document.getElementById('overlay-novo').classList.remove('open');
}
function criarLead(){
  const nome=document.getElementById('nl-nome').value.trim();
  if(!nome)return;
  const lead={
    id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    nome,tel:document.getElementById('nl-tel').value.trim(),
    criadoEm:Date.now(),atualizadoEm:Date.now(),
    checklist:{},obs:'',score:null,statusLabel:'Pendente'
  };
  if(novoLeadTipo==='civel'){
    leadsCivel.unshift(lead);
    salvarStorageCivel();
    fecharModalNovo();
    renderLeadsCivel();
    abrirLeadCivel(lead.id);
  }else{
    leads.unshift(lead);
    salvarStorage();
    fecharModalNovo();
    renderLeads();
    abrirLead(lead.id);
  }
}
