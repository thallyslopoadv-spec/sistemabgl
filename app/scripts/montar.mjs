// Monta app/sistema/index.html, a página que roda dentro do aplicativo.
//
// Parte do mesmo src/ que gera o site (tools/build.mjs) e aplica, só nesta
// cópia, as diferenças do aplicativo:
//   · as funções de dados e login do Gist ganham o sufixo __gist, e os
//     módulos de app/nuvem/ entram no lugar delas (Supabase + backup no Drive);
//   · a política de segurança da página passa a permitir conexão só com o
//     Supabase do escritório e com o DJEN (o GitHub sai da lista);
//   · a tela de login e a aba Segurança do backup trocam Gist/token pelo
//     que o aplicativo usa.
// Cada substituição confere que o trecho original existe exatamente uma vez:
// se o src/ mudar e o trecho sumir, a montagem para com erro em vez de gerar
// um aplicativo quebrado em silêncio.
//
//   node scripts/montar.mjs            usa app/config.local.json
//   BGL_CONFIG=outro.json node ...     usa outro arquivo de configuração
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const APP=join(dirname(fileURLToPath(import.meta.url)),'..');
const SRC=join(APP,'..','src');
const ler=p=>readFileSync(join(SRC,p),'utf8');

// ─── CONFIGURAÇÃO ─────────────────────────────────────────
const arqConfig=resolve(APP,process.env.BGL_CONFIG||'config.local.json');
if(!existsSync(arqConfig)){
  console.error('Falta '+arqConfig+'.\nCopie config.exemplo.json para config.local.json e preencha com os dados do projeto Supabase.');
  process.exit(1);
}
const cfg=JSON.parse(readFileSync(arqConfig,'utf8'));
let urlNuvem;
try{urlNuvem=new URL(cfg.supabaseUrl);}catch(e){throw new Error('supabaseUrl inválida em '+arqConfig);}
const local=['localhost','127.0.0.1'].includes(urlNuvem.hostname);   // só para os testes automáticos
if(urlNuvem.protocol!=='https:'&&!local)throw new Error('supabaseUrl precisa começar com https://');
if(typeof cfg.supabaseChave!=='string'||cfg.supabaseChave.length<20)throw new Error('supabaseChave ausente em '+arqConfig);
const origemNuvem=urlNuvem.origin;
const origemWs=origemNuvem.replace(/^http/,'ws');

// ─── SUBSTITUIÇÃO CONFERIDA ───────────────────────────────
function trocarUmaVez(texto,de,para,rotulo){
  const n=texto.split(de).length-1;
  if(n!==1)throw new Error('trecho "'+rotulo+'" encontrado '+n+' vezes (esperado: 1). O src/ mudou; revise scripts/montar.mjs.');
  return texto.replace(de,()=>para);
}
function renomearFuncao(js,nome){
  const re=new RegExp('(^|\\n)((?:async )?function )'+nome+'\\(','g');
  const n=(js.match(re)||[]).length;
  if(n!==1)throw new Error('função '+nome+' encontrada '+n+' vezes (esperado: 1).');
  return js.replace(re,(_,a,b)=>a+b+nome+'__gist(');
}

// ─── HTML BASE (mesma lógica de tools/build.mjs) ──────────
const manifesto=JSON.parse(ler('manifesto.json'));
let html=ler('index.html');
const css='<style>\n'+manifesto.css.map(f=>ler('assets/css/'+f)).join('')+
  readFileSync(join(APP,'nuvem','app.css'),'utf8')+'</style>\n';

let js=manifesto.js.filter(f=>f!=='99-inicializacao.js').map(f=>ler('assets/js/'+f)).join('');
for(const nome of ['lerDB','gravarDB','tentarLogin','initApp','finalizarLogout','trocarSenha','renderSegurancaBackup'])
  js=renomearFuncao(js,nome);
js='window.BGL_NUVEM='+JSON.stringify({url:origemNuvem,chave:cfg.supabaseChave})+';\n'+js+
  readFileSync(join(APP,'nuvem','01-nuvem-supabase.js'),'utf8')+
  readFileSync(join(APP,'nuvem','02-backup-drive.js'),'utf8')+
  ler('assets/js/99-inicializacao.js');
const vendor=readFileSync(join(APP,'node_modules','@supabase','supabase-js','dist','umd','supabase.js'),'utf8');
if(/<\/script/i.test(vendor+js))throw new Error('um script contém "</script", o que quebraria a página');

const marcador=nome=>{
  const m='<!-- @'+nome+' -->\n';
  if(html.split(m).length!==2)throw new Error('marcador '+m.trim()+' ausente ou repetido em src/index.html');
  return m;
};
html=html.replace(marcador('css'),()=>css).replace(marcador('js'),()=>
  '<script>\n'+vendor+'\n</script>\n<script>\n'+js+'</script>\n');

const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'};
html=html.replace(/\{\{img:([\w.-]+)\}\}/g,(_,nome)=>{
  const tipo=MIME[nome.split('.').pop().toLowerCase()];
  if(!tipo)throw new Error('formato de imagem não suportado: '+nome);
  return 'data:'+tipo+';base64,'+readFileSync(join(SRC,'assets/img',nome)).toString('base64');
});

// ─── DIFERENÇAS DO APLICATIVO ─────────────────────────────
html=trocarUmaVez(html,
  "connect-src 'self' https://api.github.com https://gist.githubusercontent.com https://comunicaapi.pje.jus.br;",
  "connect-src 'self' "+origemNuvem+' '+origemWs+' https://comunicaapi.pje.jus.br;',
  'connect-src da política de segurança');
html=trocarUmaVez(html,'<title>BGL Advogados — Sistema</title>','<title>Sistema BGL</title>','título');
html=trocarUmaVez(html,
  '<label>Usuário</label><input type="text" id="inp-u"',
  '<label>E-mail</label><input type="email" id="inp-u"',
  'campo de usuário do login');
html=trocarUmaVez(html,
  '<div class="login-err" id="login-err"></div>',
  `<div class="login-err" id="login-err"></div>
    <div class="token-wrap" id="app-importacao" style="display:none">
      <div class="tw-title"><i class="ti ti-database-import"></i> Primeira carga da base</div>
      <div class="fg" style="margin-bottom:.65rem"><label>Backup do sistema (.json ou "sistema completo" .html)</label><input type="file" id="app-importacao-arquivo" accept=".json,.html,.js"></div>
      <button class="btn-login" id="app-importacao-btn" onclick="importarBaseInicial()">Importar backup</button>
    </div>`,
  'área de erro do login');
const iniSeg='      <div class="det-sec-titulo" style="margin-top:4px"><span>Cópia automática no repositório</span></div>\n';
const fimSeg='      <button class="det-add" onclick="esquecerDispositivo()"><i class="ti ti-lock-off"></i> Esquecer token e sair deste dispositivo</button>\n';
const a=html.indexOf(iniSeg),b=html.indexOf(fimSeg);
if(a<0||b<a||html.indexOf(iniSeg,a+1)>=0||html.indexOf(fimSeg,b+1)>=0)
  throw new Error('bloco da aba Segurança não encontrado como esperado; revise scripts/montar.mjs.');
html=html.slice(0,a)+
  '      <div class="det-sec-titulo" style="margin-top:4px"><span>Backup automático no Google Drive</span></div>\n'+
  '      <div id="bk-seg-drive"></div>\n'+
  html.slice(b+fimSeg.length);

if(/\{\{img:|<!-- @(css|js) -->/.test(html))throw new Error('sobrou marcador sem substituir');
writeFileSync(join(APP,'sistema','index.html'),html);
console.log('app/sistema/index.html gerado · nuvem '+origemNuvem+' · '+(html.length/1024).toFixed(0)+' KB');
