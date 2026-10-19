// ═══════════════════════════════════════════════════════════
//  DADOS-SEMENTE — INTENCIONALMENTE VAZIOS
//  Estas listas continham os dados reais do escritório escritos aqui
//  dentro. Como este arquivo é servido pela web e chega inteiro a quem
//  abrir a página, isso expunha nomes, honorários, processos e telefones
//  de clientes. Foram esvaziadas.
//  Os dados verdadeiros ficam no Gist e são carregados no login; estas
//  listas só seriam usadas para semear um Gist novo e vazio. Para
//  recriar a base do zero, use Backup → Restaurar.
// ═══════════════════════════════════════════════════════════
// Lista vazia: os clientes reais vivem no Gist.
const SEED_CLIENTES=[];

// datas em ISO (aaaa-mm-dd); status Ativo/Arquivado por processo
// Lista vazia: os processos reais vivem no Gist.
const SEED_PROCESSOS=[];

// ─── IMPORTAÇÃO CRM: leads reais trazidos da planilha CRM_BGL_Dashboard.xlsx ───
// (aba "Cadastro" — importados uma única vez; ver flag DB.crmImportadoV1)
// Lista vazia: os leads reais vivem no Gist.
const SEED_LEADS_CRM_IMPORT=[];
const CAMPOS_JORNADA_CRM=['area','responsavel','categoriaOrigem','origemTexto','motivoBusca','urgencia','problema',
  'honorariosTexto','valorHonorarioEstimado','probabilidadeFechamento','objecaoPrincipal','categoriaObjecao',
  'honorariosObstaculo','inseguranca','canalFollowup','entrouContatoTexto','reuniaoAgendadaTexto',
  'compareceu','propostaEnviada','fechouCRM','statusCRM','motivoPerdaGanho','licoes','motivoPerda'];
function construirLeadCRM(d){
  const criadoEm=new Date(d.criadoEm+'T09:00:00').getTime();
  const lead={
    id:uid()+Math.random().toString(36).slice(2,4),
    nome:d.nome, tel:d.tel,
    criadoEm, atualizadoEm:Date.now(),
    checklist:{}, obs:'', score:null, statusLabel:'Pendente', convertido:false,
    statusAtendimento:d.statusAtendimento,
    followups:JSON.parse(JSON.stringify(d.followups||[])),
    // funil de vendas (regras de negócio): etapa de entrada, próxima ação e cadência de follow-up
    etapaEntradaEm:criadoEm, proximaAcaoEm:'', propostaEnviadaEm:(d.statusCRM==='Proposta enviada'||d.statusCRM==='Em negociação'||d.statusCRM==='Ganho'||d.statusCRM==='Perdido')?criadoEm:'',
    followupCadenciaGerada:false, reuniaoDataHora:'',
  };
  CAMPOS_JORNADA_CRM.forEach(k=>lead[k]=d[k]);
  return lead;
}
function criarLeadsCRMImport(){
  const trab=[],civel=[];
  SEED_LEADS_CRM_IMPORT.forEach(d=>{(d.mod==='civel'?civel:trab).push(construirLeadCRM(d));});
  return {trab,civel};
}
// acha um lead já existente que corresponda ao dado da planilha (por telefone ou nome)
function acharLeadImport(lista,d){
  const n2=(d.nome||'').trim().toLowerCase(), t2=(d.tel||'').replace(/\D/g,'');
  return lista.find(l=>{
    const n1=(l.nome||'').trim().toLowerCase(), t1=(l.tel||'').replace(/\D/g,'');
    if(t1&&t2&&t1===t2)return true;
    if(n1&&n1===n2)return true;
    if(n2.length>=5&&(n1.includes(n2)||n2.includes(n1)))return true;
    return false;
  });
}
// preenche num lead existente os campos da planilha que ainda estiverem vazios
function mesclarJornadaCRM(l,d){
  CAMPOS_JORNADA_CRM.forEach(k=>{
    const cur=l[k];
    const vazio=cur===undefined||cur===null||cur===''||cur===0||cur==='Novo';
    if(vazio&&d[k]!==undefined&&d[k]!==null&&d[k]!=='')l[k]=d[k];
  });
  if(!Array.isArray(l.followups)||!l.followups.length)l.followups=JSON.parse(JSON.stringify(d.followups||[]));
  if(!l.statusAtendimento||l.statusAtendimento==='responder')l.statusAtendimento=d.statusAtendimento;
}

// tarefas da rotina: tipo lead|inicial|peticao|prazo|audiencia|diligencia|outro
// resp Cecília|Thallys|Escritório · status pendente|andamento|concluido
// Lista vazia: as tarefas reais vivem no Gist.
const SEED_TAREFAS=[];

// tipos de tarefa configuráveis (edite em Configurações, sem precisar mexer no código)
const SEED_TIPOS_TAREFA=[
  {key:'lead',       lbl:'Leads a responder', cor:'#a9741b'},
  {key:'inicial',    lbl:'Iniciais a fazer',   cor:'#2f5d94'},
  {key:'peticao',    lbl:'Petições',           cor:'#16243d'},
  {key:'prazo',      lbl:'Prazos',             cor:'#b23b3b'},
  {key:'audiencia',  lbl:'Audiências',         cor:'#2f7d3f'},
  {key:'diligencia', lbl:'Diligências',        cor:'#8a93a6'},
  {key:'followup',   lbl:'Follow-up de leads', cor:'#6b4f9e'},
  {key:'outro',      lbl:'Outros',             cor:'#828b9c'},
];

