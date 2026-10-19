
// ═══════════════════════════════════════════════════════════
//  TRIAGEM — ESTADO
// ═══════════════════════════════════════════════════════════
let leads=[];
let leadAtual=null;
let dirty=false;

function carregarLeads(){
  leads=Array.isArray(DB.leads)?DB.leads:(DB.leads=[]);
  renderLeads();
}
function salvarStorage(){
  DB.leads=leads; // captura eventuais reatribuições (filter/etc.) antes de gravar
  salvarDB();
}

// ─── FILTRO DE STATUS NA COLUNA DE LEADS (abas por status de atendimento) ───
let leadFiltroStatus='todos', leadFiltroStatusCivel='todos';
function leadCategoria(l){
  if(l.convertido)return 'convertido';
  const st=l.statusAtendimento||'responder';
  if(st!=='responder')return st; // status ajustado manualmente prevalece
  // status de atendimento nunca ajustado (default "responder"): deriva do estágio do funil,
  // para um lead já em negociação/proposta não aparecer indevidamente como "a responder"
  if(l.statusCRM==='Perdido')return 'perdido';
  if(['Reunião marcada','Proposta enviada','Em negociação','Ganho'].includes(l.statusCRM))return 'seguimento';
  return 'responder'; // Novo/Qualificado/sem etapa: realmente aguardando resposta
}
const LEAD_PILL={convertido:['pill-ok','Cliente ✓'],responder:['pill-pending','A responder'],reuniao:['pill-warn','Reunião'],seguimento:['pill-warn','Follow-up'],perdido:['pill-fail','Sem interesse']};
const LEAD_CHIP_DEFS=[
  {k:'todos',lbl:'Todos'},
  {k:'responder',lbl:'A responder'},
  {k:'reuniao',lbl:'Reunião'},
  {k:'seguimento',lbl:'Follow-up'},
  {k:'perdido',lbl:'Sem interesse'},
  {k:'convertido',lbl:'Convertidos'},
];
function renderLeadChips(mod){
  const el=document.getElementById('lead-chips-'+mod);
  if(!el)return;
  const arr=mod==='civel'?leadsCivel:leads;
  const filtro=mod==='civel'?leadFiltroStatusCivel:leadFiltroStatus;
  el.innerHTML=LEAD_CHIP_DEFS.map(d=>{
    const n=d.k==='todos'?arr.length:arr.filter(l=>leadCategoria(l)===d.k).length;
    return `<button class="lead-chip ${filtro===d.k?'active':''}" onclick="filtroStatusLead('${d.k}','${mod}')">${d.lbl}<span class="lc-n">${n}</span></button>`;
  }).join('');
}
function filtroStatusLead(status,mod){
  if(mod==='civel'){leadFiltroStatusCivel=status;renderLeadsCivel(document.getElementById('civel-search').value);}
  else{leadFiltroStatus=status;renderLeads(document.getElementById('trab-search').value);}
}
function renderLeads(filtro=''){
  let lista=filtro?leads.filter(l=>l.nome.toLowerCase().includes(filtro.toLowerCase())||(l.tel||'').includes(filtro)):leads;
  if(leadFiltroStatus!=='todos')lista=lista.filter(l=>leadCategoria(l)===leadFiltroStatus);
  renderLeadChips('trab');
  document.getElementById('stat-total-badge').textContent=leads.length+' lead'+(leads.length!==1?'s':'');
  const c=document.getElementById('leads-list');
  if(!lista.length){c.innerHTML='<div style="padding:22px;text-align:center;font-size:13px;color:var(--t3)">Nenhum lead neste filtro</div>';return;}
  const sorted=[...lista].sort((a,b)=>b.criadoEm-a.criadoEm);
  c.innerHTML=sorted.map(l=>{
    const ini=l.nome.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
    const ci=l.id.charCodeAt(0)%CORES.length;
    const [pc,rot]=LEAD_PILL[leadCategoria(l)]||LEAD_PILL.responder;
    const sel=leadAtual&&leadAtual.id===l.id?'selected':'';
    const d=new Date(l.criadoEm).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const alerta=leadTemAlertaPrazo(l)?'<i class="ti ti-alert-triangle-filled" style="color:var(--red-hi);font-size:13px;margin-right:4px" title="Prazo do funil vencido"></i>':'';
    return`<div class="lead-item ${sel}" onclick="abrirLead('${l.id}')">
      <div class="lead-av" style="background:${CORES[ci][0]};color:${CORES[ci][1]}">${ini}</div>
      <div class="lead-info">
        <div class="lead-nome">${alerta}${l.nome}</div>
        <div class="lead-meta">${d}${l.tel?' · '+l.tel:''}</div>
      </div>
      <div class="lead-pill ${pc}">${rot}</div>
    </div>`;
  }).join('');
}
function filtrarLeads(v){renderLeads(v)}

function abrirLead(id){
  if(dirty&&leadAtual)salvarLead(true);
  leadAtual=leads.find(l=>l.id===id);
  if(!leadAtual)return;
  dirty=false;
  document.getElementById('btn-salvar').disabled=true;
  document.getElementById('detalhe-empty').style.display='none';
  document.getElementById('detalhe-content').style.display='flex';
  document.getElementById('dh-nome').textContent=leadAtual.nome;
  document.getElementById('dh-tel').textContent=leadAtual.tel||'—';
  document.getElementById('ck-obs').value=leadAtual.obs||'';
  // botão de conversão em cliente
  const bf=document.getElementById('btn-fechar-contrato');
  if(leadAtual.convertido){
    bf.classList.remove('ok');
    bf.innerHTML='<i class="ti ti-user-check" style="color:var(--green-hi)"></i>';
    bf.title='Já convertido em cliente — clique para abrir a ficha';
    bf.onclick=()=>irParaCliente(leadAtual.clienteId);
  }else{
    bf.classList.add('ok');
    bf.innerHTML='<i class="ti ti-user-check"></i>';
    bf.title='Contrato fechado — transferir para a carteira de clientes';
    bf.onclick=fecharContrato;
  }
  aplicarStatusLeadUI(leadAtual);
  aplicarJornadaUI(leadAtual);
  renderLeads(document.getElementById('trab-search').value);
}
// ─── STATUS DO ATENDIMENTO (a responder / reunião / follow-up / sem interesse) ─
// não conta mais em "leads a responder" quando o status deixa de ser 'responder'
const LEAD_STATUS_LBL={responder:'A responder',reuniao:'Reunião marcada',seguimento:'Follow-up',perdido:'Sem interesse',convertido:'Convertido'};
// o botão "Convertido" reflete o estado real de conversão do lead (l.convertido): leads já
// vinculados a um contrato (inclusive os retroativos) aparecem como convertidos, e não como
// "a responder"; os demais status só valem enquanto o lead não virou cliente
function statusAtendimentoEfetivo(l){return l&&l.convertido?'convertido':((l&&l.statusAtendimento)||'responder');}
function aplicarStatusLeadUI(l){
  const cat=statusAtendimentoEfetivo(l);
  Object.keys(LEAD_STATUS_LBL).forEach(k=>{const b=document.getElementById('ls-'+k);if(b)b.classList.toggle('on',k===cat);});
}
function mudarStatusLead(s){
  if(!leadAtual)return;
  if(s==='convertido'){ // marcar "Convertido" dispara a conversão em cliente (se ainda não for)
    if(!leadAtual.convertido)fecharContrato(); else aplicarStatusLeadUI(leadAtual);
    return;
  }
  if(leadAtual.convertido){aplicarStatusLeadUI(leadAtual);return;} // lead já é cliente: status fixo
  leadAtual.statusAtendimento=s;
  aplicarStatusLeadUI(leadAtual);
  salvarDB();
  refreshUI();
  renderLeads(document.getElementById('trab-search').value);
}
