// ─── PASTAS / GOOGLE DRIVE (guardadas dentro de cada cliente) ──
const PASTAS=[
  {k:'docs',       nome:'Docs pessoais',            ico:'ti-id'},
  {k:'contrato',   nome:'Contrato de honorários',   ico:'ti-file-certificate'},
  {k:'procuracao', nome:'Procuração',               ico:'ti-writing-sign'},
  {k:'processos',  nome:'Docs dos processos',       ico:'ti-gavel'},
];
function driveGet(cid,k){
  const c=DB.clientes.find(x=>x.id===cid);
  return (c&&c.drive&&c.drive[k])||'';
}
function driveSet(cid,k,url){
  const c=DB.clientes.find(x=>x.id===cid);
  if(!c)return;
  if(!c.drive)c.drive={};
  if(url)c.drive[k]=url;else delete c.drive[k];
  salvarDB();
}

// ─── HELPERS ──────────────────────────────────────────────
const BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function fmt(v){return BRL.format(v)}
function fmtK(v){return v>=1000?('R$ '+(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+'k'):fmt(v)}
// ─── MÁSCARA DE VALORES (botão olho) ───────────────────────
let MONEY_VISIBLE=localStorage.getItem('bgl_money_hidden')!=='1';
function money(v){return MONEY_VISIBLE?fmt(v):'R$ ••••'}
function moneyK(v){return MONEY_VISIBLE?fmtK(v):'••••'}
function toggleMoney(){
  MONEY_VISIBLE=!MONEY_VISIBLE;
  localStorage.setItem('bgl_money_hidden',MONEY_VISIBLE?'0':'1');
  aplicarIconeOlho();
  renderDashboard();renderFin();
  if(clienteAtual)document.getElementById('cli-detail').innerHTML=detalheClienteHTML(clienteAtual);
}
function aplicarIconeOlho(){
  const b=document.getElementById('btn-eye');
  b.classList.toggle('off',!MONEY_VISIBLE);
  b.innerHTML=MONEY_VISIBLE?'<i class="ti ti-eye"></i>':'<i class="ti ti-eye-off"></i>';
  b.title=MONEY_VISIBLE?'Ocultar valores':'Mostrar valores';
}
function fmtData(iso){if(!iso)return '';const[a,m,d]=iso.split('-');return d+'/'+m+'/'+a}
function fmtDataHora(ts){
  const d=new Date(ts);
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

// ─── CHAT / RECADOS (por cliente e geral na Rotina) ────────
function chatListHTML(msgs){
  if(!msgs||!msgs.length)return '<div class="chat-empty">Nenhum recado ainda.</div>';
  return [...msgs].sort((a,b)=>b.criadoEm-a.criadoEm).map(m=>{
    const cr=corDe(m.autor);
    return `<div class="chat-msg">
      <div class="chat-msg-av" style="background:${cr[0]};color:${cr[1]}">${iniciais(m.autor)}</div>
      <div class="chat-msg-body">
        <div class="chat-msg-head"><span class="chat-msg-autor">${esc(m.autor)}</span><span class="chat-msg-data">${fmtDataHora(m.criadoEm)}</span></div>
        <div class="chat-msg-texto">${esc(m.texto)}</div>
      </div>
    </div>`;
  }).join('');
}
function enviarChatCliente(cid){
  const inp=document.getElementById('cli-chat-input');
  const texto=inp.value.trim();
  if(!texto)return;
  const c=DB.clientes.find(x=>x.id===cid);
  if(!c)return;
  if(!Array.isArray(c.chat))c.chat=[];
  c.chat.push({id:uid(),autor:EU.nome,texto,criadoEm:Date.now()});
  salvarDB();
  if(clienteAtual&&clienteAtual.id===cid){
    document.getElementById('cli-detail').innerHTML=detalheClienteHTML(clienteAtual);
    document.getElementById('cli-chat-input').focus();
  }
}
function enviarChatGeral(){
  const inp=document.getElementById('rotina-chat-input');
  const texto=inp.value.trim();
  if(!texto)return;
  if(!Array.isArray(DB.chatGeral))DB.chatGeral=[];
  DB.chatGeral.push({id:uid(),autor:EU.nome,texto,criadoEm:Date.now()});
  salvarDB();
  inp.value='';
  renderChatGeral();
  document.getElementById('rotina-chat-input').focus();
}
function renderChatGeral(){
  const el=document.getElementById('rotina-chat-list');
  if(!el)return;
  el.innerHTML=chatListHTML(DB.chatGeral);
}

// ─── CONVERSA EXPORTADA (WhatsApp etc.) ────────────────────
// reconhece "dd/mm/aaaa hh:mm - Nome: msg" (Android) e "[dd/mm/aaaa, hh:mm:ss] Nome: msg" (iOS);
// qualquer outro formato aparece como texto corrido, sem quebrar a importação
function parseConversaLinha(linha){
  let m=linha.match(/^(\d{2}\/\d{2}\/\d{4}),?\s+(\d{2}:\d{2})(?::\d{2})?\s*-\s*([^:]+):\s?(.*)$/);
  if(m)return {data:m[1],hora:m[2],autor:m[3].trim(),texto:m[4]};
  m=linha.match(/^\[(\d{2}\/\d{2}\/\d{4}),\s+(\d{2}:\d{2})(?::\d{2})?\]\s*([^:]+):\s?(.*)$/);
  if(m)return {data:m[1],hora:m[2],autor:m[3].trim(),texto:m[4]};
  return null;
}
function parseConversa(texto){
  const linhas=texto.split(/\r?\n/);
  const out=[];
  let atual=null;
  linhas.forEach(linha=>{
    const p=parseConversaLinha(linha);
    if(p){
      if(atual)out.push(atual);
      atual={autor:p.autor,meta:p.data+' '+p.hora,texto:p.texto};
    }else if(atual){
      atual.texto+=(atual.texto?'\n':'')+linha;
    }else if(linha.trim()){
      out.push({autor:'',meta:'',texto:linha});
    }
  });
  if(atual)out.push(atual);
  return out;
}
function renderConversaBloco(c){
  if(!c.conversa||!c.conversa.texto)return '<p style="font-size:13.5px;color:var(--t3);padding:4px 0 8px">Nenhuma conversa importada.</p>';
  const itens=parseConversa(c.conversa.texto);
  const linhasHTML=itens.map(it=>it.autor
    ?`<div class="conv-linha"><span class="conv-autor">${esc(it.autor)}</span><span class="conv-meta">${esc(it.meta)}</span><div class="conv-texto">${esc(it.texto)}</div></div>`
    :`<div class="conv-linha conv-linha--solta"><div class="conv-texto">${esc(it.texto)}</div></div>`
  ).join('');
  return `<div class="conv-box">${linhasHTML}</div>
    <div style="font-size:11px;color:var(--t3);margin-top:8px">Importado em ${fmtDataHora(c.conversa.importadoEm)} · ${itens.length} mensagem${itens.length!==1?'ns':''}</div>`;
}
let convCtx={cid:null};
function abrirModalConversa(cid){
  convCtx={cid};
  const c=DB.clientes.find(x=>x.id===cid);
  document.getElementById('conv-texto').value=(c&&c.conversa&&c.conversa.texto)||'';
  document.getElementById('conv-file').value='';
  document.getElementById('conv-del').style.display=(c&&c.conversa&&c.conversa.texto)?'inline-flex':'none';
  abrirOverlay('overlay-conversa');
}
function carregarArquivoConversa(inp){
  const file=inp.files&&inp.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{document.getElementById('conv-texto').value=e.target.result;};
  reader.readAsText(file,'utf-8');
}
function salvarConversa(){
  const c=DB.clientes.find(x=>x.id===convCtx.cid);
  if(!c)return;
  const texto=document.getElementById('conv-texto').value;
  if(!texto.trim()){alert('Cole o texto da conversa ou envie o arquivo exportado.');return;}
  c.conversa={texto,importadoEm:Date.now()};
  salvarDB();
  fecharOverlay('overlay-conversa');
  refreshUI();
}
function removerConversa(){
  const c=DB.clientes.find(x=>x.id===convCtx.cid);
  if(!c)return;
  if(!confirm('Remover a conversa importada deste cliente?'))return;
  c.conversa=null;
  salvarDB();
  fecharOverlay('overlay-conversa');
  refreshUI();
}
// data de hoje em ISO. É chamada dentro de laços de renderização e de
// comparadores de ordenação (centenas de vezes por desenho de tela), por isso
// o resultado fica guardado por meio minuto em vez de criar um Date a cada vez.
let __hojeISO='', __hojeISOEm=0, __hojeTS=0;
function hojeISO(){
  const agora=Date.now();
  if(__hojeISO&&agora-__hojeISOEm<30000)return __hojeISO;
  const d=new Date(agora);
  __hojeISO=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  __hojeISOEm=agora;
  __hojeTS=new Date(__hojeISO).getTime();
  return __hojeISO;
}
// meia-noite de hoje em milissegundos (para contas de prazo)
function hojeTS(){hojeISO();return __hojeTS}
function parseValor(s){
  s=String(s).trim().replace(/^R\$\s*/,'');
  if(!s)return NaN;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  // "18.000" ou "1.500.000" sem vírgula: os pontos são de milhar, não decimal
  else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  return parseFloat(s);
}
function iniciais(n){return n.trim().split(/\s+/).map(p=>p[0]).slice(0,2).join('').toUpperCase()}
const CORES=[['#e4ece4','#256a33'],['#f3e3e3','#8f2f2f'],['#e5eaf3','#264d7c'],['#f3ecd9','#8a5e12'],['#e6eaf2','#16243d']];
function corDe(id){return CORES[(id.charCodeAt(0)+id.length)%CORES.length]}

// ─── CRM COMERCIAL: categorias e opções (espelham o Dashboard Comercial da planilha) ───
const CATEGORIAS_ORIGEM=['Busca Online (Google/ChatGPT)','Indicacao de Parceiro/Advogado','Indicacao de Cliente/Conhecido','Instagram/Redes Sociais','Site/Formulario','Outro'];
const CATEGORIAS_OBJECAO=['Honorarios/Custas','Inseguranca/Medo','Tempo para decidir','Confianca no advogado','Documentacao','Nao apresentada','Outro'];
const PROBABILIDADES_FECHAMENTO=[0,0.1,0.25,0.5,0.75,0.9,1];
const CRM_PALETA=['var(--navy)','var(--amber)','var(--green)','var(--red)','var(--navy-soft)','var(--t3)'];
// cores em hex (para SVG do gráfico bolo, onde var(--x) nem sempre resolve)
const CRM_PALETA_HEX=['#16243d','#a9741b','#2f7d3f','#b23b3b','#3a5a86','#9aa3b0','#c9a24a'];
// cadência de follow-up: leads sem contato há este nº de dias (ou mais) já entram no aviso
const CRM_FOLLOWUP_DIAS=2;

// ─── FUNIL DE VENDAS (regras de negócio): etapas fixas, motivos de perda, prazos e pesos ───
const STATUS_CRM_OPCOES=['Novo','Qualificado','Reunião marcada','Proposta enviada','Em negociação','Ganho','Perdido'];
const ETAPAS_ATIVAS=['Novo','Qualificado','Reunião marcada','Proposta enviada','Em negociação']; // não-terminais
const MOTIVOS_PERDA=['Preço','Prazo','Concorrência','Sumiço','Caso inviável'];
// prazo máximo por etapa até gerar alerta de estouro — 'Novo' é em horas úteis, os demais em dias corridos
const PRAZO_ETAPA={'Novo':{h:4},'Qualificado':{d:2},'Reunião marcada':{d:5},'Proposta enviada':{d:7},'Em negociação':{d:7}};
const PRAZO_TETO_FUNIL_DIAS=15; // teto total corrido no funil, da criação até Ganho/Perdido
const PRAZO_REUNIAO_PROPOSTA_H=24; // até 24h entre a reunião (data marcada) e o envio da proposta
// cadência automática de follow-up ao entrar em "Proposta enviada": dia → canal
// peso da etapa sobre o honorário estimado, para a receita prevista
const PESO_ETAPA_LEAD={'Qualificado':0.10,'Reunião marcada':0.30,'Proposta enviada':0.50,'Em negociação':0.70};
const PESO_PREVISTO_CLIENTE={aceiteVerbal:0.90,contratado:1.00};
function popularOpcoesCRM(){
  const addOpts=(id,valores,fmt)=>{
    const el=document.getElementById(id);
    if(!el)return;
    valores.forEach(v=>{
      const o=document.createElement('option');
      o.value=v; o.textContent=fmt?fmt(v):v;
      el.appendChild(o);
    });
  };
  ['jr-origem','jr-origem-civel'].forEach(id=>addOpts(id,CATEGORIAS_ORIGEM));
  ['jr-cat-objecao','jr-cat-objecao-civel'].forEach(id=>addOpts(id,CATEGORIAS_OBJECAO));
  ['jr-status-crm','jr-status-crm-civel'].forEach(id=>addOpts(id,STATUS_CRM_OPCOES));
  ['jr-probabilidade','jr-probabilidade-civel'].forEach(id=>addOpts(id,PROBABILIDADES_FECHAMENTO,v=>Math.round(v*100)+'%'));
  ['jr-motivo-perda','jr-motivo-perda-civel','mvp-motivo'].forEach(id=>addOpts(id,['',...MOTIVOS_PERDA],v=>v||'— selecione —'));
}
popularOpcoesCRM();
function clienteAlc(c){return c.fin.filter(x=>x.t==='alc').reduce((a,x)=>a+x.v,0)}
function clientePrev(c){return c.fin.filter(x=>x.t==='prev').reduce((a,x)=>a+x.v,0)}
function clienteSaida(c){return c.fin.filter(x=>x.t==='saida').reduce((a,x)=>a+x.v,0)}
function procsDe(cid){return DB.processos.filter(p=>p.cid===cid)}

// ─── CONTRATOS DO CLIENTE ─────────────────────────────────
// Um mesmo cliente pode fechar vários contratos ao longo do tempo (ex.: uma ação,
// depois outra, depois uma assessoria mensal). Antes, cada contrato novo virava
// um cadastro de cliente separado. Agora o cliente tem uma lista de contratos e
// cada lançamento financeiro pode apontar para o contrato a que pertence.
function contratosDe(c){return (c&&Array.isArray(c.contratos))?c.contratos:[]}
function contratoDe(c,ctId){return ctId?contratosDe(c).find(k=>k.id===ctId)||null:null}
function finDoContrato(c,ctId){return (c.fin||[]).filter(f=>(f.contratoId||null)===(ctId||null))}
function novoContrato(dados){
  return {id:uid(),titulo:'',inicio:'',status:'Ativo',obs:'',leadId:null,leadMod:null,criadoEm:Date.now(),...dados};
}
// migração: todo cliente ganha a lista de contratos. Quem já existia recebe um
// contrato inicial com os dados que estavam no próprio cadastro (demandas, data
// de entrada, lead vinculado), e os lançamentos dele passam a apontar para esse
// contrato. Nada é apagado; roda uma vez por cliente.
function garantirContratos(){
  let mudou=false;
  (DB&&DB.clientes||[]).forEach(c=>{
    if(Array.isArray(c.contratos))return;
    const ct=novoContrato({
      titulo:(c.demandas||'').trim()||'Contrato inicial',
      inicio:c.entrada||'',
      status:c.status==='Arquivado'?'Encerrado':'Ativo',
      leadId:c.leadVinculadoId||null,leadMod:c.leadVinculadoMod||null,
    });
    c.contratos=[ct];
    (c.fin||[]).forEach(f=>{if(!f.contratoId)f.contratoId=ct.id;});
    mudou=true;
  });
  return mudou;
}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

// ─── ORDEM ALFABÉTICA PADRÃO DO SISTEMA ────────────────────
// Regra única: toda lista de pessoas (clientes, seleção de clientes,
// listas financeiras e de processos por cliente) aparece em ordem
// alfabética de A a Z. Usa Intl.Collator para tratar acentos e
// maiúsculas corretamente em português ("Ávila" antes de "Bastos").
const COLLATOR=new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
function cmpNome(a,b){return COLLATOR.compare(String(a??''),String(b??''))}
function ordenarPorNome(lista,pegarNome){
  const nome=pegarNome||(x=>x&&x.nome);
  return [...lista].sort((a,b)=>cmpNome(nome(a),nome(b)));
}
// índice id→cliente: evita varrer DB.clientes dentro de laços de renderização
// (era O(processos × clientes) nas telas de Teses e Arquivados)
let __idxClientes=null;
function indiceClientes(){
  if(!__idxClientes){
    __idxClientes=new Map();
    (DB&&DB.clientes||[]).forEach(c=>__idxClientes.set(c.id,c));
  }
  return __idxClientes;
}
function invalidarIndiceClientes(){__idxClientes=null}
function clientePorId(id){return id?indiceClientes().get(id)||null:null}
// processos em ordem alfabética do cliente; sem cliente vinculado vão para o fim,
// e dentro do mesmo cliente valem os mais recentes primeiro
function ordenarProcessosPorCliente(lista){
  return [...lista].sort((a,b)=>{
    const ca=clientePorId(a.cid), cb=clientePorId(b.cid);
    if(!!ca!==!!cb)return ca?-1:1;
    if(ca){const d=cmpNome(ca.nome,cb.nome);if(d)return d;}
    return (b.dist||'')<(a.dist||'')?-1:1;
  });
}

// ─── COLUNAS E SEÇÕES RECOLHÍVEIS ──────────────────────────
// Guarda no navegador quais blocos dos quadros ficam fechados.
// Por padrão vêm fechados os blocos "de arquivo": pautas já
// publicadas e tarefas já concluídas — abrem com um clique.
const LS_RECOLHIDAS='bgl_blocos_recolhidos';
let blocosRecolhidos=(()=>{
  try{
    const s=JSON.parse(localStorage.getItem(LS_RECOLHIDAS)||'null');
    return (s&&typeof s==='object')?s:{};
  }catch(e){return {};}
})();
// padraoFechado = como o bloco aparece antes de o usuário mexer nele
function blocoRecolhido(chave,padraoFechado){
  const v=blocosRecolhidos[chave];
  return v===undefined?!!padraoFechado:!!v;
}
function alternarBloco(chave,padraoFechado){
  blocosRecolhidos[chave]=!blocoRecolhido(chave,padraoFechado);
  try{localStorage.setItem(LS_RECOLHIDAS,JSON.stringify(blocosRecolhidos))}catch(e){}
  if(chave.indexOf('comercial:')===0)renderComercial();
  else if(chave.indexOf('fin:')===0)renderFin();
  else renderRotina();
}
function chevron(){return '<i class="ti ti-chevron-down chev"></i>'}
function fecharOverlay(id){document.getElementById(id).classList.remove('open')}
function abrirOverlay(id){document.getElementById(id).classList.add('open')}

