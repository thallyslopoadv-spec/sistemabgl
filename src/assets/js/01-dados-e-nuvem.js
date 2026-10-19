// ─── VERSÍCULO MOTIVADOR DO DIA (mesmo para todo mundo, muda por dia) ──
const VERSICULOS=[
  {texto:'Seja forte e corajoso! Não se apavore, nem se desanime, pois o Senhor, o seu Deus, estará com você por onde você andar.',ref:'Josué 1:9'},
  {texto:'Tudo posso naquele que me fortalece.',ref:'Filipenses 4:13'},
  {texto:'Entregue ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.',ref:'Provérbios 16:3'},
  {texto:'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo, e te sustento com a minha destra fiel.',ref:'Isaías 41:10'},
  {texto:'Confie no Senhor de todo o seu coração e não se apoie em seu próprio entendimento; reconheça o Senhor em todos os seus caminhos, e ele endireitará as suas veredas.',ref:'Provérbios 3:5-6'},
  {texto:'Entregue o seu caminho ao Senhor; confie nele, e ele agirá.',ref:'Salmos 37:5'},
  {texto:'Tudo o que fizerem, façam de todo o coração, como para o Senhor, e não para os homens.',ref:'Colossenses 3:23'},
  {texto:'Os planos de quem trabalha arduamente resultam em proveito, mas a pressa desmedida leva à pobreza.',ref:'Provérbios 21:5'},
  {texto:'Tudo quanto te vier à mão para fazer, faze-o conforme as tuas forças.',ref:'Eclesiastes 9:10'},
  {texto:'Não nos cansemos de fazer o bem, pois no tempo próprio colheremos, se não desanimarmos.',ref:'Gálatas 6:9'},
  {texto:'Se algum de vocês tem falta de sabedoria, peça-a a Deus, que a todos dá livremente, de boa vontade; e lhe será concedida.',ref:'Tiago 1:5'},
  {texto:'Pois o Senhor é quem dá sabedoria; de sua boca vêm o conhecimento e o entendimento.',ref:'Provérbios 2:6'},
  {texto:'Seja sobre nós a graça do Senhor, o nosso Deus, e confirma sobre nós a obra das nossas mãos.',ref:'Salmos 90:17'},
  {texto:'As mãos preguiçosas empobrecem o homem, mas as mãos diligentes trazem riquezas.',ref:'Provérbios 10:4'},
  {texto:'Nunca sejam preguiçosos, mas sejam fervorosos no espírito, servindo ao Senhor.',ref:'Romanos 12:11'},
  {texto:'Porque o justo cai sete vezes, e se levanta.',ref:'Provérbios 24:16'},
  {texto:'Os que esperam no Senhor renovam as suas forças. Voam alto como águias; correm e não se cansam; andam e não se fatigam.',ref:'Isaías 40:31'},
  {texto:'Não andem ansiosos por coisa alguma, mas em tudo, pela oração e súplicas, e com ação de graças, apresentem seus pedidos a Deus.',ref:'Filipenses 4:6'},
  {texto:'Os planos fracassam por falta de conselho, mas são bem-sucedidos quando há muitos conselheiros.',ref:'Provérbios 15:22'},
  {texto:'Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.',ref:'Salmos 118:24'},
  {texto:'Você já viu alguém habilidoso em seu trabalho? Perante reis ele será posto, e não perante gente comum.',ref:'Provérbios 22:29'},
  {texto:'A alegria do Senhor é a força de vocês.',ref:'Neemias 8:10'},
  {texto:'Abra a boca em favor do mudo, pela causa de todos os desamparados. Fale, e julgue com justiça; defenda os direitos do pobre e do necessitado.',ref:'Provérbios 31:8-9'},
  {texto:'Pratique a justiça, ame a fidelidade e ande humildemente com o seu Deus.',ref:'Miquéias 6:8'},
  {texto:'Deus não nos deu espírito de covardia, mas de poder, de amor e de equilíbrio.',ref:'2 Timóteo 1:7'},
  {texto:'A sabedoria é a coisa principal; adquira, pois, a sabedoria, e, com tudo o que possuir, adquira o entendimento.',ref:'Provérbios 4:7'},
  {texto:'Se o Senhor não edificar a casa, em vão trabalham os que a edificam.',ref:'Salmos 127:1'},
  {texto:'Sirvam de boa vontade, como quem serve ao Senhor, e não a pessoas, sabendo que cada um receberá do Senhor conforme o bem que tiver feito.',ref:'Efésios 6:7-8'},
  {texto:'As mãos diligentes governarão, mas a mão preguiçosa será posta a trabalhos forçados.',ref:'Provérbios 12:24'},
  {texto:'A visão aguarda um tempo determinado; ainda que demore, espera-a, porque certamente virá, e não tardará.',ref:'Habacuque 2:3'},
  {texto:'Elevo os olhos para os montes: de onde me vem o socorro? O meu socorro vem do Senhor, que fez os céus e a terra.',ref:'Salmos 121:1-2'},
  {texto:'Os planos são estabelecidos mediante conselhos; portanto, faça a guerra com bons conselhos.',ref:'Provérbios 20:18'},
  {texto:'Quem é fiel no pouco também é fiel no muito.',ref:'Lucas 16:10'},
  {texto:'Sejam prontos para ouvir, tardios para falar, tardios para irar-se.',ref:'Tiago 1:19'},
  {texto:'O coração do homem planeja o seu caminho, mas o Senhor lhe dirige os passos.',ref:'Provérbios 16:9'},
];
function versiculoDoDia(){
  const hoje=new Date();
  const inicioAno=new Date(hoje.getFullYear(),0,0);
  const diaDoAno=Math.floor((hoje-inicioAno)/86400000);
  return VERSICULOS[diaDoAno%VERSICULOS.length];
}

// ─── SINCRONIZAÇÃO (GitHub Gist) ───────────────────────────
// Os dados (clientes, processos, tarefas, leads, usuários) ficam
// guardados num Gist do GitHub, compartilhado entre os sócios.
// Gist ID e Token ficam salvos só no localStorage deste
// dispositivo — nunca aparecem no código-fonte da página.
const GIST_FILE='bgl-sistema-dados.json';
const LS_GIST='bgl_sistema_gist';
const LS_TOKEN_LEGADO='bgl_sistema_token';   // formato antigo: token em texto puro
const LS_COFRE='bgl_sistema_cofre';          // formato novo: token cifrado por usuário
const SS_TOKEN='bgl_sistema_tk';             // token aberto, só enquanto a aba viver
const PBKDF2_ITER=210000;

let GIST_ID='', GH_TOKEN='';
let MODO_OFFLINE=false;                      // true quando a página é uma cópia de backup

function carregarCredenciais(){
  GIST_ID=localStorage.getItem(LS_GIST)||'';
  // o token vem da sessão desta aba ou, em dispositivos ainda não migrados, do
  // formato antigo em texto puro — que é apagado assim que o cofre é criado
  GH_TOKEN=sessionStorage.getItem(SS_TOKEN)||localStorage.getItem(LS_TOKEN_LEGADO)||'';
}
function salvarCredenciais(gist,token){
  try{localStorage.setItem(LS_GIST,gist);}catch(e){}
  try{sessionStorage.setItem(SS_TOKEN,token);}catch(e){}
  GIST_ID=gist;GH_TOKEN=token;
}
function limparCredenciais(){
  localStorage.removeItem(LS_GIST);
  localStorage.removeItem(LS_TOKEN_LEGADO);
  localStorage.removeItem(LS_COFRE);
  sessionStorage.removeItem(SS_TOKEN);
  GIST_ID='';GH_TOKEN='';
}
function temCredenciais(){return !!(GIST_ID&&GH_TOKEN)}
// há configuração neste dispositivo mesmo que o token ainda esteja fechado no cofre
function temConfiguracao(){return !!(GIST_ID&&(GH_TOKEN||cofreDoUsuario()))}
function GH_HDR(){
  return {'Authorization':'Bearer '+GH_TOKEN,'Accept':'application/vnd.github+json','Content-Type':'application/json'};
}

// ─── CRIPTOGRAFIA ──────────────────────────────────────────
function hexDe(buf){return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('')}
function b64De(buf){const a=new Uint8Array(buf);let s='';for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}
function deB64(s){const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a}
function bytesAleatorios(n){return crypto.getRandomValues(new Uint8Array(n))}
// comparação em tempo constante: não entrega, pelo tempo de resposta, o quanto do hash bateu
function igualdadeSegura(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);
  return d===0;
}
// SHA-256 puro — formato ANTIGO das senhas, mantido só para continuar aceitando
// o login de quem ainda não passou pela migração automática
async function H(s){
  const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
  return hexDe(h);
}
async function derivarBits(senha,salt,iter,tam){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(senha),'PBKDF2',false,['deriveBits']);
  return crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},base,tam);
}
// formato NOVO: PBKDF2-SHA256 com sal próprio por usuário e 210 mil rodadas.
// Torna inviável descobrir a senha a partir do hash, mesmo se o backup vazar.
async function hashSenha(senha,saltB64,iter){
  const salt=saltB64?deB64(saltB64):bytesAleatorios(16);
  iter=iter||PBKDF2_ITER;
  const bits=await derivarBits(senha,salt,iter,256);
  return {alg:'PBKDF2-SHA256',salt:b64De(salt),iter,hash:hexDe(bits)};
}
async function conferirSenha(usuario,senha){
  if(usuario&&usuario.senha&&usuario.senha.alg==='PBKDF2-SHA256'){
    const r=await hashSenha(senha,usuario.senha.salt,usuario.senha.iter);
    return igualdadeSegura(r.hash,usuario.senha.hash);
  }
  if(usuario&&usuario.hash)return igualdadeSegura(await H(senha),usuario.hash);
  return false;
}

// ─── COFRE DO TOKEN (AES-GCM aberto pela senha do usuário) ──
// O token do GitHub dá acesso total aos dados. Guardá-lo em texto puro no
// navegador significa que qualquer pessoa com acesso ao computador — ou um
// script malicioso — o leria. Aqui ele fica cifrado e só é aberto no login,
// com a chave derivada da senha; depois vive apenas na sessão da aba.
async function chaveDoCofre(senha,salt){
  const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(senha),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:PBKDF2_ITER},base,
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function lerCofres(){try{return JSON.parse(localStorage.getItem(LS_COFRE)||'{}')||{}}catch(e){return {}}}
function gravarCofres(c){try{localStorage.setItem(LS_COFRE,JSON.stringify(c))}catch(e){console.warn('[cofre]',e)}}
function cofreDoUsuario(user){
  const c=lerCofres();
  const u=(user||(EU&&EU.user)||'').toLowerCase();
  if(u)return c[u]||null;
  return Object.keys(c).length?c:null;   // sem usuário: só informa se existe algum cofre
}
async function guardarNoCofre(user,senha,token){
  if(!user||!senha||!token)return;
  try{
    const salt=bytesAleatorios(16),iv=bytesAleatorios(12);
    const k=await chaveDoCofre(senha,salt);
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(token));
    const c=lerCofres();
    c[user.toLowerCase()]={v:1,salt:b64De(salt),iv:b64De(iv),ct:b64De(ct),em:Date.now()};
    gravarCofres(c);
    localStorage.removeItem(LS_TOKEN_LEGADO); // apaga a versão em texto puro
  }catch(e){console.warn('[cofre] não foi possível cifrar o token',e);}
}
async function abrirCofre(user,senha){
  const c=cofreDoUsuario(user);
  if(!c||!c.ct)return '';
  const k=await chaveDoCofre(senha,deB64(c.salt));
  const aberto=await crypto.subtle.decrypt({name:'AES-GCM',iv:deB64(c.iv)},k,deB64(c.ct));
  return new TextDecoder().decode(aberto);
}

// ─── PROTEÇÃO CONTRA TENTATIVA REPETIDA DE SENHA ───────────
const LS_TENTATIVAS='bgl_login_tentativas';
function estadoTentativas(){try{return JSON.parse(localStorage.getItem(LS_TENTATIVAS)||'{}')||{}}catch(e){return {}}}
function bloqueioRestanteSeg(){
  const e=estadoTentativas();
  return e.ate?Math.max(0,Math.ceil((e.ate-Date.now())/1000)):0;
}
function registrarFalhaLogin(){
  const e=estadoTentativas();
  e.n=(e.n||0)+1;
  if(e.n>=5){
    const esperas=[30,60,300,900]; // 30s · 1min · 5min · 15min
    e.ate=Date.now()+esperas[Math.min(e.n-5,esperas.length-1)]*1000;
  }
  try{localStorage.setItem(LS_TENTATIVAS,JSON.stringify(e));}catch(err){}
}
function limparFalhasLogin(){localStorage.removeItem(LS_TENTATIVAS)}

// ─── ENCERRAMENTO AUTOMÁTICO POR INATIVIDADE ───────────────
const INATIVIDADE_MIN=30;
let __ultimaAtividade=Date.now(),__inatIntervalo=null;
function marcarAtividade(){__ultimaAtividade=Date.now()}
function iniciarVigiaInatividade(){
  if(__inatIntervalo)clearInterval(__inatIntervalo);
  if(MODO_OFFLINE)return;
  __ultimaAtividade=Date.now();
  __inatIntervalo=setInterval(()=>{
    if(!EU)return;
    if(Date.now()-__ultimaAtividade>INATIVIDADE_MIN*60000){
      clearInterval(__inatIntervalo);__inatIntervalo=null;
      logout();
      alert('Sessão encerrada automaticamente após '+INATIVIDADE_MIN+' minutos sem uso.\n\nEntre novamente para continuar.');
    }
  },60000);
}
['click','keydown','touchstart','scroll'].forEach(ev=>
  document.addEventListener(ev,marcarAtividade,{passive:true,capture:true}));
async function lerDB(){
  const r=await fetch('https://api.github.com/gists/'+GIST_ID,{headers:GH_HDR()});
  if(!r.ok)throw new Error('HTTP '+r.status+' — verifique o Gist ID e o Token');
  const j=await r.json();
  const arq=j.files&&(j.files[GIST_FILE]||Object.values(j.files)[0]);
  let txt=(arq&&arq.content)?arq.content.trim():'';
  // acima de ~1 MB a API do GitHub entrega o arquivo cortado (truncated) —
  // o conteúdo inteiro tem de ser lido pelo raw_url do próprio Gist
  if(arq&&arq.truncated&&arq.raw_url){
    const raw=await fetch(arq.raw_url,{cache:'no-store'});
    if(!raw.ok)throw new Error('HTTP '+raw.status+' ao ler o arquivo completo do Gist');
    txt=(await raw.text()).trim();
  }
  if(!txt)return null; // gist realmente vazio → primeira vez, será semeado
  try{
    return JSON.parse(txt);
  }catch(e){
    // O Gist tem conteúdo, mas ilegível (gravação interrompida, edição manual
    // com erro). Antes isto era tratado como "gist vazio" e o sistema semeava
    // por cima — apagando o que restava. Agora interrompe e avisa: os dados
    // continuam lá, para serem recuperados do backup ou do histórico do Gist.
    const err=new Error('O conteúdo do Gist está ilegível ('+txt.length+
      ' caracteres que não formam um JSON válido). NADA foi alterado. '+
      'Recupere pelo histórico de revisões do Gist ou restaure um backup.');
    err.corrompido=true;
    throw err;
  }
}
function marcarSync(estado){
  const el=document.getElementById('sync-status');
  if(!el)return;
  if(estado==='ok'){el.textContent='Sincronizado ✓';el.style.color='var(--green-hi)';}
  else if(estado==='offline'){el.textContent='Cópia offline — não salva';el.style.color='var(--amber)';}
  else if(estado==='salvando'){el.textContent='Salvando…';el.style.color='var(--silver-light)';}
  else{el.textContent='Erro ao sincronizar';el.style.color='var(--red-hi)';}
  if(estado==='ok')setTimeout(()=>{if(el.textContent==='Sincronizado ✓')el.textContent='';},2500);
}
async function gravarDB(){
  if(MODO_OFFLINE)return;      // cópia de segurança aberta do computador: não grava nada
  if(!temCredenciais())return;
  marcarSync('salvando');
  const r=await fetch('https://api.github.com/gists/'+GIST_ID,{
    method:'PATCH',headers:GH_HDR(),
    body:JSON.stringify({files:{[GIST_FILE]:{content:JSON.stringify(DB,null,2)}}})
  });
  if(!r.ok){marcarSync('erro');throw new Error('Erro ao salvar (HTTP '+r.status+')');}
  marcarSync('ok');
}
// ─── GRAVAÇÃO AGRUPADA NA NUVEM ────────────────────────────
// Cada gravação envia a base INTEIRA para o Gist. Antes, cada clique
// disparava um envio próprio: alterar cinco campos seguidos = cinco
// uploads completos, um sufocando o outro e travando a tela.
//
// Agora as alterações feitas em sequência são agrupadas: espera-se um
// intervalo curto de silêncio e envia-se uma única vez. As gravações
// nunca correm em paralelo (ficam em fila), e o que estiver pendente é
// descarregado antes de a página fechar.
const ATRASO_GRAVACAO=900;      // ms de silêncio antes de subir para a nuvem
let __gravarTimer=null;
let __gravarPendente=false;
let __filaGravacao=Promise.resolve();

function avisarFalhaGravacao(e){
  console.warn(e);
  alert('Não foi possível salvar na nuvem: '+e.message+
    '\n\nSua alteração ficou só nesta tela — verifique a conexão e tente novamente.'+
    '\n\nSe o problema persistir, use o botão de Backup na barra superior e baixe uma cópia antes de fechar a página.');
}
// executa agora o que estiver pendente (usado antes de fechar a página,
// ao sair do sistema e antes de baixar um backup)
function descarregarGravacao(){
  if(__gravarTimer){clearTimeout(__gravarTimer);__gravarTimer=null;}
  if(!__gravarPendente)return __filaGravacao;
  __gravarPendente=false;
  __filaGravacao=__filaGravacao.catch(()=>{}).then(gravarDB).catch(avisarFalhaGravacao);
  return __filaGravacao;
}
// dispara a gravação em segundo plano; chamada por todo o app após cada edição
function salvarDB(){
  if(MODO_OFFLINE){
    marcarSync('offline');
    return;
  }
  __gravarPendente=true;
  marcarSync('salvando');       // feedback imediato, mesmo com o envio agrupado
  if(__gravarTimer)clearTimeout(__gravarTimer);
  __gravarTimer=setTimeout(descarregarGravacao,ATRASO_GRAVACAO);
  agendarSnapshotRepo();
  agendarBackupLocal();   // cópia de curto prazo no próprio navegador
}
window.addEventListener('beforeunload',e=>{
  if(!__gravarPendente)return;
  descarregarGravacao();
  e.preventDefault();
  e.returnValue='';           // avisa que ainda há alteração subindo para a nuvem
});

// ═══════ SNAPSHOT NO REPOSITÓRIO (para o diagnóstico quinzenal) ═══════
// Grava uma cópia dos dados num arquivo do repositório do GitHub, para
// leitura externa (diagnóstico automático do escritório).
//
// ATENÇÃO — POR PADRÃO ISSO FICA DESLIGADO. Este envio despeja a base
// inteira (nomes, valores, processos, conversas) num repositório. Se o
// repositório for público, esses dados ficam acessíveis a qualquer
// pessoa da internet — violação de sigilo profissional e da LGPD.
// Só pode ser ligado conscientemente em Backup → Segurança, e somente
// se o repositório de destino for privado.
const SNAPSHOT_OWNER='thallyslopoadv-spec', SNAPSHOT_REPO='sitebgl', SNAPSHOT_PATH='sistema/dados-snapshot.json';
const LS_SNAPSHOT='bgl_snapshot_repo';
let __snapshotTimer=null;
function snapshotRepoAtivo(){return localStorage.getItem(LS_SNAPSHOT)==='1'}
function alternarSnapshotRepo(chk){
  if(chk.checked){
    const ok=confirm(
      'Enviar automaticamente TODOS os dados do escritório para o repositório\n'+
      SNAPSHOT_OWNER+'/'+SNAPSHOT_REPO+'?\n\n'+
      'Só continue se esse repositório for PRIVADO.\n\n'+
      'Se ele for público, nomes de clientes, valores de honorários, processos e\n'+
      'conversas ficam visíveis para qualquer pessoa na internet.');
    if(!ok){chk.checked=false;return;}
    try{localStorage.setItem(LS_SNAPSHOT,'1');}catch(e){}
  }else{
    localStorage.removeItem(LS_SNAPSHOT);
  }
  renderSegurancaBackup();
}
function agendarSnapshotRepo(){
  if(!snapshotRepoAtivo())return;
  if(__snapshotTimer)clearTimeout(__snapshotTimer);
  __snapshotTimer=setTimeout(enviarSnapshotRepo,5000);
}
async function enviarSnapshotRepo(){
  if(!snapshotRepoAtivo()||MODO_OFFLINE)return;
  if(!temCredenciais())return;
  try{
    const api='https://api.github.com/repos/'+SNAPSHOT_OWNER+'/'+SNAPSHOT_REPO+'/contents/'+SNAPSHOT_PATH;
    const hdrGet={'Authorization':'Bearer '+GH_TOKEN,'Accept':'application/vnd.github+json'};
    let sha=null;
    const getRes=await fetch(api,{headers:hdrGet});
    if(getRes.ok){const j=await getRes.json();sha=j.sha;}
    else if(getRes.status!==404){console.warn('[snapshot] leitura falhou, HTTP '+getRes.status);return;}
    const conteudo=JSON.stringify(DB,null,2);
    const b64=btoa(unescape(encodeURIComponent(conteudo)));
    const body={message:'Snapshot automático — '+new Date().toISOString(),content:b64,branch:'main'};
    if(sha)body.sha=sha;
    const putRes=await fetch(api,{method:'PUT',headers:{...hdrGet,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!putRes.ok){
      console.warn('[snapshot] Não foi possível gravar snapshot no repositório (HTTP '+putRes.status+'). O token pode não ter permissão "repo". O Gist continua salvando normalmente.');
    }
  }catch(e){
    console.warn('[snapshot] erro',e);
  }
}

// Senha usada APENAS ao semear um Gist novo e completamente vazio — nunca
// substitui a senha real, que já está gravada no Gist do escritório. Se um dia
// este valor for usado de verdade, troque a senha no primeiro acesso
// (Configurações → Sua senha).
const SENHA_SEMENTE='trocar-no-primeiro-acesso';
let DB=null;
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function seedTarefas(){return JSON.parse(JSON.stringify(SEED_TAREFAS)).map(t=>({id:uid()+Math.random().toString(36).slice(2,4),...t}))}
function seedTiposTarefa(){return JSON.parse(JSON.stringify(SEED_TIPOS_TAREFA))}
async function seedDB(){
  const leadsCRM=criarLeadsCRMImport();
  return {
    usuarios:[
      {user:'thallys@bgl.adv.br', nome:'Thallys', senha:await hashSenha(SENHA_SEMENTE)},
      {user:'cecilia@bgl.adv.br', nome:'Cecília', senha:await hashSenha(SENHA_SEMENTE)},
    ],
    clientes:JSON.parse(JSON.stringify(SEED_CLIENTES)).map(c=>{c.entrada=c.entrada||'';c.drive={};c.chat=[];c.leadVinculadoId=c.leadVinculadoId||null;c.leadVinculadoMod=c.leadVinculadoMod||null;c.fin=(c.fin||[]).map(f=>({id:uid()+Math.random().toString(36).slice(2,4),criadoEm:Date.now(),dependeTerceiro:false,dataPrevistaRecebimento:'',aceiteVerbal:false,...f}));return c;}),
    processos:JSON.parse(JSON.stringify(SEED_PROCESSOS)).map(p=>({id:uid()+Math.random().toString(36).slice(2,4),exito:null,...p})),
    tarefas:seedTarefas(),
    tiposTarefa:seedTiposTarefa(),
    leads:leadsCRM.trab,
    leadsCivel:leadsCRM.civel,
    crmImportadoV1:true,
    crmImportadoV2:true,
    statusCrmMigradoV1:true,
    metasCRM:{},
    fundoAportes:[],
    fundoRetiradas:[],
    mesesExcluidosProLabore:[],
    chatGeral:[],
    custosFixos:[],
    lancamentos:[],
    saldoInicial:{valor:0,obs:'',atualizadoEm:''},
    conteudos:[],
    metasComercial:{artigosMes:4,videosMes:4},
  };
}
// carrega o DB do Gist; semeia automaticamente na primeira vez (gist vazio)
async function carregarDBRemoto(){
  const carregado=await lerDB();
  // "vazio" cobre tanto gist realmente em branco quanto um gist criado
  // com conteúdo placeholder "{}" (sem usuários = nunca foi semeado antes)
  const vazio=!carregado||!Array.isArray(carregado.usuarios)||!carregado.usuarios.length;
  let precisaSalvar=false;
  if(vazio){
    DB=await seedDB();
    precisaSalvar=true;
    // não retorna aqui: cai para a migração abaixo, que também se aplica a um Gist
    // recém-semeado (ex.: cadência retroativa dos leads importados já em etapa avançada)
  }else{
    DB=carregado;
  }
  // migração defensiva: preenche campos que vierem ausentes ou vazios (ex.:
  // gist que passou pelo bug de semeadura parcial, ou versão anterior do
  // sistema), sem jamais apagar dados que já tenham sido editados de verdade
  if(!Array.isArray(DB.clientes)||!DB.clientes.length){DB.clientes=(await seedDB()).clientes;precisaSalvar=true;}
  if(!Array.isArray(DB.processos)||!DB.processos.length){DB.processos=(await seedDB()).processos;precisaSalvar=true;}
  if(!Array.isArray(DB.tarefas)){DB.tarefas=seedTarefas();precisaSalvar=true;}
  if(!Array.isArray(DB.tiposTarefa)||!DB.tiposTarefa.length){DB.tiposTarefa=seedTiposTarefa();precisaSalvar=true;}
  if(!Array.isArray(DB.leads))DB.leads=[];
  if(!Array.isArray(DB.leadsCivel)){DB.leadsCivel=[];precisaSalvar=true;}
  if(!Array.isArray(DB.fundoAportes)){DB.fundoAportes=[];precisaSalvar=true;}
  if(!Array.isArray(DB.fundoRetiradas)){DB.fundoRetiradas=[];precisaSalvar=true;}
  if(!Array.isArray(DB.mesesExcluidosProLabore)){DB.mesesExcluidosProLabore=[];precisaSalvar=true;}
  if(!Array.isArray(DB.chatGeral)){DB.chatGeral=[];precisaSalvar=true;}
  if(!Array.isArray(DB.custosFixos)){DB.custosFixos=[];precisaSalvar=true;}
  if(!Array.isArray(DB.lancamentos)){DB.lancamentos=[];precisaSalvar=true;}
  if(!DB.saldoInicial||typeof DB.saldoInicial.valor!=='number'){DB.saldoInicial={valor:0,obs:'',atualizadoEm:''};precisaSalvar=true;}
  if(!Array.isArray(DB.conteudos)){DB.conteudos=[];precisaSalvar=true;}
  if(!DB.metasComercial||typeof DB.metasComercial.artigosMes!=='number'){DB.metasComercial={artigosMes:4,videosMes:4};precisaSalvar=true;}
  if(!DB.metasCRM||typeof DB.metasCRM!=='object'){DB.metasCRM={};precisaSalvar=true;}
  // régua pré-proposta: preenche a proximaAcaoEm em branco dos leads ativos pré-proposta
  // (os que somem), sem tocar em quem já tem data definida manualmente
  if(!DB.reguaPrePropostaV1){
    [...(DB.leads||[]),...(DB.leadsCivel||[])].forEach(l=>{if(leadPreProposta(l)&&!l.proximaAcaoEm)atualizarProximaAcaoPreProposta(l);});
    DB.reguaPrePropostaV1=true;precisaSalvar=true;
  }
  DB.clientes.forEach(c=>{
    if(c.entrada===undefined)c.entrada='';
    if(!c.drive)c.drive={};
    if(!Array.isArray(c.chat)){c.chat=[];precisaSalvar=true;}
    if(c.leadVinculadoId===undefined){
      // vínculo lead-contrato: reconstrói retroativamente quando o próprio lead já
      // aponta pra esse cliente (conversões feitas antes dessa regra existir)
      const leadTrab=DB.leads.find(l=>l.convertido&&l.clienteId===c.id);
      const leadCiv=DB.leadsCivel.find(l=>l.convertido&&l.clienteId===c.id);
      if(leadTrab){c.leadVinculadoId=leadTrab.id;c.leadVinculadoMod='trab';}
      else if(leadCiv){c.leadVinculadoId=leadCiv.id;c.leadVinculadoMod='civel';}
      else{c.leadVinculadoId=null;c.leadVinculadoMod=null;}
      precisaSalvar=true;
    }
  });
  DB.processos.forEach(p=>{if(p.exito===undefined){p.exito=null;precisaSalvar=true;}});
  // importação/enriquecimento dos leads reais da planilha CRM.
  // V2: além de criar os que faltam, MESCLA os dados da planilha nos leads que
  // já existiam (por nome/telefone) — antes só criava os ausentes, deixando os
  // pré-existentes (ex.: Emerson, Ismael, Bela Massa) sem as informações.
  if(!DB.crmImportadoV2){
    SEED_LEADS_CRM_IMPORT.forEach(d=>{
      const alvo=d.mod==='civel'?DB.leadsCivel:DB.leads;
      const ex=acharLeadImport(alvo,d);
      if(ex)mesclarJornadaCRM(ex,d);
      else alvo.push(construirLeadCRM(d));
    });
    DB.crmImportadoV1=true;
    DB.crmImportadoV2=true;
    precisaSalvar=true;
  }
  // backfill defensivo: leads salvos antes da Jornada Comercial existir ganham os campos com valores neutros
  const backfillJornada=l=>{
    const defaults={area:'',responsavel:'',categoriaOrigem:'',origemTexto:'',motivoBusca:'',urgencia:null,problema:'',
      honorariosTexto:'',valorHonorarioEstimado:0,probabilidadeFechamento:0,objecaoPrincipal:'',categoriaObjecao:'',
      honorariosObstaculo:'',inseguranca:'',canalFollowup:'',entrouContatoTexto:'',reuniaoAgendadaTexto:'',
      compareceu:'',propostaEnviada:'',fechouCRM:'',statusCRM:'Novo',motivoPerdaGanho:'',licoes:'',
      motivoPerda:'',etapaEntradaEm:l.criadoEm||Date.now(),proximaAcaoEm:'',propostaEnviadaEm:'',
      followupCadenciaGerada:false,reuniaoDataHora:''};
    Object.keys(defaults).forEach(k=>{if(l[k]===undefined){l[k]=defaults[k];precisaSalvar=true;}});
    if(!Array.isArray(l.followups)){l.followups=[];precisaSalvar=true;}
  };
  DB.leads.forEach(backfillJornada);
  DB.leadsCivel.forEach(backfillJornada);
  // migração V1 do funil: as etapas antigas (Andamento/Aguardando/Fechado/Encerrado)
  // dão lugar às 7 etapas fixas do novo funil de vendas. Leads que caem em "Perdido"
  // por essa migração ganham um motivo padrão (lista fechada) para não infringir a
  // obrigatoriedade — heurística a partir da objeção já registrada, com fallback "Sumiço".
  if(!DB.statusCrmMigradoV1){
    const mapaEtapaLegado={'Andamento':'Qualificado','Aguardando':'Qualificado','Fechado':'Ganho','Encerrado':'Perdido'};
    const motivoPadraoDe=l=>{
      const o=(l.categoriaObjecao||'').toLowerCase();
      if(o.includes('honorar'))return 'Preço';
      if(o.includes('tempo'))return 'Prazo';
      if(o.includes('confianc')||o.includes('inseguranc'))return 'Prazo';
      return 'Sumiço';
    };
    [...DB.leads,...DB.leadsCivel].forEach(l=>{
      if(mapaEtapaLegado[l.statusCRM]){
        l.statusCRM=mapaEtapaLegado[l.statusCRM];
        precisaSalvar=true;
      }
      if(l.statusCRM==='Perdido'&&!l.motivoPerda){l.motivoPerda=motivoPadraoDe(l);precisaSalvar=true;}
      if(l.statusCRM==='Ganho')l.convertido=l.convertido; // mantém convertido como já estava (não força cliente)
    });
    DB.statusCrmMigradoV1=true;
    precisaSalvar=true;
  }
  // tipo de tarefa "Follow-up de leads", usado pela cadência automática
  if(Array.isArray(DB.tiposTarefa)&&!DB.tiposTarefa.some(t=>t.key==='followup')){
    DB.tiposTarefa.push({key:'followup',lbl:'Follow-up de leads',cor:'#6b4f9e'});
    precisaSalvar=true;
  }
  // remoção da cadência de follow-up: apaga as tarefas D+0..D+15 geradas antes e limpa a
  // flag, para os dados existentes não continuarem mostrando as tarefas que não faziam sentido
  if(!DB.cadenciaRemovidaV1){
    const antes=DB.tarefas.length;
    DB.tarefas=DB.tarefas.filter(t=>t.tipo!=='followup');
    [...DB.leads,...DB.leadsCivel].forEach(l=>{if(l.followupCadenciaGerada)l.followupCadenciaGerada=false;});
    DB.cadenciaRemovidaV1=true;
    if(DB.tarefas.length!==antes)precisaSalvar=true; else precisaSalvar=precisaSalvar||true;
  }
  // data de conclusão das tarefas: as que já estavam concluídas antes deste
  // controle ficam com data vazia (aparecem como "sem data registrada"), para
  // não inventar um cumprimento de prazo que ninguém conferiu
  DB.tarefas.forEach(t=>{
    if(t.concluidoEm===undefined){t.concluidoEm='';precisaSalvar=true;}
  });
  // créditos dependentes de terceiro: campos novos em cada lançamento financeiro previsto
  DB.clientes.forEach(c=>{
    (c.fin||[]).forEach(f=>{
      if(f.criadoEm===undefined){f.criadoEm=Date.now();precisaSalvar=true;}
      if(f.dependeTerceiro===undefined){f.dependeTerceiro=false;precisaSalvar=true;}
      if(f.dataPrevistaRecebimento===undefined){f.dataPrevistaRecebimento='';precisaSalvar=true;}
      if(f.aceiteVerbal===undefined){f.aceiteVerbal=false;precisaSalvar=true;}
    });
  });
  // processos: áreas, fases, publicações do DJEN e o tipo de tarefa "prazo"
  if(garantirEstruturaProcessos())precisaSalvar=true;
  if(garantirContratos())precisaSalvar=true;
  if(precisaSalvar)await gravarDB();
}

