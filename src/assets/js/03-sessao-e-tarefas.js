// ─── TAREFAS / ROTINA ─────────────────────────────────────
// O escritório tem dois sócios: Cecília e Thallys. Toda tarefa tem UM
// responsável (quem executa) e, opcionalmente, pede que o OUTRO sócio
// revise e/ou aprove. Não há mais "Dupla" nem "Escritório" como opções:
// RESP_DUPLA e 'Escritório' permanecem só para ler dados antigos até a
// migração (migrarResponsaveis) convertê-los.
const RESP_DUPLA='Cecília e Thallys';          // legado (dados anteriores à migração)
const RESP=['Cecília','Thallys'];
const RESP_CONTEUDO=['Cecília','Thallys','Escritório'];  // comercial: pauta de conteúdo, não mexida aqui
// o outro sócio (a quem cabe revisar/aprovar a tarefa do primeiro)
function outroSocio(r){return r==='Cecília'?'Thallys':r==='Thallys'?'Cecília':''}
// cor e sigla do avatar de um responsável (ícones próprios para os valores legados)
function corResp(r){return r==='Escritório'?['#e6eaf2','#16243d']:r===RESP_DUPLA?['#efe6f3','#5c3f7e']:corDe(r)}
function avatarResp(r){return r==='Escritório'?'<i class="ti ti-building"></i>':r===RESP_DUPLA?'C+T':iniciais(r)}

// ─── REVISÃO / APROVAÇÃO PELO OUTRO SÓCIO ──────────────────
// Campos na tarefa:
//   t.revPede    '' | 'revisar' | 'aprovar' | 'ambos'  (o que se pede do outro sócio)
//   t.revEstado  '' | 'revisado' | 'aprovado'          (até onde já foi)
//   t.revEm      timestamp da última ação  · t.revPorQuem quem a fez
// O revisor é sempre o outro sócio — com apenas duas pessoas, não há o que escolher.
const REV_PEDE_LBL={revisar:'Revisar',aprovar:'Aprovar',ambos:'Revisar e aprovar'};
function revisorDa(t){return outroSocio(t.resp)}
// próxima ação que ainda falta do revisor ('revisar' | 'aprovar' | '' = nada pendente)
function revProximaAcao(t){
  if(!t||!t.revPede)return '';
  if(t.revPede==='revisar')return t.revEstado==='revisado'?'':'revisar';
  if(t.revPede==='aprovar')return t.revEstado==='aprovado'?'':'aprovar';
  // 'ambos': primeiro revisar, depois aprovar
  if(t.revEstado==='aprovado')return '';
  return t.revEstado==='revisado'?'aprovar':'revisar';
}
function revEstadoLbl(t){
  if(!t||!t.revPede)return '';
  const quem=revisorDa(t);
  const prox=revProximaAcao(t);
  if(!prox)return (t.revEstado==='aprovado'?'Aprovada':'Revisada')+(t.revPorQuem?' por '+t.revPorQuem:'');
  return (prox==='aprovar'?'Aguarda aprovação de ':'Aguarda revisão de ')+quem;
}
// FLUXO: em andamento → o responsável envia para revisão/aprovação → o outro
// sócio revisa/aprova → só então a tarefa pode ser concluída.
// A revisão/aprovação só fica disponível para o outro sócio DEPOIS do envio
// (t.revEnviado); antes disso a tarefa ainda está com o responsável.
function revEnviada(t){return !!(t&&t.revPede&&t.revEnviado)}
// está na mesa do revisor? (pedida, já enviada e ainda falta ação dele)
function revPendenteRevisor(t){return !!(t&&t.revPede&&t.revEnviado&&revProximaAcao(t))}
// o responsável ainda precisa enviar para o outro sócio?
function revAguardaEnvio(t){return !!(t&&t.revPede&&!t.revEnviado&&revProximaAcao(t))}
// Uma tarefa com revisão/aprovação pedida só pode ser concluída depois que
// o outro sócio cumprir sua parte. Enquanto houver ação pendente, trava.
function revBloqueiaConclusao(t){return !!(t&&t.revPede&&revProximaAcao(t))}
function avisoRevConclusao(t){
  const prox=revProximaAcao(t), quem=revisorDa(t);
  if(!t.revEnviado)return 'Envie esta tarefa para '+(prox==='aprovar'?'aprovação':'revisão')+' de '+quem+' antes de concluí-la.';
  return 'Esta tarefa aguarda '+(prox==='aprovar'?'aprovação':'revisão')+' de '+quem+' antes de ser concluída.';
}
// o responsável termina sua parte e envia para o outro sócio
function enviarParaRevisao(id){
  const t=DB.tarefas.find(x=>x.id===id);if(!t||!t.revPede||!revProximaAcao(t))return;
  t.revEnviado=true;t.revEnviadoEm=Date.now();
  if(t.status==='pendente')aplicarStatusTarefa(t,'andamento');
  salvarDB();refreshUI();
  mostrarToast('Enviada para '+(revProximaAcao(t)==='aprovar'?'aprovação':'revisão')+' de '+revisorDa(t));
}
function marcarRevisao(id,acao){
  const t=DB.tarefas.find(x=>x.id===id);if(!t||!t.revPede||!t.revEnviado)return;
  const prox=revProximaAcao(t);
  if(acao!==prox)return;
  t.revEstado=acao==='aprovar'?'aprovado':'revisado';
  t.revEm=Date.now();
  t.revPorQuem=EU&&RESP.includes(EU.nome)?EU.nome:revisorDa(t);
  salvarDB();refreshUI();
  mostrarToast((acao==='aprovar'?'Aprovada':'Revisada')+': '+t.titulo);
}
// Converte dados antigos (resp 'Dupla'/'Escritório' e quaisquer valores fora da
// lista) para o novo modelo de dois sócios e zera qualquer revisão/aprovação
// gravada em tarefas pré-existentes. Esse recurso é novo e vale só daqui para
// frente: tudo o que havia foi acrescentado automaticamente pelas versões
// anteriores (nunca escolhido pelo usuário), então a base começa limpa.
function migrarResponsaveis(){
  if(!DB)return;
  let mudou=false;
  if(!DB.respV2){
    (DB.tarefas||[]).forEach(t=>{
      if(t.resp===RESP_DUPLA)t.resp='Cecília';       // execução conjunta → Cecília conduz
      else if(!RESP.includes(t.resp))t.resp='Thallys'; // 'Escritório' e órfãos
    });
    DB.respV2=true;mudou=true;
  }
  if(!DB.revResetV1){
    (DB.tarefas||[]).forEach(t=>{
      ['revPede','revEstado','revEm','revPorQuem','revEnviado','revEnviadoEm'].forEach(k=>{
        if(t[k]!==undefined){delete t[k];mudou=true;}
      });
    });
    DB.revResetV1=true;mudou=true;
  }
  if(mudou&&!MODO_OFFLINE)salvarDB();
}
// tipos de tarefa agora vivem em DB.tiposTarefa (editável em Configurações)
function tiposTarefa(){return DB.tiposTarefa&&DB.tiposTarefa.length?DB.tiposTarefa:SEED_TIPOS_TAREFA}
function tipoInfo(key){return tiposTarefa().find(x=>x.key===key)||{key,lbl:key||'—',cor:'#828b9c'}}

// ─── CONFIGURAÇÕES: TIPOS DE TAREFA (editáveis, sem mexer no código) ──
function slugify(s){
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'tipo';
}
function abrirConfiguracoes(){
  renderConfigTipos();
  renderConfigDrive();
  prepararTrocaSenha();
  abrirOverlay('overlay-config');
}

// ─── TROCA DE SENHA ────────────────────────────────────────
// A senha protege duas coisas: a entrada no sistema e o token do
// GitHub guardado cifrado neste dispositivo. Por isso, ao trocá-la,
// o cofre precisa ser refeito com a chave nova — senão o token
// deixaria de abrir no próximo login.
const SENHA_MIN=8;
const SENHAS_PROIBIDAS=['bgl2024','12345678','bgladvogados','senha123'];
function prepararTrocaSenha(){
  const quem=document.getElementById('cfg-senha-quem');
  if(quem)quem.textContent=EU?('conectado como '+EU.nome):'';
  ['cfg-senha-atual','cfg-senha-nova','cfg-senha-nova2'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  msgSenha('','');
  const btn=document.getElementById('cfg-senha-btn');
  if(btn){
    btn.disabled=!!MODO_OFFLINE;
    if(MODO_OFFLINE)msgSenha('Esta é uma cópia de segurança offline — a troca de senha só pode ser feita no sistema online.','alerta');
  }
}
function msgSenha(txt,tipo){
  const el=document.getElementById('cfg-senha-msg');
  if(!el)return;
  if(!txt){el.style.display='none';return;}
  el.style.display='block';
  el.textContent=txt;
  if(tipo==='ok'){el.style.background='var(--green-bg)';el.style.color='var(--green-hi)';}
  else if(tipo==='alerta'){el.style.background='var(--amber-bg)';el.style.color='var(--amber-hi)';}
  else{el.style.background='var(--red-bg)';el.style.color='var(--red-hi)';}
}
async function trocarSenha(){
  if(MODO_OFFLINE){msgSenha('Cópia offline: não é possível gravar a nova senha.','alerta');return;}
  if(!EU||!DB){msgSenha('Sessão não identificada. Entre novamente.','erro');return;}
  const atual=document.getElementById('cfg-senha-atual').value;
  const nova=document.getElementById('cfg-senha-nova').value;
  const nova2=document.getElementById('cfg-senha-nova2').value;
  if(!atual||!nova||!nova2){msgSenha('Preencha os três campos.','erro');return;}
  if(nova!==nova2){msgSenha('A nova senha e a repetição não são iguais.','erro');return;}
  if(nova.length<SENHA_MIN){msgSenha('A nova senha precisa ter pelo menos '+SENHA_MIN+' caracteres.','erro');return;}
  if(nova===atual){msgSenha('A nova senha é igual à atual.','erro');return;}
  if(SENHAS_PROIBIDAS.includes(nova.toLowerCase())){msgSenha('Essa senha é conhecida publicamente. Escolha outra.','erro');return;}

  const btn=document.getElementById('cfg-senha-btn');
  btn.disabled=true;
  const rotulo=btn.innerHTML;
  btn.innerHTML='<i class="ti ti-loader"></i> Trocando…';
  msgSenha('','');
  try{
    const eu=DB.usuarios.find(x=>String(x.user||'').toLowerCase()===EU.user.toLowerCase());
    if(!eu){msgSenha('Seu usuário não foi encontrado nos dados. Entre novamente.','erro');return;}
    if(!await conferirSenha(eu,atual)){msgSenha('A senha atual está incorreta.','erro');return;}

    const anterior=eu.senha?JSON.parse(JSON.stringify(eu.senha)):null;
    const hashAntigo=eu.hash;
    eu.senha=await hashSenha(nova);
    delete eu.hash;                       // sai o formato antigo, sem sal
    eu.senhaAlteradaEm=Date.now();
    try{
      await gravarDB();
    }catch(e){
      // desfaz na memória para a tela não ficar divergindo do que está salvo
      if(anterior)eu.senha=anterior;else delete eu.senha;
      if(hashAntigo)eu.hash=hashAntigo;
      delete eu.senhaAlteradaEm;
      msgSenha('Não foi possível salvar a nova senha na nuvem: '+e.message+' A senha antiga continua valendo.','erro');
      return;
    }
    // o cofre deste dispositivo é refeito com a chave nova
    await guardarNoCofre(eu.user,nova,GH_TOKEN);
    prepararTrocaSenha();
    msgSenha('Senha trocada. Nos outros computadores, o token guardado vai pedir para ser informado de novo no primeiro login — é esperado.','ok');
  }finally{
    btn.disabled=false;btn.innerHTML=rotulo;
  }
}
function renderConfigTipos(){
  const el=document.getElementById('config-tipos-list');
  if(!DB.tiposTarefa.length){el.innerHTML='<p style="font-size:13px;color:var(--t3);padding:6px 0">Nenhum tipo cadastrado.</p>';return;}
  el.innerHTML=DB.tiposTarefa.map(x=>`
    <div class="cfgtipo-row">
      <input type="color" class="cfgtipo-color" value="${x.cor}" onchange="recolorirTipoTarefa('${x.key}',this.value)" title="Cor">
      <input type="text" class="cfgtipo-lbl" value="${esc(x.lbl)}" onchange="renomearTipoTarefa('${x.key}',this.value)">
      <button class="btn-ico" onclick="excluirTipoTarefa('${x.key}')" title="Excluir tipo"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}
function adicionarTipoTarefa(){
  const nome=document.getElementById('cfg-tipo-nome').value.trim();
  const cor=document.getElementById('cfg-tipo-cor').value;
  if(!nome){alert('Dê um nome para o novo tipo.');return;}
  let key=slugify(nome),i=2;
  while(DB.tiposTarefa.some(x=>x.key===key)){key=slugify(nome)+'-'+i;i++;}
  DB.tiposTarefa.push({key,lbl:nome,cor});
  salvarDB();
  document.getElementById('cfg-tipo-nome').value='';
  renderConfigTipos();
  refreshUI();
}
function renomearTipoTarefa(key,novoLbl){
  const t=DB.tiposTarefa.find(x=>x.key===key);if(!t)return;
  novoLbl=novoLbl.trim();
  if(!novoLbl){renderConfigTipos();return;}
  t.lbl=novoLbl;salvarDB();refreshUI();
}
function recolorirTipoTarefa(key,cor){
  const t=DB.tiposTarefa.find(x=>x.key===key);if(!t)return;
  t.cor=cor;salvarDB();refreshUI();
}
function excluirTipoTarefa(key){
  const emUso=DB.tarefas.filter(t=>t.tipo===key).length;
  const msg=emUso?`Excluir este tipo? ${emUso} tarefa(s) usam ele — elas continuam existindo, só perdem a cor/nome (mostram "${key}").`:'Excluir este tipo de tarefa?';
  if(!confirm(msg))return;
  DB.tiposTarefa=DB.tiposTarefa.filter(x=>x.key!==key);
  salvarDB();
  renderConfigTipos();
  refreshUI();
}

const ST_LBL={pendente:'Pendente',andamento:'Em andamento',concluido:'Concluída'};
function tarefasDe(cid){return DB.tarefas.filter(t=>t.cid===cid)}
function nomeCliente(cid){const c=cid&&DB.clientes.find(x=>x.id===cid);return c?c.curto:''}
// ─── CUMPRIMENTO DE PRAZO (tarefas concluídas) ────────────
// Toda tarefa que entra em "Concluída" guarda a data em t.concluidoEm
// (ISO aaaa-mm-dd). Com ela e o prazo dá para saber se a tarefa saiu
// adiantada, no dia ou com atraso — e quantos dias.
// diferença em dias entre duas datas ISO (b − a), sem risco de fuso
function diasEntreISO(a,b){
  if(!a||!b)return null;
  const[ay,am,ad]=a.split('-').map(Number);
  const[by,bm,bd]=b.split('-').map(Number);
  return Math.round((new Date(by,bm-1,bd).getTime()-new Date(ay,am-1,ad).getTime())/86400000);
}
function plural(n,s){return n+' dia'+(n>1?'s':'')+(s||'')}
// data curta (dd/mm) para caber nos badges dos cards
function fmtDataCurta(iso){return iso?fmtData(iso).slice(0,5):''}
// classifica a conclusão: antecipada | noprazo | atrasada | semprazo | semregistro
function conclusaoInfo(t){
  if(!t||t.status!=='concluido')return null;
  const data=t.concluidoEm||'';
  if(!data)return {cat:'semregistro',dias:null,data:'',cls:'prazo-sem',
    txt:'sem data',titulo:'Tarefa concluída antes deste controle existir — sem data registrada. Edite a tarefa para informar quando foi concluída.'};
  if(!t.prazo)return {cat:'semprazo',dias:null,data,cls:'prazo-ok',
    txt:'✓ '+fmtDataCurta(data),titulo:'Concluída em '+fmtData(data)+' · a tarefa não tinha prazo definido'};
  const dias=diasEntreISO(t.prazo,data); // >0 atraso · 0 no dia · <0 antes
  if(dias>0)return {cat:'atrasada',dias,data,cls:'prazo-late',
    txt:'✓ '+fmtDataCurta(data)+' · '+dias+'d de atraso',
    titulo:'Prazo em '+fmtData(t.prazo)+' · concluída em '+fmtData(data)+' — '+plural(dias,' de atraso')};
  if(dias===0)return {cat:'noprazo',dias,data,cls:'prazo-ok',
    txt:'✓ '+fmtDataCurta(data)+' · no prazo',
    titulo:'Prazo em '+fmtData(t.prazo)+' · concluída no próprio dia do prazo'};
  const ant=-dias;
  return {cat:'antecipada',dias,data,cls:'prazo-antes',
    txt:'✓ '+fmtDataCurta(data)+' · '+ant+'d antes',
    titulo:'Prazo em '+fmtData(t.prazo)+' · concluída em '+fmtData(data)+' — '+plural(ant,' antes do prazo')};
}
const CONC_CAT_LBL={antecipada:'Antes do prazo',noprazo:'No dia do prazo',atrasada:'Em atraso',semprazo:'Sem prazo definido',semregistro:'Sem data registrada'};
// muda o status de uma tarefa carimbando (ou apagando) a data de conclusão.
// dataConclusao omitida = carimba hoje (se ainda não houver data); informada
// (mesmo vazia) = vale exatamente o que veio, para o modal poder corrigir
function aplicarStatusTarefa(t,novo,dataConclusao){
  if(novo==='concluido'){
    t.concluidoEm=dataConclusao===undefined?(t.concluidoEm||hojeISO()):dataConclusao;
  }else{
    t.concluidoEm='';
  }
  t.status=novo;
}
// info do prazo → classe + rótulo
function prazoInfo(t){
  if(t.status==='concluido'){
    const ci=conclusaoInfo(t);
    return {cls:ci.cls,txt:ci.txt,titulo:ci.titulo};
  }
  if(!t.prazo)return {cls:'prazo-ok',txt:'sem prazo'};
  const dias=Math.round((new Date(t.prazo).getTime()-hojeTS())/86400000);
  if(dias<0)return {cls:'prazo-late',txt:'Atrasada · '+fmtData(t.prazo)};
  if(dias<=3)return {cls:'prazo-soon',txt:(dias===0?'Hoje':dias+'d')+' · '+fmtData(t.prazo)};
  return {cls:'prazo-ok',txt:fmtData(t.prazo)};
}
// ─── SINO DE NOTIFICAÇÕES: tarefas atrasadas ───
function tarefasAtrasadas(){
  return DB.tarefas.filter(t=>t.status!=='concluido'&&t.prazo&&t.prazo<hojeISO());
}
// tarefas que aguardam a revisão/aprovação de uma pessoa (o revisor é o outro sócio).
// Sem argumento, usa o sócio logado (EU) — é "o que está na mesa de cada um".
function tarefasPendentesRevisao(quem){
  quem=quem||(EU&&EU.nome);
  if(!quem)return [];
  return DB.tarefas.filter(t=>revPendenteRevisor(t)&&revisorDa(t)===quem);
}
function renderSino(){
  const n=tarefasAtrasadas().length;
  const nRev=tarefasPendentesRevisao().length;   // pendentes da aprovação/revisão do sócio logado
  const nb=(id,v)=>{const el=document.getElementById(id);if(!el)return;el.textContent=v>99?'99+':v;el.style.display=v>0?'inline-flex':'none';};
  nb('nav-rotina-badge',n);
  nb('nav-processos-badge',typeof pubsAnalisar==='function'&&DB?pubsAnalisar().length:0);
  const b=document.getElementById('sino-badge');
  if(!b)return;
  const total=n+nRev;
  if(total>0){b.textContent=total>99?'99+':total;b.style.display='flex';}
  else{b.style.display='none';}
}
function abrirNotificacoes(){
  const atrasadas=tarefasAtrasadas().sort((a,b)=>a.prazo<b.prazo?-1:1);
  const revisar=tarefasPendentesRevisao().sort((a,b)=>(a.prazo||'9999')<(b.prazo||'9999')?-1:1);
  const avisos=[];
  if(revisar.length)avisos.push('<i class="ti ti-eye-check"></i> '+revisar.length+' tarefa'+(revisar.length>1?'s':'')+' pendente'+(revisar.length>1?'s':'')+' da sua aprovação ou revisão.');
  if(atrasadas.length)avisos.push('<i class="ti ti-alert-triangle"></i> '+atrasadas.length+' tarefa'+(atrasadas.length>1?'s':'')+' com prazo vencido.');
  document.getElementById('notif-sub').innerHTML=avisos.length?avisos.join('<br>'):'Nada pendente no momento.';
  // bloco de aprovação/revisão do sócio logado, acima das atrasadas
  const blocoRev=revisar.length?('<div class="notif-sec">Para você revisar ou aprovar</div>'+revisar.map(t=>{
    const prox=revProximaAcao(t);
    const cli=t.cid?DB.clientes.find(c=>c.id===t.cid):null;
    const pi=prazoInfo(t);
    return `<div class="pend-row">
      <span class="resp-chip" title="Responsável">${esc(t.resp)}</span>
      <span class="pend-titulo">${esc(t.titulo)}${cli?' · <span style="color:var(--t3)">'+esc(cli.nome)+'</span>':''}</span>
      <span class="prazo-badge ${pi.cls}">${pi.txt}</span>
      <button class="btn-sec" onclick="marcarRevisao('${t.id}','${prox}');abrirNotificacoes();" title="${prox==='aprovar'?'Aprovar':'Revisar'}">${prox==='aprovar'?'Aprovar':'Revisar'}</button>
      <button class="btn-ico" onclick="fecharOverlay('overlay-notif');abrirModalTarefa('${t.id}',null)" title="Abrir tarefa"><i class="ti ti-pencil"></i></button>
    </div>`;
  }).join('')):'';
  const blocoAtras=atrasadas.length?((revisar.length?'<div class="notif-sec">Prazos vencidos</div>':'')+atrasadas.map(t=>{
    const pi=prazoInfo(t);
    const cli=t.cid?DB.clientes.find(c=>c.id===t.cid):null;
    const stCls=t.status==='andamento'?'st-andamento':'st-pendente';
    return `<div class="pend-row">
      <span class="st-pill ${stCls}" onclick="cicloTarefa('${t.id}');abrirNotificacoes();refreshUI();renderSino();" title="Clique para avançar o status">${ST_LBL[t.status]}</span>
      <span class="pend-titulo">${esc(t.titulo)}</span>
      <span class="resp-chip" style="max-width:170px;overflow:hidden;text-overflow:ellipsis;display:inline-block" title="${esc(t.resp)}${cli?' · '+esc(cli.nome):''}">${esc(t.resp)}${cli?' · '+esc(cli.nome):''}</span>
      <span class="prazo-badge ${pi.cls}">${pi.txt}</span>
      <button class="btn-ico" onclick="fecharOverlay('overlay-notif');abrirModalTarefa('${t.id}',null)" title="Editar"><i class="ti ti-pencil"></i></button>
    </div>`;
  }).join('')):'';
  document.getElementById('notif-lista').innerHTML=(blocoRev+blocoAtras)||'<p style="font-size:13.5px;color:var(--t3);padding:4px 0 8px">Nada pendente. Tudo em dia.</p>';
  abrirOverlay('overlay-notif');
}
function verificarAvisoDiario(){
  const n=tarefasAtrasadas().length;
  if(!n)return;
  const chave='bgl_sistema_aviso_atraso';
  const hoje=hojeISO();
  if(localStorage.getItem(chave)===hoje)return;
  localStorage.setItem(chave,hoje);
  alert('⏰ Você tem '+n+' tarefa'+(n>1?'s':'')+' atrasada'+(n>1?'s':'')+' na rotina.');
}
// probabilidade de êxito do processo (preenchida manualmente) → classe + valor
function exitoInfo(p){
  if(p.exito===null||p.exito===undefined||p.exito==='')return null;
  const v=Number(p.exito);
  return {v,cls:v>=70?'exito-alta':v>=40?'exito-media':'exito-baixa'};
}
// data de entrada do cliente (ou distribuição mais antiga como proxy)
function getEntrada(c){
  if(c.entrada)return c.entrada;
  const ds=procsDe(c.id).map(p=>p.dist).filter(Boolean).sort();
  return ds[0]||'';
}

// re-renderiza tudo que depende dos dados
// ─── ATUALIZAÇÃO DA TELA ───────────────────────────────────
// Antes, cada edição (marcar uma tarefa, salvar um valor) remontava o HTML
// das OITO telas do sistema, inclusive as que não estavam visíveis. Com a
// base cheia isso deixava o sistema travado a cada clique.
//
// Agora: só a tela visível é redesenhada na hora. As outras ficam marcadas
// como "desatualizadas" e são redesenhadas quando o usuário entra nelas.
// Além disso, várias chamadas seguidas no mesmo instante viram um único
// desenho (agrupadas no próximo quadro de vídeo).
const RENDERIZADORES={
  dash:()=>renderDashboard(),
  trab:()=>{renderDashboardCRM();if(typeof renderFilaHoje==='function'&&atendAba==='fila')renderFilaHoje();},
  crm:()=>renderClientes(),
  processos:()=>{if(typeof renderProcessos==='function')renderProcessos()},
  arquivados:()=>{if(typeof renderArquivados==='function')renderArquivados()},
  fin:()=>renderFin(),
  rotina:()=>{if(typeof renderRotina==='function')renderRotina()},
  comercial:()=>{if(typeof renderComercial==='function')renderComercial()},
};
let telasDesatualizadas=new Set();
let __refreshAgendado=false;

function telaAtiva(){
  const v=document.querySelector('.view.active');
  return v?v.id.replace('view-',''):'dash';
}
function desenharTela(id){
  const fn=RENDERIZADORES[id];
  if(!fn)return;
  try{fn()}catch(e){console.warn('[render '+id+']',e)}
  telasDesatualizadas.delete(id);
}
// redesenha só o que está na tela; o resto fica para depois
function refreshUI(){
  invalidarIndiceClientes();
  Object.keys(RENDERIZADORES).forEach(k=>telasDesatualizadas.add(k));
  if(__refreshAgendado)return;
  __refreshAgendado=true;
  requestAnimationFrame(()=>{
    __refreshAgendado=false;
    desenharTela(telaAtiva());
    renderSino();
    if(clienteAtual){
      clienteAtual=DB.clientes.find(c=>c.id===clienteAtual.id)||null;
      const det=document.getElementById('cli-detail');
      if(clienteAtual){
        det.innerHTML=detalheClienteHTML(clienteAtual);
      }else{
        det.style.display='none';
        document.getElementById('cli-empty').style.display='flex';
      }
    }
  });
}
// usado ao entrar no app pela primeira vez: desenha tudo de uma vez só
function refreshUITudo(){
  invalidarIndiceClientes();
  Object.keys(RENDERIZADORES).forEach(desenharTela);
  renderSino();
}

// ─── AUTH (usuários guardados no Gist; senha em hash SHA-256) ──
let EU=null; // {user, nome} do usuário logado nesta aba

function mostrarErroLogin(msg){
  const e=document.getElementById('login-err');
  e.textContent=msg;
  e.style.display='block';
}
function esconderErroLogin(){document.getElementById('login-err').style.display='none'}
function ajustarCampoToken(){
  // na cópia offline não há nuvem nenhuma; nos demais casos, só pede Gist/Token
  // quando este dispositivo ainda não tem nada configurado
  document.getElementById('token-wrap').style.display=(MODO_OFFLINE||temConfiguracao())?'none':'block';
}

async function tentarLogin(){
  esconderErroLogin();
  const u=document.getElementById('inp-u').value.trim();
  const p=document.getElementById('inp-p').value;
  if(!u||!p){mostrarErroLogin('Preencha usuário e senha.');return;}

  const espera=bloqueioRestanteSeg();
  if(espera>0){
    mostrarErroLogin('Muitas tentativas erradas. Tente de novo em '+
      (espera>=60?(Math.ceil(espera/60)+' minuto(s)'):(espera+' segundos'))+'.');
    return;
  }

  const btn=document.getElementById('btn-entrar');
  btn.disabled=true;btn.textContent='Entrando…';
  try{
    if(!MODO_OFFLINE){
      const gist=document.getElementById('l-gist').value.trim();
      const token=document.getElementById('l-token').value.trim();
      let tokenDigitado=false;
      if(gist&&token){
        salvarCredenciais(gist,token);
        tokenDigitado=true;
      }else if(!GH_TOKEN){
        // token guardado cifrado: a própria senha do login é a chave que o abre
        if(cofreDoUsuario(u)){
          try{
            const aberto=await abrirCofre(u,p);
            if(!aberto)throw new Error('cofre vazio');
            GH_TOKEN=aberto;
            try{sessionStorage.setItem(SS_TOKEN,GH_TOKEN);}catch(e){}
          }catch(e){
            registrarFalhaLogin();
            // a chave do cofre é a senha: se ela foi trocada em outro
            // computador, o token guardado aqui não abre mais
            document.getElementById('token-wrap').style.display='block';
            mostrarErroLogin('Senha incorreta — ou a senha foi trocada em outro computador. Se você trocou, informe o Gist ID e o Token abaixo desta vez.');
            return;
          }
        }else{
          document.getElementById('token-wrap').style.display='block';
          mostrarErroLogin('Este usuário ainda não configurou a sincronização neste dispositivo. Preencha o Gist ID e o Token.');
          return;
        }
      }
      if(!temCredenciais()){
        mostrarErroLogin('Na primeira vez neste dispositivo, preencha também o Gist ID e o Token.');
        return;
      }
      if(tokenDigitado||!DB){
        try{ await carregarDBRemoto(); }
        catch(e){
          if(tokenDigitado)limparCredenciais();
          else{GH_TOKEN='';sessionStorage.removeItem(SS_TOKEN);}
          mostrarErroLogin('Não foi possível acessar os dados: '+e.message);
          return;
        }
      }
    }
    if(!DB||!Array.isArray(DB.usuarios)){mostrarErroLogin('Os dados do sistema não foram carregados.');return;}

    // pode haver mais de um registro com o mesmo e-mail (duplicatas acumuladas
    // ao longo do tempo): vale o primeiro cuja senha confira, não o primeiro da
    // lista — senão uma duplicata antiga barraria o login legítimo
    const candidatos=DB.usuarios.filter(x=>String(x.user||'').toLowerCase()===u.toLowerCase());
    let found=null;
    for(const c of candidatos){ if(await conferirSenha(c,p)){found=c;break;} }
    const ok=!!found;
    if(!ok){
      registrarFalhaLogin();
      const restante=bloqueioRestanteSeg();
      mostrarErroLogin('Usuário ou senha incorretos.'+(restante>0?(' Aguarde '+restante+'s antes de tentar novamente.'):''));
      return;
    }
    limparFalhasLogin();
    EU={user:found.user,nome:found.nome};
    try{sessionStorage.setItem('bgl_sistema_eu',JSON.stringify(EU));}catch(e){}

    if(!MODO_OFFLINE){
      // migrações silenciosas de segurança, agora que a senha correta está em mãos:
      // 1) guarda o token cifrado e apaga a versão em texto puro
      await guardarNoCofre(found.user,p,GH_TOKEN);
      // 2) acrescenta o hash forte (PBKDF2 com sal) ao lado do antigo.
      //    O hash antigo NÃO é apagado aqui de propósito: durante a transição
      //    ainda pode haver aba aberta, cache do navegador ou outro dispositivo
      //    rodando a versão anterior do sistema, que só entende o formato
      //    antigo — apagá-lo agora trancaria essas telas para fora. Ele some
      //    sozinho na primeira troca de senha (Configurações → Sua senha),
      //    quando deixa de valer de qualquer forma.
      if(!found.senha||found.senha.alg!=='PBKDF2-SHA256'){
        found.senha=await hashSenha(p);
        gravarDB().catch(e=>console.warn('[migração de senha]',e));
      }
    }
    entrarApp();
  }catch(e){
    mostrarErroLogin('Erro de conexão: '+e.message);
  }finally{
    btn.disabled=false;btn.textContent='Entrar';
  }
}

function entrarApp(){
  document.getElementById('screen-login').style.display='none';
  document.getElementById('screen-dashboard').style.display='flex';
  document.getElementById('tb-user').textContent=EU.nome;
  prepararCasca();
  const h=new Date().getHours();
  const s=h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  document.getElementById('greeting-h1').textContent=s+', '+EU.nome+'.';
  const dias=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const meses=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const d=new Date();
  document.getElementById('greeting-p').textContent=dias[d.getDay()]+', '+d.getDate()+' de '+meses[d.getMonth()]+' de '+d.getFullYear();
  const v=versiculoDoDia();
  document.getElementById('greeting-verse').innerHTML='"'+esc(v.texto)+'"<span class="ref">'+esc(v.ref)+'</span>';
  carregarLeads();
  carregarLeadsCivel();
  garantirEstruturaProcessos();
  garantirContratos();   // cópia offline / backup restaurado não passam pela migração do Gist
  migrarResponsaveis();  // converte 'Dupla'/'Escritório' para o modelo de dois sócios
  if(reprocessarPublicacoesPendentes())salvarDB();
  aplicarIconeOlho();
  refreshUITudo();
  buscaAutomaticaDJEN();
  verificarAvisoDiario();
  atualizarBadgeBackup();
  iniciarVigiaInatividade();
  aplicarModoOffline();
  // cascata de entrada da visão geral: só neste momento, nunca na troca de aba
  document.body.classList.add('app-entrada');
  setTimeout(()=>document.body.classList.remove('app-entrada'),1200);
}
function logout(){
  // se ainda houver alteração agrupada esperando para subir, sobe antes de
  // apagar o token e a base da memória — senão a última edição se perderia
  if(__gravarPendente||__gravarTimer){
    descarregarGravacao().catch(()=>{}).then(finalizarLogout);
    return;
  }
  finalizarLogout();
}
function finalizarLogout(){
  sessionStorage.removeItem('bgl_sistema_eu');
  sessionStorage.removeItem(SS_TOKEN);  // o token volta para o cofre cifrado
  GH_TOKEN='';
  EU=null;
  // na cópia offline os dados moram no próprio arquivo: recarrega-os para o próximo login
  const embutido=MODO_OFFLINE?dadosEmbutidos():null;
  DB=embutido?embutido.dados:null;
  invalidarIndiceClientes();
  if(__inatIntervalo){clearInterval(__inatIntervalo);__inatIntervalo=null;}
  document.getElementById('screen-dashboard').style.display='none';
  document.getElementById('screen-login').style.display='flex';
  document.getElementById('inp-u').value='';
  document.getElementById('inp-p').value='';
  document.getElementById('l-token').value='';
  esconderErroLogin();
  ajustarCampoToken();
}
function trocarSincronizacao(){
  if(!confirm('Trocar o Gist/Token deste dispositivo?\n\nO token guardado aqui será apagado e você vai precisar informar o Gist ID e o Token novamente no próximo login.'))return;
  limparCredenciais();
  logout();
  ajustarCampoToken();
}
function esquecerDispositivo(){
  if(!confirm('Apagar deste computador o Gist ID e o token guardado, e encerrar a sessão?\n\nUse isto ao sair de um computador emprestado ou compartilhado. Os dados na nuvem não são afetados.'))return;
  limparCredenciais();
  fecharOverlay('overlay-backup');
  logout();
}
// faixa de aviso quando a página aberta é um arquivo de cópia de segurança
function aplicarModoOffline(){
  const faixa=document.getElementById('faixa-offline');
  if(!faixa)return;
  faixa.classList.toggle('on',!!MODO_OFFLINE);
  if(!MODO_OFFLINE)return;
  const meta=(dadosEmbutidos()||{}).meta||{};
  const quando=meta.geradoEmTexto||(meta.geradoEm?new Date(meta.geradoEm).toLocaleString('pt-BR'):'data desconhecida');
  document.getElementById('faixa-offline-txt').textContent=
    'Cópia de segurança de '+quando+' — os dados desta tela vieram do próprio arquivo. '+
    'Você pode consultar e imprimir tudo, mas nada é salvo na nuvem.';
}
document.getElementById('inp-p').addEventListener('keydown',e=>{if(e.key==='Enter')tentarLogin()});
document.getElementById('inp-u').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('inp-p').focus()});

// ─── INICIALIZAÇÃO (chamada no fim do script) ──────────────
async function initApp(){
  // 1) esta página é uma cópia de segurança? então os dados vêm de dentro dela
  const embutido=dadosEmbutidos();
  if(embutido){
    MODO_OFFLINE=true;
    DB=embutido.dados;
  }
  carregarCredenciais();
  ajustarCampoToken();
  aplicarModoOffline();
  atualizarBadgeBackup();
  try{const s=sessionStorage.getItem('bgl_sistema_eu');if(s)EU=JSON.parse(s);}catch{}

  const reentrar=()=>{
    if(!EU)return false;
    const ok=DB&&Array.isArray(DB.usuarios)&&DB.usuarios.find(x=>x.user===EU.user);
    if(ok){EU={user:ok.user,nome:ok.nome};entrarApp();return true;}
    EU=null;sessionStorage.removeItem('bgl_sistema_eu');
    return false;
  };

  if(MODO_OFFLINE){reentrar();return;}    // a senha continua sendo exigida na cópia offline

  if(!temCredenciais()){
    // token fechado no cofre (ou dispositivo novo): a senha do login é que destranca
    EU=null;sessionStorage.removeItem('bgl_sistema_eu');
    return;
  }
  try{ await carregarDBRemoto(); }
  catch(e){ mostrarErroLogin('Erro de conexão: '+e.message); return; }
  reentrar();
}

// ─── NAVEGAÇÃO ────────────────────────────────────────────
function navegarPara(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  const nb=document.getElementById('nav-'+id);
  if(nb)nb.classList.add('active');
  aoNavegar(id);   // casca: título do cabeçalho, menu do celular, topo da página
  // desenha a tela só agora, se ela ficou desatualizada por edições feitas em outra aba
  if(telasDesatualizadas.has(id))desenharTela(id);
  else if(id==='trab'&&typeof renderFilaHoje==='function'&&atendAba==='fila')renderFilaHoje();
}
