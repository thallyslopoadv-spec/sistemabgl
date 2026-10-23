
// ═══════════════════════════════════════════════════════════
//  MODAL: PROCESSO
// ═══════════════════════════════════════════════════════════
let mpCtx={pid:null,cid:null,polo:'a',status:'Ativo',pubId:null};
function mpPolo(p){
  mpCtx.polo=p;
  document.getElementById('mp-polo-a').classList.toggle('on',p==='a');
  document.getElementById('mp-polo-p').classList.toggle('on',p==='p');
  document.getElementById('mp-polo-hint').style.display=p==='p'?'block':'none';
}
function mpClienteMudou(){
  const c=DB.clientes.find(x=>x.id===document.getElementById('mp-cli').value);
  const campoAtivo=document.getElementById('mp-ativo');
  if(c&&!campoAtivo.value.trim())campoAtivo.value=c.nome;
}
function mpStatus(s){
  mpCtx.status=s;
  document.getElementById('mp-st-a').classList.toggle('on',s==='Ativo');
  document.getElementById('mp-st-x').classList.toggle('on',s==='Arquivado');
}
function abrirModalProc(pid,cid){
  const p=pid?DB.processos.find(x=>x.id===pid):null;
  const cidResolvido=cid||(p&&p.cid)||'';
  mpCtx={pid,cid:cidResolvido,polo:'a',status:'Ativo',pubId:null};
  garantirEstruturaProcessos();
  const c=DB.clientes.find(x=>x.id===cidResolvido);
  const selCli=document.getElementById('mp-cli');
  selCli.innerHTML='<option value="">— sem cliente vinculado —</option>'+ordenarPorNome(DB.clientes).map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('');
  selCli.value=cidResolvido;
  const fases=fasesProcesso();
  const faseAtual=p?(p.fase||''):'';
  document.getElementById('mp-area').innerHTML='<option value="">— sem área —</option>'+areasProcesso().map(a=>`<option value="${a.key}">${esc(a.lbl)}</option>`).join('');
  document.getElementById('mp-fase').innerHTML='<option value="">— fase não informada —</option>'+fases.map(f=>`<option>${esc(f)}</option>`).join('')+
    (faseAtual&&!fases.includes(faseAtual)?`<option>${esc(faseAtual)}</option>`:'');
  // área sugerida: a aba aberta na tela de Processos
  document.getElementById('mp-area').value=p?(p.area||''):(typeof procArea==='string'&&areaInfo(procArea)?procArea:'');
  document.getElementById('mp-fase').value=faseAtual;
  document.getElementById('mp-resp').value=p&&p.resp&&RESP.includes(p.resp)?p.resp:(EU&&RESP.includes(EU.nome)?EU.nome:'Cecília');
  document.getElementById('mp-orgao').value=p?(p.orgao||''):'';
  document.getElementById('mp-obs').value=p?(p.obs||''):'';
  document.getElementById('mp-tese-titulo').value=p?(p.teseTitulo||''):'';
  document.getElementById('mp-tese-texto').value=p?(p.teseTexto||''):'';
  document.querySelector('#overlay-proc .mp-tese').open=!!(p&&(p.teseTitulo||p.teseTexto));
  if(pid){
    document.getElementById('mp-titulo').textContent='Editar processo — '+(c?c.curto:'sem cliente');
    document.getElementById('mp-num').value=p.num;
    document.getElementById('mp-ativo').value=p.ativo;
    document.getElementById('mp-passivo').value=p.passivo;
    document.getElementById('mp-dist').value=p.dist||'';
    document.getElementById('mp-exito').value=(p.exito===null||p.exito===undefined)?'':p.exito;
    mpPolo(p.polo);mpStatus(p.status||'Ativo');
    document.getElementById('mp-del').style.display='inline-flex';
  }else{
    document.getElementById('mp-titulo').textContent='Novo processo'+(c?' — '+c.curto:'');
    document.getElementById('mp-num').value='';
    document.getElementById('mp-ativo').value=c?c.nome:'';
    document.getElementById('mp-passivo').value='';
    document.getElementById('mp-dist').value='';
    document.getElementById('mp-exito').value='';
    mpPolo('a');mpStatus('Ativo');
    document.getElementById('mp-del').style.display='none';
  }
  abrirOverlay('overlay-proc');
  setTimeout(()=>document.getElementById('mp-num').focus(),100);
}
function salvarProc(){
  const num=document.getElementById('mp-num').value.trim();
  const at=document.getElementById('mp-ativo').value.trim();
  const pa=document.getElementById('mp-passivo').value.trim();
  const dist=document.getElementById('mp-dist').value;
  const cid=document.getElementById('mp-cli').value||null;
  const exitoRaw=document.getElementById('mp-exito').value.trim();
  let exito=null;
  if(exitoRaw!==''){
    exito=Math.max(0,Math.min(100,Math.round(Number(exitoRaw))));
    if(Number.isNaN(exito)){alert('Probabilidade de êxito deve ser um número de 0 a 100.');return;}
  }
  if(!num){alert('Informe o número do processo.');return;}
  if(!at||!pa){alert('Informe as partes dos dois polos.');return;}
  const dup=DB.processos.find(x=>x.id!==mpCtx.pid&&soDigitos(x.num).length>=10&&soDigitos(x.num)===soDigitos(num));
  if(dup&&!confirm('Já existe um processo com este número ('+dup.ativo+' × '+dup.passivo+'). Cadastrar mesmo assim?'))return;
  const extras={
    area:document.getElementById('mp-area').value,
    resp:document.getElementById('mp-resp').value,
    orgao:document.getElementById('mp-orgao').value.trim(),
    obs:document.getElementById('mp-obs').value.trim(),
    teseTitulo:document.getElementById('mp-tese-titulo').value.trim(),
    teseTexto:document.getElementById('mp-tese-texto').value.trim(),
  };
  const fase=document.getElementById('mp-fase').value;
  let p;
  if(mpCtx.pid){
    p=DB.processos.find(x=>x.id===mpCtx.pid);
    // número corrigido à mão: o número completo guardado pelo DJEN deixa de valer
    if(soDigitos(p.num)!==soDigitos(num))delete p.numCNJ;
    p.num=num;p.ativo=at;p.passivo=pa;p.dist=dist;p.cid=cid;p.polo=mpCtx.polo;p.status=mpCtx.status;p.exito=exito;
    Object.assign(p,extras);
    delete p.revisar;   // cadastro conferido por alguém
  }else{
    p={id:uid(),num,ativo:at,passivo:pa,dist,cid,polo:mpCtx.polo,status:mpCtx.status,exito,...extras,criadoEm:Date.now()};
    DB.processos.push(p);
  }
  if((p.fase||'')!==fase){
    p.fase=fase;p.faseEm=Date.now();
    if(!Array.isArray(p.fases))p.fases=[];
    p.fases.push({fase,em:p.faseEm,por:EU?EU.nome:''});
  }
  // prazos e audiências do processo acompanham o cliente vinculado
  DB.tarefas.forEach(t=>{if(t.pid===p.id&&t.status!=='concluido'&&!t.cid&&p.cid)t.cid=p.cid;});
  // processo cadastrado a partir de uma publicação do DJEN: já liga e cria o prazo
  let r=null;
  if(mpCtx.pubId){
    const pub=(DB.publicacoes||[]).find(x=>x.id===mpCtx.pubId);
    if(pub&&!pub.pid)r=vincularPublicacao(pub,p);
    mpCtx.pubId=null;
  }
  salvarDB();
  fecharOverlay('overlay-proc');
  refreshUI();
  if(r&&(r.prazos||r.audiencias))mostrarToast('Processo cadastrado e publicação vinculada · '+(r.prazos?'prazo criado na Rotina ':'')+(r.audiencias?'audiência criada':'')+' — confira.');
}
function excluirProc(){
  const p=DB.processos.find(x=>x.id===mpCtx.pid);
  if(!p)return;
  const vinc=DB.tarefas.filter(t=>t.pid===p.id&&t.status!=='concluido').length;
  if(!confirm('Excluir o processo '+p.num+'?'+(vinc?'\n\n'+vinc+' tarefa(s) em aberto ligadas a ele continuam na Rotina, só perdem o vínculo.':'')))return;
  DB.processos=DB.processos.filter(x=>x.id!==mpCtx.pid);
  DB.tarefas.forEach(t=>{if(t.pid===p.id)t.pid=null;});
  (DB.publicacoes||[]).forEach(x=>{if(x.pid===p.id){x.pid=null;if(x.status==='auto')x.status='nova';}});
  salvarDB();
  fecharOverlay('overlay-proc');
  refreshUI();
}
