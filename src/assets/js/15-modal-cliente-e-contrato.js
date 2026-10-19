
// ═══════════════════════════════════════════════════════════
//  MODAL: CLIENTE
// ═══════════════════════════════════════════════════════════
let mcCtx={cid:null,tipo:'externo',status:'Ativo',leadModRetroativo:'trab'};
function mcTipo(t){
  mcCtx.tipo=t;
  document.getElementById('mc-tp-e').classList.toggle('on',t==='externo');
  document.getElementById('mc-tp-p').classList.toggle('on',t==='pessoal');
}
function mcStatus(s){
  mcCtx.status=s;
  document.getElementById('mc-st-a').classList.toggle('on',s==='Ativo');
  document.getElementById('mc-st-x').classList.toggle('on',s==='Arquivado');
}
// popula o select de leads do modal de cliente (vínculo lead-contrato) — só lista
// leads ainda não convertidos, mais o lead já vinculado a este cliente (se houver)
function popularSelectLeadCliente(modAtual,idAtual){
  const sel=document.getElementById('mc-lead');
  // lista única em ordem alfabética — mais fácil de achar o nome do que separado por área
  const disponiveis=[];
  leads.forEach(l=>{if(!l.convertido||(modAtual==='trab'&&l.id===idAtual))disponiveis.push({l,mod:'trab',area:'Trabalhista'});});
  leadsCivel.forEach(l=>{if(!l.convertido||(modAtual==='civel'&&l.id===idAtual))disponiveis.push({l,mod:'civel',area:'Cível'});});
  disponiveis.sort((a,b)=>cmpNome(a.l.nome,b.l.nome));
  const opts=['<option value="">— nenhum: fica pendente de vincular —</option>']
    .concat(disponiveis.map(x=>`<option value="${x.mod}:${x.l.id}">${esc(x.l.nome)} (${x.area})</option>`));
  sel.innerHTML=opts.join('');
  sel.value=idAtual?(modAtual+':'+idAtual):'';
  mcLeadMudou();
}
// mostra a opção de "criar lead retroativo" só quando não há nenhum lead selecionado —
// cobre o caso de clientes que nunca passaram pelo funil (ex.: anteriores ao CRM)
function mcLeadMudou(){
  const wrap=document.getElementById('mc-lead-criar-wrap');
  if(wrap)wrap.style.display=document.getElementById('mc-lead').value?'none':'block';
  mcLeadModRetroativo(mcCtx.leadModRetroativo||'trab');
}
function mcLeadModRetroativo(mod){
  mcCtx.leadModRetroativo=mod;
  document.getElementById('mc-lead-mod-trab').classList.toggle('on',mod==='trab');
  document.getElementById('mc-lead-mod-civel').classList.toggle('on',mod==='civel');
}
// cria um lead retroativo pra um cliente que nunca teve registro no CRM comercial —
// nasce direto como "Ganho" (contrato já fechado) e já vinculado a este cliente
function criarLeadRetroativo(){
  const nome=document.getElementById('mc-nome').value.trim();
  if(!nome){alert('Informe o nome do cliente antes de criar o lead retroativo.');return;}
  const civel=mcCtx.leadModRetroativo==='civel';
  const dataStr=document.getElementById('mc-lead-data').value;
  const ts=dataStr?new Date(dataStr+'T12:00:00').getTime():Date.now();
  const novo={
    id:uid(), nome, tel:'', retroativo:true,
    criadoEm:ts, atualizadoEm:Date.now(),
    checklist:{}, obs:'Lead criado retroativamente a partir de um cliente já existente na carteira.',
    score:null, statusLabel:'Pendente', convertido:true, clienteId:mcCtx.cid||null, statusAtendimento:'convertido',
    area:'', responsavel:'', categoriaOrigem:'', origemTexto:'', motivoBusca:'', urgencia:null, problema:'',
    honorariosTexto:'', valorHonorarioEstimado:0, probabilidadeFechamento:0, objecaoPrincipal:'', categoriaObjecao:'',
    honorariosObstaculo:'', inseguranca:'', canalFollowup:'', entrouContatoTexto:'', reuniaoAgendadaTexto:'',
    compareceu:'', propostaEnviada:'', fechouCRM:'Sim', statusCRM:'Ganho', motivoPerdaGanho:'', licoes:'', motivoPerda:'',
    etapaEntradaEm:ts, proximaAcaoEm:'', propostaEnviadaEm:'', followupCadenciaGerada:false, reuniaoDataHora:'',
    followups:[],
  };
  (civel?leadsCivel:leads).push(novo);
  civel?salvarStorageCivel():salvarStorage();
  popularSelectLeadCliente(civel?'civel':'trab',novo.id);
}
function abrirModalCliente(cid){
  mcCtx={cid,tipo:'externo',status:'Ativo'};
  const dataLead=document.getElementById('mc-lead-data');if(dataLead)dataLead.value='';
  if(cid){
    const c=DB.clientes.find(x=>x.id===cid);
    document.getElementById('mc-titulo').textContent='Editar cliente';
    document.getElementById('mc-nome').value=c.nome;
    document.getElementById('mc-curto').value=c.curto;
    document.getElementById('mc-demandas').value=c.demandas;
    document.getElementById('mc-entrada').value=c.entrada||'';
    popularSelectLeadCliente(c.leadVinculadoMod,c.leadVinculadoId);
    mcTipo(c.tipo);mcStatus(c.status);
    popularSelectUnir(c);
    document.getElementById('mc-del').style.display='inline-flex';
  }else{
    document.getElementById('mc-titulo').textContent='Novo cliente';
    document.getElementById('mc-nome').value='';
    document.getElementById('mc-curto').value='';
    document.getElementById('mc-demandas').value='';
    document.getElementById('mc-entrada').value='';
    popularSelectLeadCliente(null,null);
    mcTipo('externo');mcStatus('Ativo');
    document.getElementById('mc-unir-wrap').style.display='none';
    document.getElementById('mc-del').style.display='none';
  }
  abrirOverlay('overlay-cli');
  setTimeout(()=>document.getElementById('mc-nome').focus(),100);
}
function salvarCliente(){
  const nome=document.getElementById('mc-nome').value.trim();
  if(!nome){alert('Informe o nome do cliente.');return;}
  const curto=document.getElementById('mc-curto').value.trim()||nome.split(' ')[0];
  const demandas=document.getElementById('mc-demandas').value.trim();
  const entrada=document.getElementById('mc-entrada').value;
  const leadSel=document.getElementById('mc-lead').value; // "trab:id" | "civel:id" | ""
  const [leadMod,leadId]=leadSel?leadSel.split(':'):[null,null];
  const novoCliente=!mcCtx.cid;
  if(mcCtx.cid){
    const c=DB.clientes.find(x=>x.id===mcCtx.cid);
    c.nome=nome;c.curto=curto;c.demandas=demandas;c.tipo=mcCtx.tipo;c.status=mcCtx.status;c.entrada=entrada;
    c.leadVinculadoId=leadId||null;c.leadVinculadoMod=leadId?leadMod:null;
    delete c.obs; // dados conferidos manualmente
  }else{
    const novo={id:uid(),nome,curto,tipo:mcCtx.tipo,status:mcCtx.status,demandas,entrada,fin:[],leadVinculadoId:leadId||null,leadVinculadoMod:leadId?leadMod:null,
      contratos:[novoContrato({titulo:demandas||'Contrato inicial',inicio:entrada,leadId:leadId||null,leadMod:leadId?leadMod:null})]};
    DB.clientes.push(novo);
    clienteAtual=novo;
  }
  salvarDB();
  fecharOverlay('overlay-cli');
  refreshUI();
  if(novoCliente&&clienteAtual)abrirCliente(clienteAtual.id);
}
// ─── UNIR CADASTROS DUPLICADOS ────────────────────────────
// nomes parecidos aparecem primeiro, o resto da carteira depois
function popularSelectUnir(c){
  const parecidos=clientesComMesmoNome(c.nome).filter(x=>x.id!==c.id);
  const ids=new Set(parecidos.map(x=>x.id));
  const outros=ordenarPorNome(DB.clientes.filter(x=>x.id!==c.id&&!ids.has(x.id)));
  const op=x=>`<option value="${x.id}">${esc(x.nome)}</option>`;
  document.getElementById('mc-unir').innerHTML='<option value="">— escolha o cadastro duplicado —</option>'+
    (parecidos.length?`<optgroup label="Nome parecido">${parecidos.map(op).join('')}</optgroup>`:'')+
    `<optgroup label="Demais clientes">${outros.map(op).join('')}</optgroup>`;
  document.getElementById('mc-unir-wrap').style.display='block';
}
function unirClientes(){
  const alvo=DB.clientes.find(x=>x.id===mcCtx.cid);
  const outro=DB.clientes.find(x=>x.id===document.getElementById('mc-unir').value);
  if(!alvo||!outro){alert('Escolha o cadastro duplicado que deve ser trazido para este.');return;}
  garantirContratos();
  const nProc=procsDe(outro.id).length, nTar=tarefasDe(outro.id).length;
  if(!confirm('Unir "'+outro.nome+'" a "'+alvo.nome+'"?\n\n'+
    'Passam para "'+alvo.nome+'":\n'+
    '  · '+contratosDe(outro).length+' contrato(s)\n'+
    '  · '+outro.fin.length+' lançamento(s) financeiro(s)\n'+
    '  · '+nProc+' processo(s)\n'+
    '  · '+nTar+' pendência(s)\n\n'+
    'O cadastro "'+outro.nome+'" deixa de existir. Esta operação não tem desfazer automático (o backup local continua valendo).'))return;
  alvo.contratos=[...contratosDe(alvo),...contratosDe(outro)];
  alvo.fin=[...alvo.fin,...(outro.fin||[])];
  DB.processos.forEach(p=>{if(p.cid===outro.id)p.cid=alvo.id;});
  DB.tarefas.forEach(t=>{if(t.cid===outro.id)t.cid=alvo.id;});
  (DB.fundoAportes||[]).forEach(a=>{if(a.origem&&a.origem.cid===outro.id){a.origem.cid=alvo.id;a.origem.cnome=alvo.nome;}});
  [...(DB.leads||[]),...(DB.leadsCivel||[])].forEach(l=>{if(l.clienteId===outro.id)l.clienteId=alvo.id;});
  alvo.chat=[...(alvo.chat||[]),...(outro.chat||[])].sort((a,b)=>(a.criadoEm||0)-(b.criadoEm||0));
  alvo.drive={...(outro.drive||{}),...(alvo.drive||{})};   // o link deste cadastro prevalece
  if(!(alvo.conversa&&alvo.conversa.texto)&&outro.conversa)alvo.conversa=outro.conversa;
  const datas=[alvo.entrada,outro.entrada].filter(Boolean).sort();
  alvo.entrada=datas[0]||'';
  if(!alvo.leadVinculadoId&&outro.leadVinculadoId){alvo.leadVinculadoId=outro.leadVinculadoId;alvo.leadVinculadoMod=outro.leadVinculadoMod;}
  if(outro.demandas&&!semAcento(alvo.demandas).includes(semAcento(outro.demandas)))
    alvo.demandas=[alvo.demandas,outro.demandas].filter(Boolean).join(' + ');
  if(outro.status==='Ativo')alvo.status='Ativo';
  DB.clientes=DB.clientes.filter(x=>x.id!==outro.id);
  clienteAtual=alvo;
  salvarDB();
  fecharOverlay('overlay-cli');
  refreshUI();
  abrirCliente(alvo.id);
  mostrarToast('"'+outro.nome+'" unido a "'+alvo.nome+'"');
}

// ═══════════════════════════════════════════════════════════
//  MODAL: CONTRATO
// ═══════════════════════════════════════════════════════════
let mctCtx={cid:null,ctId:null,status:'Ativo'};
function mctStatus(st){
  mctCtx.status=st;
  document.getElementById('mct-st-a').classList.toggle('on',st==='Ativo');
  document.getElementById('mct-st-x').classList.toggle('on',st==='Encerrado');
}
function abrirModalContrato(cid,ctId){
  const c=DB.clientes.find(x=>x.id===cid);
  if(!c)return;
  if(!Array.isArray(c.contratos))c.contratos=[];
  const ct=contratoDe(c,ctId);
  mctCtx={cid,ctId:ct?ct.id:null,status:ct?ct.status:'Ativo'};
  document.getElementById('mct-titulo').textContent=(ct?'Editar contrato':'Novo contrato')+' — '+c.curto;
  document.getElementById('mct-objeto').value=ct?ct.titulo:'';
  document.getElementById('mct-inicio').value=ct?(ct.inicio||''):hojeISO();
  document.getElementById('mct-obs').value=ct?(ct.obs||''):'';
  document.getElementById('mct-valor').value=ct&&ct.valor>0?ct.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';
  mctStatus(mctCtx.status);
  const n=ct?finDoContrato(c,ct.id).length:0;
  document.getElementById('mct-resumo').textContent=ct
    ?(n?n+' lançamento'+(n>1?'s':'')+' financeiro'+(n>1?'s':'')+' vinculado'+(n>1?'s':'')+' a este contrato.':'Nenhum lançamento financeiro vinculado ainda.')
    :'Depois de salvar, use o botão de pagamento no cartão do contrato para lançar as parcelas (inclusive recorrentes).';
  document.getElementById('mct-del').style.display=ct?'inline-flex':'none';
  abrirOverlay('overlay-contrato');
  setTimeout(()=>document.getElementById('mct-objeto').focus(),100);
}
function salvarContrato(){
  const c=DB.clientes.find(x=>x.id===mctCtx.cid);
  if(!c)return;
  const titulo=document.getElementById('mct-objeto').value.trim();
  if(!titulo){alert('Informe o objeto do contrato (ex.: Assessoria jurídica mensal).');return;}
  const valorTxt=document.getElementById('mct-valor').value.trim();
  const valor=valorTxt?parseValor(valorTxt):0;
  if(valorTxt&&!(valor>0)){alert('Valor do contrato inválido (ex.: 18.000,00). Deixe em branco se não quiser informar.');return;}
  const dados={titulo,inicio:document.getElementById('mct-inicio').value,status:mctCtx.status,obs:document.getElementById('mct-obs').value.trim(),valor};
  if(mctCtx.ctId){
    Object.assign(contratoDe(c,mctCtx.ctId),dados);
  }else{
    c.contratos.push(novoContrato(dados));
    // contrato novo ativo reabre um cliente que estava arquivado
    if(dados.status==='Ativo'&&c.status==='Arquivado')c.status='Ativo';
  }
  salvarDB();
  fecharOverlay('overlay-contrato');
  refreshUI();
}
// o contrato sai, mas os lançamentos ficam no cliente (sem contrato): dinheiro
// recebido não pode sumir do caixa porque alguém apagou o cadastro do contrato
function excluirContrato(){
  const c=DB.clientes.find(x=>x.id===mctCtx.cid);
  const ct=c&&contratoDe(c,mctCtx.ctId);
  if(!ct)return;
  const fins=finDoContrato(c,ct.id);
  if(!confirm('Excluir o contrato "'+ct.titulo+'"?'+(fins.length?'\n\nOs '+fins.length+' lançamento(s) financeiro(s) dele continuam no cliente, apenas sem contrato vinculado.':'')))return;
  fins.forEach(f=>{f.contratoId=null;});
  c.contratos=c.contratos.filter(k=>k.id!==ct.id);
  salvarDB();
  fecharOverlay('overlay-contrato');
  refreshUI();
}

function excluirCliente(){
  const c=DB.clientes.find(x=>x.id===mcCtx.cid);
  if(!c)return;
  const nProc=procsDe(c.id).length;
  if(!confirm('Excluir o cliente "'+c.nome+'"?\n\nIsso remove também '+nProc+' processo(s) e '+c.fin.length+' lançamento(s) financeiro(s) vinculados.\n\nSe o cliente apenas encerrou, prefira mudar o status para "Arquivado".'))return;
  DB.clientes=DB.clientes.filter(x=>x.id!==c.id);
  DB.processos=DB.processos.filter(p=>p.cid!==c.id);
  clienteAtual=null;
  salvarDB();
  fecharOverlay('overlay-cli');
  document.getElementById('cli-detail').style.display='none';
  document.getElementById('cli-empty').style.display='flex';
  refreshUI();
}
