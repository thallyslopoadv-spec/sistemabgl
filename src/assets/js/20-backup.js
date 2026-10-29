
// ═══════════════════════════════════════════════════════════
//  BACKUP, RESTAURAÇÃO E RELATÓRIO
//  ───────────────────────────────────────────────────────
//  Tudo o que o escritório digita vive num Gist do GitHub. Se o
//  Gist, o token ou a conta se perderem, os dados iriam junto.
//  Este módulo permite baixar, a qualquer momento, uma cópia
//  completa de TUDO (do dia e de todo o histórico) em 5 formatos:
//    1. .html → o sistema inteiro + os dados num arquivo só
//    2. .json → os dados brutos (é o que a restauração lê)
//    3. .js   → os mesmos dados prontos para incluir em outro HTML
//    4. .html → relatório legível / imprimível em PDF
//    5. .csv  → uma planilha por assunto (Excel)
// ═══════════════════════════════════════════════════════════
const BACKUP_VERSAO=2;
const BACKUP_AVISO_DIAS=7;                       // avisa quando passa disso sem baixar
const LS_ULTIMO_BACKUP='bgl_ultimo_backup';
const LS_HIST_PREFIXO='bgl_backup_local_';
const HIST_MAX=6;                                // cópias automáticas guardadas no navegador

function carimboArquivo(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes());
}
function baixarArquivo(nome,conteudo,mime){
  const blob=new Blob([conteudo],{type:(mime||'text/plain')+';charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=nome;a.style.display='none';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},2000);
}
function contarDados(d){
  d=d||{};
  const cli=Array.isArray(d.clientes)?d.clientes:[];
  const n=x=>Array.isArray(x)?x.length:0;
  return {
    clientes:cli.length,
    lancamentosDeClientes:cli.reduce((a,c)=>a+n(c.fin),0),
    processos:n(d.processos), tarefas:n(d.tarefas),
    leadsTrabalhista:n(d.leads), leadsCivel:n(d.leadsCivel),
    custosFixos:n(d.custosFixos), lancamentosDeCaixa:n(d.lancamentos),
    aportesDoFundo:n(d.fundoAportes), conteudos:n(d.conteudos),
    assessorias:n(d.assessorias),
    consultasDeAssessoria:(Array.isArray(d.assessorias)?d.assessorias:[]).reduce((a,x)=>a+n(x.consultas),0),
    mensagensChatGeral:n(d.chatGeral), usuarios:n(d.usuarios),
  };
}
function totalRegistros(t){return Object.values(t).reduce((a,b)=>a+b,0)}
function pacoteBackup(){
  return {
    _meta:{
      sistema:'BGL Advogados — Sistema interno',
      versaoBackup:BACKUP_VERSAO,
      geradoEm:new Date().toISOString(),
      geradoEmTexto:new Date().toLocaleString('pt-BR'),
      geradoPor:EU?(EU.nome+' <'+EU.user+'>'):'—',
      origem:MODO_OFFLINE?'cópia offline':(location.origin+location.pathname),
      totais:contarDados(DB),
      comoRestaurar:'Abra o sistema → botão de Backup (ícone de download na barra superior) → aba "Restaurar" → selecione este arquivo.',
    },
    dados:DB
  };
}
function marcarBackupFeito(){
  try{localStorage.setItem(LS_ULTIMO_BACKUP,String(Date.now()));}catch(e){}
  atualizarBadgeBackup();
  renderResumoBackup();
}
function atualizarBadgeBackup(){
  const badge=document.getElementById('backup-badge'),btn=document.getElementById('btn-backup');
  if(!badge||!btn)return;
  const ult=Number(localStorage.getItem(LS_ULTIMO_BACKUP)||0);
  const dias=ult?Math.floor((Date.now()-ult)/86400000):null;
  const atrasado=dias===null||dias>=BACKUP_AVISO_DIAS;
  badge.style.display=atrasado?'block':'none';
  btn.title=dias===null
    ? 'Backup dos dados — nenhuma cópia baixada ainda neste computador'
    : ('Backup dos dados — última cópia há '+dias+' dia(s)');
}

// ─── CÓPIAS AUTOMÁTICAS NO PRÓPRIO NAVEGADOR ───────────────
// Rede de segurança de curto prazo: guarda as últimas versões dos
// dados aqui mesmo, para desfazer um erro recente. NÃO substitui o
// backup baixado — some se o navegador for limpo ou o PC trocar.
let __histTimer=null;
function agendarBackupLocal(){
  if(__histTimer)clearTimeout(__histTimer);
  __histTimer=setTimeout(guardarBackupLocal,4000);
}
function chavesHistorico(){
  const ks=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith(LS_HIST_PREFIXO))ks.push(k);
  }
  return ks.sort(); // o timestamp no nome mantém a ordem cronológica
}
function podarHistorico(manter){
  const ks=chavesHistorico();
  while(ks.length>manter)localStorage.removeItem(ks.shift());
}
function guardarBackupLocal(){
  if(!DB||MODO_OFFLINE)return;
  const registro=JSON.stringify({em:Date.now(),totais:contarDados(DB),dados:DB});
  const gravar=()=>localStorage.setItem(LS_HIST_PREFIXO+Date.now(),registro);
  try{ podarHistorico(HIST_MAX-1); gravar(); }
  catch(e){
    // sem espaço no navegador: mantém só a cópia mais nova
    try{ podarHistorico(0); gravar(); }
    catch(e2){ console.warn('[backup local] não coube no navegador',e2); }
  }
}
function renderHistoricoBackup(){
  const el=document.getElementById('bk-historico');
  if(!el)return;
  const ks=chavesHistorico().reverse();
  if(!ks.length){el.innerHTML='<p class="bk-info" style="margin:0">Nenhuma cópia automática ainda — ela é criada logo após a próxima alteração nos dados.</p>';return;}
  el.innerHTML=ks.map(k=>{
    let r={};try{r=JSON.parse(localStorage.getItem(k))||{}}catch(e){}
    const quando=r.em?fmtDataHora(r.em):'—';
    const tot=r.totais?totalRegistros(r.totais):0;
    return '<div class="bk-hist"><span><b>'+esc(quando)+'</b> · '+tot+' registros</span>'+
      '<span style="display:flex;gap:6px">'+
      '<button onclick="baixarBackupLocal(\''+k+'\')">Baixar</button>'+
      '<button onclick="restaurarBackupLocal(\''+k+'\')">Restaurar</button>'+
      '</span></div>';
  }).join('');
}
function lerHistorico(k){
  try{const r=JSON.parse(localStorage.getItem(k));return r&&r.dados?r:null}catch(e){return null}
}
function baixarBackupLocal(k){
  const r=lerHistorico(k);
  if(!r){alert('Esta cópia não pôde ser lida.');return;}
  const d=new Date(r.em),p=n=>String(n).padStart(2,'0');
  const carimbo=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+p(d.getMinutes());
  baixarArquivo('bgl-backup-automatico-'+carimbo+'.json',
    JSON.stringify({_meta:{sistema:'BGL Advogados — Sistema interno',versaoBackup:BACKUP_VERSAO,geradoEm:new Date(r.em).toISOString(),origem:'cópia automática do navegador',totais:r.totais},dados:r.dados},null,2),
    'application/json');
}
function restaurarBackupLocal(k){
  const r=lerHistorico(k);
  if(!r){alert('Esta cópia não pôde ser lida.');return;}
  aplicarRestauracao(r.dados,'cópia automática de '+fmtDataHora(r.em));
}

// ─── 1. SISTEMA COMPLETO (.html autocontido) ───────────────
// Pega o código-fonte desta própria página e embute os dados
// dentro dele. O arquivo resultante é o sistema inteiro: abrindo
// no navegador, tudo volta a funcionar sem internet, sem Gist e
// sem token — em modo somente-leitura protegido pela mesma senha.
const MARCA_EMBUTIDA='bgl-dados-embutidos';
function capturarDOMAtual(){
  const login=document.getElementById('screen-login'),dash=document.getElementById('screen-dashboard');
  const abertos=Array.from(document.querySelectorAll('.overlay.open'));
  const l0=login.style.display,d0=dash.style.display;
  abertos.forEach(o=>o.classList.remove('open'));
  login.style.display='';dash.style.display='';
  const html='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  login.style.display=l0;dash.style.display=d0;
  abertos.forEach(o=>o.classList.add('open'));
  return html;
}
async function obterFontePagina(){
  try{
    const r=await fetch(window.location.href,{cache:'no-store'});
    if(r.ok){
      const t=await r.text();
      if(/<\/html>/i.test(t)&&/id="screen-login"/.test(t))return t;
    }
  }catch(e){/* file:// ou offline → usa o DOM atual */}
  return capturarDOMAtual();
}
async function baixarSistemaCompleto(btn){
  if(btn){btn.disabled=true;}
  try{
    let fonte=await obterFontePagina();
    // remove um bloco de dados de uma cópia anterior, para não duplicar
    fonte=fonte.replace(new RegExp('<script id="'+MARCA_EMBUTIDA+'"[\\s\\S]*?<\\/script>\\s*','i'),'');
    const json=JSON.stringify(pacoteBackup()).replace(/</g,'\\u003c').replace(/[\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16));
    const bloco='<script id="'+MARCA_EMBUTIDA+'" type="application/json">'+json+'<\/script>\n';
    const aviso='<!-- CÓPIA DE SEGURANÇA DO SISTEMA BGL — gerada em '+new Date().toLocaleString('pt-BR')+
      '.\n     Este arquivo contém DADOS SIGILOSOS de clientes: guarde em local seguro e nunca publique.\n'+
      '     Para usar: abra este arquivo no navegador e entre com o mesmo usuário e senha. -->\n';
    if(/<\/head>/i.test(fonte))fonte=fonte.replace(/<\/head>/i,bloco+'</head>');
    else fonte=bloco+fonte;
    fonte=aviso+fonte;
    baixarArquivo('bgl-sistema-completo-'+carimboArquivo()+'.html',fonte,'text/html');
    marcarBackupFeito();
  }catch(e){
    console.warn(e);
    alert('Não foi possível gerar o arquivo do sistema completo: '+e.message+'\n\nBaixe pelo menos o "Backup dos dados (.json)", que preserva todas as informações.');
  }finally{
    if(btn)btn.disabled=false;
  }
}
// lê os dados embutidos quando esta página É uma cópia de segurança
function dadosEmbutidos(){
  const el=document.getElementById(MARCA_EMBUTIDA);
  if(!el)return null;
  try{
    const p=JSON.parse(el.textContent);
    const d=p&&p.dados?p.dados:p;
    return (d&&Array.isArray(d.usuarios))?{dados:d,meta:(p&&p._meta)||{}}:null;
  }catch(e){console.warn('[backup embutido] ilegível',e);return null;}
}

// ─── 2. DADOS BRUTOS (.json) ───────────────────────────────
function baixarBackupJSON(){
  baixarArquivo('bgl-backup-'+carimboArquivo()+'.json',JSON.stringify(pacoteBackup(),null,2),'application/json');
  marcarBackupFeito();
}

// ─── 3. DADOS PRONTOS PARA OUTRO HTML (.js) ────────────────
function baixarBackupJS(){
  const p=pacoteBackup();
  const js=
'/* ══════════════════════════════════════════════════════════\n'+
'   BGL ADVOGADOS — dados do sistema\n'+
'   Gerado em: '+p._meta.geradoEmTexto+' por '+p._meta.geradoPor+'\n'+
'   Registros: '+totalRegistros(p._meta.totais)+'\n'+
'   ──────────────────────────────────────────────────────────\n'+
'   COMO USAR EM QUALQUER OUTRO HTML — basta uma linha:\n'+
'       <script src="'+('bgl-dados-'+carimboArquivo()+'.js')+'"><\/script>\n'+
'   Depois disso os dados estão prontos em:\n'+
'       window.BGL_DADOS            → tudo (clientes, processos, financeiro…)\n'+
'       window.BGL_DADOS.clientes   → lista de clientes\n'+
'       window.BGL_DADOS.processos  → lista de processos\n'+
'       window.BGL_DADOS.leads      → funil trabalhista\n'+
'       window.BGL_DADOS.leadsCivel → funil cível\n'+
'       window.BGL_DADOS_META       → data, autor e totais desta cópia\n'+
'   ATENÇÃO: contém dados sigilosos de clientes. Não publique.\n'+
'   ══════════════════════════════════════════════════════════ */\n'+
'window.BGL_DADOS_META = '+JSON.stringify(p._meta,null,2)+';\n\n'+
'window.BGL_DADOS = '+JSON.stringify(p.dados,null,2)+';\n\n'+
'if (typeof module !== "undefined" && module.exports) { module.exports = window.BGL_DADOS; }\n';
  baixarArquivo('bgl-dados-'+carimboArquivo()+'.js',js,'application/javascript');
  marcarBackupFeito();
}

// ─── 4. RELATÓRIO LEGÍVEL (.html → imprimir em PDF) ────────
function relTabela(cols,linhas){
  if(!linhas.length)return '<p class="vazio">Nada registrado.</p>';
  return '<table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+
    linhas.map(l=>'<tr>'+l.map(c=>'<td>'+(c==null?'':c)+'</td>').join('')+'</tr>').join('')+
    '</tbody></table>';
}
function relFichaCampos(obj,rotulos){
  const its=[];
  Object.keys(rotulos).forEach(k=>{
    let v=obj[k];
    if(v===undefined||v===null||v===''||v===false)return;
    if(typeof v==='number'&&!v)return;
    if(k==='valorHonorarioEstimado')v=fmt(v);
    if(k==='probabilidadeFechamento')v=Math.round(v*100)+'%';
    if(k==='criadoEm'||k==='atualizadoEm'||k==='etapaEntradaEm'||k==='propostaEnviadaEm')v=fmtDataHora(v);
    if(v===true)v='sim';
    its.push('<div class="ficha-item"><span>'+esc(rotulos[k])+'</span><b>'+esc(String(v))+'</b></div>');
  });
  return its.length?'<div class="ficha">'+its.join('')+'</div>':'';
}
const ROTULOS_LEAD={
  tel:'Telefone',area:'Área',responsavel:'Responsável',statusCRM:'Etapa no funil',statusAtendimento:'Status do atendimento',
  statusLabel:'Situação',score:'Score de viabilidade',categoriaOrigem:'Como chegou',origemTexto:'Detalhe da origem',
  motivoBusca:'Motivo da procura',urgencia:'Urgência',problema:'Problema relatado',honorariosTexto:'Honorários conversados',
  valorHonorarioEstimado:'Valor estimado',probabilidadeFechamento:'Probabilidade de fechar',objecaoPrincipal:'Objeção principal',
  categoriaObjecao:'Categoria da objeção',honorariosObstaculo:'Honorários foram obstáculo',inseguranca:'Insegurança',
  canalFollowup:'Canal de follow-up',entrouContatoTexto:'Contato feito',reuniaoAgendadaTexto:'Reunião agendada',
  reuniaoDataHora:'Data/hora da reunião',compareceu:'Compareceu',propostaEnviada:'Proposta enviada',
  propostaEnviadaEm:'Proposta enviada em',fechouCRM:'Fechou',motivoPerda:'Motivo da perda',motivoPerdaGanho:'Motivo (ganho/perda)',
  licoes:'Lições aprendidas',proximaAcaoEm:'Próxima ação em',obs:'Observações',criadoEm:'Criado em',atualizadoEm:'Atualizado em',
};
function relLeads(lista,titulo){
  if(!lista.length)return '<h3>'+esc(titulo)+'</h3><p class="vazio">Nenhum lead registrado.</p>';
  const tab=relTabela(['Nome','Telefone','Etapa','Responsável','Valor estimado','Criado em','Convertido'],
    lista.map(l=>[esc(l.nome||''),esc(l.tel||''),esc(l.statusCRM||l.statusLabel||''),esc(l.responsavel||''),
      esc(fmt(Number(l.valorHonorarioEstimado)||0)),esc(l.criadoEm?fmtDataHora(l.criadoEm):''),l.convertido?'sim':'']));
  const fichas=lista.map(l=>{
    const fu=(l.followups||[]).length
      ? '<div class="sub-bloco"><b>Follow-ups</b>'+relTabela(['Data','Canal','Anotação'],
          l.followups.map(f=>[esc(f.data?fmtData(f.data):(f.em?fmtDataHora(f.em):'')),esc(f.canal||''),esc(f.texto||f.obs||'')]))+'</div>'
      : '';
    const ck=l.checklist&&Object.keys(l.checklist).length
      ? '<div class="sub-bloco"><b>Checklist de viabilidade</b><pre>'+esc(JSON.stringify(l.checklist))+'</pre></div>'
      : '';
    return '<div class="bloco"><h4>'+esc(l.nome||'(sem nome)')+'</h4>'+relFichaCampos(l,ROTULOS_LEAD)+fu+ck+'</div>';
  }).join('');
  return '<h3>'+esc(titulo)+' — '+lista.length+' lead(s)</h3>'+tab+'<div class="fichas">'+fichas+'</div>';
}
function gerarRelatorioHTML(){
  const agora=new Date();
  const t=contarDados(DB);
  const S=[];
  const seguro=(fn,padrao)=>{try{return fn()}catch(e){return padrao}};

  // ── capa e resumo ──
  S.push('<h2>Resumo geral</h2>');
  S.push(relTabela(['Informação','Quantidade'],[
    ['Clientes na carteira',String(t.clientes)],
    ['Lançamentos financeiros de clientes',String(t.lancamentosDeClientes)],
    ['Processos',String(t.processos)],
    ['Tarefas na rotina',String(t.tarefas)],
    ['Leads — trabalhista',String(t.leadsTrabalhista)],
    ['Leads — cível',String(t.leadsCivel)],
    ['Custos fixos cadastrados',String(t.custosFixos)],
    ['Lançamentos de caixa',String(t.lancamentosDeCaixa)],
    ['Aportes no fundo do escritório',String(t.aportesDoFundo)],
    ['Pautas de conteúdo',String(t.conteudos)],
    ['Assessorias mensais',String(t.assessorias)],
    ['Consultas de assessoria',String(t.consultasDeAssessoria)],
    ['<b>Total de registros</b>','<b>'+totalRegistros(t)+'</b>'],
  ]));

  // ── panorama financeiro ──
  const recebido=DB.clientes.reduce((a,c)=>a+clienteAlc(c),0);
  const previstoCli=DB.clientes.reduce((a,c)=>a+clientePrev(c),0);
  S.push('<h2>Panorama financeiro</h2>');
  S.push(relTabela(['Indicador','Valor'],[
    ['Saldo inicial informado',esc(fmt((DB.saldoInicial&&DB.saldoInicial.valor)||0))],
    ['Caixa atual (calculado)',esc(fmt(seguro(caixaAtualValor,0)))],
    ['Total já recebido de clientes',esc(fmt(recebido))],
    ['Total previsto de clientes',esc(fmt(previstoCli))],
    ['Receita prevista do funil de leads',esc(fmt(seguro(receitaPrevistaLeads,0)))],
    ['Guardado no fundo do escritório',esc(fmt(seguro(guardadoFundoEscritorio,0)))],
    ['Custos fixos mensais ativos',esc(fmt((DB.custosFixos||[]).filter(c=>c.ativo!==false).reduce((a,c)=>a+(c.valor||0),0)))],
  ]));

  // ── clientes ──
  S.push('<h2>Carteira de clientes</h2>');
  S.push(relTabela(['Cliente','Tipo','Status','Entrada','Demandas','Recebido','A receber'],
    DB.clientes.map(c=>[esc(c.nome),esc(c.tipo||''),esc(c.status||''),esc(fmtData(getEntrada(c))),esc(c.demandas||''),
      esc(fmt(clienteAlc(c))),esc(fmt(clientePrev(c)))])));
  S.push('<div class="fichas">'+DB.clientes.map(c=>{
    const fin=relTabela(['Descrição','Tipo','Valor','Data','Observações'],
      (c.fin||[]).map(f=>[esc(f.d||''),esc(f.t==='alc'?'recebido':f.t==='prev'?'a receber':'saída'),esc(fmt(f.v||0)),
        esc(f.dt?fmtData(f.dt):''),esc([f.dependeTerceiro?'depende de terceiro':'',f.aceiteVerbal?'aceite verbal':'',
        f.dataPrevistaRecebimento?('previsto p/ '+fmtData(f.dataPrevistaRecebimento)):''].filter(Boolean).join(' · '))]));
    const procs=relTabela(['Processo','Polo','Ativo','Passivo','Distribuição','Status','Resultado'],
      procsDe(c.id).map(p=>[esc(p.num||''),esc(p.polo==='a'?'autor':'réu'),esc(p.ativo||''),esc(p.passivo||''),
        esc(fmtData(p.dist||'')),esc(p.status||''),esc(p.resultado||'')]));
    const tars=relTabela(['Tarefa','Tipo','Responsável','Prazo','Status'],
      tarefasDe(c.id).map(x=>[esc(x.titulo||''),esc(tipoInfo(x.tipo).lbl),esc(x.resp||''),esc(x.prazo?fmtData(x.prazo):''),esc(ST_LBL[x.status]||x.status||'')]));
    const links=Object.keys(c.drive||{}).filter(k=>c.drive[k]).map(k=>'<div class="ficha-item"><span>'+esc(k)+'</span><b>'+esc(c.drive[k])+'</b></div>').join('');
    const chat=(c.chat||[]).length?'<div class="sub-bloco"><b>Anotações internas</b>'+relTabela(['Quando','Quem','Mensagem'],
      c.chat.map(m=>[esc(m.em?fmtDataHora(m.em):''),esc(m.autor||m.nome||''),esc(m.txt||m.texto||'')]))+'</div>':'';
    const conversa=(c.conversa&&c.conversa.texto)
      ? '<div class="sub-bloco"><b>Conversa importada</b> <span class="mini">(importada em '+esc(fmtDataHora(c.conversa.importadoEm))+')</span><details><summary>ver conversa completa</summary><pre>'+esc(c.conversa.texto)+'</pre></details></div>'
      : '';
    return '<div class="bloco"><h4>'+esc(c.nome)+'</h4>'+
      relFichaCampos(c,{curto:'Apelido',tipo:'Tipo',status:'Status',demandas:'Demandas',entrada:'Entrada'})+
      (links?'<div class="sub-bloco"><b>Pastas no Drive</b><div class="ficha">'+links+'</div></div>':'')+
      '<div class="sub-bloco"><b>Financeiro</b>'+fin+'</div>'+
      '<div class="sub-bloco"><b>Processos</b>'+procs+'</div>'+
      '<div class="sub-bloco"><b>Tarefas</b>'+tars+'</div>'+chat+conversa+'</div>';
  }).join('')+'</div>');

  // ── processos e teses ──
  S.push('<h2>Processos</h2>');
  S.push(relTabela(['Processo','Cliente','Polo','Ativo','Passivo','Distribuição','Status','Êxito %','Resultado'],
    DB.processos.map(p=>[esc(p.num||''),esc(nomeCliente(p.cid)||''),esc(p.polo==='a'?'autor':'réu'),esc(p.ativo||''),
      esc(p.passivo||''),esc(fmtData(p.dist||'')),esc(p.status||''),esc(p.exito!=null?String(p.exito):''),esc(p.resultado||'')])));
  const comTese=DB.processos.filter(p=>p.teseTitulo||p.teseTexto);
  S.push('<h3>Teses registradas</h3>');
  S.push(comTese.length?'<div class="fichas">'+comTese.map(p=>
    '<div class="bloco"><h4>'+esc(p.teseTitulo||'(sem título)')+'</h4>'+
    '<div class="mini">Processo '+esc(p.num||'')+' — '+esc(nomeCliente(p.cid)||'')+'</div>'+
    '<pre>'+esc(p.teseTexto||'')+'</pre></div>').join('')+'</div>':'<p class="vazio">Nenhuma tese registrada.</p>');

  // ── rotina ──
  S.push('<h2>Rotina — tarefas</h2>');
  S.push(relTabela(['Tarefa','Cliente','Tipo','Responsável','Etapa atual','Prazo','Status','Concluída em','Cumprimento do prazo'],
    DB.tarefas.map(x=>{
      const ci=conclusaoInfo(x);
      return [esc(x.titulo||''),esc(nomeCliente(x.cid)||''),esc(tipoInfo(x.tipo).lbl),esc(x.resp||''),
        esc(x.statusExec||''),
        esc(x.prazo?fmtData(x.prazo):''),esc(ST_LBL[x.status]||x.status||''),
        esc(ci&&ci.data?fmtData(ci.data):''),esc(ci?CONC_CAT_LBL[ci.cat]+(ci.cat==='atrasada'?' ('+plural(ci.dias,'')+')':ci.cat==='antecipada'?' ('+plural(-ci.dias,'')+')':''):'')];
    })));

  // ── assessorias ──
  const ass=Array.isArray(DB.assessorias)?DB.assessorias:[];
  S.push('<h2>Assessorias mensais</h2>');
  S.push(ass.length?relTabela(['Cliente','Objeto','Situação','Responsável','Consultas/mês','Mensalidade','Início','Usadas no mês','Parcelas pagas','Em aberto'],
    ass.map(a=>{
      const k=seguro(()=>cotaAssessoria(a),{usadas:0,cota:0});
      const ps=seguro(()=>parcelasDaAssessoria(a),[]);
      const pagas=ps.filter(f=>f.t==='alc');
      const aberto=ps.filter(f=>f.t!=='alc').reduce((x,f)=>x+(f.v||0),0);
      return [esc(nomeCliente(a.cid)||''),esc(a.titulo||''),esc(a.status||''),esc(a.resp||''),
        esc(a.consultasCiclo?String(a.consultasCiclo):'—'),esc(a.valor?fmt(a.valor):'—'),esc(a.inicio?fmtData(a.inicio):''),
        esc(k.cota?k.usadas+' de '+k.cota:String(k.usadas)),esc(pagas.length+' de '+ps.length),esc(fmt(aberto))];
    })):'<p class="vazio">Nenhuma assessoria cadastrada.</p>');
  const comConsultas=ass.filter(a=>(a.consultas||[]).length);
  if(comConsultas.length){
    S.push('<h3>Consultas e pedidos</h3>');
    S.push(relTabela(['Cliente','Pedido','Tipo','Quem pediu','Competência','Pedida em','Prazo','Situação','Entregue em'],
      comConsultas.flatMap(a=>(a.consultas||[]).map(c=>[
        esc(nomeCliente(a.cid)||''),esc(c.titulo||''),esc(seguro(()=>tipoConsulta(c.tipo).lbl,'')),esc(c.solicitante||''),
        esc(seguro(()=>fmtComp(c.competencia),'')),esc(c.solicitadoEm?fmtData(c.solicitadoEm):''),
        esc(c.prazo?fmtData(c.prazo):''),esc(ST_CONSULTA[c.status]||c.status||''),esc(c.entregaEm?fmtData(c.entregaEm):'')]))));
  }

  // ── funil ──
  S.push('<h2>Funil de vendas (CRM)</h2>');
  S.push(relLeads(DB.leads||[],'Trabalhista'));
  S.push(relLeads(DB.leadsCivel||[],'Cível'));

  // ── caixa ──
  S.push('<h2>Caixa e custos</h2>');
  S.push('<h3>Custos fixos</h3>');
  S.push(relTabela(['Custo','Categoria','Valor','Vencimento','Ativo'],
    (DB.custosFixos||[]).map(c=>[esc(c.nome||''),esc(c.categoria||''),esc(fmt(c.valor||0)),
      esc(c.vencimento?('dia '+c.vencimento):''),c.ativo===false?'não':'sim'])));
  S.push('<h3>Lançamentos de caixa</h3>');
  S.push(relTabela(['Data','Descrição','Categoria','Tipo','Valor'],
    (DB.lancamentos||[]).slice().sort((a,b)=>String(a.data).localeCompare(String(b.data)))
      .map(l=>[esc(l.data?fmtData(l.data):''),esc(l.descricao||''),esc(l.categoria||''),esc(l.tipo||''),esc(fmt(l.valor||0))])));
  S.push('<h3>Fundo do escritório</h3>');
  S.push(relTabela(['Data','Valor','Observação'],
    (DB.fundoAportes||[]).map(f=>[esc(f.data?fmtData(f.data):''),esc(fmt(f.valor||0)),esc(f.obs||'')])));

  // ── comercial ──
  S.push('<h2>Comercial — conteúdos</h2>');
  S.push(relTabela(['Título','Tipo','Tema','Responsável','Data prevista','Publicado em','Status','Link'],
    (DB.conteudos||[]).map(c=>[esc(c.titulo||''),esc(c.tipo||''),esc(c.tema||''),esc(c.resp||''),
      esc(c.dataPrevista?fmtData(c.dataPrevista):''),esc(c.dataPublicacao?fmtData(c.dataPublicacao):''),
      esc(CONTEUDO_ST_LBL[c.status]||c.status||''),esc(c.link||'')])));

  // ── chat geral e usuários ──
  if((DB.chatGeral||[]).length){
    S.push('<h2>Mural interno</h2>');
    S.push(relTabela(['Quando','Quem','Mensagem'],
      DB.chatGeral.map(m=>[esc(m.em?fmtDataHora(m.em):''),esc(m.autor||m.nome||''),esc(m.txt||m.texto||'')])));
  }
  S.push('<h2>Usuários do sistema</h2>');
  S.push('<p class="mini">As senhas não aparecem neste relatório. Elas só existem, em forma cifrada, dentro do backup .json / .html.</p>');
  S.push(relTabela(['Nome','Login'],(DB.usuarios||[]).map(u=>[esc(u.nome||''),esc(u.user||'')])));

  return '<!DOCTYPE html>\n<html lang="pt-BR"><head><meta charset="UTF-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">'+
    '<meta name="robots" content="noindex, nofollow">'+
    '<title>BGL Advogados — Relatório completo dos dados ('+agora.toLocaleDateString('pt-BR')+')</title><style>'+
    '*{box-sizing:border-box;margin:0;padding:0}'+
    'body{font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:13px;color:#1b2533;background:#f4efe6;padding:34px 20px;line-height:1.5}'+
    '.folha{max-width:1000px;margin:0 auto;background:#fff;border:1px solid #e9e2d4;border-radius:12px;padding:38px 40px}'+
    '.capa{border-bottom:2px solid #16243d;padding-bottom:18px;margin-bottom:26px}'+
    '.capa h1{font-family:Georgia,"Times New Roman",serif;font-size:27px;color:#16243d;letter-spacing:.02em}'+
    '.capa .sub{font-size:12px;color:#828b9c;margin-top:6px;text-transform:uppercase;letter-spacing:.14em}'+
    '.capa .meta{font-size:12.5px;color:#4a5466;margin-top:12px}'+
    '.aviso{background:rgba(169,116,27,.12);border:1px solid rgba(169,116,27,.3);color:#8a5e12;border-radius:6px;padding:11px 14px;font-size:12px;margin:18px 0 26px}'+
    'h2{font-family:Georgia,serif;font-size:20px;color:#16243d;margin:34px 0 14px;padding-bottom:7px;border-bottom:1px solid rgba(22,36,61,.16)}'+
    'h3{font-size:15px;color:#16243d;margin:22px 0 10px}'+
    'h4{font-size:14.5px;color:#16243d;margin-bottom:8px}'+
    'table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}'+
    'th,td{border:1px solid rgba(22,36,61,.12);padding:6px 9px;text-align:left;vertical-align:top}'+
    'th{background:#f4efe6;font-weight:600;color:#16243d;white-space:nowrap}'+
    'tbody tr:nth-child(even){background:#faf7f1}'+
    '.bloco{border:1px solid rgba(22,36,61,.14);border-radius:8px;padding:16px 18px;margin-bottom:16px;background:#fff;page-break-inside:avoid}'+
    '.sub-bloco{margin-top:12px}.sub-bloco>b{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:#4a5466;display:block;margin-bottom:6px}'+
    '.ficha{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px 16px;margin-bottom:8px}'+
    '.ficha-item span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#828b9c}'+
    '.ficha-item b{font-size:12.5px;font-weight:500;color:#1b2533;word-break:break-word}'+
    '.vazio{font-size:12px;color:#828b9c;font-style:italic;margin-bottom:12px}'+
    '.mini{font-size:11.5px;color:#828b9c;margin-bottom:8px}'+
    'pre{white-space:pre-wrap;word-break:break-word;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:11.5px;background:#faf7f1;border:1px solid rgba(22,36,61,.1);border-radius:6px;padding:10px;margin-top:6px}'+
    'details summary{cursor:pointer;font-size:12px;color:#2f5d94;margin-top:4px}'+
    '@media print{body{background:#fff;padding:0}.folha{border:none;border-radius:0;padding:0;max-width:none}details{display:block}details>summary{display:none}h2{page-break-after:avoid}}'+
    '</style></head><body><div class="folha">'+
    '<div class="capa"><h1>BGL Advogados</h1><div class="sub">Relatório completo dos dados do sistema</div>'+
    '<div class="meta">Gerado em '+esc(agora.toLocaleString('pt-BR'))+(EU?(' por '+esc(EU.nome)):'')+
    ' · '+totalRegistros(t)+' registros</div></div>'+
    '<div class="aviso"><b>Documento sigiloso.</b> Contém dados de clientes, valores e informações processuais protegidos por sigilo profissional (art. 34, VII, do Estatuto da OAB) e pela LGPD. Guarde em local seguro e não compartilhe.</div>'+
    S.join('\n')+
    '<p class="mini" style="margin-top:38px;border-top:1px solid rgba(22,36,61,.12);padding-top:14px">Relatório gerado automaticamente pelo Sistema BGL. Para restaurar os dados no sistema, use o arquivo de backup <b>.json</b> ou <b>.html</b> — este relatório é somente para leitura.</p>'+
    '</div></body></html>';
}
function baixarRelatorio(){
  baixarArquivo('bgl-relatorio-'+carimboArquivo()+'.html',gerarRelatorioHTML(),'text/html');
  marcarBackupFeito();
}

// ─── 5. PLANILHAS (.csv) ───────────────────────────────────
function csvCampo(v){
  const s=String(v==null?'':v);
  return /[",;\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function csvTexto(cols,linhas){
  // ';' e BOM para o Excel em português abrir certo, sem passos extras
  return '﻿'+[cols].concat(linhas).map(l=>l.map(csvCampo).join(';')).join('\r\n');
}
function planilhasBackup(){
  const cli=DB.clientes||[];
  return [
    {nome:'clientes',cols:['id','nome','apelido','tipo','status','entrada','demandas','recebido','a_receber','saidas'],
     linhas:cli.map(c=>[c.id,c.nome,c.curto,c.tipo,c.status,getEntrada(c),c.demandas,clienteAlc(c),clientePrev(c),clienteSaida(c)])},
    {nome:'financeiro-clientes',cols:['cliente','descricao','tipo','valor','data','depende_terceiro','aceite_verbal','previsto_para'],
     linhas:cli.flatMap(c=>(c.fin||[]).map(f=>[c.nome,f.d,f.t==='alc'?'recebido':f.t==='prev'?'a receber':'saida',f.v,f.dt,
       f.dependeTerceiro?'sim':'',f.aceiteVerbal?'sim':'',f.dataPrevistaRecebimento||'']))},
    {nome:'processos',cols:['numero','cliente','polo','ativo','passivo','distribuicao','status','exito','resultado','tese'],
     linhas:(DB.processos||[]).map(p=>[p.num,nomeCliente(p.cid),p.polo==='a'?'autor':'reu',p.ativo,p.passivo,p.dist,p.status,p.exito,p.resultado,p.teseTitulo])},
    {nome:'tarefas',cols:['titulo','cliente','tipo','responsavel','prazo','status','etapa_atual','etapa_atualizada_em','concluida_em','cumprimento_prazo','dias_de_atraso'],
     linhas:(DB.tarefas||[]).map(t=>{
       const ci=conclusaoInfo(t);
       return [t.titulo,nomeCliente(t.cid),tipoInfo(t.tipo).lbl,t.resp,t.prazo,ST_LBL[t.status]||t.status,
         t.statusExec||'',t.statusExecEm?new Date(t.statusExecEm).toLocaleString('pt-BR'):'',
         ci?ci.data:'',ci?CONC_CAT_LBL[ci.cat]:'',ci&&ci.dias!==null?ci.dias:''];
     })},
    {nome:'leads',cols:['area_do_funil','nome','telefone','etapa','responsavel','origem','valor_estimado','probabilidade','proposta_enviada','motivo_perda','criado_em','convertido'],
     linhas:[['leads',DB.leads||[]],['leadsCivel',DB.leadsCivel||[]]].flatMap(([mod,lista])=>lista.map(l=>
       [mod==='leadsCivel'?'civel':'trabalhista',l.nome,l.tel,l.statusCRM||l.statusLabel,l.responsavel,l.categoriaOrigem,
        l.valorHonorarioEstimado,l.probabilidadeFechamento,l.propostaEnviada,l.motivoPerda,
        l.criadoEm?new Date(l.criadoEm).toLocaleString('pt-BR'):'',l.convertido?'sim':'']))},
    {nome:'custos-fixos',cols:['nome','categoria','valor','dia_vencimento','ativo'],
     linhas:(DB.custosFixos||[]).map(c=>[c.nome,c.categoria,c.valor,c.vencimento,c.ativo===false?'nao':'sim'])},
    {nome:'lancamentos-caixa',cols:['data','descricao','categoria','tipo','valor'],
     linhas:(DB.lancamentos||[]).map(l=>[l.data,l.descricao,l.categoria,l.tipo,l.valor])},
    {nome:'fundo-escritorio',cols:['data','valor','observacao'],
     linhas:(DB.fundoAportes||[]).map(f=>[f.data,f.valor,f.obs])},
    {nome:'conteudos',cols:['titulo','tipo','tema','responsavel','data_prevista','publicado_em','status','link'],
     linhas:(DB.conteudos||[]).map(c=>[c.titulo,c.tipo,c.tema,c.resp,c.dataPrevista,c.dataPublicacao,CONTEUDO_ST_LBL[c.status]||c.status,c.link])},
  ];
}
function baixarPlanilhas(){
  const carimbo=carimboArquivo();
  const arqs=planilhasBackup();
  // baixa em sequência: navegadores bloqueiam vários downloads disparados juntos
  arqs.forEach((p,i)=>setTimeout(()=>{
    baixarArquivo('bgl-'+p.nome+'-'+carimbo+'.csv',csvTexto(p.cols,p.linhas),'text/csv');
    if(i===arqs.length-1)marcarBackupFeito();
  },i*450));
}

// ─── BAIXAR TUDO DE UMA VEZ ────────────────────────────────
async function baixarBackupCompletoTudo(btn){
  if(btn){btn.disabled=true;btn.textContent='Gerando…';}
  try{
    await baixarSistemaCompleto();
    await new Promise(r=>setTimeout(r,500));
    baixarBackupJSON();
    await new Promise(r=>setTimeout(r,500));
    baixarBackupJS();
    await new Promise(r=>setTimeout(r,500));
    baixarRelatorio();
    await new Promise(r=>setTimeout(r,500));
    baixarPlanilhas();
    marcarBackupFeito();
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML='<i class="ti ti-download" style="margin-right:6px"></i>Baixar tudo de uma vez';}
  }
}

// ─── RESTAURAÇÃO ───────────────────────────────────────────
// Aceita o .json, o .html do sistema completo, o relatório não
// (ele é só leitura) e o .js de dados prontos.
function extrairDadosDeTexto(txt){
  const t=(txt||'').trim();
  const tentar=s=>{try{const j=JSON.parse(s);return (j&&j.dados)?j.dados:j}catch(e){return null}};
  let d=null;
  if(t.startsWith('{'))d=tentar(t);
  if(!d){
    const m=t.match(new RegExp('<script id="'+MARCA_EMBUTIDA+'"[^>]*>([\\s\\S]*?)<\\/script>','i'));
    if(m)d=tentar(m[1]);
  }
  if(!d){
    const m=t.match(/window\.BGL_DADOS\s*=\s*(\{[\s\S]*?\});\s*(?:\n|$)/);
    if(m)d=tentar(m[1]);
  }
  return d;
}
function validarDadosRestaurados(d){
  if(!d||typeof d!=='object')return 'O arquivo não contém dados do sistema.';
  if(!Array.isArray(d.usuarios)||!d.usuarios.length)return 'O arquivo não tem a lista de usuários — não parece um backup do sistema.';
  if(!Array.isArray(d.clientes))return 'O arquivo não tem a lista de clientes — não parece um backup do sistema.';
  return null;
}
async function aplicarRestauracao(dados,descricao){
  const erro=validarDadosRestaurados(dados);
  if(erro){alert('Não foi possível restaurar.\n\n'+erro);return;}
  if(MODO_OFFLINE){alert('Esta é uma cópia de segurança offline: ela não grava nada.\n\nAbra o sistema no endereço normal para restaurar os dados na nuvem.');return;}
  const t=contarDados(dados),atual=contarDados(DB);
  const ok=confirm(
    'RESTAURAR BACKUP\n\n'+
    'Origem: '+descricao+'\n'+
    'Vai substituir os dados atuais do sistema (e do Gist) por:\n'+
    '  · '+t.clientes+' clientes (hoje: '+atual.clientes+')\n'+
    '  · '+t.processos+' processos (hoje: '+atual.processos+')\n'+
    '  · '+(t.leadsTrabalhista+t.leadsCivel)+' leads (hoje: '+(atual.leadsTrabalhista+atual.leadsCivel)+')\n'+
    '  · '+totalRegistros(t)+' registros no total (hoje: '+totalRegistros(atual)+')\n\n'+
    'Antes de gravar, o estado atual será baixado como arquivo de segurança.\n\nConfirmar a restauração?');
  if(!ok)return;
  // rede de proteção: guarda o estado atual antes de sobrescrever
  try{
    guardarBackupLocal();
    baixarArquivo('bgl-antes-da-restauracao-'+carimboArquivo()+'.json',JSON.stringify(pacoteBackup(),null,2),'application/json');
  }catch(e){console.warn(e);}
  await new Promise(r=>setTimeout(r,600));
  DB=dados;
  garantirContratos();   // backup anterior aos contratos: converte antes de gravar
  try{
    await gravarDB();
  }catch(e){
    alert('Os dados foram restaurados nesta tela, mas não foi possível gravá-los na nuvem: '+e.message+
      '\n\nVerifique a conexão e faça qualquer alteração para tentar salvar de novo. NÃO feche esta aba antes disso.');
  }
  carregarLeads();carregarLeadsCivel();
  refreshUI();
  renderResumoBackup();renderHistoricoBackup();
  alert('Backup restaurado: '+totalRegistros(contarDados(DB))+' registros voltaram para o sistema.');
}
function restaurarDeArquivo(){
  const inp=document.getElementById('bk-arquivo');
  const f=inp&&inp.files&&inp.files[0];
  if(!f){alert('Escolha primeiro o arquivo de backup.');return;}
  const fr=new FileReader();
  fr.onload=()=>{
    const dados=extrairDadosDeTexto(String(fr.result||''));
    if(!dados){alert('Não encontrei dados do sistema neste arquivo.\n\nUse o arquivo .json de backup, o .html do "Sistema completo" ou o .js de dados prontos.');return;}
    aplicarRestauracao(dados,'arquivo '+f.name);
  };
  fr.onerror=()=>alert('Não foi possível ler o arquivo.');
  fr.readAsText(f);
}

// ─── PAINEL ────────────────────────────────────────────────
function mudarAbaBackup(id,btn){
  document.querySelectorAll('#overlay-backup .bk-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('#overlay-backup .bk-aba button').forEach(b=>b.classList.remove('active'));
  const pane=document.getElementById('bk-pane-'+id);
  if(pane)pane.classList.add('active');
  if(btn)btn.classList.add('active');
  if(id==='restaurar')renderHistoricoBackup();
  if(id==='seguranca')renderSegurancaBackup();
}
function renderResumoBackup(){
  const el=document.getElementById('bk-resumo');
  if(!el||!DB)return;
  const t=contarDados(DB);
  const ult=Number(localStorage.getItem(LS_ULTIMO_BACKUP)||0);
  const dias=ult?Math.floor((Date.now()-ult)/86400000):null;
  const alerta=dias===null||dias>=BACKUP_AVISO_DIAS;
  el.className='bk-info'+(alerta?' bk-alerta':'');
  el.innerHTML=
    '<b>'+totalRegistros(t)+' registros</b> prontos para backup — '+t.clientes+' clientes, '+t.processos+' processos, '+
    (t.leadsTrabalhista+t.leadsCivel)+' leads, '+t.lancamentosDeClientes+' lançamentos financeiros, '+t.tarefas+' tarefas.<br>'+
    (dias===null
      ? '<b>Nenhuma cópia foi baixada neste computador ainda.</b> Baixe agora a primeira — leva alguns segundos.'
      : ('Última cópia baixada: <b>'+esc(new Date(ult).toLocaleString('pt-BR'))+'</b>'+(dias>=BACKUP_AVISO_DIAS?(' — há '+dias+' dias. Hora de baixar de novo.'):' — em dia.')));
}
function renderSegurancaBackup(){
  const repo=document.getElementById('bk-seg-repo');
  if(repo)repo.textContent=SNAPSHOT_OWNER+'/'+SNAPSHOT_REPO;
  const chk=document.getElementById('bk-seg-snapshot');
  if(chk)chk.checked=snapshotRepoAtivo();
  const dias=document.getElementById('bk-seg-dias');
  if(dias)dias.textContent=String(BACKUP_AVISO_DIAS);
  const est=document.getElementById('bk-seg-estado');
  if(est){
    est.className='bk-info';
    est.innerHTML=MODO_OFFLINE
      ? '<b>Modo cópia de segurança.</b> Esta página é um arquivo de backup aberto do computador: os dados vêm de dentro dele e nada é gravado na nuvem.'
      : ('<b>Sincronização ativa.</b> Os dados são gravados num Gist privado do GitHub a cada alteração. Sessão aberta por <b>'+esc(EU?EU.nome:'—')+'</b>, com encerramento automático após '+(INATIVIDADE_MIN)+' minutos sem uso.');
  }
  const tk=document.getElementById('bk-seg-token');
  if(tk){
    tk.innerHTML=cofreDoUsuario()
      ? 'O token do GitHub deste dispositivo está <b>guardado cifrado</b> (AES-GCM), aberto apenas pela sua senha no momento do login. Quem tiver acesso ao computador não consegue lê-lo sem a senha.'
      : 'O token do GitHub deste dispositivo ainda está guardado <b>em texto puro</b>. Ele será cifrado automaticamente no seu próximo login.';
  }
}
function abrirBackup(){
  renderResumoBackup();
  renderHistoricoBackup();
  renderSegurancaBackup();
  mudarAbaBackup('baixar',document.getElementById('bk-aba-baixar'));
  abrirOverlay('overlay-backup');
}
