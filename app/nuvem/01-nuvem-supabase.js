// ═══════ NUVEM DO APLICATIVO (Supabase) ═══════════════════
// Este arquivo só entra no aplicativo de computador (app/scripts/montar.mjs).
// O site continua com o Gist, sem nenhuma mudança.
//
// O montador renomeia as funções originais de dados e login com o sufixo
// __gist e estas versões ocupam o lugar delas. Cada uma devolve a chamada
// para a original quando a página é uma cópia offline (backup "sistema
// completo"), para que essa cópia continue abrindo como hoje.
//
// Gravação: em vez de enviar a base inteira, envia só as chaves de primeiro
// nível que mudaram desde a última leitura, junto com a versão sobre a qual
// foram feitas. Se outra pessoa gravou antes, o servidor recusa sem apagar
// nada; o aplicativo baixa a versão nova, mescla as duas e tenta de novo.
const NUVEM=window.BGL_NUVEM||null;   // {url, chave}, embutido pelo montador
let SB=null;
let __membro=null;                     // {usuario, nome} de quem entrou
let __versaoBase=0;                    // versão do servidor da última leitura ou gravação
let __baseSync={};                     // chave → JSON como estava no servidor nessa versão
let __vigiaRemota=null;
let __remotoPendente=false;
const VIGIA_REMOTA_MS=60000;

function emModoGist(){return MODO_OFFLINE||!NUVEM||typeof supabase==='undefined'}
function clienteNuvem(){
  if(!SB){
    // sessão só na memória desta janela: fechou o aplicativo, pede a senha de novo
    SB=supabase.createClient(NUVEM.url,NUVEM.chave,{auth:{
      storage:window.sessionStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  }
  return SB;
}
function erroNuvem(error,contexto){
  const e=new Error((contexto?contexto+': ':'')+(error&&error.message||String(error)));
  e.nuvem=error;
  return e;
}

// ─── LEITURA ───────────────────────────────────────────────
function marcarBase(dados,versao){
  __versaoBase=versao;
  __baseSync={};
  Object.keys(dados||{}).forEach(k=>{__baseSync[k]=JSON.stringify(dados[k]);});
}
async function buscarBaseRemota(){
  const {data,error}=await clienteNuvem().from('base').select('dados,versao').eq('id',1).maybeSingle();
  if(error)throw erroNuvem(error,'leitura da base');
  if(!data)throw new Error('a base do escritório não está acessível para esta conta');
  return data;
}
async function lerDB(){
  if(emModoGist())return lerDB__gist();
  const r=await buscarBaseRemota();
  if(!r.versao||!r.dados||!Array.isArray(r.dados.usuarios)){
    // nunca semeia por cima: base vazia só se preenche pela importação inicial
    const e=new Error('a base do aplicativo ainda está vazia');
    e.baseVazia=true;
    throw e;
  }
  marcarBase(r.dados,r.versao);
  return r.dados;
}

// ─── GRAVAÇÃO ──────────────────────────────────────────────
function alteracoesLocais(){
  const alt={},json={};
  new Set([...Object.keys(DB),...Object.keys(__baseSync)]).forEach(k=>{
    const atual=(k in DB&&DB[k]!==undefined)?JSON.stringify(DB[k]):undefined;
    if(atual===__baseSync[k])return;
    json[k]=atual;
    alt[k]=atual===undefined?null:JSON.parse(atual);   // cópia congelada no instante do envio
  });
  return {alt,json};
}
async function enviarAlteracoes(){
  for(let tentativa=0;tentativa<4;tentativa++){
    const {alt,json}=alteracoesLocais();
    const chaves=Object.keys(alt);
    if(!chaves.length)return;
    const {data,error}=await clienteNuvem().rpc('gravar_alteracoes',{p_versao_base:__versaoBase,p_alteracoes:alt});
    if(error)throw erroNuvem(error,'gravação');
    if(data&&data.ok){
      chaves.forEach(k=>{if(json[k]===undefined)delete __baseSync[k];else __baseSync[k]=json[k];});
      __versaoBase=data.versao;
      return;
    }
    await mesclarComServidor();   // alguém gravou antes: incorpora e tenta de novo
  }
  throw new Error('a base mudou várias vezes seguidas durante a gravação. Tente de novo em instantes');
}
async function gravarDB(){
  if(emModoGist())return gravarDB__gist();
  if(!__membro||!DB)return;
  marcarSync('salvando');
  try{await enviarAlteracoes();}
  catch(e){marcarSync('erro');throw e;}
  marcarSync('ok');
}

// ─── MESCLA ────────────────────────────────────────────────
// Três versões de cada parte: como estava no servidor quando lemos (base),
// como está nesta tela (local) e como está no servidor agora (remoto).
// Quem não mexeu cede para quem mexeu. Se os dois mexeram, a mescla desce:
// objetos campo a campo, listas de registros com id registro a registro.
// Só quando os dois alteraram o MESMO campo do MESMO registro prevalece o
// desta tela, e isso é avisado.
const igual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ehObjeto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function chaveRegistro(x){return ehObjeto(x)?(x.id!==undefined?x.id:x.key):undefined}
function listaDeRegistros(...ls){
  return ls.every(l=>Array.isArray(l)&&l.every(x=>chaveRegistro(x)!==undefined));
}
function mesclarValor(b,l,r,caminho,conflitos){
  if(igual(l,b))return r;
  if(igual(r,b)||igual(l,r))return l;
  if(ehObjeto(l)&&ehObjeto(r)&&(b===undefined||ehObjeto(b))){
    b=b||{};
    const out={};
    new Set([...Object.keys(l),...Object.keys(r)]).forEach(k=>{
      const v=mesclarValor(b[k],l[k],r[k],caminho+'.'+k,conflitos);
      if(v!==undefined)out[k]=v;
    });
    return out;
  }
  if(listaDeRegistros(l,r)&&(b===undefined||listaDeRegistros(b))){
    const porId=lista=>new Map((lista||[]).map(x=>[String(chaveRegistro(x)),x]));
    const mb=porId(b),ml=porId(l),mr=porId(r),out=[];
    const resolver=id=>{
      const vb=mb.get(id),vl=ml.get(id),vr=mr.get(id);
      if(vl!==undefined&&vr!==undefined)return mesclarValor(vb,vl,vr,caminho+'['+id+']',conflitos);
      if(vl!==undefined)return vb!==undefined&&igual(vl,vb)?undefined:vl;   // remoto apagou o que não mudou aqui
      return vb!==undefined&&igual(vr,vb)?undefined:vr;                     // local apagou o que não mudou lá
    };
    // ordem do servidor; o que só existe aqui vai para o fim
    const ids=[...mr.keys(),...[...ml.keys()].filter(id=>!mr.has(id))];
    ids.forEach(id=>{const v=resolver(id);if(v!==undefined)out.push(v);});
    return out;
  }
  conflitos.push(caminho);
  return l;
}
async function mesclarComServidor(){
  const r=await buscarBaseRemota();
  const remoto=r.dados||{},conflitos=[];
  new Set([...Object.keys(DB),...Object.keys(remoto),...Object.keys(__baseSync)]).forEach(k=>{
    const base=__baseSync[k]===undefined?undefined:JSON.parse(__baseSync[k]);
    const v=mesclarValor(base,DB[k],remoto[k],k,conflitos);
    if(v===undefined)delete DB[k];else DB[k]=v;
  });
  marcarBase(remoto,r.versao);
  invalidarIndiceClientes();
  if(conflitos.length){
    console.warn('[nuvem] alterado ao mesmo tempo nos dois computadores; prevaleceu esta tela:',conflitos);
    mostrarToast('Você e outra pessoa alteraram o mesmo registro ao mesmo tempo. Ficou a versão desta tela.');
  }
  redesenharAposMudancaRemota();
}

// ─── ALTERAÇÕES FEITAS NO OUTRO COMPUTADOR ─────────────────
// Confere a versão do servidor a cada minuto e ao voltar para a janela.
// Com um formulário aberto, espera ele fechar para não trocar os dados
// debaixo de quem está digitando.
function redesenharAposMudancaRemota(){
  if(document.querySelector('.overlay.open')){__remotoPendente=true;return;}
  __remotoPendente=false;
  if(EU)refreshUITudo();
}
async function verificarMudancasRemotas(){
  if(emModoGist()||!__membro||!DB)return;
  if(__gravarPendente||__gravarTimer)return;   // a próxima gravação já vai mesclar
  const {data,error}=await clienteNuvem().from('base').select('versao').eq('id',1).maybeSingle();
  if(error||!data||data.versao===__versaoBase)return;
  await mesclarComServidor();
}
function agendarVerificacaoRemota(){
  // entra na mesma fila das gravações: as duas nunca correm ao mesmo tempo
  __filaGravacao=__filaGravacao.catch(()=>{}).then(verificarMudancasRemotas).catch(e=>console.warn('[nuvem]',e));
  return __filaGravacao;
}
function iniciarVigiaRemota(){
  pararVigiaRemota();
  __vigiaRemota=setInterval(agendarVerificacaoRemota,VIGIA_REMOTA_MS);
}
function pararVigiaRemota(){if(__vigiaRemota){clearInterval(__vigiaRemota);__vigiaRemota=null;}}
window.addEventListener('focus',()=>{if(__membro)agendarVerificacaoRemota();});
// ao fechar um formulário, aplica o que chegou enquanto ele estava aberto
new MutationObserver(()=>{if(__remotoPendente&&!document.querySelector('.overlay.open'))redesenharAposMudancaRemota();})
  .observe(document.body,{subtree:true,attributes:true,attributeFilter:['class']});

// ─── LOGIN ─────────────────────────────────────────────────
async function tentarLogin(){
  if(emModoGist())return tentarLogin__gist();
  esconderErroLogin();
  const u=document.getElementById('inp-u').value.trim();
  const p=document.getElementById('inp-p').value;
  if(!u||!p){mostrarErroLogin('Preencha e-mail e senha.');return;}
  const espera=bloqueioRestanteSeg();
  if(espera>0){
    mostrarErroLogin('Muitas tentativas erradas. Tente de novo em '+
      (espera>=60?(Math.ceil(espera/60)+' minuto(s)'):(espera+' segundos'))+'.');
    return;
  }
  const btn=document.getElementById('btn-entrar');
  btn.disabled=true;btn.textContent='Entrando…';
  try{
    const {error}=await clienteNuvem().auth.signInWithPassword({email:u,password:p});
    if(error){
      registrarFalhaLogin();
      mostrarErroLogin(/invalid login credentials/i.test(error.message)?'E-mail ou senha incorretos.':('Não foi possível entrar: '+error.message));
      return;
    }
    limparFalhasLogin();
    await abrirSessaoNuvem();
  }catch(e){
    mostrarErroLogin('Erro de conexão: '+e.message);
  }finally{
    btn.disabled=false;btn.textContent='Entrar';
  }
}
async function abrirSessaoNuvem(){
  const {data:m,error}=await clienteNuvem().from('membros').select('usuario,nome').maybeSingle();
  if(error)throw erroNuvem(error,'cadastro');
  if(!m){
    await SB.auth.signOut();
    throw new Error('esta conta não tem acesso ao sistema do escritório');
  }
  __membro=m;
  try{
    await carregarDBRemoto();
  }catch(e){
    if(e.baseVazia){mostrarImportacaoInicial();return;}
    __membro=null;
    throw e;
  }
  esconderImportacaoInicial();
  EU={user:m.usuario,nome:m.nome};
  try{sessionStorage.setItem('bgl_sistema_eu',JSON.stringify(EU));}catch(e){}
  entrarApp();
  iniciarVigiaRemota();
  if(typeof iniciarBackupDrive==='function')iniciarBackupDrive();
}

// ─── IMPORTAÇÃO INICIAL ────────────────────────────────────
// Só aparece quando a base do Supabase ainda está vazia. O servidor também
// recusa importar por cima de uma base com dados.
function mostrarImportacaoInicial(){
  document.getElementById('app-importacao').style.display='block';
  mostrarErroLogin('A base do aplicativo está vazia. Importe o backup mais recente do sistema para começar.');
}
function esconderImportacaoInicial(){
  const el=document.getElementById('app-importacao');
  if(el)el.style.display='none';
}
function importarBaseInicial(){
  const inp=document.getElementById('app-importacao-arquivo');
  const f=inp&&inp.files&&inp.files[0];
  if(!f){mostrarErroLogin('Escolha primeiro o arquivo de backup.');return;}
  const fr=new FileReader();
  fr.onload=async()=>{
    const dados=extrairDadosDeTexto(String(fr.result||''));
    const problema=dados?validarDadosRestaurados(dados):'Não encontrei dados do sistema neste arquivo.';
    if(problema){mostrarErroLogin(problema);return;}
    const t=contarDados(dados);
    if(!confirm('Importar este backup como base inicial do aplicativo?\n\n'+
      t.clientes+' clientes, '+t.processos+' processos, '+(t.leadsTrabalhista+t.leadsCivel)+' leads, '+
      totalRegistros(t)+' registros no total.\n\nO site e o Gist não são alterados.'))return;
    const btn=document.getElementById('app-importacao-btn');
    btn.disabled=true;
    try{
      const {error}=await clienteNuvem().rpc('importar_base_inicial',{p_dados:dados});
      if(error)throw erroNuvem(error,'importação');
      esconderErroLogin();
      await abrirSessaoNuvem();
    }catch(e){
      mostrarErroLogin('Não foi possível importar: '+e.message);
    }finally{btn.disabled=false;}
  };
  fr.onerror=()=>mostrarErroLogin('Não foi possível ler o arquivo.');
  fr.readAsText(f);
}

// ─── INICIALIZAÇÃO E SAÍDA ─────────────────────────────────
async function initApp(){
  if(dadosEmbutidos()||emModoGist())return initApp__gist();
  aplicarModoOffline();
  atualizarBadgeBackup();
  let euSalvo=null;
  try{euSalvo=JSON.parse(sessionStorage.getItem('bgl_sistema_eu')||'null');}catch(e){}
  const {data}=await clienteNuvem().auth.getSession();
  if(!data||!data.session){sessionStorage.removeItem('bgl_sistema_eu');return;}
  if(!euSalvo){await SB.auth.signOut();return;}   // sessão sem tela aberta: pede a senha
  try{await abrirSessaoNuvem();}
  catch(e){mostrarErroLogin('Erro de conexão: '+e.message);}
}
function finalizarLogout(){
  if(!emModoGist()){
    pararVigiaRemota();
    __membro=null;__versaoBase=0;__baseSync={};__remotoPendente=false;
    if(SB)SB.auth.signOut().catch(()=>{});
    if(typeof pararBackupDrive==='function')pararBackupDrive();
  }
  finalizarLogout__gist();
}

// ─── TROCA DE SENHA ────────────────────────────────────────
async function trocarSenha(){
  if(emModoGist())return trocarSenha__gist();
  if(!EU){msgSenha('Sessão não identificada. Entre novamente.','erro');return;}
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
    const {data:{user}}=await clienteNuvem().auth.getUser();
    if(!user){msgSenha('Sessão expirada. Entre novamente.','erro');return;}
    const conf=await SB.auth.signInWithPassword({email:user.email,password:atual});
    if(conf.error){msgSenha('A senha atual está incorreta.','erro');return;}
    const {error}=await SB.auth.updateUser({password:nova});
    if(error){msgSenha('Não foi possível trocar a senha: '+error.message,'erro');return;}
    prepararTrocaSenha();
    msgSenha('Senha trocada. Ela vale para o aplicativo em qualquer computador.','ok');
  }finally{
    btn.disabled=false;btn.innerHTML=rotulo;
  }
}

// ─── PAINEL DE SEGURANÇA ───────────────────────────────────
function renderSegurancaBackup(){
  renderSegurancaBackup__gist();
  if(emModoGist())return;
  const est=document.getElementById('bk-seg-estado');
  if(est){
    est.className='bk-info';
    est.innerHTML='<b>Sincronização ativa.</b> Os dados ficam no banco do escritório (Supabase), acessível só às contas cadastradas. '+
      'Uma cópia da base é guardada no histórico do banco a cada hora de uso. Sessão aberta por <b>'+esc(EU?EU.nome:'—')+
      '</b>, com encerramento automático após '+INATIVIDADE_MIN+' minutos sem uso.';
  }
  if(typeof renderPainelBackupDrive==='function')renderPainelBackupDrive();
}
