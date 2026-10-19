
// ═══════════════════════════════════════════════════════════
//  TRIAGEM CÍVEL — espelha a triagem trabalhista acima,
//  com estado, checklist e elementos DOM totalmente independentes
// ═══════════════════════════════════════════════════════════
let leadsCivel=[];
let leadCivelAtual=null;
let dirtyCivel=false;

function mudarTipoTriagem(tipo){
  document.getElementById('tri-layout-trab').style.display=tipo==='trab'?'flex':'none';
  document.getElementById('tri-layout-civel').style.display=tipo==='civel'?'flex':'none';
  document.getElementById('triatipo-trab').classList.toggle('active',tipo==='trab');
  document.getElementById('triatipo-civel').classList.toggle('active',tipo==='civel');
}

function carregarLeadsCivel(){
  leadsCivel=Array.isArray(DB.leadsCivel)?DB.leadsCivel:(DB.leadsCivel=[]);
  renderLeadsCivel();
}
function salvarStorageCivel(){
  DB.leadsCivel=leadsCivel;
  salvarDB();
}

function renderLeadsCivel(filtro=''){
  let lista=filtro?leadsCivel.filter(l=>l.nome.toLowerCase().includes(filtro.toLowerCase())||(l.tel||'').includes(filtro)):leadsCivel;
  if(leadFiltroStatusCivel!=='todos')lista=lista.filter(l=>leadCategoria(l)===leadFiltroStatusCivel);
  renderLeadChips('civel');
  document.getElementById('stat-total-badge-civel').textContent=leadsCivel.length+' lead'+(leadsCivel.length!==1?'s':'');
  const c=document.getElementById('leads-list-civel');
  if(!lista.length){c.innerHTML='<div style="padding:22px;text-align:center;font-size:13px;color:var(--t3)">Nenhum lead neste filtro</div>';return;}
  const sorted=[...lista].sort((a,b)=>b.criadoEm-a.criadoEm);
  c.innerHTML=sorted.map(l=>{
    const ini=l.nome.split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase();
    const ci=l.id.charCodeAt(0)%CORES.length;
    const [pc,rot]=LEAD_PILL[leadCategoria(l)]||LEAD_PILL.responder;
    const sel=leadCivelAtual&&leadCivelAtual.id===l.id?'selected':'';
    const d=new Date(l.criadoEm).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});
    const alerta=leadTemAlertaPrazo(l)?'<i class="ti ti-alert-triangle-filled" style="color:var(--red-hi);font-size:13px;margin-right:4px" title="Prazo do funil vencido"></i>':'';
    return`<div class="lead-item ${sel}" onclick="abrirLeadCivel('${l.id}')">
      <div class="lead-av" style="background:${CORES[ci][0]};color:${CORES[ci][1]}">${ini}</div>
      <div class="lead-info">
        <div class="lead-nome">${alerta}${l.nome}</div>
        <div class="lead-meta">${d}${l.tel?' · '+l.tel:''}</div>
      </div>
      <div class="lead-pill ${pc}">${rot}</div>
    </div>`;
  }).join('');
}
function filtrarLeadsCivel(v){renderLeadsCivel(v)}

function abrirLeadCivel(id){
  if(dirtyCivel&&leadCivelAtual)salvarLeadCivel(true);
  leadCivelAtual=leadsCivel.find(l=>l.id===id);
  if(!leadCivelAtual)return;
  dirtyCivel=false;
  document.getElementById('btn-salvar-civel').disabled=true;
  document.getElementById('detalhe-empty-civel').style.display='none';
  document.getElementById('detalhe-content-civel').style.display='flex';
  document.getElementById('dh-nome-civel').textContent=leadCivelAtual.nome;
  document.getElementById('dh-tel-civel').textContent=leadCivelAtual.tel||'—';
  document.getElementById('ck-obs-civel').value=leadCivelAtual.obs||'';
  const bf=document.getElementById('btn-fechar-contrato-civel');
  if(leadCivelAtual.convertido){
    bf.classList.remove('ok');
    bf.innerHTML='<i class="ti ti-user-check" style="color:var(--green-hi)"></i>';
    bf.title='Já convertido em cliente — clique para abrir a ficha';
    bf.onclick=()=>irParaCliente(leadCivelAtual.clienteId);
  }else{
    bf.classList.add('ok');
    bf.innerHTML='<i class="ti ti-user-check"></i>';
    bf.title='Contrato fechado — transferir para a carteira de clientes';
    bf.onclick=fecharContratoCivel;
  }
  aplicarStatusLeadUICivel(leadCivelAtual);
  aplicarJornadaUICivel(leadCivelAtual);
  renderLeadsCivel(document.getElementById('civel-search').value);
}
function aplicarStatusLeadUICivel(l){
  const cat=statusAtendimentoEfetivo(l);
  Object.keys(LEAD_STATUS_LBL).forEach(k=>{const b=document.getElementById('ls-'+k+'-civel');if(b)b.classList.toggle('on',k===cat);});
}
function mudarStatusLeadCivel(s){
  if(!leadCivelAtual)return;
  if(s==='convertido'){
    if(!leadCivelAtual.convertido)fecharContratoCivel(); else aplicarStatusLeadUICivel(leadCivelAtual);
    return;
  }
  if(leadCivelAtual.convertido){aplicarStatusLeadUICivel(leadCivelAtual);return;}
  leadCivelAtual.statusAtendimento=s;
  aplicarStatusLeadUICivel(leadCivelAtual);
  salvarDB();
  refreshUI();
  renderLeadsCivel(document.getElementById('civel-search').value);
}

function fecharContratoCivel(){
  if(!leadCivelAtual||leadCivelAtual.convertido)return;
  if(!confirm('Marcar contrato FECHADO com "'+leadCivelAtual.nome+'"?\n\nO lead será transferido para a carteira de clientes (ativo).'))return;
  const {c:novo,existente}=registrarContratoDoLead(leadCivelAtual,'civel',
    'Consulta Cível'+(leadCivelAtual.statusLabel&&leadCivelAtual.statusLabel!=='Pendente'?' (triagem: '+leadCivelAtual.statusLabel+')':''));
  salvarDB();
  leadCivelAtual.convertido=true;
  leadCivelAtual.clienteId=novo.id;
  leadCivelAtual.statusAtendimento='convertido';
  leadCivelAtual.fechouCRM='Sim';
  leadCivelAtual.statusCRM='Ganho';
  leadCivelAtual.ganhoEm=Date.now();
  salvarStorageCivel();
  renderLeadsCivel(document.getElementById('civel-search').value);
  abrirLeadCivel(leadCivelAtual.id);
  refreshUI();
  if(confirm('Contrato fechado! '+(existente?'Registrado como novo contrato de "'+novo.nome+'".':'"'+novo.nome+'" já está na carteira de clientes.')+'\n\nDeseja abrir a ficha do cliente agora?'))irParaCliente(novo.id);
}

function aplicarChecklistCivel(){
  if(!leadCivelAtual)return;
  const ck=leadCivelAtual.checklist||{};
  document.querySelectorAll('#tri-layout-civel .ck-item').forEach(el=>{
    const{type,idx}=el.dataset;
    const v=(ck[type]||{})[idx];
    el.dataset.state=v||'';
    const box=el.querySelector('.ck-box');
    if(v==='ok')box.innerHTML='✓';
    else if(v==='fail')box.innerHTML='✕';
    else box.innerHTML='';
  });
}

function toggleItemCivel(el){
  if(!leadCivelAtual)return;
  const{type,idx}=el.dataset;
  if(!leadCivelAtual.checklist)leadCivelAtual.checklist={};
  const ck=leadCivelAtual.checklist;
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
  aplicarChecklistCivel();
  calcularScoreCivel();
  marcarDirtyCivel();
}

function calcularScoreCivel(){
  if(!leadCivelAtual)return;
  const ck=leadCivelAtual.checklist||{};
  const kN=document.querySelectorAll('#tri-layout-civel [data-type="kill"]').length;
  const rN=document.querySelectorAll('#tri-layout-civel [data-type="risk"]').length;
  const pN=document.querySelectorAll('#tri-layout-civel [data-type="plus"]').length;
  const kOk=Object.values(ck.kill||{}).filter(v=>v==='ok').length;
  const hasFail=Object.values(ck.kill||{}).some(v=>v==='fail');
  const rOk=Object.values(ck.risk||{}).filter(v=>v==='ok').length;
  const pOk=Object.values(ck.plus||{}).filter(v=>v==='ok').length;
  const touched=Object.keys(ck.kill||{}).length+Object.keys(ck.risk||{}).length+Object.keys(ck.plus||{}).length;
  const bar=document.getElementById('score-bar-civel');
  const num=document.getElementById('score-num-civel');
  ['sb-ok-civel','sb-warn-civel','sb-fail-civel'].forEach(i=>document.getElementById(i).classList.remove('show'));
  if(!touched){num.textContent='—';bar.style.width='0%';leadCivelAtual.score=null;leadCivelAtual.statusLabel='Pendente';return;}
  if(hasFail){
    num.textContent='Inviável';bar.style.width='5%';bar.style.background='var(--red)';
    document.getElementById('sb-fail-civel').classList.add('show');
    leadCivelAtual.score=0;leadCivelAtual.statusLabel='Inviável';return;
  }
  const s=Math.round((kOk/kN)*50+(rOk/rN)*30+(pOk/pN)*20);
  num.textContent=s+'%';bar.style.width=s+'%';
  bar.style.background=s>=65?'var(--green)':s>=40?'var(--amber)':'var(--red)';
  if(s>=65){document.getElementById('sb-ok-civel').classList.add('show');leadCivelAtual.statusLabel='Viável';}
  else if(s>=40){document.getElementById('sb-warn-civel').classList.add('show');leadCivelAtual.statusLabel='Atenção';}
  else{document.getElementById('sb-fail-civel').classList.add('show');leadCivelAtual.statusLabel='Inviável';}
  leadCivelAtual.score=s;
}

function marcarDirtyCivel(){
  dirtyCivel=true;
  document.getElementById('btn-salvar-civel').disabled=false;
  document.getElementById('save-status-civel').textContent='';
}
function salvarLeadCivel(silencioso=false){
  if(!leadCivelAtual)return;
  leadCivelAtual.obs=document.getElementById('ck-obs-civel').value;
  leadCivelAtual.atualizadoEm=Date.now();
  const idx=leadsCivel.findIndex(l=>l.id===leadCivelAtual.id);
  if(idx>=0)leadsCivel[idx]=leadCivelAtual;
  salvarStorageCivel();
  dirtyCivel=false;
  document.getElementById('btn-salvar-civel').disabled=true;
  if(!silencioso){
    const ss=document.getElementById('save-status-civel');
    ss.textContent='Salvo ✓';
    setTimeout(()=>{ss.textContent=''},2500);
  }
  renderLeadsCivel(document.getElementById('civel-search').value);
  renderDashboardCRM();
}
function confirmarExclusaoCivel(){
  if(!leadCivelAtual||!confirm('Excluir o lead de '+leadCivelAtual.nome+'?'))return;
  leadsCivel=leadsCivel.filter(l=>l.id!==leadCivelAtual.id);
  salvarStorageCivel();
  leadCivelAtual=null;
  dirtyCivel=false;
  document.getElementById('detalhe-empty-civel').style.display='flex';
  document.getElementById('detalhe-content-civel').style.display='none';
  renderLeadsCivel();
}

function mudarAbaCivel(id,btn){
  document.querySelectorAll('#tri-layout-civel .pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#tri-layout-civel .aba-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('pane-'+id+'-civel').classList.add('active');
  btn.classList.add('active');
}
document.getElementById('nl-nome').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('nl-tel').focus()});
document.getElementById('nl-tel').addEventListener('keydown',e=>{if(e.key==='Enter')criarLead()});

// fecha overlays clicando fora
['overlay-novo','overlay-fin','overlay-proc','overlay-cli','overlay-tarefa','overlay-config','overlay-backup','overlay-conversa','overlay-custo','overlay-lanc','overlay-saldo','overlay-conteudo','overlay-metas','overlay-mesdet','overlay-mescli','overlay-fundo','overlay-extrato','overlay-prazo','overlay-areas','overlay-notif','overlay-metacrm','overlay-followup'].forEach(id=>{
  document.getElementById(id).addEventListener('click',e=>{if(e.target===e.currentTarget)fecharOverlay(id)});
});
