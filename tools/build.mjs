// Monta o index.html publicado a partir de src/.
//
// O sistema precisa ser UM arquivo só na hora de publicar: o backup offline
// ("baixar sistema completo") copia a própria página com os dados embutidos,
// e isso só funciona se CSS, JS e imagens estiverem dentro dela. Por isso o
// código-fonte fica organizado em pastas e este script junta tudo.
//
//   node tools/build.mjs          → gera ./index.html (o que vai para o ar)
//   node tools/build.mjs --dev    → gera ./dev.html, que carrega os arquivos de
//                                   src/assets separadamente (para desenvolver)
//
// Sem dependências: só Node 18+.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ=join(dirname(fileURLToPath(import.meta.url)),'..');
const SRC=join(RAIZ,'src');
const dev=process.argv.includes('--dev');
const ler=p=>readFileSync(join(SRC,p),'utf8');
const manifesto=JSON.parse(ler('manifesto.json'));

let html=ler('index.html');
const marcador=(nome)=>{
  const m='<!-- @'+nome+' -->\n';
  if(html.split(m).length!==2)throw new Error('marcador '+m.trim()+' ausente ou repetido em src/index.html');
  return m;
};
const css=dev
  ? manifesto.css.map(f=>`<link rel="stylesheet" href="src/assets/css/${f}">\n`).join('')
  : '<style>\n'+manifesto.css.map(f=>ler('assets/css/'+f)).join('')+'</style>\n';
const js=dev
  ? manifesto.js.map(f=>`<script src="src/assets/js/${f}"></script>\n`).join('')
  : '<script>\n'+manifesto.js.map(f=>ler('assets/js/'+f)).join('')+'</script>\n';
// funções de substituição: um "$" dentro do código não pode ser lido como padrão
html=html.replace(marcador('css'),()=>css).replace(marcador('js'),()=>js);
html=html.replace(/\{\{img:([\w.-]+)\}\}/g,(_,nome)=>dev
  ? 'src/assets/img/'+nome
  : 'data:image/png;base64,'+readFileSync(join(SRC,'assets/img',nome)).toString('base64'));
if(/\{\{img:|<!-- @(css|js) -->/.test(html))throw new Error('sobrou marcador sem substituir');

const destino=join(RAIZ,dev?'dev.html':'index.html');
writeFileSync(destino,html);
console.log((dev?'dev.html':'index.html')+' gerado · '+manifesto.css.length+' CSS · '+manifesto.js.length+' JS · '+(html.length/1024).toFixed(0)+' KB');
