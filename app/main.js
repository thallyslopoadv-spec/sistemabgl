// Processo principal do protótipo do Sistema BGL.
//
// O sistema (sistema/index.html) é montado por scripts/montar.mjs a partir
// do mesmo src/ do site, com a camada de dados trocada para o Supabase.
// Este arquivo cria a janela e resolve, do lado do aplicativo, os pontos
// que mudam fora do navegador:
//   1. links externos abrem no navegador padrão, não dentro do app;
//   2. fechar a janela com alteração ainda subindo para a nuvem espera a
//      gravação terminar, em vez de travar ou perder a edição;
//   3. a página é servida por um endereço próprio (app://bgl), para que
//      armazenamento local, consultas externas e o backup "sistema
//      completo" se comportem como no site;
//   4. o backup diário é gravado numa pasta escolhida pelo usuário
//      (normalmente uma pasta do Google Drive para computador).
const {app,BrowserWindow,protocol,net,shell,ipcMain,Menu,dialog,session}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');

const ORIGEM='app://bgl';
const PASTA=path.join(__dirname,'sistema');
const DJEN_API='https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const ESPERA_GRAVACAO_MS=20000;

protocol.registerSchemesAsPrivileged([{
  scheme:'app',
  privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true},
}]);

if(!app.requestSingleInstanceLock()){app.quit();}

// ─── ARQUIVOS DA PÁGINA ───────────────────────────────────
// só entrega o que está dentro de sistema/; qualquer caminho que tente
// sair da pasta (../) recebe 404
function arquivoDoPedido(url){
  const u=new URL(url);
  if(u.host!=='bgl')return null;
  let p=decodeURIComponent(u.pathname);
  if(!p||p==='/')p='/index.html';
  const alvo=path.normalize(path.join(PASTA,p));
  return alvo.startsWith(PASTA+path.sep)?alvo:null;
}

// ─── LINKS EXTERNOS ───────────────────────────────────────
function abrirNoNavegador(url){
  try{
    const u=new URL(url);
    if(['https:','http:','mailto:'].includes(u.protocol))shell.openExternal(url);
  }catch(e){}
}
function protegerNavegacao(win){
  const wc=win.webContents;
  wc.setWindowOpenHandler(({url})=>{abrirNoNavegador(url);return {action:'deny'};});
  wc.on('will-navigate',(e,url)=>{
    if(url.startsWith(ORIGEM+'/'))return;
    e.preventDefault();
    abrirNoNavegador(url);
  });
}

// ─── FECHAMENTO COM GRAVAÇÃO PENDENTE ─────────────────────
// O sistema usa "beforeunload" para avisar que ainda há alteração subindo.
// No navegador isso abre uma pergunta; no Electron, simplesmente impede a
// janela de fechar, sem explicação. Aqui o próprio app descarrega a fila de
// gravação do sistema (descarregarGravacao) antes de fechar.
const esperar=ms=>new Promise(r=>setTimeout(r,ms));
async function gravacaoPendente(wc){
  return wc.executeJavaScript(
    "typeof __gravarPendente!=='undefined'&&(!!__gravarPendente||!!__gravarTimer)",true);
}
async function descarregar(wc){
  const r=await Promise.race([
    wc.executeJavaScript("Promise.resolve(descarregarGravacao()).then(()=>'ok',()=>'erro')",true),
    esperar(ESPERA_GRAVACAO_MS).then(()=>'tempo'),
  ]);
  if(r!=='ok')return r;
  // descarregarGravacao não rejeita quando o envio falha: ela avisa e marca o
  // indicador de sincronização como erro. É esse indicador que diz o resultado.
  const erro=await wc.executeJavaScript(
    "(document.getElementById('sync-status')||{}).textContent==='Erro ao sincronizar'",true);
  return erro?'erro':'ok';
}
function tratarFechamento(win){
  let liberado=false;
  win.on('close',async e=>{
    if(liberado)return;
    e.preventDefault();
    let fechar=true;
    try{
      if(await gravacaoPendente(win.webContents)){
        win.setTitle('Sistema BGL — salvando antes de fechar…');
        const r=await descarregar(win.webContents);
        if(r!=='ok'){
          const {response}=await dialog.showMessageBox(win,{
            type:'warning',buttons:['Continuar no sistema','Fechar mesmo assim'],defaultId:0,cancelId:0,
            title:'Alteração não confirmada',
            message:r==='tempo'
              ?'A última alteração ainda não terminou de subir para a nuvem.'
              :'A última alteração não pôde ser salva na nuvem.',
            detail:'Se fechar agora, ela pode se perder. Verifique a conexão ou baixe um backup antes de sair.',
          });
          fechar=response===1;
        }
      }
    }catch(err){/* página travada ou já descarregada: não prende o usuário */}
    if(fechar){liberado=true;win.destroy();}
    else win.setTitle('Sistema BGL');
  });
  // garantia: um beforeunload da página nunca deixa a janela presa sem explicação
  win.webContents.on('will-prevent-unload',e=>e.preventDefault());
}

// ─── JANELA ───────────────────────────────────────────────
function criarJanela(pagina){
  const win=new BrowserWindow({
    width:1400,height:900,minWidth:900,minHeight:600,
    title:'Sistema BGL',backgroundColor:'#f7f5f0',show:false,
    webPreferences:{
      preload:path.join(__dirname,'preload.js'),
      contextIsolation:true,sandbox:true,nodeIntegration:false,
      webviewTag:false,spellcheck:true,
    },
  });
  win.once('ready-to-show',()=>win.show());
  protegerNavegacao(win);
  tratarFechamento(win);
  win.loadURL(ORIGEM+'/'+pagina);
  return win;
}
function janelaAtual(){return BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows()[0]||null}
function irPara(pagina){
  const w=janelaAtual();
  if(w)w.loadURL(ORIGEM+'/'+pagina);else criarJanela(pagina);
}

function montarMenu(){
  const mac=process.platform==='darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac?[{role:'appMenu'}]:[]),
    {label:'Protótipo',submenu:[
      {label:'Abrir o sistema BGL',click:()=>irPara('index.html')},
      {label:'Diagnóstico do aplicativo',click:()=>irPara('diagnostico.html')},
      {type:'separator'},
      {role:'reload',label:'Recarregar'},
      {role:'toggleDevTools',label:'Ferramentas do desenvolvedor'},
      ...(mac?[]:[{type:'separator'},{role:'quit',label:'Sair'}]),
    ]},
    // sem o menu Editar, Cmd+C / Cmd+V não funcionam no Mac
    {role:'editMenu',label:'Editar'},
    {role:'viewMenu',label:'Exibir'},
    {role:'windowMenu',label:'Janela'},
  ]));
}

// ─── BACKUP NA PASTA DO DRIVE ─────────────────────────────
// A página não escolhe nome nem caminho: só informa quem está gravando e o
// conteúdo. O arquivo sempre cai na pasta escolhida, com o nome padrão, e só
// arquivos com esse nome padrão são apagados na limpeza.
const MANTER_BACKUPS=30;
const NOME_BACKUP=/^bgl-backup-auto-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.json$/;
const arquivoPrefs=()=>path.join(app.getPath('userData'),'preferencias.json');
function lerPrefs(){try{return JSON.parse(fs.readFileSync(arquivoPrefs(),'utf8'))||{};}catch(e){return {};}}
function gravarPrefs(p){fs.writeFileSync(arquivoPrefs(),JSON.stringify(p,null,2));}
function pastaBackup(){
  const p=lerPrefs().pastaBackup;
  try{return p&&fs.statSync(p).isDirectory()?p:null;}catch(e){return null;}
}
// só a página do próprio aplicativo pode chamar estes canais
function daPagina(e){return !!(e.senderFrame&&e.senderFrame.url.startsWith(ORIGEM+'/'));}

ipcMain.handle('backup:pasta',e=>daPagina(e)?pastaBackup():null);
ipcMain.handle('backup:escolherPasta',async e=>{
  if(!daPagina(e))return null;
  const r=await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender),{
    title:'Pasta do Google Drive para os backups',properties:['openDirectory','createDirectory']});
  if(r.canceled||!r.filePaths[0])return null;
  gravarPrefs({...lerPrefs(),pastaBackup:r.filePaths[0]});
  return r.filePaths[0];
});
ipcMain.handle('backup:gravar',async(e,pedido)=>{
  if(!daPagina(e))return {ok:false,erro:'origem não permitida'};
  const {quem,conteudo}=pedido||{};
  if(typeof quem!=='string'||!/^[a-z0-9]{1,30}$/.test(quem))return {ok:false,erro:'identificação inválida'};
  if(typeof conteudo!=='string'||!conteudo.length||conteudo.length>200*1024*1024)return {ok:false,erro:'conteúdo inválido'};
  const pasta=pastaBackup();
  if(!pasta)return {ok:false,erro:'a pasta de backup não existe mais; escolha outra'};
  const dia=new Date().toLocaleDateString('sv-SE');   // AAAA-MM-DD no fuso do computador
  const nome='bgl-backup-auto-'+dia+'-'+quem+'.json';
  try{
    // grava num temporário e renomeia: o Drive nunca sobe um arquivo pela metade
    const tmp=path.join(pasta,'.'+nome+'.tmp');
    await fs.promises.writeFile(tmp,conteudo,'utf8');
    await fs.promises.rename(tmp,path.join(pasta,nome));
    const antigos=(await fs.promises.readdir(pasta)).filter(n=>NOME_BACKUP.test(n)).sort().reverse().slice(MANTER_BACKUPS);
    for(const n of antigos)await fs.promises.unlink(path.join(pasta,n)).catch(()=>{});
    return {ok:true,arquivo:nome};
  }catch(err){return {ok:false,erro:String(err&&err.message||err)};}
});

// ─── CANAIS USADOS SÓ PELA PÁGINA DE DIAGNÓSTICO ──────────
ipcMain.handle('diag:info',e=>daPagina(e)&&({
  app:app.getVersion(),electron:process.versions.electron,chrome:process.versions.chrome,
  plataforma:process.platform,arquitetura:process.arch,
}));
// consulta ao DJEN feita pelo próprio aplicativo, fora da página: é o plano B
// caso a API recuse chamadas vindas da origem app://bgl
ipcMain.handle('diag:djen',async(e,url)=>{
  if(!daPagina(e))return {erro:'origem não permitida'};
  if(typeof url!=='string'||!url.startsWith(DJEN_API+'?'))return {erro:'endereço não permitido'};
  try{
    const r=await net.fetch(url,{headers:{'Accept':'application/json'}});
    const t=await r.text();
    return {status:r.status,ok:r.ok,amostra:t.slice(0,200)};
  }catch(e){return {erro:String(e&&e.message||e)};}
});

app.on('second-instance',()=>{const w=janelaAtual();if(w){if(w.isMinimized())w.restore();w.focus();}});
app.on('window-all-closed',()=>app.quit());

app.whenReady().then(()=>{
  protocol.handle('app',req=>{
    const f=arquivoDoPedido(req.url);
    if(!f)return new Response('não encontrado',{status:404});
    return net.fetch(pathToFileURL(f).toString());
  });
  // nenhuma permissão de hardware (câmera, microfone, localização, notificações);
  // só a cópia para a área de transferência, usada pelo sistema
  session.defaultSession.setPermissionRequestHandler((_wc,perm,cb)=>cb(perm==='clipboard-sanitized-write'));
  montarMenu();
  criarJanela('index.html');
});
