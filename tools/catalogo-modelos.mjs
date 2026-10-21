// Gera src/assets/js/24-modelos-catalogo.js a partir dos arquivos de
// integração do Drive (pasta "00 Painel BGL/Integração"):
//
//   node tools/catalogo-modelos.mjs <catalogo_modelos.json> <dicionario_campos.json>
//
// Só entram no código o código, a área, a subpasta, o título, o formato e os
// campos de cada modelo. Ficam de fora:
//   • peca_de_origem: aponta para a pasta do cliente de onde a peça saiu;
//   • caminho e links do Drive: o repositório é público e a página é servida
//     inteira a quem abrir. Os links chegam pelo mapa importado no sistema
//     (Configurações → Google Drive), que fica no Gist, junto dos dados.
// Um título no formato "Fulano x Beltrano" interrompe a geração: renomeie o
// modelo no Drive (ou ajuste aqui em TITULOS_NEUTROS) antes de publicar.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const RAIZ=join(dirname(fileURLToPath(import.meta.url)),'..');
const [arqCatalogo,arqCampos]=process.argv.slice(2);
if(!arqCatalogo||!arqCampos){
  console.error('uso: node tools/catalogo-modelos.mjs <catalogo_modelos.json> <dicionario_campos.json>');
  process.exit(1);
}
const catalogo=JSON.parse(readFileSync(arqCatalogo,'utf8'));
const campos=JSON.parse(readFileSync(arqCampos,'utf8'));

// títulos que, no Drive, ainda trazem o nome de uma das partes
const TITULOS_NEUTROS={'CIV-005':'Inicial - Consumidor (Dois Réus)'};

const AREAS=[
  'Trabalhista - Defesa Empresarial','Trabalhista - Reclamante','Cível - Petições Iniciais',
  'Cível - Respostas e Manifestações','Recursos','Execução e Cumprimento de Sentença',
  'Petições Intermediárias','Família','Criminal','Extrajudicial',
  'Consultivo - Auditoria Trabalhista','Gestão do Escritório',
];
const semChaves=c=>String(c).replace(/^\{\{|\}\}$/g,'');
const linhas=[],problemas=[];
for(const m of catalogo.modelos){
  const area=AREAS.indexOf(m.area);
  if(area<0)problemas.push(m.codigo+': área desconhecida "'+m.area+'"');
  const titulo=TITULOS_NEUTROS[m.codigo]||m.titulo;
  if(/\sx\s/i.test(titulo))problemas.push(m.codigo+': título com nome de parte ("'+titulo+'")');
  const sub=(m.subpasta||'').replace(/\\/g,'/');
  linhas.push(JSON.stringify([m.codigo,area,sub,titulo,m.formato,(m.campos||[]).map(semChaves)]));
}
if(problemas.length){console.error('Nada foi gerado:\n  '+problemas.join('\n  '));process.exit(1);}

const dic=Object.entries(campos).sort(([a],[b])=>a.localeCompare(b))
  .map(([k,v])=>'  '+JSON.stringify(semChaves(k))+':'+JSON.stringify(v)).join(',\n');
const saida=`// ═══════════════════════════════════════════════════════════
//  CATÁLOGO DE MODELOS — gerado por tools/catalogo-modelos.mjs
//  Não editar à mão. Fonte: catalogo_modelos.json (${catalogo.gerado_em||'sem data'}).
//  Sem links e sem a peça de origem: o repositório é público. Os links
//  vêm do mapa do Drive importado em Configurações → Google Drive.
// ═══════════════════════════════════════════════════════════
const MODELOS_AREAS=${JSON.stringify(AREAS)};
// [código, índice da área, subpasta, título, formato, campos]
const MODELOS_EMBUTIDOS=[
${linhas.join(',\n')}
];
// descrição de cada campo {{CAMPO}} usado nos modelos
const MODELOS_CAMPOS={
${dic}
};
`;
writeFileSync(join(RAIZ,'src/assets/js/24-modelos-catalogo.js'),saida);
console.log('24-modelos-catalogo.js gerado · '+linhas.length+' modelos · '+Object.keys(campos).length+' campos');
