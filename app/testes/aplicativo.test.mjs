// Teste de ponta a ponta do aplicativo contra um Supabase imitado.
//   npm run testar          (no Linux sem tela: xvfb-run -a npm run testar)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {_electron as electron,chromium} from 'playwright-core';
import {criarSupabaseFalso} from './supabase-falso.mjs';

const APP=join(dirname(fileURLToPath(import.meta.url)),'..');
const CHAVE='chave-de-teste-0123456789abcdef';
const SENHA_T='senha-do-thallys',SENHA_C='senha-da-cecilia';

const tmp=mkdtempSync(join(tmpdir(),'bgl-app-teste-'));
const falso=criarSupabaseFalso({chave:CHAVE});
await new Promise(r=>falso.servidor.listen(0,'127.0.0.1',r));
const porta=falso.servidor.address().port;
falso.criarConta('thallys@gmail.com',SENHA_T,{usuario:'thallys@bgl.adv.br',nome:'Thallys'});
falso.criarConta('cecilia@gmail.com',SENHA_C,{usuario:'cecilia@bgl.adv.br',nome:'Cecília'});
falso.criarConta('intruso@gmail.com','senha-do-intruso',null);

writeFileSync(join(tmp,'config.json'),JSON.stringify({supabaseUrl:'http://127.0.0.1:'+porta,supabaseChave:CHAVE}));
execFileSync(process.execPath,[join(APP,'scripts','montar.mjs')],{env:{...process.env,BGL_CONFIG:join(tmp,'config.json')}});

const dadosApp=join(tmp,'dados-app'),pastaDrive=join(tmp,'drive');
execFileSync('mkdir',['-p',dadosApp,pastaDrive]);
writeFileSync(join(dadosApp,'preferencias.json'),JSON.stringify({pastaBackup:pastaDrive}));

async function abrirApp(){
  const args=[APP,'--user-data-dir='+dadosApp];
  if(process.getuid&&process.getuid()===0)args.push('--no-sandbox');
  const app=await electron.launch({executablePath:join(APP,'node_modules','electron','dist',process.platform==='win32'?'electron.exe':'electron'),args});
  const p=await app.firstWindow();
  p.on('dialog',d=>d.accept());
  p.on('pageerror',e=>errosPagina.push(e.message));
  await p.waitForLoadState('load');
  return {app,p};
}
async function entrar(p,email,senha){
  await p.fill('#inp-u',email);
  await p.fill('#inp-p',senha);
  await p.click('#btn-entrar');
}
const esperarSync=p=>p.waitForFunction(()=>!__gravarPendente&&!__gravarTimer).then(()=>p.evaluate(()=>__filaGravacao));
const rpcs=()=>falso.chamadas.filter(c=>c.caminho==='/rest/v1/rpc/gravar_alteracoes');

let app,p;
const errosPagina=[];

test('tela de login do aplicativo', async()=>{
  ({app,p}=await abrirApp());
  assert.equal(p.url(),'app://bgl/index.html');
  assert.equal(await p.isVisible('#screen-login'),true);
  assert.equal(await p.isVisible('#token-wrap'),false,'campos de Gist/token escondidos');
  assert.equal(await p.evaluate(()=>document.getElementById('inp-u').previousElementSibling.textContent),'E-mail');
  const csp=await p.evaluate(()=>document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  assert.match(csp,new RegExp('connect-src \'self\' http://127.0.0.1:'+porta));
  assert.doesNotMatch(csp,/api\.github\.com/,'o GitHub sai da lista de conexões permitidas');
});

test('senha errada e conta sem cadastro de membro são recusadas', async()=>{
  await entrar(p,'thallys@gmail.com','errada');
  await p.waitForFunction(()=>document.getElementById('login-err').textContent.includes('incorretos'));
  await entrar(p,'intruso@gmail.com','senha-do-intruso');
  await p.waitForFunction(()=>document.getElementById('login-err').textContent.includes('não tem acesso'));
  assert.equal(await p.isVisible('#screen-dashboard'),false);
});

test('base vazia: pede a importação e nunca semeia por cima', async()=>{
  await entrar(p,'thallys@gmail.com',SENHA_T);
  await p.waitForSelector('#app-importacao',{state:'visible'});
  assert.equal(falso.estado.versao,0,'nada foi gravado antes da importação');
  // backup de teste gerado pelas próprias sementes do sistema
  const pacote=await p.evaluate(async()=>{
    const d=await seedDB();
    // registros fictícios: as sementes do código público não trazem clientes nem processos
    for(let i=1;i<=3;i++){
      d.clientes.push({id:'cli-'+i,nome:'Cliente fictício '+i,telefone:'',obs:'',entrada:'',drive:{},chat:[],fin:[],leadVinculadoId:null,leadVinculadoMod:null});
      d.processos.push({id:'proc-'+i,numero:'0000000-0'+i+'.2026.5.18.0001',cliente:'Cliente fictício '+i,exito:null});
    }
    return {_meta:{sistema:'teste'},dados:d};
  });
  writeFileSync(join(tmp,'backup.json'),JSON.stringify(pacote));
  await p.setInputFiles('#app-importacao-arquivo',join(tmp,'backup.json'));
  await p.click('#app-importacao-btn');
  await p.waitForSelector('#screen-dashboard',{state:'visible'});
  await esperarSync(p);
  assert.ok(falso.estado.versao>=1);
  assert.equal(falso.estado.dados.clientes.length,pacote.dados.clientes.length);
  assert.equal(await p.evaluate(()=>EU.user),'thallys@bgl.adv.br','identidade vem do cadastro de membro');
});

test('gravação envia só as partes alteradas', async()=>{
  const antes=rpcs().length;
  await p.evaluate(()=>{DB.tarefas.push({id:'t-teste-1',titulo:'Tarefa criada no teste',tipo:'outro',concluida:false});salvarDB();});
  await esperarSync(p);
  const novas=rpcs().slice(antes);
  assert.equal(novas.length,1);
  assert.deepEqual(Object.keys(novas[0].corpo.p_alteracoes),['tarefas']);
  assert.ok(falso.estado.dados.tarefas.some(t=>t.id==='t-teste-1'));
});

test('edição simultânea em registros diferentes: as duas ficam', async()=>{
  const [c0,c1]=falso.estado.dados.clientes;
  falso.gravarComo('cecilia@gmail.com',d=>{d.clientes[0].nome='Nome alterado pela Cecília';});
  await p.evaluate(id=>{DB.clientes.find(c=>c.id===id).telefone='(62) 90000-0000';salvarDB();},c1.id);
  await esperarSync(p);
  const srv=falso.estado.dados.clientes;
  assert.equal(srv.find(c=>c.id===c0.id).nome,'Nome alterado pela Cecília');
  assert.equal(srv.find(c=>c.id===c1.id).telefone,'(62) 90000-0000');
  assert.equal(await p.evaluate(id=>DB.clientes.find(c=>c.id===id).nome,c0.id),'Nome alterado pela Cecília','a tela recebeu a alteração dela');
});

test('edição simultânea em partes diferentes da base: as duas ficam', async()=>{
  falso.gravarComo('cecilia@gmail.com',d=>{d.custosFixos=[{id:'cf1',nome:'Aluguel',valor:1000}];});
  await p.evaluate(()=>{DB.saldoInicial={valor:123,obs:'teste',atualizadoEm:''};salvarDB();});
  await esperarSync(p);
  assert.equal(falso.estado.dados.custosFixos[0].nome,'Aluguel');
  assert.equal(falso.estado.dados.saldoInicial.valor,123);
});

test('mesmo campo alterado nos dois lados: prevalece esta tela e há aviso', async()=>{
  const c0=falso.estado.dados.clientes[0];
  falso.gravarComo('cecilia@gmail.com',d=>{d.clientes[0].obs='versão da Cecília';});
  await p.evaluate(id=>{DB.clientes.find(c=>c.id===id).obs='versão do Thallys';salvarDB();},c0.id);
  await esperarSync(p);
  assert.equal(falso.estado.dados.clientes[0].obs,'versão do Thallys');
  assert.match(await p.textContent('#toast-txt'),/mesmo registro ao mesmo tempo/);
});

test('registro apagado de um lado e intocado do outro some nos dois', async()=>{
  const alvo=falso.estado.dados.processos[0].id;
  falso.gravarComo('cecilia@gmail.com',d=>{d.processos=d.processos.filter(x=>x.id!==alvo);});
  await p.evaluate(()=>{DB.tarefas.push({id:'t-teste-2',titulo:'Outra tarefa',tipo:'outro',concluida:false});salvarDB();});
  await esperarSync(p);
  assert.equal(falso.estado.dados.processos.some(x=>x.id===alvo),false);
  assert.equal(await p.evaluate(id=>DB.processos.some(x=>x.id===id),alvo),false);
});

test('alteração feita no outro computador aparece sem recarregar', async()=>{
  falso.gravarComo('cecilia@gmail.com',d=>{d.chatGeral=[{id:'m1',texto:'oi'}];});
  await p.evaluate(()=>agendarVerificacaoRemota());
  assert.equal(await p.evaluate(()=>DB.chatGeral.length),1);
  assert.equal(await p.evaluate(()=>__versaoBase),falso.estado.versao);
});

test('backup automático grava na pasta do Drive e guarda só os 30 mais recentes', async()=>{
  for(let i=1;i<=35;i++)writeFileSync(join(pastaDrive,'bgl-backup-auto-2020-01-'+String(i).padStart(2,'0')+'-thallys.json'),'{}');
  writeFileSync(join(pastaDrive,'outro-arquivo.json'),'{}');
  assert.equal(await p.evaluate(()=>fazerBackupDrive(false)),true);
  const arqs=readdirSync(pastaDrive);
  const hoje=new Date().toLocaleDateString('sv-SE');
  const nome='bgl-backup-auto-'+hoje+'-thallys.json';
  assert.ok(arqs.includes(nome));
  assert.equal(arqs.filter(n=>n.startsWith('bgl-backup-auto-')).length,30);
  assert.ok(arqs.includes('outro-arquivo.json'),'arquivos alheios não são tocados');
  assert.equal(JSON.parse(readFileSync(join(pastaDrive,nome),'utf8')).dados.clientes.length,falso.estado.dados.clientes.length);
  // a página não escolhe caminho: nome inválido é recusado
  const r=await p.evaluate(()=>window.bglApp.backup.gravar({quem:'../../etc',conteudo:'x'}));
  assert.equal(r.ok,false);
});

test('a cópia offline gerada pelo aplicativo continua abrindo com a senha do sistema', async(t)=>{
  const exe=['/opt/pw-browsers/chromium-1194/chrome-linux/chrome','/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
  if(!exe){t.skip('Chromium avulso não encontrado neste computador');return;}
  const html=await p.evaluate(async()=>{
    const fonte=await obterFontePagina();
    const json=JSON.stringify(pacoteBackup()).replace(/</g,'\\u003c');
    return fonte.replace(/<\/head>/i,'<script id="bgl-dados-embutidos" type="application/json">'+json+'<\/script>\n</head>');
  });
  writeFileSync(join(tmp,'copia-offline.html'),html);
  const nav=await chromium.launch({executablePath:exe});
  const pg=await nav.newPage();
  await pg.goto('file://'+join(tmp,'copia-offline.html'));
  assert.equal(await pg.evaluate(()=>MODO_OFFLINE),true);
  await pg.fill('#inp-u','thallys@bgl.adv.br');
  await pg.fill('#inp-p','trocar-no-primeiro-acesso');   // senha das sementes usadas no teste
  await pg.click('#btn-entrar');
  await pg.waitForSelector('#screen-dashboard',{state:'visible'});
  await nav.close();
});

test('sair encerra a sessão; reabrir pede a senha de novo', async()=>{
  await p.evaluate(()=>logout());
  await p.waitForSelector('#screen-login',{state:'visible'});
  assert.equal(await p.evaluate(async()=>!!(await SB.auth.getSession()).data.session),false);
  await p.reload();await p.waitForLoadState('load');
  await p.waitForTimeout(500);
  assert.equal(await p.isVisible('#screen-dashboard'),false);
});

test('fechar a janela com alteração pendente espera a gravação', async()=>{
  await entrar(p,'cecilia@gmail.com',SENHA_C);
  await p.waitForSelector('#screen-dashboard',{state:'visible'});
  await esperarSync(p);
  await p.evaluate(()=>{DB.tarefas.push({id:'t-antes-de-fechar',titulo:'Antes de fechar',tipo:'outro',concluida:false});salvarDB();});
  const fim=new Promise(r=>app.process().on('exit',r));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  await fim;
  assert.ok(falso.estado.dados.tarefas.some(t=>t.id==='t-antes-de-fechar'));
  falso.servidor.close();
});

test('nenhum erro de JavaScript em todo o percurso', ()=>{
  assert.deepEqual(errosPagina,[]);
});
