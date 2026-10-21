
// ═══════════════════════════════════════════════════════════
//  CLIENTES (CRM)
// ═══════════════════════════════════════════════════════════
let cliFiltro='todos', cliBusca='', clienteAtual=null;

function filtroCliente(f,btn){
  cliFiltro=f;
  document.querySelectorAll('#cli-chips .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderClientes();
}
function buscaCliente(v){cliBusca=v;renderClientes();}

function clientesFiltrados(){
  let lista=DB.clientes;
  if(cliFiltro==='ativos')lista=lista.filter(c=>c.tipo==='externo'&&c.status==='Ativo');
  else if(cliFiltro==='arquivados')lista=lista.filter(c=>c.status==='Arquivado');
  else if(cliFiltro==='socios')lista=lista.filter(c=>c.tipo==='pessoal');
  if(cliBusca){
    const q=cliBusca.toLowerCase();
    lista=lista.filter(c=>c.nome.toLowerCase().includes(q)||c.demandas.toLowerCase().includes(q));
  }
  return ordenarPorNome(lista);   // ordem alfabética — regra padrão do sistema
}
function pillCliente(c){
  if(c.tipo==='pessoal')return '<div class="cli-status s-socio">Sócio</div>';
  if(c.status==='Ativo')return '<div class="cli-status s-ativo">Ativo</div>';
  return '<div class="cli-status s-arq">Arquivado</div>';
}
// vínculo lead-contrato (regra de negócio): todo contrato fechado deveria estar ligado
// a um lead do CRM — clientes "sócio" (demandas pessoais) ficam isentos, pois nunca
// passam pelo funil comercial
function clientePendenciaVinculo(c){return c.tipo!=='pessoal'&&!c.leadVinculadoId}
function linhaCliente(c){
  const cr=corDe(c.id);
  const sel=clienteAtual&&clienteAtual.id===c.id?'selected':'';
  const alerta=clientePendenciaVinculo(c)?'<i class="ti ti-link-off" style="color:var(--amber-hi);font-size:13px;margin-right:4px" title="Pendência: vincular a um lead do CRM"></i>':'';
  return `<div class="lead-item ${sel}" data-cid="${c.id}" onclick="abrirCliente('${c.id}')">
    <div class="lead-av" style="background:${cr[0]};color:${cr[1]}">${iniciais(c.nome)}</div>
    <div class="lead-info">
      <div class="lead-nome">${alerta}${esc(c.curto)}</div>
      <div class="lead-meta">${esc(c.demandas)}</div>
    </div>
    ${pillCliente(c)}
  </div>`;
}
function renderClientes(){
  const lista=clientesFiltrados();
  const ativos=DB.clientes.filter(c=>c.tipo==='externo'&&c.status==='Ativo').length;
  const socios=DB.clientes.filter(c=>c.tipo==='pessoal').length;
  const arq=DB.clientes.filter(c=>c.status==='Arquivado').length;
  document.getElementById('cli-total-badge').textContent=lista.length+' de '+DB.clientes.length;
  const el=document.getElementById('cli-list');
  if(!lista.length){el.innerHTML='<div style="padding:22px;text-align:center;font-size:13px;color:var(--t3)">Nenhum cliente encontrado</div>';return;}
  if(cliFiltro==='todos'&&!cliBusca){
    el.innerHTML=
      `<div class="cli-group">Ativos (${ativos})</div>`+
      lista.filter(c=>c.tipo==='externo'&&c.status==='Ativo').map(linhaCliente).join('')+
      `<div class="cli-group">Sócios — demandas pessoais (${socios})</div>`+
      lista.filter(c=>c.tipo==='pessoal').map(linhaCliente).join('')+
      `<div class="cli-group">Arquivados (${arq})</div>`+
      lista.filter(c=>c.status==='Arquivado').map(linhaCliente).join('');
  } else {
    el.innerHTML=lista.map(linhaCliente).join('');
  }
}

// ─── DETALHE DO CLIENTE ───────────────────────────────────
function abrirCliente(id){
  clienteAtual=DB.clientes.find(c=>c.id===id);
  if(!clienteAtual)return;
  document.getElementById('cli-empty').style.display='none';
  const det=document.getElementById('cli-detail');
  det.style.display='flex';
  det.innerHTML=detalheClienteHTML(clienteAtual);
  destacarClienteNaLista(id);
}
// Antes, abrir uma ficha remontava a lista inteira de clientes só para mudar
// qual linha aparece destacada — jogava fora dezenas de elementos e criava
// outros iguais a cada clique. Agora só troca a classe das duas linhas
// envolvidas; se a lista ainda não estiver na tela, aí sim desenha.
function destacarClienteNaLista(id){
  const lista=document.getElementById('cli-list');
  const alvo=lista&&lista.querySelector('.lead-item[data-cid="'+id+'"]');
  if(!alvo){renderClientes();return;}
  const antigo=lista.querySelector('.lead-item.selected');
  if(antigo===alvo)return;
  if(antigo)antigo.classList.remove('selected');
  alvo.classList.add('selected');
}
// cartões dos contratos na ficha: cada um com o que já entrou, o que falta
// receber e a próxima parcela prevista
function contratosHTML(c){
  const lista=[...contratosDe(c)].sort((a,b)=>(a.status==='Encerrado')-(b.status==='Encerrado')||(b.inicio||'').localeCompare(a.inicio||''));
  if(!lista.length)return '<p style="font-size:13.5px;color:var(--t3);padding:4px 0 8px">Nenhum contrato registrado. Use “Novo contrato” para separar cada contratação deste cliente.</p>';
  return lista.map(ct=>{
    const fins=finDoContrato(c,ct.id);
    const rec=fins.filter(f=>f.t==='alc').reduce((a,f)=>a+f.v,0);
    const prevs=fins.filter(f=>f.t==='prev');
    const aRec=prevs.reduce((a,f)=>a+f.v,0);
    const prox=prevs.map(f=>f.dt).filter(Boolean).sort()[0];
    const st=ct.status==='Encerrado'?'<span class="proc-st s-arq">Encerrado</span>':'<span class="proc-st s-ativo">Ativo</span>';
    const meta=[
      ct.inicio?'desde '+fmtData(ct.inicio):'sem data de início',
      ct.valor>0?'valor '+money(ct.valor):'',
      'recebido '+money(rec),
      prevs.length?'a receber '+money(aRec)+' ('+prevs.length+' lançamento'+(prevs.length>1?'s':'')+')':'nada a receber',
      prox?'próxima em '+fmtData(prox):'',
    ].filter(Boolean).join(' · ');
    return `<div class="ct-card hoverable">
      <div class="ct-info">
        <div class="ct-titulo">${esc(ct.titulo||'Contrato')}${ct.leadId?' <i class="ti ti-link" style="font-size:12px;color:var(--t3)" title="Ligado a um lead do CRM"></i>':''}</div>
        <div class="ct-meta">${meta}</div>
        ${ct.obs?`<div class="ct-meta" style="margin-top:3px">${esc(ct.obs)}</div>`:''}
      </div>
      ${st}
      <span class="row-act">
        <button class="btn-ico ok" onclick="abrirModalFin('${c.id}',null,'${ct.id}')" title="Lançar pagamento neste contrato"><i class="ti ti-cash-banknote"></i></button>
        <button class="btn-ico" onclick="abrirModalContrato('${c.id}','${ct.id}')" title="Editar contrato"><i class="ti ti-pencil"></i></button>
      </span>
    </div>`;
  }).join('');
}
function detalheClienteHTML(c){
  const alc=clienteAlc(c),prev=clientePrev(c),saida=clienteSaida(c);
  const procs=procsDe(c.id).sort((a,b)=>(a.status==='Arquivado')-(b.status==='Arquivado'));
  const rootUrl=driveGet(c.id,'root');

  const variosContratos=contratosDe(c).length>1;
  // parcelas em ordem de data (sem data vão para o fim), para a série recorrente ler em sequência
  const finOrdenado=[...c.fin].sort((a,b)=>(a.dt||'9999').localeCompare(b.dt||'9999'));
  const finLinhas=c.fin.length?finOrdenado.map(f=>{
    const tipoCls=f.t==='alc'?'ft-e':f.t==='saida'?'ft-saida':'ft-a';
    const tipoLbl=f.t==='alc'?'recebido':f.t==='saida'?'saída':'previsto';
    const ct=contratoDe(c,f.contratoId);
    const chipCt=(variosContratos?`<span class="ct-chip${ct?'':' vazio'}">${ct?esc(ct.titulo):'sem contrato'}</span>`:'')
      +(f.t!=='saida'&&ehAlvara(f)?'<span class="ct-chip vazio" title="Fora da meta de faturamento">alvará</span>':'');
    return `
    <div class="det-fin-item hoverable">
      <span class="det-fin-desc">${esc(f.d)}${chipCt}</span>
      ${f.dt?`<span class="det-fin-data"><i class="ti ti-calendar" style="font-size:11px"></i> ${fmtData(f.dt)}</span>`:''}
      <span class="det-fin-val" style="color:${f.t==='saida'?'var(--red-hi)':'inherit'}">${f.t==='saida'?'− ':''}${money(f.v)}</span>
      <span class="fin-tipo ${tipoCls}">${tipoLbl}</span>
      <span class="row-act">
        ${f.t==='prev'?`<button class="btn-ico ok" onclick="marcarRecebido('${c.id}','${f.id}')" title="Marcar como recebido hoje"><i class="ti ti-check"></i></button>`:''}
        <button class="btn-ico ${f.comprovante?'ok':''}" onclick="abrirComprovanteFin('${c.id}','${f.id}')" title="${f.comprovante?'Ver comprovante':'Anexar comprovante (Google Drive)'}"><i class="ti ti-paperclip"></i></button>
        <button class="btn-ico" onclick="abrirModalFin('${c.id}','${f.id}')" title="Editar lançamento"><i class="ti ti-pencil"></i></button>
      </span>
    </div>`;
  }).join('')
    :'<p style="font-size:13.5px;color:var(--t3);padding:4px 0 8px">Sem lançamentos financeiros registrados.</p>';

  const finHTML=`
    <div class="det-fin-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="fin-bloco"><div class="fin-label">Recebido</div><div class="fin-val g">${money(alc)}</div></div>
      <div class="fin-bloco"><div class="fin-label">A receber</div><div class="fin-val a">${money(prev)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Saídas</div><div class="fin-val" style="color:var(--red-hi)">${money(saida)}</div></div>
    </div>
    <div class="fin-bloco" style="margin-bottom:14px"><div class="fin-label">Líquido (recebido − saídas)</div><div class="fin-val" style="color:${(alc-saida)<0?'var(--red-hi)':'var(--navy)'}">${money(alc-saida)}</div></div>
    ${finLinhas}`;

  const trfs=tarefasDe(c.id).sort((a,b)=>{const o={pendente:0,andamento:1,concluido:2};return o[a.status]-o[b.status];});
  const pendHTML=trfs.length?trfs.map(t=>{
    const pi=prazoInfo(t);
    const stCls=t.status==='concluido'?'st-concluido':t.status==='andamento'?'st-andamento':'st-pendente';
    return `<div class="pend-row ${t.status==='concluido'?'done':''}">
      <span class="st-pill ${stCls}" onclick="cicloTarefa('${t.id}')" title="Clique para avançar o status">${ST_LBL[t.status]}</span>
      <span class="pend-titulo">${esc(t.titulo)}</span>
      ${seloProjeto(t)}
      <span class="resp-chip">${esc(t.resp)}</span>
      <span class="prazo-badge ${pi.cls}"${pi.titulo?` title="${esc(pi.titulo)}"`:''}>${pi.txt}</span>
      <button class="btn-ico" onclick="abrirModalTarefa('${t.id}',null)" title="Editar"><i class="ti ti-pencil"></i></button>
    </div>`;
  }).join('')
    :'<p style="font-size:13.5px;color:var(--t3);padding:4px 0 8px">Nenhuma pendência registrada para este cliente.</p>';

  const procsHTML=procs.length?procs.map(p=>{
    const ei=exitoInfo(p);
    const exitoHTML=ei?`<span class="exito-badge ${ei.cls}" title="Probabilidade de êxito (preenchido manualmente)">${ei.v}% êxito</span>`
                       :`<span class="exito-badge exito-na" title="Ainda não avaliado">êxito não avaliado</span>`;
    return `
    <div class="proc-row hoverable">
      <span class="proc-num">${esc(p.num)}</span>
      <span class="proc-partes"><b>${esc(p.ativo)}</b> × ${esc(p.passivo)}</span>
      <span class="proc-st ${p.status==='Arquivado'?'s-arq':'s-ativo'}">${p.status||'Ativo'}</span>
      <span class="proc-polo ${p.polo==='a'?'polo-a':'polo-p'}">${p.polo==='a'?'Polo ativo':'Polo passivo'}</span>
      ${exitoHTML}
      <span class="proc-data">${fmtData(p.dist)}</span>
      <span class="row-act"><button class="btn-ico" onclick="abrirModalProc('${p.id}','${c.id}')" title="Editar processo"><i class="ti ti-pencil"></i></button></span>
    </div>`;
  }).join('')
    :'<p style="font-size:13.5px;color:var(--t3);padding:4px 0 8px">Nenhum processo vinculado a este cliente.</p>';

  // sugestão do mapa do Drive (Configurações → Google Drive), só para cards vazios
  const sug=driveSugestaoCliente(c);
  const escolherCaso=driveFaltaEscolherCaso(c);
  const pastasHTML=PASTAS.map(p=>{
    const url=driveGet(c.id,p.k);
    const s=!url&&sug&&sug.links[p.k];
    let status=url?'<i class="ti ti-brand-google-drive"></i> Abrir no Drive ↗':'Configurar link do Drive';
    if(url&&p.k==='processos'&&escolherCaso)status='<i class="ti ti-brand-google-drive"></i> Pasta do cliente ↗ <span class="drv-aviso">escolher caso</span>';
    if(s)status=`<span class="pasta-sug-de" title="${esc(s.de)}">Drive: ${esc(s.de)}</span>`;
    return `<div class="pasta-card ${url?'':'sem-link'}" onclick="abrirPasta('${c.id}','${p.k}')" title="${url?'Abrir no Google Drive':'Clique para configurar o link do Drive'}">
      <div class="pasta-ico"><i class="ti ${p.ico}" aria-hidden="true"></i></div>
      <div class="pasta-info">
        <div class="pasta-nome">${p.nome}</div>
        <div class="pasta-status ${url?'on':''}">${status}</div>
        ${s?`<button class="pasta-sugerida" onclick="event.stopPropagation();usarPastaSugerida('${c.id}','${p.k}')"><i class="ti ti-wand"></i> Usar pasta sugerida</button>`:''}
      </div>
      <button class="pasta-edit" onclick="event.stopPropagation();configurarPasta('${c.id}','${p.k}')" title="Editar link"><i class="ti ti-pencil"></i></button>
    </div>`;
  }).join('');

  return `
    <div class="detalhe-header">
      <div style="flex:1;min-width:0">
        <div class="dh-nome">${esc(c.nome)}</div>
        <div class="dh-tel" style="display:flex;gap:9px;align-items:center;margin-top:4px">
          ${pillCliente(c)}
          <span style="font-size:12.5px;color:var(--t3)">${c.tipo==='pessoal'?'Demanda pessoal do sócio':'Cliente externo'}${procs.length?' · '+procs.length+' processo'+(procs.length>1?'s':''):''}</span>
        </div>
      </div>
      <button class="btn-ico" onclick="abrirModalCliente('${c.id}')" title="Editar dados do cliente"><i class="ti ti-pencil"></i></button>
      ${!rootUrl&&sug?`<button class="btn-drive-root sem-link" onclick="usarPastaSugerida('${c.id}','root')" title="Drive: ${esc(sug.links.root.de)}">
        <i class="ti ti-wand"></i>Usar pasta sugerida
      </button>`:`<button class="btn-drive-root ${rootUrl?'':'sem-link'}" onclick="abrirPasta('${c.id}','root')" title="${rootUrl?'Abrir pasta raiz do cliente no Drive':'Configurar a pasta raiz do cliente no Drive'}">
        <i class="ti ti-brand-google-drive"></i>${rootUrl?'Pasta do cliente ↗':'Vincular pasta do Drive'}
      </button>`}
    </div>
    <div class="cli-detail-scroll">
      ${clientePendenciaVinculo(c)?`<div class="det-obs" style="border-color:var(--amber);color:var(--amber-hi);cursor:pointer" onclick="abrirModalCliente('${c.id}')"><i class="ti ti-link-off"></i> Pendência: este contrato ainda não está vinculado a um lead do CRM — clique para vincular.</div>`:''}
      <div class="det-sec">
        <div class="det-sec-titulo">Demandas</div>
        <p class="det-demandas">${esc(c.demandas)}</p>
        ${c.obs?`<div class="det-obs"><i class="ti ti-info-circle"></i> ${esc(c.obs)}</div>`:''}
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Contratos</span>
          <button class="det-add" onclick="abrirModalContrato('${c.id}',null)"><i class="ti ti-plus"></i> Novo contrato</button>
        </div>
        ${contratosHTML(c)}
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Financeiro</span>
          <button class="det-add" onclick="abrirModalFin('${c.id}',null)"><i class="ti ti-plus"></i> Adicionar lançamento</button>
        </div>
        ${finHTML}
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Pendências / A fazer</span>
          <button class="det-add" onclick="abrirModalTarefa(null,'${c.id}')"><i class="ti ti-plus"></i> Adicionar pendência</button>
        </div>
        ${pendHTML}
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Processos</span>
          <button class="det-add" onclick="abrirModalProc(null,'${c.id}')"><i class="ti ti-plus"></i> Adicionar processo</button>
        </div>
        ${procsHTML}
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Pastas do cliente · Google Drive</span>
          ${driveMapa()?`<button class="det-add" onclick="abrirSugestaoDrive('${c.id}')"><i class="ti ti-wand"></i> Sugerir links do Drive</button>`:''}
        </div>
        <p class="pasta-nota">Os links ficam salvos na nuvem do sistema e valem para todos os dispositivos.</p>
        <div class="pasta-grid">${pastasHTML}</div>
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Conversa exportada</span>
          <button class="det-add" onclick="abrirModalConversa('${c.id}')"><i class="ti ti-upload"></i> ${c.conversa&&c.conversa.texto?'Substituir':'Importar'} conversa</button>
        </div>
        ${renderConversaBloco(c)}
      </div>
      <div class="det-sec">
        <div class="det-sec-titulo"><span>Recados / Observações</span></div>
        <div class="chat-panel" style="margin-bottom:0;box-shadow:none">
          <div class="chat-list" id="cli-chat-list">${chatListHTML(c.chat)}</div>
          <div class="chat-input-row">
            <input type="text" class="chat-input" id="cli-chat-input" placeholder="Deixe um recado sobre este cliente…" onkeydown="if(event.key==='Enter')enviarChatCliente('${c.id}')">
            <button class="chat-send-btn" onclick="enviarChatCliente('${c.id}')" title="Enviar"><i class="ti ti-send"></i></button>
          </div>
        </div>
      </div>
    </div>`;
}

// ─── GOOGLE DRIVE ─────────────────────────────────────────
// Só abre endereços http/https: um link colado com "javascript:" rodaria
// código dentro do sistema, com acesso a tudo que está na tela.
function abrirLinkExterno(url){
  const u=String(url||'').trim();
  if(!/^https?:\/\//i.test(u)){
    alert('Este link não é um endereço válido da web.\n\nUse um endereço começando com https:// (por exemplo, o link da pasta no Google Drive).');
    return false;
  }
  window.open(u,'_blank','noopener,noreferrer');
  return true;
}
function abrirPasta(cid,k){
  const url=driveGet(cid,k);
  if(url){abrirLinkExterno(url);return;}
  configurarPasta(cid,k);
}
function configurarPasta(cid,k){
  const nome=k==='root'?'Pasta raiz do cliente':(PASTAS.find(p=>p.k===k)||{}).nome||k;
  const atual=driveGet(cid,k);
  const u=prompt('Cole o link da pasta do Google Drive para:\n"'+nome+'"\n\n(deixe vazio para remover o link)',atual);
  if(u===null)return;
  driveSet(cid,k,u.trim());
  refreshUI();
}

// ─── COMPROVANTES DE LANÇAMENTOS (mesmo molde das pastas do cliente) ──
// cada lançamento (de cliente ou geral) pode ter um link de comprovante
// hospedado no Google Drive — só o link fica salvo aqui, o arquivo em si
// mora no Drive
function abrirComprovanteFin(cid,fid){
  const c=DB.clientes.find(x=>x.id===cid);
  const f=c&&c.fin.find(x=>x.id===fid);
  if(!f)return;
  if(f.comprovante){abrirLinkExterno(f.comprovante);return;}
  configurarComprovanteFin(cid,fid);
}
function configurarComprovanteFin(cid,fid){
  const c=DB.clientes.find(x=>x.id===cid);
  const f=c&&c.fin.find(x=>x.id===fid);
  if(!f)return;
  const u=prompt('Cole o link do comprovante no Google Drive para:\n"'+f.d+'"\n\n(deixe vazio para remover o link)',f.comprovante||'');
  if(u===null)return;
  if(u.trim())f.comprovante=u.trim();else delete f.comprovante;
  salvarDB();
  refreshUI();
}
function abrirComprovanteLanc(id){
  const l=DB.lancamentos.find(x=>x.id===id);
  if(!l)return;
  if(l.comprovante){abrirLinkExterno(l.comprovante);return;}
  configurarComprovanteLanc(id);
}
function configurarComprovanteLanc(id){
  const l=DB.lancamentos.find(x=>x.id===id);
  if(!l)return;
  const u=prompt('Cole o link do comprovante no Google Drive para:\n"'+l.descricao+'"\n\n(deixe vazio para remover o link)',l.comprovante||'');
  if(u===null)return;
  if(u.trim())l.comprovante=u.trim();else delete l.comprovante;
  salvarDB();
  refreshUI();
}
