// Gera src/assets/js/24-modelos-catalogo.js a partir dos arquivos de
// integração do Drive (pasta "00 Painel BGL/Integração"):
//
//   node tools/catalogo-modelos.mjs <catalogo_modelos.json> <dicionario_campos.json>
//
// Só entram no código o código, a área, a subpasta, o título, o formato e os
// campos de cada modelo, mais a tabela de códigos renomeados (codigo_anterior
// → codigo). Ficam de fora:
//   • peca_de_origem: aponta para a pasta do cliente de onde a peça saiu;
//   • caminho, drive_id e url: o repositório é público e a página é servida
//     inteira a quem abrir. Os links chegam pelo mapa ou pelo catálogo
//     importados no sistema (Configurações → Google Drive), que ficam no Gist,
//     junto dos dados. Embaralhar o link não resolveria: a própria página
//     teria de desembaralhá-lo, e qualquer um faria o mesmo.
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
const TITULOS_NEUTROS={};

const AREAS=[
  'Trabalhista - Defesa Empresarial','Trabalhista - Reclamante','Cível - Petições Iniciais',
  'Cível - Respostas e Manifestações','Recursos','Execução e Cumprimento de Sentença',
  'Petições Intermediárias','Família','Criminal','Extrajudicial',
  'Consultivo - Auditoria Trabalhista','Gestão do Escritório',
];
const semChaves=c=>String(c).replace(/^\{\{|\}\}$/g,'');
const linhas=[],problemas=[],renomeados={};
for(const m of catalogo.modelos){
  const area=AREAS.indexOf(m.area);
  if(area<0)problemas.push(m.codigo+': área desconhecida "'+m.area+'"');
  const titulo=TITULOS_NEUTROS[m.codigo]||m.titulo;
  if(/\sx\s/i.test(titulo))problemas.push(m.codigo+': título com nome de parte ("'+titulo+'")');
  const sub=(m.subpasta||'').replace(/\\/g,'/');
  if(m.codigo_anterior&&m.codigo_anterior!==m.codigo)renomeados[m.codigo_anterior]=m.codigo;
  linhas.push(JSON.stringify([m.codigo,area,sub,titulo,m.formato,(m.campos||[]).map(semChaves)]));
}
// "22/10/2026" → "2026-10-22": comparada com a data do catálogo importado
const dm=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(catalogo.gerado_em||'');
const geradoEm=dm?dm[3]+'-'+dm[2]+'-'+dm[1]:String(catalogo.gerado_em||'').slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(geradoEm))problemas.push('gerado_em ilegível: "'+catalogo.gerado_em+'"');
if(problemas.length){console.error('Nada foi gerado:\n  '+problemas.join('\n  '));process.exit(1);}

const dic=Object.entries(campos).sort(([a],[b])=>a.localeCompare(b))
  .map(([k,v])=>'  '+JSON.stringify(semChaves(k))+':'+JSON.stringify(v)).join(',\n');
const saida=`// ═══════════════════════════════════════════════════════════
//  CATÁLOGO DE MODELOS — gerado por tools/catalogo-modelos.mjs
//  Não editar à mão. Fonte: catalogo_modelos.json (${catalogo.gerado_em||'sem data'}).
//  Sem links e sem a peça de origem: o repositório é público. Os links
//  vêm do mapa ou do catálogo importados em Configurações → Google Drive.
// ═══════════════════════════════════════════════════════════
const MODELOS_GERADO_EM='${geradoEm}';
const MODELOS_AREAS=${JSON.stringify(AREAS)};
// códigos trocados no Drive (anterior → atual). O arquivo é o mesmo, então o
// link guardado no mapa sob o código antigo continua valendo para o novo.
const MODELOS_RENOMEADOS=${JSON.stringify(renomeados)};
// [código, índice da área, subpasta, título, formato, campos]
const MODELOS_EMBUTIDOS=[
${linhas.join(',\n')}
];
// descrição de cada campo {{CAMPO}} usado nos modelos
const MODELOS_CAMPOS={
${dic}
};
`;
if(/google\.com|drive_id|peca_de_origem|01 Clientes/i.test(saida)){console.error('Nada foi gerado: a saída traria link ou caminho do Drive.');process.exit(1);}
writeFileSync(join(RAIZ,'src/assets/js/24-modelos-catalogo.js'),saida);
console.log('24-modelos-catalogo.js gerado · '+linhas.length+' modelos · '+Object.keys(campos).length+' campos · '+Object.keys(renomeados).length+' códigos renomeados');
