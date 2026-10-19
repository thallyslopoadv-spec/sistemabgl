
// ═══════════════════════════════════════════════════════════
//  PROCESSOS — área, fase, prazos correndo e publicações do DJEN
//  Substituiu a antiga aba "Teses" (a tese continua guardada no
//  processo e é editada no próprio modal do processo).
//
//  Não existe uma lista separada de prazos: o prazo de um processo é
//  uma tarefa da Rotina do tipo "prazo" com t.pid = id do processo.
//  Assim o mesmo registro aparece na Rotina (por data de entrega), no
//  calendário da visão geral (pelo prazo fatal) e no card do processo.
//  Campos novos no processo:
//    area · fase · faseEm · fases[{fase,em,por}] · resp · orgao · obs · numCNJ · ultimaPub
//  Campos novos na tarefa:
//    pid · prazoFatal · origem('djen'|'manual') · pubId · conferir · adiamentos · prazoOriginal
// ═══════════════════════════════════════════════════════════
const SEED_AREAS_PROCESSO=[
  {key:'trabalhista',lbl:'Trabalhista',cor:'#2f5d94'},
  {key:'civel',      lbl:'Cível',      cor:'#2f7d3f'},
  {key:'consumidor', lbl:'Consumidor', cor:'#a9741b'},
];
const SEED_FASES_PROCESSO=[
  'Distribuído — aguardando citação',
  'Defesa / contestação',
  'Réplica',
  'Audiência',
  'Instrução / perícia',
  'Razões finais',
  'Aguardando sentença',
  'Sentença',
  'Recurso',
  'Tribunal superior',
  'Execução / cumprimento de sentença',
  'Acordo em cumprimento',
  'Suspenso',
];
const DJEN_API='https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const DJEN_MAX_PUBLICACOES=150;     // o Gist inteiro precisa ficar abaixo de ~1 MB
const DJEN_TEXTO_MAX=1800;          // caracteres guardados de cada publicação em aberto
const DJEN_TEXTO_TRATADA=300;       // depois de tratada, só um resumo
const DJEN_INTERVALO_AUTO=4*3600000;

function djenCfg(){
  if(!DB.djen||typeof DB.djen!=='object')DB.djen={};
  const c=DB.djen;
  if(!Array.isArray(c.oabs))c.oabs=[];
  if(!Array.isArray(c.feriados))c.feriados=[];
  if(!Array.isArray(c.vistos))c.vistos=[];
  if(typeof c.antecedencia!=='number')c.antecedencia=2;
  if(typeof c.autoBuscar!=='boolean')c.autoBuscar=true;
  if(typeof c.autoCadastrar!=='boolean')c.autoCadastrar=true;
  return c;
}
function areasProcesso(){return Array.isArray(DB.areasProcesso)&&DB.areasProcesso.length?DB.areasProcesso:SEED_AREAS_PROCESSO}
function areaInfo(key){return areasProcesso().find(a=>a.key===key)||null}
function fasesProcesso(){return Array.isArray(DB.fasesProcesso)&&DB.fasesProcesso.length?DB.fasesProcesso:SEED_FASES_PROCESSO}

// número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos)
function soDigitos(s){return String(s||'').replace(/\D/g,'')}
function mascaraCNJ(d){
  d=soDigitos(d);
  if(d.length!==20)return d;
  return d.slice(0,7)+'-'+d.slice(7,9)+'.'+d.slice(9,13)+'.'+d.slice(13,14)+'.'+d.slice(14,16)+'.'+d.slice(16);
}
// palpite de área pelo segmento da Justiça no número CNJ (5 = Trabalho)
function areaPorNumero(num,tribunal){
  const d=soDigitos(num);
  if(/^(TRT|TST)/i.test(tribunal||''))return 'trabalhista';
  if(d.length===20)return d[13]==='5'?'trabalhista':'civel';
  return '';
}

// Estrutura mínima dos dados novos. Roda no carregamento do Gist e também
// na cópia offline (que não passa pela migração). Devolve true se mudou algo.
function garantirEstruturaProcessos(){
  if(!DB)return false;
  let mudou=false;
  if(!Array.isArray(DB.areasProcesso)||!DB.areasProcesso.length){DB.areasProcesso=JSON.parse(JSON.stringify(SEED_AREAS_PROCESSO));mudou=true;}
  if(!Array.isArray(DB.fasesProcesso)||!DB.fasesProcesso.length){DB.fasesProcesso=[...SEED_FASES_PROCESSO];mudou=true;}
  if(!Array.isArray(DB.publicacoes)){DB.publicacoes=[];mudou=true;}
  if(!DB.djen){djenCfg();mudou=true;}
  if(Array.isArray(DB.tiposTarefa)&&!DB.tiposTarefa.some(t=>t.key==='prazo')){
    DB.tiposTarefa.push({key:'prazo',lbl:'Prazos',cor:'#b23b3b'});mudou=true;
  }
  // palpite único de área para os processos que já existiam: segmento da
  // Justiça no número CNJ ou, na falta dele, a modalidade do lead do cliente
  if(!DB.processosAreaV1){
    (DB.processos||[]).forEach(p=>{
      if(p.area)return;
      let a=areaPorNumero(p.num);
      if(!a){
        const c=(DB.clientes||[]).find(x=>x.id===p.cid);
        if(c&&c.leadVinculadoMod)a=c.leadVinculadoMod==='trab'?'trabalhista':'civel';
      }
      p.area=a||'';
    });
    DB.processosAreaV1=true;mudou=true;
  }
  return mudou;
}

// ─── CALENDÁRIO FORENSE (dias úteis) ──────────────────────
// Considerados não úteis: sábado, domingo, feriados nacionais (Lei 662/49,
// Lei 6.802/80, Lei 14.759/23), Carnaval (seg e ter), Sexta-feira Santa,
// Corpus Christi, o recesso de 20/12 a 20/01 (CPC art. 220; CLT art. 775-A)
// e os feriados locais cadastrados em Configurar DJEN.
// Contagem a partir do DJEN (Lei 11.419/06, art. 4º, §§ 3º e 4º): a
// publicação é o 1º dia útil após a disponibilização; o prazo começa no
// 1º dia útil após a publicação.
function isoAdd(iso,k){
  const[y,m,d]=iso.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+k)).toISOString().slice(0,10);
}
function isoDow(iso){const[y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).getUTCDay()}
function pascoa(ano){
  const a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
    h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
    mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
  return ano+'-'+String(mes).padStart(2,'0')+'-'+String(dia).padStart(2,'0');
}
const __feriadosAno={};
function feriadosDoAno(ano){
  if(__feriadosAno[ano])return __feriadosAno[ano];
  const fixos=['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].map(md=>ano+'-'+md);
  const p=pascoa(ano);
  const moveis=[isoAdd(p,-48),isoAdd(p,-47),isoAdd(p,-2),isoAdd(p,60)]; // carnaval seg/ter, sexta santa, corpus christi
  return (__feriadosAno[ano]=new Set([...fixos,...moveis]));
}
let __feriadosLocais=null,__feriadosLocaisChave='';
function feriadosLocais(){
  const lista=(DB&&DB.djen&&Array.isArray(DB.djen.feriados))?DB.djen.feriados:[];
  const chave=lista.join(',');
  if(!__feriadosLocais||chave!==__feriadosLocaisChave){__feriadosLocais=new Set(lista);__feriadosLocaisChave=chave;}
  return __feriadosLocais;
}
function emRecesso(iso){const md=iso.slice(5);return md>='12-20'||md<='01-20'}
function diaUtil(iso){
  const dw=isoDow(iso);
  if(dw===0||dw===6)return false;
  if(emRecesso(iso))return false;
  if(feriadosDoAno(+iso.slice(0,4)).has(iso))return false;
  return !feriadosLocais().has(iso);
}
function proximoDiaUtil(iso){let d=isoAdd(iso,1);let g=0;while(!diaUtil(d)&&g++<60)d=isoAdd(d,1);return d}
function somarDiasUteis(iso,n){let d=iso,c=0,g=0;while(c<n&&g++<800){d=isoAdd(d,1);if(diaUtil(d))c++;}return d}
function subtrairDiasUteis(iso,n){let d=iso,c=0,g=0;while(c<n&&g++<800){d=isoAdd(d,-1);if(diaUtil(d))c++;}return d}
function contarDiasUteis(de,ate){ // dias úteis em (de, ate]
  if(!de||!ate||ate<=de)return 0;
  let d=de,c=0,g=0;while(d<ate&&g++<800){d=isoAdd(d,1);if(diaUtil(d))c++;}return c;
}
// devolve {publicacao, inicio, fatal}
function calcularPrazoFatal(disp,dias,contagem){
  const pub=proximoDiaUtil(disp);
  const inicio=proximoDiaUtil(pub);
  let fatal;
  if(contagem==='corridos'){
    fatal=isoAdd(inicio,dias-1);
    let g=0;while(!diaUtil(fatal)&&g++<60)fatal=isoAdd(fatal,1);   // vence em dia não útil: prorroga
  }else{
    fatal=somarDiasUteis(pub,dias);
  }
  return {publicacao:pub,inicio,fatal};
}
function diaSemanaCurto(iso){return ['dom','seg','ter','qua','qui','sex','sáb'][isoDow(iso)]}
function fmtDataSem(iso){return iso?diaSemanaCurto(iso)+' '+fmtData(iso):''}

// ─── PRAZOS DOS PROCESSOS (tarefas da Rotina) ─────────────
function ehTarefaPrazo(t){return !!t&&(t.tipo==='prazo'||!!t.prazoFatal)}
function dataEvento(t){return t.tipo==='audiencia'?t.prazo:(t.prazoFatal||t.prazo)}
function tarefasDoProcesso(pid){return DB.tarefas.filter(t=>t.pid===pid)}
function prazosCorrendo(pid){
  return tarefasDoProcesso(pid).filter(t=>t.status!=='concluido'&&(ehTarefaPrazo(t)||t.tipo==='audiencia'))
    .sort((a,b)=>(dataEvento(a)||'9999')<(dataEvento(b)||'9999')?-1:1);
}
function processoPorId(pid){return pid?DB.processos.find(p=>p.id===pid)||null:null}
function rotuloProcesso(p){
  if(!p)return '';
  const num=p.numCNJ||p.num||'';
  return num+(p.ativo||p.passivo?' — '+(p.ativo||'')+' × '+(p.passivo||''):'');
}
function diasAte(iso){return diasEntreISO(hojeISO(),iso)}
function rotuloDias(iso){
  const d=diasAte(iso);
  if(d===null)return {txt:'sem data',cls:''};
  if(d<0)return {txt:'venceu há '+(-d)+'d',cls:'late'};
  if(d===0)return {txt:'vence hoje',cls:'late'};
  if(d===1)return {txt:'amanhã',cls:'soon'};
  return {txt:'em '+d+' dias',cls:d<=5?'soon':''};
}
// atualiza a fase registrando o histórico (quem mudou e quando)
function mudarFaseProcesso(pid,fase){
  const p=processoPorId(pid);if(!p)return;
  if((p.fase||'')===fase)return;
  p.fase=fase;p.faseEm=Date.now();
  if(!Array.isArray(p.fases))p.fases=[];
  p.fases.push({fase,em:p.faseEm,por:EU?EU.nome:''});
  if(p.fases.length>30)p.fases=p.fases.slice(-30);
  salvarDB();refreshUI();
}

// ─── TELA DE PROCESSOS ────────────────────────────────────
let procArea='todos', procStatus='ativos', procBusca='';
function filtroProcArea(a){procArea=a;renderProcessos();}
function filtroProcStatus(f,btn){
  procStatus=f;
  document.querySelectorAll('#view-processos .rotina-chips .chip').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  renderProcessos();
}
function buscaProcessos(v){procBusca=v;renderProcessos();}
function tarefasConferir(){return DB.tarefas.filter(t=>t.conferir&&t.status!=='concluido')}
function renderProcessos(){
  const lista=document.getElementById('proc-lista');
  if(!lista)return;
  garantirEstruturaProcessos();
  const todos=DB.processos;
  const ativos=todos.filter(p=>p.status!=='Arquivado');
  const comPrazo=ativos.filter(p=>prazosCorrendo(p.id).some(ehTarefaPrazo)).length;
  const em5=DB.tarefas.filter(t=>t.status!=='concluido'&&t.pid&&ehTarefaPrazo(t)&&dataEvento(t)&&diasAte(dataEvento(t))<=5).length;
  document.getElementById('proc-stats').innerHTML=
    `<span><b>${ativos.length}</b> ativos</span><span><b>${comPrazo}</b> com prazo correndo</span>`+
    `<span class="${em5?'alerta':''}"><b>${em5}</b> vence${em5===1?'':'m'} em até 5 dias</span>`;
  renderPainelPublicacoes();

  const porStatus=todos.filter(p=>procStatus==='arquivados'?p.status==='Arquivado':procStatus==='todos'?true:p.status!=='Arquivado');
  const areas=areasProcesso();
  const semArea=porStatus.filter(p=>!p.area||!areaInfo(p.area)).length;
  if(procArea!=='todos'&&procArea!=='_sem'&&!areaInfo(procArea))procArea='todos';
  document.getElementById('proc-areas').innerHTML=
    `<button class="area-tab ${procArea==='todos'?'on':''}" onclick="filtroProcArea('todos')">Todos <span class="n">${porStatus.length}</span></button>`+
    areas.map(a=>`<button class="area-tab ${procArea===a.key?'on':''}" style="--c:${a.cor}" onclick="filtroProcArea('${a.key}')"><i class="dot" style="background:${a.cor}"></i>${esc(a.lbl)} <span class="n">${porStatus.filter(p=>p.area===a.key).length}</span></button>`).join('')+
    (semArea?`<button class="area-tab ${procArea==='_sem'?'on':''}" onclick="filtroProcArea('_sem')">Sem área <span class="n">${semArea}</span></button>`:'')+
    `<button class="area-tab cfg" onclick="abrirAreasFases()" title="Criar, renomear ou excluir áreas e fases"><i class="ti ti-settings"></i></button>`;

  let ps=porStatus;
  if(procStatus==='prazo')ps=ativos.filter(p=>prazosCorrendo(p.id).length);
  if(procArea==='_sem')ps=ps.filter(p=>!p.area||!areaInfo(p.area));
  else if(procArea!=='todos')ps=ps.filter(p=>p.area===procArea);
  if(procBusca){
    const q=semAcento(procBusca);
    const qd=soDigitos(procBusca);
    ps=ps.filter(p=>{
      const c=clientePorId(p.cid);
      if(qd.length>=4&&(soDigitos(p.num).includes(qd)||soDigitos(p.numCNJ).includes(qd)))return true;
      return [p.num,p.ativo,p.passivo,p.fase,p.orgao,p.obs,p.teseTitulo,c&&c.nome].some(x=>semAcento(x).includes(q));
    });
  }
  // ordem: o prazo mais próximo primeiro; sem prazo, por cliente
  const proxData=p=>{const pr=prazosCorrendo(p.id)[0];return pr?(dataEvento(pr)||'9999'):'9999';};
  ps=ordenarProcessosPorCliente(ps).sort((a,b)=>{const da=proxData(a),db=proxData(b);return da===db?0:(da<db?-1:1);});
  lista.innerHTML=ps.length
    ?`<div class="pl-cab"><span>Processo</span><span>Fase</span><span>Próximo prazo</span><span></span></div>`+ps.map(procLinhaHTML).join('')
    :`<p class="proc-vazio">${todos.length?'Nenhum processo neste filtro.':'Nenhum processo cadastrado ainda. Use “Novo processo” ou busque as publicações do DJEN.'}</p>`;
}
// chip de vencimento: data curta + dias, na cor da urgência
function chipVencimento(iso,extra){
  if(!iso)return '<span class="vc vc-sem">sem data</span>';
  const d=diasAte(iso);
  const cls=d<=2?'vc-alta':d<=5?'vc-media':'vc-baixa';
  const quando=d<0?'vencido':d===0?'hoje':d===1?'amanhã':d+' dias';
  return `<span class="vc ${cls}"><b>${fmtDataCurta(iso)}</b>${quando}${extra||''}</span>`;
}
function procLinhaHTML(p){
  const c=clientePorId(p.cid);
  const a=areaInfo(p.area);
  const fases=fasesProcesso();
  const opcoesFase=`<option value="" ${!p.fase?'selected':''}>definir fase</option>`+
    fases.map(f=>`<option ${f===p.fase?'selected':''}>${esc(f)}</option>`).join('')+
    (p.fase&&!fases.includes(p.fase)?`<option selected>${esc(p.fase)}</option>`:'');
  const prazos=prazosCorrendo(p.id);
  const t=prazos[0];
  const prazo=t
    ?`<div class="pl-prazo" onclick="abrirModalTarefa('${t.id}',null)" title="${esc(t.titulo)}${t.conferir?' — a conferir':''}">
        ${chipVencimento(dataEvento(t),t.conferir?'<i class="conf" title="a conferir"></i>':'')}
        <span class="pl-prazo-tt">${t.tipo==='audiencia'?'<i class="ti ti-gavel"></i> ':''}${esc(t.titulo.split(' — ')[0])}${prazos.length>1?` <em>+${prazos.length-1}</em>`:''}</span>
      </div>`
    :'<div class="pl-prazo vazio">—</div>';
  return `<div class="pl-row ${p.status==='Arquivado'?'arq':''}" id="pcard-${p.id}" style="--c:${a?a.cor:'var(--silver)'}">
    <div class="pl-main" onclick="abrirModalProc('${p.id}',null)" title="Abrir o cadastro do processo">
      <div class="pl-partes">${esc(p.ativo)} <span>×</span> ${esc(p.passivo)}${p.revisar?' <i class="pl-novo" title="Cadastrado pelo DJEN — confira as partes e vincule o cliente">novo</i>':''}</div>
      <div class="pl-sub">${esc(p.numCNJ||p.num)}${c?' · '+esc(c.curto||c.nome):''}${a?` · <span style="color:${a.cor}">${esc(a.lbl)}</span>`:''}</div>
    </div>
    <select class="pl-fase" onchange="mudarFaseProcesso('${p.id}',this.value)" title="Fase atual">${opcoesFase}</select>
    ${prazo}
    <div class="pl-acoes">${p.status!=='Arquivado'?`<button class="btn-ico" onclick="abrirModalPrazo({pid:'${p.id}'})" title="Novo prazo"><i class="ti ti-hourglass-high"></i></button>
      <button class="btn-ico" onclick="novaAudienciaProcesso('${p.id}')" title="Nova audiência"><i class="ti ti-gavel"></i></button>`:''}</div>
  </div>`;
}

function novaTarefaProcesso(pid){
  const p=processoPorId(pid);if(!p)return;
  abrirModalTarefa(null,p.cid||null);
  document.getElementById('mt-proc').value=pid;
  if(p.resp&&RESP.includes(p.resp))document.getElementById('mt-resp').value=p.resp;
  mtAtualizarHintFatal();
}
function novaAudienciaProcesso(pid){
  const p=processoPorId(pid);if(!p)return;
  abrirNovaAudiencia(hojeISO());
  document.getElementById('mt-proc').value=pid;
  if(p.cid)document.getElementById('mt-cli').value=p.cid;
  if(p.resp&&RESP.includes(p.resp))document.getElementById('mt-resp').value=p.resp;
  document.getElementById('mt-prazo').value='';
  document.getElementById('mt-titulo-in').value='Audiência — '+(p.ativo||'')+' × '+(p.passivo||'');
  mtAtualizarHintFatal();
}
function irParaProcesso(pid){
  const p=processoPorId(pid);if(!p)return;
  procArea='todos';procBusca='';
  const bs=document.getElementById('proc-search');if(bs)bs.value='';
  procStatus=p.status==='Arquivado'?'arquivados':'ativos';
  document.querySelectorAll('#view-processos .rotina-chips .chip').forEach(b=>b.classList.toggle('active',b.dataset.f===procStatus));
  navegarPara('processos');
  renderProcessos();
  setTimeout(()=>{
    const el=document.getElementById('pcard-'+pid);
    if(!el)return;
    el.scrollIntoView({behavior:'smooth',block:'center'});
    el.classList.add('destaque');setTimeout(()=>el.classList.remove('destaque'),1800);
  },80);
}

// ─── ÁREAS E FASES (editáveis) ────────────────────────────
function abrirAreasFases(){
  garantirEstruturaProcessos();
  renderConfigAreas();
  document.getElementById('cfg-fases').value=fasesProcesso().join('\n');
  abrirOverlay('overlay-areas');
}
function renderConfigAreas(){
  const el=document.getElementById('cfg-areas-list');
  el.innerHTML=DB.areasProcesso.map(a=>`
    <div class="cfgtipo-row">
      <input type="color" class="cfgtipo-color" value="${a.cor}" onchange="editarArea('${a.key}','cor',this.value)" title="Cor">
      <input type="text" class="cfgtipo-lbl" value="${esc(a.lbl)}" onchange="editarArea('${a.key}','lbl',this.value)">
      <button class="btn-ico" onclick="excluirArea('${a.key}')" title="Excluir área"><i class="ti ti-trash"></i></button>
    </div>`).join('')||'<p style="font-size:13px;color:var(--t3);padding:6px 0">Nenhuma área cadastrada.</p>';
}
function adicionarArea(){
  const nome=document.getElementById('cfg-area-nome').value.trim();
  if(!nome){alert('Dê um nome para a nova área.');return;}
  let key=slugify(nome),i=2;
  while(DB.areasProcesso.some(a=>a.key===key)){key=slugify(nome)+'-'+i;i++;}
  DB.areasProcesso.push({key,lbl:nome,cor:document.getElementById('cfg-area-cor').value});
  document.getElementById('cfg-area-nome').value='';
  salvarDB();renderConfigAreas();refreshUI();
}
function editarArea(key,campo,valor){
  const a=DB.areasProcesso.find(x=>x.key===key);if(!a)return;
  valor=String(valor||'').trim();
  if(!valor){renderConfigAreas();return;}
  a[campo]=valor;salvarDB();refreshUI();
}
function excluirArea(key){
  const n=DB.processos.filter(p=>p.area===key).length;
  if(!confirm(n?`Excluir esta área? ${n} processo(s) estão nela e passam para "Sem área".`:'Excluir esta área?'))return;
  DB.areasProcesso=DB.areasProcesso.filter(a=>a.key!==key);
  DB.processos.forEach(p=>{if(p.area===key)p.area='';});
  salvarDB();renderConfigAreas();refreshUI();
}
function salvarFases(){
  const fases=document.getElementById('cfg-fases').value.split('\n').map(x=>x.trim()).filter(Boolean);
  if(!fases.length){alert('Informe ao menos uma fase.');return;}
  DB.fasesProcesso=[...new Set(fases)];
  salvarDB();fecharOverlay('overlay-areas');refreshUI();
}

// ─── MODAL: NOVO PRAZO ────────────────────────────────────
let mpzCtx={pid:null,pubId:null,contagem:'uteis',fatalManual:false};
function abrirModalPrazo(o){
  o=o||{};
  const pub=o.pubId?(DB.publicacoes||[]).find(x=>x.id===o.pubId):null;
  const pid=o.pid||(pub&&pub.pid)||'';
  mpzCtx={pid,pubId:pub?pub.id:null,contagem:'uteis',fatalManual:false,ajustar:!!o.ajustar};
  const rg=pub&&pub.regra&&pub.regra.dias?pub.regra:null;
  const tAuto=pub?pubTarefas(pub).find(t=>t.tipo==='prazo'):null;
  const sel=document.getElementById('mpz-proc');
  const ativos=ordenarProcessosPorCliente(DB.processos.filter(p=>p.status!=='Arquivado'||p.id===pid));
  sel.innerHTML='<option value="">— escolha o processo —</option>'+ativos.map(p=>`<option value="${p.id}">${esc(rotuloProcesso(p))}</option>`).join('');
  sel.value=pid;
  const p=processoPorId(pid);
  document.getElementById('mpz-contexto').textContent=pub
    ?'Publicação de '+fmtData(pub.data)+' · '+(pub.tribunal||'')+' · '+(pub.tipoDoc||pub.tipo||'')
    :'O prazo vira uma tarefa da Rotina e aparece no calendário da visão geral.';
  document.getElementById('mpz-ato').value=rg?rg.ato:(pub?'Manifestação':'');
  document.getElementById('mpz-disp').value=pub?pub.data:hojeISO();
  document.getElementById('mpz-dias').value=rg?rg.dias:(pub?5:'');
  document.getElementById('mpz-resp').value=tAuto&&RESP.includes(tAuto.resp)?tAuto.resp:pub?respDaPublicacao(p,pub):(p&&p.resp&&RESP.includes(p.resp))?p.resp:(EU&&RESP.includes(EU.nome)?EU.nome:'Escritório');
  document.querySelector('#overlay-prazo h3').textContent=o.ajustar?'Ajustar prazo calculado':'Novo prazo';
  document.querySelector('#overlay-prazo .btn-confirm').textContent=o.ajustar?'Salvar prazo corrigido':'Criar prazo na Rotina';
  mpzContagem(rg&&rg.contagem==='corridos'?'corridos':'uteis');
  abrirOverlay('overlay-prazo');
  setTimeout(()=>document.getElementById(pub?'mpz-dias':'mpz-ato').focus(),100);
}
function mpzContagem(c){
  mpzCtx.contagem=c;
  document.getElementById('mpz-uteis').classList.toggle('on',c==='uteis');
  document.getElementById('mpz-corridos').classList.toggle('on',c==='corridos');
  mpzCtx.fatalManual=false;
  mpzRecalcular();
}
function mpzFatalManual(){
  mpzCtx.fatalManual=true;
  const f=document.getElementById('mpz-fatal').value;
  if(f)document.getElementById('mpz-interno').value=internoPara(f);
  mpzRecalcular(true);
}
function internoPara(fatal){
  const ant=djenCfg().antecedencia;
  let i=ant>0?subtrairDiasUteis(fatal,ant):fatal;
  const h=hojeISO();
  if(i<h)i=fatal>=h?h:fatal;
  return i;
}
function mpzRecalcular(soTexto){
  const disp=document.getElementById('mpz-disp').value;
  const dias=parseInt(document.getElementById('mpz-dias').value,10);
  const el=document.getElementById('mpz-calc');
  if(!disp||!dias||dias<1){el.innerHTML='Informe a data de disponibilização e a quantidade de dias para calcular o vencimento.';return;}
  const r=calcularPrazoFatal(disp,dias,mpzCtx.contagem);
  if(!soTexto&&!mpzCtx.fatalManual){
    document.getElementById('mpz-fatal').value=r.fatal;
    document.getElementById('mpz-interno').value=internoPara(r.fatal);
  }
  const fatal=document.getElementById('mpz-fatal').value||r.fatal;
  el.innerHTML=`Disponibilizado ${fmtDataSem(disp)} → publicado <b>${fmtDataSem(r.publicacao)}</b> → contagem a partir de <b>${fmtDataSem(r.inicio)}</b> → `+
    `${dias} dia${dias>1?'s':''} ${mpzCtx.contagem==='uteis'?'úteis':'corridos'} → vence <b>${fmtDataSem(r.fatal)}</b>.`+
    (mpzCtx.fatalManual&&fatal!==r.fatal?`<br><span style="color:var(--amber-hi)">Prazo fatal ajustado à mão para ${fmtDataSem(fatal)}.</span>`:'')+
    `<br><span style="color:var(--t3)">Confira feriados locais e suspensões do tribunal antes de confiar na data.</span>`;
}
function salvarPrazo(){
  const pid=document.getElementById('mpz-proc').value;
  const p=processoPorId(pid);
  if(!p){alert('Escolha o processo.');return;}
  const ato=document.getElementById('mpz-ato').value.trim()||'Prazo';
  const fatal=document.getElementById('mpz-fatal').value;
  let interno=document.getElementById('mpz-interno').value;
  if(!fatal){alert('Informe ou calcule o prazo fatal.');return;}
  if(!interno||interno>fatal)interno=fatal;
  const pub=mpzCtx.pubId?(DB.publicacoes||[]).find(x=>x.id===mpzCtx.pubId):null;
  const dias=parseInt(document.getElementById('mpz-dias').value,10);
  const t={id:uid(),titulo:ato+' — '+(p.numCNJ||p.num),resp:document.getElementById('mpz-resp').value,tipo:'prazo',
    cid:p.cid||null,pid:p.id,prazo:interno,prazoFatal:fatal,hora:'',status:'pendente',concluidoEm:'',
    origem:pub?'djen':'manual',pubId:pub?pub.id:null,criadoEm:Date.now(),criadoPor:EU?EU.nome:'',
    descricao:(dias?dias+' dias '+(mpzCtx.contagem==='uteis'?'úteis':'corridos')+' · disponibilizado em '+fmtData(document.getElementById('mpz-disp').value)+'\n':'')+
      (pub?'Publicação DJEN ('+(pub.tribunal||'')+' · '+(pub.tipoDoc||pub.tipo||'')+'):\n'+pub.texto.slice(0,900):'')};
  // ajuste de um prazo calculado: o cálculo automático sai e fica o corrigido
  if(pub&&mpzCtx.ajustar)removerTarefasAuto(pub,true);
  DB.tarefas.push(t);
  if(pub){
    (pub.tarefaIds=pub.tarefaIds||[]).push(t.id);
    if(!pub.pid)pub.pid=p.id;
    pub.regra={...(pub.regra||{}),dias:dias||0,contagem:mpzCtx.contagem,ato,fonte:'manual',base:'prazo informado por '+(EU?EU.nome:'usuário')};
    pub.calc=dias?calcularPrazoFatal(document.getElementById('mpz-disp').value,dias,mpzCtx.contagem):pub.calc;
    fecharPubSeConferida(pub);
    if(pub.status==='nova'){pub.status='tratada';pub.tratadaEm=Date.now();pub.tratadaPor=EU?EU.nome:'';}
  }
  salvarDB();fecharOverlay('overlay-prazo');refreshUI();
  mostrarToast('Prazo criado na Rotina — fatal '+fmtData(fatal)+', entrega '+fmtData(interno)+'.');
}

// ─── PUBLICAÇÕES DO DJEN: leitura do texto ────────────────
const NUM_EXTENSO={um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,
  quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,noventa:90};
function numeroDeTexto(s){
  s=String(s||'').trim();
  if(/^\d+$/.test(s))return parseInt(s,10);
  let total=0,achou=false;
  s.split(/\s+e\s+/).forEach(w=>{const v=NUM_EXTENSO[w.trim()];if(v){total+=v;achou=true;}});
  return achou?total:null;
}
// procura "prazo de 15 (quinze) dias", "prazo de quinze dias", "em 5 dias"…
function detectarPrazoDias(texto){
  const t=semAcento(texto).replace(/\s+/g,' ');
  const N='(\\d{1,3}|[a-z]+(?: e [a-z]+)?)';
  const res=[
    new RegExp('prazos? (?:comum |sucessivo |legal |improrrogavel |igual |razoavel )*(?:de |em )?(?:ate )?'+N+' ?(?:\\([^)]{1,30}\\) ?)?dias( uteis| corridos)?','g'),
    new RegExp('\\b(?:no|em|dentro de|dentro do) (?:prazo de )?(?:ate )?'+N+' ?(?:\\([^)]{1,30}\\) ?)?dias( uteis| corridos)?','g'),
  ];
  let melhor=null;
  res.forEach(re=>{
    let m;
    while((m=re.exec(t))){
      const n=numeroDeTexto(m[1]);
      if(n&&n>0&&n<=120&&(!melhor||m.index<melhor.pos)){melhor={dias:n,corridos:/corridos/.test(m[2]||''),pos:m.index,trecho:m[0]};}
    }
  });
  return melhor?{dias:melhor.dias,contagem:melhor.corridos?'corridos':'uteis',trecho:melhor.trecho}:null;
}
// ato a praticar, o mais próximo do trecho do prazo (antes ou depois dele)
const ATOS_PROCESSUAIS=[['contrarrazoes','Contrarrazões'],['contestacao','Contestação'],['contestar','Contestação'],['replica','Réplica'],
  ['impugnacao','Impugnação'],['impugnar','Impugnação'],['embargos','Embargos'],['recurso','Recurso'],['emenda','Emenda à inicial'],['emendar','Emenda à inicial'],
  ['alegacoes finais','Alegações finais'],['razoes finais','Razões finais'],['especificar','Especificação de provas'],['rol de testemunhas','Rol de testemunhas'],
  ['quesitos','Quesitos'],['laudo','Manifestação sobre laudo'],['calculos','Manifestação sobre cálculos'],['pagamento','Pagamento'],['pagar','Pagamento'],
  ['comprovar','Comprovação nos autos'],['juntar','Juntada de documentos'],['manifest','Manifestação']];
function detectarAto(texto,trecho){
  const t=semAcento(texto).replace(/\s+/g,' ');
  const i=trecho?t.indexOf(trecho):-1;
  const ini=i>=0?Math.max(0,i-140):0;
  const janela=i>=0?t.slice(ini,i+trecho.length+160):t.slice(0,400);
  const ref=i>=0?i-ini:0, fimRef=i>=0?ref+trecho.length:0;
  let melhor=null;
  ATOS_PROCESSUAIS.forEach(([k,lbl])=>{
    let pos=janela.indexOf(k);
    while(pos>=0){
      const dist=pos<ref?ref-pos:pos>fimRef?pos-fimRef:0;
      if(!melhor||dist<melhor.dist)melhor={dist,lbl};
      pos=janela.indexOf(k,pos+1);
    }
  });
  return melhor?melhor.lbl:'';
}
// audiência designada no texto: data futura + horário, perto da palavra "audiência"
function detectarAudiencia(texto){
  const t=semAcento(texto).replace(/\s+/g,' ');
  const re=/audiencia/g;let m;
  const hoje=hojeISO();
  while((m=re.exec(t))){
    const jan=t.slice(m.index,m.index+320);
    if(!/(design|redesign|marcad|pauta|realiz|agend|ocorrer|sera)/.test(jan))continue;
    const d=jan.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
    if(!d)continue;
    const iso=d[3]+'-'+d[2].padStart(2,'0')+'-'+d[1].padStart(2,'0');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||iso<hoje)continue;
    const resto=jan.slice(jan.indexOf(d[0])+d[0].length,jan.indexOf(d[0])+d[0].length+60);
    const h=resto.match(/(\d{1,2}) ?(?:h|:|horas?) ?(\d{2})?/);
    const hora=h&&+h[1]<24?String(h[1]).padStart(2,'0')+':'+(h[2]||'00'):'';
    const modo=/telepresencial|videoconferencia|virtual/.test(jan)?'telepresencial':/presencial/.test(jan)?'presencial':'';
    const ini=jan.slice(0,60);
    const tipo=/instrucao e julgamento/.test(ini)?'de instrução e julgamento':/\buna\b/.test(ini)?'una':/inicial/.test(ini)?'inicial':
      /conciliacao/.test(ini)?'de conciliação':/instrucao/.test(ini)?'de instrução':/encerramento/.test(ini)?'de encerramento':'';
    return {data:iso,hora,modo,tipo};
  }
  return null;
}
// ─── REGRA DO PRAZO ───────────────────────────────────────
// Toda publicação ligada a processo sai com prazo calculado, nesta ordem:
//  1. prazo escrito no texto ("no prazo de 8 (oito) dias")
//  2. prazo da lei para o ato publicado (sentença, acórdão, citação)
//  3. prazo geral de 5 dias úteis (CPC, art. 218, § 3º)
// Só fica sem prazo a publicação que designa audiência ou inclui o
// processo em pauta de julgamento — nesses casos o compromisso vai
// para a agenda. Tudo nasce marcado "conferir": é cálculo de máquina.
function regraPrazo(pub,area){
  const txt=pub.texto||'';
  const t=semAcento(txt).replace(/\s+/g,' ');
  const doc=semAcento((pub.tipoDoc||'')+' '+(pub.tipo||'')+' '+(pub.classe||''));
  const trab=area==='trabalhista'||/^(TRT|TST)/i.test(pub.tribunal||'');
  const jec=/juizado/.test(semAcento((pub.orgao||'')+' '+(pub.classe||'')));
  const ex=detectarPrazoDias(txt);
  if(ex)return {dias:ex.dias,contagem:ex.contagem,ato:detectarAto(txt,ex.trecho)||'Manifestação',fonte:'texto',
    base:'prazo escrito na publicação (“'+ex.trecho+'”)'};
  const h=t.match(/(?:prazo de |em |no prazo de )(\d{1,3}) ?(?:\([a-z ]+\) ?)?horas/);
  if(h){const d=Math.max(1,Math.ceil(+h[1]/24));return {dias:d,contagem:'corridos',ato:detectarAto(txt,h[0])||'Manifestação',fonte:'texto',
    base:'prazo em horas ('+h[1]+'h) — conta-se de hora a hora a partir da intimação; confira o horário'};}
  if(pub.aud)return {dias:0,fonte:'nenhum',motivo:'audiência designada — o compromisso foi para a agenda'};
  if(/pauta de julgamento|incluid[oa] em pauta|sessao (?:virtual|de julgamento|ordinaria)/.test(t))
    return {dias:0,fonte:'nenhum',motivo:'inclusão em pauta de julgamento'};
  if(/homologo (?:o |por sentenca o )?acordo/.test(t))
    return {dias:0,fonte:'nenhum',motivo:'homologação de acordo — confira as datas de pagamento'};
  const ehAcordao=/acordao/.test(doc)||/\bacordam\b/.test(t);
  const ehSentenca=/sentenca/.test(doc)||/\b(?:ante o exposto|isto posto|pelo exposto)[, ]+julgo\b|\bjulgo (?:totalmente |parcialmente )?(?:procedente|improcedente)/.test(t);
  const ehCitacao=/citacao/.test(doc)||/\bcite-se\b|\bfica(?:m)? (?:a parte .{0,30})?citad/.test(t);
  if(ehAcordao)return trab
    ?{dias:8,contagem:'uteis',ato:'Recurso de revista',fonte:'regra',ed:true,base:'acórdão trabalhista — recurso de revista em 8 dias úteis (CLT, art. 896)'}
    :{dias:15,contagem:'uteis',ato:'Recurso especial / extraordinário',fonte:'regra',ed:true,base:'acórdão — recursos aos tribunais superiores em 15 dias úteis (CPC, art. 1.003, § 5º)'};
  if(ehSentenca){
    if(trab)return {dias:8,contagem:'uteis',ato:'Recurso ordinário',fonte:'regra',ed:true,base:'sentença trabalhista — recurso ordinário em 8 dias úteis (CLT, art. 895, I)'};
    if(jec)return {dias:10,contagem:'uteis',ato:'Recurso inominado',fonte:'regra',ed:true,base:'sentença do juizado — recurso inominado em 10 dias úteis (Lei 9.099/95, art. 42)'};
    return {dias:15,contagem:'uteis',ato:'Apelação',fonte:'regra',ed:true,base:'sentença — apelação em 15 dias úteis (CPC, art. 1.003, § 5º)'};
  }
  if(ehCitacao&&!trab&&!jec)return {dias:15,contagem:'uteis',ato:'Contestação',fonte:'regra',base:'citação — contestação em 15 dias úteis (CPC, art. 335)'};
  return {dias:5,contagem:'uteis',ato:detectarAto(txt,'')||'Manifestação',fonte:'padrao',
    base:(pub.semConteudo?'o tribunal não publicou o conteúdo do ato no DJEN':'a publicação não diz o prazo')+' — aplicado o prazo geral de 5 dias úteis (CPC, art. 218, § 3º); confira no PJe'};
}
function textoDeHTML(html){
  try{return (new DOMParser().parseFromString(String(html||''),'text/html').body.textContent||'').replace(/\u00a0/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
  catch(e){return String(html||'').replace(/<[^>]+>/g,' ');}
}
// número como foi digitado no cadastro → 20 dígitos (completa os zeros à
// esquerda do número sequencial: "10123-45.2026.5.18.0003")
function normalizarCNJ(s){
  const partes=String(s||'').split(/\D+/).filter(Boolean);
  if(partes.length>=3&&partes[1].length===2&&partes[2].length===4)return partes[0].padStart(7,'0')+partes.slice(1).join('');
  return soDigitos(s);
}
// processo pelo número: igual nos 20 dígitos ou, se o cadastro guardou só
// parte do número, um único processo cujo número seja início do da publicação
function localizarProcesso(dig){
  dig=soDigitos(dig);
  if(dig.length<10)return {p:null,ambiguo:false};
  const exato=DB.processos.find(p=>normalizarCNJ(p.num)===dig||normalizarCNJ(p.numCNJ)===dig);
  if(exato)return {p:exato,ambiguo:false};
  const parciais=DB.processos.filter(p=>{const d=normalizarCNJ(p.num);return d.length>=9&&d.length<20&&dig.startsWith(d);});
  return parciais.length===1?{p:parciais[0],ambiguo:false}:{p:null,ambiguo:parciais.length>1};
}

// ─── OAB DE ORIGEM ────────────────────────────────────────
function chaveOab(numero,uf){return soDigitos(numero)+'/'+String(uf||'').toUpperCase()}
function oabCfg(k){return djenCfg().oabs.find(o=>chaveOab(o.numero,o.uf)===k)||null}
function rotuloOab(k){const o=oabCfg(k);return 'OAB '+k+(o&&o.nome?' · '+o.nome:'')}
// sócio dono da OAB (pelo nome cadastrado), para virar responsável do prazo
function socioDaOab(k){
  const o=oabCfg(k);if(!o||!o.nome)return '';
  const n=semAcento(o.nome);
  return RESP.find(r=>r!=='Escritório'&&r!==RESP_DUPLA&&n.includes(semAcento(r)))||'';
}
function oabsDoItem(it){
  const ks=(Array.isArray(it.destinatarioadvogados)?it.destinatarioadvogados:[])
    .map(a=>a&&a.advogado).filter(Boolean).map(a=>chaveOab(a.numero_oab,a.uf_oab)).filter(k=>oabCfg(k));
  if(it.__oab)ks.unshift(it.__oab);
  return [...new Set(ks)];
}
// publicações antigas (sem o campo oabs): deduz pelos advogados intimados
function oabsDaPub(x){
  if(Array.isArray(x.oabs)&&x.oabs.length)return x.oabs;
  const ks=[];
  (x.advs||[]).forEach(a=>{const m=String(a).match(/OAB (\d+)\/([A-Z]{2})/);if(m&&oabCfg(chaveOab(m[1],m[2])))ks.push(chaveOab(m[1],m[2]));});
  return [...new Set(ks)];
}
function respDaPublicacao(p,pub){
  if(p&&p.resp&&RESP.includes(p.resp))return p.resp;
  for(const k of oabsDaPub(pub)){const s=socioDaOab(k);if(s)return s;}
  return 'Escritório';
}

// ─── PARTES A PARTIR DO TEXTO ─────────────────────────────
// O DJEN lista como "destinatário" todo mundo que foi intimado (peritos,
// testemunhas, terceiros). As partes de verdade vêm do cabeçalho do texto
// ("RECLAMANTE: … RECLAMADO: …"); a lista de destinatários é só o recurso.
const ROTULOS_ATIVO=['reclamante','reclamantes','autor','autora','autores','requerente','requerentes','exequente','exequentes','impetrante',
  'apelante','apelantes','agravante','agravantes','recorrente','recorrentes','embargante','embargantes','demandante','suscitante','reconvinte'];
const ROTULOS_PASSIVO=['reclamado','reclamada','reclamados','reclamadas','reu','re','reus','requerido','requerida','requeridos','requeridas',
  'executado','executada','executados','impetrado','apelado','apelada','apelados','agravado','agravada','agravados','recorrido','recorrida',
  'recorridos','embargado','embargada','demandado','demandada','suscitado','reconvindo'];
const ROTULOS_OUTROS=['advogado','advogada','advogados','perito','perita','peritos','peritas','assistente','terceiro interessado','terceiro',
  'interessado','interessada','custos legis','testemunha','testemunhas','processo','orgao julgador','destinatario','destinatarios','intimado','intimados'];
function partesDoTexto(texto){
  const todos=[...ROTULOS_ATIVO,...ROTULOS_PASSIVO,...ROTULOS_OUTROS].sort((a,b)=>b.length-a.length);
  // versão sem acento com o mesmo tamanho do original, para as posições baterem
  let plano='';for(const ch of texto){const x=semAcento(ch);plano+=x.length===ch.length?x:ch;}
  const re=new RegExp('(^|[\\s\\n(])('+todos.join('|')+')\\(?s?\\)?\\s*:\\s*','gi');
  const marcas=[];let m;
  while((m=re.exec(plano))){marcas.push({rot:m[2].toLowerCase(),ini:m.index+m[1].length,fim:re.lastIndex});}
  const ativo=[],passivo=[];
  marcas.forEach((mk,i)=>{
    const ate=i+1<marcas.length?marcas[i+1].ini:Math.min(texto.length,mk.fim+160);
    let nome=texto.slice(mk.fim,ate).split('\n')[0].replace(/\s+/g,' ').replace(/[,;.\-–\s]+$/,'').trim();
    if(nome.length<3||nome.length>140)return;
    if(ROTULOS_ATIVO.includes(mk.rot)&&!ativo.includes(nome))ativo.push(nome);
    else if(ROTULOS_PASSIVO.includes(mk.rot)&&!passivo.includes(nome))passivo.push(nome);
  });
  return {ativo,passivo};
}
// nomes que o texto apresenta como perito, testemunha, terceiro…
function naoPartesDoTexto(texto){
  const plano=semAcento(texto).toLowerCase();
  const fora=new Set();
  const re=/(perit[oa]s?|testemunhas?|assistente tecnic[oa]|terceiro interessado|leiloeir[oa])\s*:?\s*([^\n:]{3,80})/g;let m;
  while((m=re.exec(plano)))fora.add(m[2].trim().slice(0,40));
  return fora;
}
function partesDaPublicacao(pub){
  const t=partesDoTexto(pub.texto||'');
  if(t.ativo.length||t.passivo.length)return {ativo:t.ativo.join(', '),passivo:t.passivo.join(', ')};
  const fora=naoPartesDoTexto(pub.texto||'');
  const parte=d=>{const n=semAcento(d.nome).toLowerCase();return ![...fora].some(f=>f.startsWith(n.slice(0,20))||n.startsWith(f.slice(0,20)));};
  const nomes=pl=>pub.partes.filter(d=>new RegExp('^'+pl,'i').test(d.polo)&&parte(d)).map(d=>d.nome).join(', ');
  return {ativo:nomes('a'),passivo:nomes('p')};
}
// mesma comunicação emitida para vários destinatários: mesmo processo, mesmo
// dia e o mesmo texto (desconsiderando nomes) — vira uma publicação só
function palavrasPub(x){
  return new Set(semAcento(x.texto||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>3));
}
function mesmaPublicacao(a,b){
  if(a.num!==b.num||a.data!==b.data)return false;
  if((a.tipoDoc||'')!==(b.tipoDoc||''))return false;
  const A=palavrasPub(a),B=palavrasPub(b);
  if(!A.size&&!B.size)return true;
  let comum=0;A.forEach(w=>{if(B.has(w))comum++;});
  return comum/Math.max(1,Math.min(A.size,B.size))>=0.85;
}
function juntarPublicacoes(fica,sai){
  fica.oabs=[...new Set([...oabsDaPub(fica),...oabsDaPub(sai)])];
  const nomes=new Set(fica.partes.map(d=>d.nome));
  sai.partes.forEach(d=>{if(!nomes.has(d.nome)&&fica.partes.length<12){fica.partes.push(d);nomes.add(d.nome);}});
  if(!fica.link&&sai.link)fica.link=sai.link;
  if((sai.texto||'').length>(fica.texto||'').length&&fica.status!=='tratada')fica.texto=sai.texto;
}
// limpeza das duplicatas já gravadas: fica a primeira; das outras saem as
// tarefas automáticas ainda não conferidas (as conferidas/cumpridas ficam)
function limparPublicacoesDuplicadas(){
  const lista=DB.publicacoes||[];
  const removidas=new Set();let mudou=false;
  const peso=x=>x.status==='tratada'?0:x.status==='auto'?1:2;
  const ordem=[...lista].sort((a,b)=>peso(a)-peso(b)||(a.criadoEm||0)-(b.criadoEm||0));
  ordem.forEach((x,i)=>{
    if(removidas.has(x.id))return;
    for(let j=i+1;j<ordem.length;j++){
      const y=ordem[j];
      if(removidas.has(y.id)||!mesmaPublicacao(x,y))continue;
      juntarPublicacoes(x,y);
      const tirar=new Set(pubTarefas(y).filter(t=>t.conferir&&t.status!=='concluido').map(t=>t.id));
      DB.tarefas=DB.tarefas.filter(t=>!tirar.has(t.id));
      pubTarefas(y).forEach(t=>{if(!tirar.has(t.id)){t.pubId=x.id;x.tarefaIds.push(t.id);}});
      removidas.add(y.id);mudou=true;
    }
  });
  if(removidas.size)DB.publicacoes=lista.filter(x=>!removidas.has(x.id));
  return mudou;
}
// processos cadastrados pelo DJEN antes desta correção: refaz as partes
// pelo cabeçalho do texto (só enquanto ninguém editou o cadastro)
function corrigirPartesProcessosDJEN(){
  let mudou=false;
  DB.processos.forEach(p=>{
    if(p.origem!=='djen'||!p.revisar||p.partesConferidas)return;
    const pub=(DB.publicacoes||[]).find(x=>x.pid===p.id&&partesDoTexto(x.texto||'').ativo.length);
    const pt=pub?partesDaPublicacao(pub):null;
    if(pt&&pt.ativo&&(pt.ativo!==p.ativo||(pt.passivo&&pt.passivo!==p.passivo))){
      p.ativo=pt.ativo;if(pt.passivo)p.passivo=pt.passivo;mudou=true;
    }
    p.partesConferidas=true;
  });
  return mudou;
}

// ─── PUBLICAÇÕES DO DJEN: busca e vínculo automático ──────
let __djenBuscando=false, __djenUltimoErro='';
function urlDJEN(oab,inicio,fim,pagina){
  const q=new URLSearchParams({numeroOab:soDigitos(oab.numero),ufOab:String(oab.uf||'').toUpperCase(),
    dataDisponibilizacaoInicio:inicio,dataDisponibilizacaoFim:fim,pagina:String(pagina),itensPorPagina:'100'});
  return DJEN_API+'?'+q.toString();
}
function janelaBuscaDJEN(){
  const c=djenCfg(), fim=hojeISO();
  let inicio=c.ultimaDataBuscada?isoAdd(c.ultimaDataBuscada,-3):isoAdd(fim,-15);
  if(inicio<isoAdd(fim,-30))inicio=isoAdd(fim,-30);
  return {inicio,fim};
}
// só GET, sem cabeçalhos além do Accept: não dispara pré-verificação de CORS.
// Falha de rede/CORS vira um erro marcado, para não ser confundida com outro defeito.
async function consultarDJEN(url){
  try{return await fetch(url,{headers:{'Accept':'application/json'},referrerPolicy:'no-referrer',cache:'no-store'});}
  catch(e){const err=new Error(e.message);err.semConexao=true;throw err;}
}
async function buscarDJEN(o){
  o=o||{};
  const c=djenCfg();
  if(!c.oabs.length){if(!o.silencioso){alert('Cadastre primeiro a OAB que deve ser monitorada.');abrirConfigDJEN();}return;}
  if(MODO_OFFLINE){if(!o.silencioso)alert('Esta é uma cópia de segurança offline: a busca no DJEN só funciona no sistema online.');return;}
  if(__djenBuscando)return;
  __djenBuscando=true;
  document.querySelectorAll('.btn-buscar-djen').forEach(b=>{b.disabled=true;b.innerHTML='<i class="ti ti-loader"></i>Buscando…';});
  const {inicio,fim}=janelaBuscaDJEN();
  const itens=[];
  try{
    for(const oab of c.oabs){
      for(let pagina=1;pagina<=20;pagina++){
        let r=await consultarDJEN(urlDJEN(oab,inicio,fim,pagina));
        if(r.status===429){await new Promise(ok=>setTimeout(ok,2500));r=await consultarDJEN(urlDJEN(oab,inicio,fim,pagina));}
        if(!r.ok)throw new Error('o DJEN respondeu HTTP '+r.status+' para a OAB '+oab.numero+'/'+oab.uf);
        const j=await r.json();
        const lote=Array.isArray(j.items)?j.items:Array.isArray(j.data)?j.data:Array.isArray(j)?j:[];
        lote.forEach(it=>{if(it&&typeof it==='object')it.__oab=chaveOab(oab.numero,oab.uf);});
        itens.push(...lote);
        if(lote.length<100)break;
      }
    }
    const res=processarPublicacoesDJEN(itens);
    c.ultimaBusca=Date.now();c.ultimaDataBuscada=fim;c.ultimoErro='';
    c.ultimoResultado={...res,inicio,fim,lidas:itens.length};
    __djenUltimoErro='';
    salvarDB();refreshUI();
    if(!o.silencioso||res.novas)mostrarToast(resumoBuscaDJEN(c.ultimoResultado));
  }catch(e){
    const bloqueio=!!e.semConexao;
    __djenUltimoErro=bloqueio
      ?'O navegador não conseguiu acessar o DJEN (conexão recusada ou bloqueio de CORS do servidor). Use “DJEN → Se a busca automática for bloqueada”.'
      :'Falha na busca: '+e.message;
    c.ultimoErro=__djenUltimoErro;c.ultimaBusca=Date.now();
    console.warn('[djen]',e);
    renderStatusDJEN();
    if(!o.silencioso)alert(__djenUltimoErro);
  }finally{
    __djenBuscando=false;
    document.querySelectorAll('.btn-buscar-djen').forEach(b=>{b.disabled=false;b.innerHTML='<i class="ti ti-refresh"></i>Buscar agora';});
  }
}
function resumoBuscaDJEN(r){
  if(!r)return '';
  if(!r.novas)return 'DJEN consultado: nenhuma publicação nova'+(r.inicio?' ('+fmtData(r.inicio)+' a '+fmtData(r.fim)+')':'')+'.';
  const p=[r.novas+' publicaç'+(r.novas>1?'ões novas':'ão nova')];
  if(r.prazos)p.push(r.prazos+' prazo'+(r.prazos>1?'s calculados':' calculado'));
  if(r.audiencias)p.push(r.audiencias+' audiência'+(r.audiencias>1?'s':''));
  if(r.processosCriados)p.push(r.processosCriados+' processo'+(r.processosCriados>1?'s cadastrados':' cadastrado'));
  if(r.semProcesso)p.push(r.semProcesso+' sem processo');
  return 'DJEN: '+p.join(' · ')+'.';
}
// transforma os itens da API em publicações do sistema, liga (ou cadastra) o
// processo e calcula o prazo — tudo marcado "conferir"
function processarPublicacoesDJEN(itens){
  garantirEstruturaProcessos();
  const c=djenCfg();
  const vistos=new Set(c.vistos);
  (DB.publicacoes||[]).forEach(x=>{vistos.add(x.id);if(x.hash)vistos.add('h:'+x.hash);});
  const res={novas:0,vinculadas:0,prazos:0,audiencias:0,semProcesso:0,processosCriados:0};
  itens.forEach(it=>{
    if(!it||typeof it!=='object')return;
    const id=String(it.id??it.numeroComunicacao??'').replace(/[^\w-]/g,'').slice(0,40);
    const hash=String(it.hash||'');
    const oabs=oabsDoItem(it);
    if((id&&vistos.has(id))||(hash&&vistos.has('h:'+hash))){
      // mesma publicação vinda por outra OAB: só acrescenta a OAB
      const ex=DB.publicacoes.find(x=>(id&&x.id===id)||(hash&&x.hash===hash));
      if(ex)ex.oabs=[...new Set([...oabsDaPub(ex),...oabs])];
      return;
    }
    const pub=normalizarPublicacao(it);
    if(!pub)return;
    pub.oabs=oabs;
    // a mesma intimação emitida para outro destinatário: junta na que já existe
    const igual=DB.publicacoes.find(y=>mesmaPublicacao(y,pub));
    if(igual){juntarPublicacoes(igual,pub);vistos.add(pub.id);if(hash)vistos.add('h:'+hash);c.vistos.push(pub.id);return;}
    vistos.add(pub.id);if(hash)vistos.add('h:'+hash);
    c.vistos.push(pub.id);
    DB.publicacoes.push(pub);
    res.novas++;
    const r=tratarPublicacao(pub);
    if(pub.pid)res.vinculadas++;else res.semProcesso++;
    res.prazos+=r.prazos;res.audiencias+=r.audiencias;res.processosCriados+=r.processoCriado?1:0;
  });
  podarPublicacoes();
  return res;
}
// localiza ou cadastra o processo e cria prazo/audiência
function tratarPublicacao(pub){
  const loc=localizarProcesso(pub.num);
  let p=loc.p, criado=false;
  if(!p&&!loc.ambiguo&&djenCfg().autoCadastrar&&pub.num.length===20){p=processoDaPublicacao(pub);criado=true;}
  const r=vincularPublicacao(pub,p);
  r.processoCriado=criado;
  return r;
}
function processoDaPublicacao(pub){
  const pt=partesDaPublicacao(pub);
  const area=areaPorNumero(pub.num,pub.tribunal);
  const p={id:uid(),num:pub.numMask||mascaraCNJ(pub.num),ativo:pt.ativo||'(polo ativo não informado)',passivo:pt.passivo||'(polo passivo não informado)',partesConferidas:true,
    dist:'',cid:null,polo:'a',status:'Ativo',exito:null,area:area&&areaInfo(area)?area:'',
    resp:respDaPublicacao(null,pub),orgao:[pub.tribunal,pub.orgao].filter(Boolean).join(' — '),obs:'',
    criadoEm:Date.now(),origem:'djen',revisar:true};
  DB.processos.push(p);
  return p;
}
function normalizarPublicacao(it){
  const num=soDigitos(it.numero_processo||it.numeroProcesso||it.numeroprocessocommascara||'');
  let data=it.data_disponibilizacao||it.dataDisponibilizacao||'';
  if(!data&&it.datadisponibilizacao){const m=String(it.datadisponibilizacao).match(/(\d{2})\/(\d{2})\/(\d{4})/);if(m)data=m[3]+'-'+m[2]+'-'+m[1];}
  data=String(data).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data))data=hojeISO();
  const texto=textoDeHTML(it.texto||'');
  const dest=Array.isArray(it.destinatarios)?it.destinatarios:[];
  const advs=Array.isArray(it.destinatarioadvogados)?it.destinatarioadvogados:[];
  const link=String(it.link||'');
  return {
    // o id vai parar em atributos onclick: só letras, números, _ e -
    id:String(it.id??it.numeroComunicacao??it.hash??'').replace(/[^\w-]/g,'').slice(0,40)||uid(),
    hash:String(it.hash||''),
    data,dataPub:proximoDiaUtil(data),
    tribunal:String(it.siglaTribunal||''),
    orgao:String(it.nomeOrgao||''),
    tipo:String(it.tipoComunicacao||''),
    tipoDoc:String(it.tipoDocumento||''),
    classe:String(it.nomeClasse||''),
    num,numMask:it.numeroprocessocommascara||mascaraCNJ(num),
    link:/^https:\/\//i.test(link)?link:'',
    partes:dest.map(d=>({nome:String(d.nome||''),polo:String(d.polo||'')})).filter(d=>d.nome).slice(0,8),
    advs:advs.map(a=>a&&a.advogado?String(a.advogado.nome||'')+(a.advogado.numero_oab?' (OAB '+soDigitos(a.advogado.numero_oab)+'/'+String(a.advogado.uf_oab||'').toUpperCase()+')':''):'').filter(Boolean).slice(0,6),
    texto:texto.slice(0,DJEN_TEXTO_MAX),
    aud:detectarAudiencia(texto),
    semConteudo:/arquivos digitais indisponiveis/.test(semAcento(texto)),
    oabs:[],status:'nova',pid:null,tarefaIds:[],criadoEm:Date.now(),
  };
}
// liga a publicação ao processo e cria as tarefas (prazo e/ou audiência)
function vincularPublicacao(pub,p){
  const r={prazos:0,audiencias:0};
  if(!p)return r;
  pub.pid=p.id;
  if(!p.ultimaPub||pub.data>p.ultimaPub)p.ultimaPub=pub.data;
  if(!p.numCNJ&&pub.num.length===20&&p.num!==pub.numMask)p.numCNJ=pub.numMask;
  if(!p.orgao&&(pub.tribunal||pub.orgao))p.orgao=[pub.tribunal,pub.orgao].filter(Boolean).join(' — ');
  if(!p.area){const a=areaPorNumero(pub.num,pub.tribunal);if(a&&areaInfo(a))p.area=a;}
  const resp=respDaPublicacao(p,pub);
  pub.tarefaIds=pub.tarefaIds||[];
  const regra=regraPrazo(pub,p.area);
  pub.regra=regra;
  if(regra.dias){
    const calc=calcularPrazoFatal(pub.data,regra.dias,regra.contagem);
    pub.calc=calc;
    const ed=regra.ed?calcularPrazoFatal(pub.data,5,'uteis').fatal:'';
    const t={id:uid(),titulo:regra.ato+' — '+(p.numCNJ||p.num),resp,tipo:'prazo',cid:p.cid||null,pid:p.id,
      prazo:internoPara(calc.fatal),prazoFatal:calc.fatal,hora:'',status:'pendente',concluidoEm:'',
      origem:'djen',pubId:pub.id,conferir:true,criadoEm:Date.now(),criadoPor:'DJEN',
      descricao:regra.dias+' dias '+(regra.contagem==='corridos'?'corridos':'úteis')+' · '+regra.base+'.\n'+
        'Disponibilizada '+fmtData(pub.data)+' · publicada '+fmtData(calc.publicacao)+' · contagem a partir de '+fmtData(calc.inicio)+' · vence '+fmtData(calc.fatal)+'.'+
        (ed?'\nSe for o caso de embargos de declaração: 5 dias úteis, vencem '+fmtData(ed)+'.':'')+'\n\n'+
        (pub.tribunal||'')+' · '+(pub.orgao||'')+' · '+(pub.tipoDoc||pub.tipo||'')+'\n'+pub.texto.slice(0,900)};
    DB.tarefas.push(t);pub.tarefaIds.push(t.id);r.prazos++;
  }
  if(pub.aud){
    const ja=DB.tarefas.some(t=>t.pid===p.id&&t.tipo==='audiencia'&&t.prazo===pub.aud.data);
    if(!ja){
      const t={id:uid(),titulo:'Audiência'+(pub.aud.tipo?' '+pub.aud.tipo:'')+(pub.aud.modo?' ('+pub.aud.modo+')':'')+' — '+(p.ativo||'')+' × '+(p.passivo||''),
        resp,tipo:'audiencia',cid:p.cid||null,pid:p.id,prazo:pub.aud.data,hora:pub.aud.hora,status:'pendente',concluidoEm:'',
        origem:'djen',pubId:pub.id,conferir:true,criadoEm:Date.now(),criadoPor:'DJEN',
        descricao:'Audiência identificada no texto da publicação de '+fmtData(pub.data)+' ('+(pub.tribunal||'')+').\n\n'+pub.texto.slice(0,900)};
      DB.tarefas.push(t);pub.tarefaIds.push(t.id);r.audiencias++;
    }
  }
  pub.status=pub.tarefaIds.length?'auto':'nova';
  return r;
}
// publicações que chegaram antes do cálculo automático: recebem o mesmo
// tratamento (uma vez; as que já têm tarefa ou foram tratadas não mudam)
function reprocessarPublicacoesPendentes(){
  if(!DB||!Array.isArray(DB.publicacoes))return false;
  let mudou=limparPublicacoesDuplicadas();
  if(corrigirPartesProcessosDJEN())mudou=true;
  DB.publicacoes.forEach(x=>{if(x.semConteudo===undefined){x.semConteudo=/arquivos digitais indisponiveis/.test(semAcento(x.texto||''));mudou=true;}});
  DB.publicacoes.forEach(x=>{
    if(!Array.isArray(x.oabs)||!x.oabs.length){const k=oabsDaPub(x);if(k.length){x.oabs=k;mudou=true;}}
    if(x.status!=='nova'||(x.tarefaIds||[]).length||x.regra)return;
    if(!x.pid)tratarPublicacao(x);
    else vincularPublicacao(x,processoPorId(x.pid));
    if(!x.regra)x.regra={dias:0,fonte:'nenhum',motivo:'processo não localizado'};
    mudou=true;
  });
  return mudou;
}
// mantém o Gist pequeno: publicações tratadas guardam só um resumo e a
// lista fica nas mais recentes (as ids continuam em djen.vistos)
function podarPublicacoes(){
  const c=djenCfg();
  DB.publicacoes.forEach(x=>{if((x.status==='tratada'||x.status==='ignorada')&&x.texto&&x.texto.length>DJEN_TEXTO_TRATADA)x.texto=x.texto.slice(0,DJEN_TEXTO_TRATADA)+'…';});
  if(DB.publicacoes.length>DJEN_MAX_PUBLICACOES){
    const prioridade=x=>x.status==='nova'?0:x.status==='auto'?1:2;
    DB.publicacoes.sort((a,b)=>prioridade(a)-prioridade(b)||(b.data<a.data?-1:b.data>a.data?1:0));
    DB.publicacoes=DB.publicacoes.slice(0,DJEN_MAX_PUBLICACOES);
  }
  if(c.vistos.length>3000)c.vistos=c.vistos.slice(-3000);
}
function importarDJENColado(){
  const txt=document.getElementById('djen-colar').value.trim();
  if(!txt){alert('Cole primeiro o conteúdo da página do DJEN.');return;}
  let j;
  try{j=JSON.parse(txt);}catch(e){alert('O conteúdo colado não é o resultado da API (esperava um texto começando com {"status"…).');return;}
  const itens=Array.isArray(j.items)?j.items:Array.isArray(j)?j:[];
  const res=processarPublicacoesDJEN(itens);
  const c=djenCfg();c.ultimoResultado={...res,inicio:'',fim:'',lidas:itens.length};
  document.getElementById('djen-colar').value='';
  salvarDB();refreshUI();
  alert(itens.length+' publicações lidas. '+resumoBuscaDJEN(res));
}
function buscaAutomaticaDJEN(){
  if(!DB||MODO_OFFLINE)return;
  const c=djenCfg();
  if(!c.autoBuscar||!c.oabs.length)return;
  if(c.ultimaBusca&&Date.now()-c.ultimaBusca<DJEN_INTERVALO_AUTO)return;
  setTimeout(()=>buscarDJEN({silencioso:true}),2500);
}
function renderStatusDJEN(){renderPainelPublicacoes();}

// ─── CAIXA DE PUBLICAÇÕES ─────────────────────────────────
// Uma linha por publicação: vencimento, ato, partes e um botão. O resto
// (cálculo, base legal, texto) só aparece ao clicar na linha.
let pubAba='revisar', pubFiltroPid=null, pubFiltroOab='todas', pubAbertas=new Set();
function pubTarefas(x){return (x.tarefaIds||[]).map(id=>DB.tarefas.find(t=>t.id===id)).filter(Boolean)}
function pubConferirPendente(x){return pubTarefas(x).some(t=>t.conferir&&t.status!=='concluido')}
function pubRevisar(x){return x.status==='nova'||(x.status==='auto'&&pubConferirPendente(x))}
function pubsAnalisar(){return (DB.publicacoes||[]).filter(pubRevisar)}
function abrirPainelPublicacoes(aba){
  if(aba)pubAba=aba;
  pubFiltroPid=null;
  navegarPara('processos');renderProcessos();
  setTimeout(()=>{const el=document.getElementById('pub-panel');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},60);
}
function verPublicacoesProcesso(pid){abrirPainelPublicacoes('todas');pubFiltroPid=pid;renderPainelPublicacoes();}
function mudarAbaPub(a){pubAba=a;pubFiltroPid=null;renderPainelPublicacoes();}
function filtrarOabPub(k){pubFiltroOab=k;renderPainelPublicacoes();}
function alternarTextoPub(id){if(pubAbertas.has(id))pubAbertas.delete(id);else pubAbertas.add(id);renderPainelPublicacoes();}
function nomeCurtoOab(k){const o=oabCfg(k);return o&&o.nome?o.nome.split(' ')[0]:k}
// data que interessa na linha: vencimento do prazo, dia da audiência ou nada
function vencimentoPub(x){
  const ts=pubTarefas(x);
  const pz=ts.find(t=>t.tipo==='prazo'),au=ts.find(t=>t.tipo==='audiencia');
  return pz?pz.prazoFatal:au?au.prazo:'';
}
function renderPainelPublicacoes(){
  const el=document.getElementById('pub-panel');
  if(!el)return;
  const c=djenCfg();
  const todas=DB.publicacoes||[];
  if(!todas.length&&!c.oabs.length){
    el.className='pr-painel vazio';
    el.innerHTML=`<div class="pr-convite"><i class="ti ti-news"></i><span>Cadastre a OAB dos sócios para receber as publicações do DJEN com o prazo já calculado.</span><button class="btn-nova-tarefa" onclick="abrirConfigDJEN()">Cadastrar OAB</button></div>`;
    return;
  }
  const porOab=x=>pubFiltroOab==='todas'||oabsDaPub(x).includes(pubFiltroOab);
  const base=todas.filter(porOab);
  const revisar=base.filter(pubRevisar);
  let lista;
  if(pubFiltroPid)lista=todas.filter(x=>x.pid===pubFiltroPid);
  else lista=pubAba==='revisar'?revisar:base.filter(x=>!pubRevisar(x));
  // para revisar: o que vence primeiro no topo; as demais, as mais recentes
  if(pubAba==='revisar'&&!pubFiltroPid)lista=[...lista].sort((a,b)=>(vencimentoPub(a)||'9999')<(vencimentoPub(b)||'9999')?-1:1);
  else lista=[...lista].sort((a,b)=>b.data<a.data?-1:b.data>a.data?1:0).slice(0,60);
  const oabs=c.oabs.map(o=>chaveOab(o.numero,o.uf));
  const selOab=oabs.length>1
    ?`<select class="pr-oabsel" onchange="filtrarOabPub(this.value)" title="Filtrar pela OAB"><option value="todas">Todas as OABs</option>${oabs.map(k=>`<option value="${k}" ${pubFiltroOab===k?'selected':''}>${esc(rotuloOab(k))}</option>`).join('')}</select>`:'';
  const p=pubFiltroPid?processoPorId(pubFiltroPid):null;
  const abas=pubFiltroPid
    ?`<button class="on">${esc(p?(p.ativo||'').split(' ')[0]+' × '+(p.passivo||'').split(' ')[0]:'Processo')}</button><button onclick="mudarAbaPub('revisar')"><i class="ti ti-x"></i></button>`
    :`<button class="${pubAba==='revisar'?'on':''}" onclick="mudarAbaPub('revisar')">Para revisar${revisar.length?` <span class="n">${revisar.length}</span>`:''}</button>
      <button class="${pubAba==='tratadas'?'on':''}" onclick="mudarAbaPub('tratadas')">Conferidas</button>`;
  const ult=c.ultimaBusca?'atualizado '+tempoRelativo(c.ultimaBusca):'';
  const erro=__djenUltimoErro||c.ultimoErro;
  el.className='pr-painel';
  el.innerHTML=`
    <div class="pr-head">
      <h3>Publicações</h3>
      <div class="pr-abas">${abas}</div>
      <span class="pr-ult ${erro?'erro':''}" title="${esc(erro||'')}">${erro?'<i class="ti ti-alert-triangle"></i> falha na última busca':esc(ult)}</span>
      ${selOab}
      <button class="btn-ico btn-buscar-djen" onclick="buscarDJEN({})" title="Buscar agora no DJEN"><i class="ti ti-refresh"></i></button>
      <button class="btn-ico" onclick="abrirConfigDJEN()" title="OABs, feriados e antecedência"><i class="ti ti-settings"></i></button>
    </div>
    <div class="pr-lista">${lista.length?lista.map(pubItemHTML).join('')
      :`<div class="pr-vazio">${pubAba==='revisar'?'<i class="ti ti-circle-check"></i> Nada para revisar.':'Nenhuma publicação.'}</div>`}</div>`;
}
function pubItemHTML(x){
  const p=processoPorId(x.pid);
  const ts=pubTarefas(x);
  const pz=ts.find(t=>t.tipo==='prazo'), au=ts.find(t=>t.tipo==='audiencia');
  const rg=x.regra||{};
  const revisar=pubRevisar(x);
  const aberto=pubAbertas.has(x.id);
  const venc=pz?pz.prazoFatal:au?au.prazo:'';
  const titulo=pz?esc(pz.titulo.split(' — ')[0])+(rg.dias?` <span class="pr-dias">${rg.dias}d${rg.contagem==='corridos'?' corridos':''}</span>`:'')
    :au?'Audiência'+(au.hora?' às '+esc(au.hora):'')
    :x.status==='ignorada'?'Ignorada'
    :esc((rg.motivo||'Sem prazo').split(' — ')[0].replace(/^./,ch=>ch.toUpperCase()));
  const partes=p?esc((p.ativo||'')+' × '+(p.passivo||'')):esc(x.partes.map(d=>d.nome).slice(0,2).join(' × ')||x.numMask);
  const conf=ts.some(t=>t.conferir&&t.status!=='concluido');
  let acao='';
  if(revisar){
    if(pz&&pz.conferir)acao=`<button class="pr-ok" onclick="event.stopPropagation();confirmarPub('${x.id}')"><i class="ti ti-check"></i>Confirmar</button>`;
    else if(au&&au.conferir)acao=`<button class="pr-ok" onclick="event.stopPropagation();confirmarTarefaPub('${x.id}','${au.id}')"><i class="ti ti-check"></i>Confirmar</button>`;
    else if(!p)acao=`<button class="pr-ok sec" onclick="event.stopPropagation();cadastrarProcessoDaPub('${x.id}')">Cadastrar processo</button>`;
    else acao=`<button class="pr-ok sec" onclick="event.stopPropagation();marcarPub('${x.id}','tratada')"><i class="ti ti-check"></i>Ciente</button>`;
  }else{
    acao=`<span class="pr-feito"><i class="ti ti-circle-check"></i></span>`;
  }
  // detalhe (só ao abrir)
  let det='';
  if(aberto){
    const c2=pz&&rg.dias?(x.calc||calcularPrazoFatal(x.data,rg.dias,rg.contagem||'uteis')):null;
    det=`<div class="pr-det" onclick="event.stopPropagation()">
      ${c2?`<div class="pr-trilha">Disponibilizada <b>${fmtDataSem(x.data)}</b> → publicada <b>${fmtDataSem(c2.publicacao)}</b> → conta de <b>${fmtDataSem(c2.inicio)}</b> → vence <b>${fmtDataSem(pz.prazoFatal)}</b> · entrega interna ${fmtDataSem(pz.prazo)} (${esc(pz.resp)})</div>`:''}
      ${rg.base?`<div class="pr-base">${esc(rg.base.charAt(0).toUpperCase()+rg.base.slice(1))}.</div>`:''}
      <div class="pr-meta">${esc(x.numMask)} · ${esc(x.tribunal)}${x.orgao?' · '+esc(x.orgao):''} · ${esc(x.tipoDoc||x.tipo)} · ${oabsDaPub(x).map(k=>esc(rotuloOab(k))).join(', ')||'OAB não identificada'}</div>
      ${x.semConteudo?`<div class="pr-pje"><i class="ti ti-lock"></i>O tribunal não publicou o conteúdo do ato no DJEN — abra o documento no PJe para ler.</div>`:''}
      <div class="pr-txt">${esc(x.texto)}</div>
      <div class="pr-links">
        ${x.link?`<a href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">Abrir no tribunal</a>`:''}
        ${revisar&&pz&&pz.conferir?`<a onclick="abrirModalPrazo({pubId:'${x.id}',ajustar:true})">Ajustar prazo</a><a onclick="semPrazoPub('${x.id}')">Não há prazo</a>`:''}
        ${revisar&&!pz&&p?`<a onclick="abrirModalPrazo({pubId:'${x.id}'})">Criar prazo</a>`:''}
        ${!p&&x.status!=='ignorada'?`<a onclick="cadastrarProcessoDaPub('${x.id}')">Cadastrar processo</a>`:''}
        ${p?`<a onclick="irParaProcesso('${p.id}')">Ver processo</a>`:''}
        ${revisar?`<a class="sutil" onclick="ignorarPub('${x.id}')">Ignorar publicação</a>`:`<a class="sutil" onclick="reabrirPub('${x.id}')">Voltar para revisar</a>`}
      </div>
    </div>`;
  }
  return `<div class="pr-item ${revisar?'':'feita'} ${aberto?'aberto':''}" onclick="alternarTextoPub('${x.id}')">
    <div class="pr-linha">
      ${venc?chipVencimento(venc):`<span class="vc vc-sem"><b>${fmtDataCurta(x.data)}</b>publicada</span>`}
      <div class="pr-info">
        <div class="pr-tt">${titulo}${conf&&!revisar?'':''}${x.semConteudo?' <i class="ti ti-lock pr-lock" title="Conteúdo disponível só no PJe"></i>':''}${p&&p.revisar?' <i class="pl-novo">processo novo</i>':''}</div>
        <div class="pr-sub">${partes}</div>
      </div>
      <span class="pr-oab" title="${esc(oabsDaPub(x).map(rotuloOab).join(' · '))}">${esc(oabsDaPub(x).map(nomeCurtoOab).join(' · '))}</span>
      ${acao}
      <i class="ti ti-chevron-down pr-chev"></i>
    </div>
    ${det}
  </div>`;
}
function marcarConferida(t){
  delete t.conferir;
  t.conferidoEm=Date.now();t.conferidoPor=EU?EU.nome:'';
}
function fecharPubSeConferida(x){
  if(!pubConferirPendente(x)&&x.status!=='ignorada'){x.status='tratada';x.tratadaEm=Date.now();x.tratadaPor=EU?EU.nome:'';}
}
function confirmarPub(id){
  const x=(DB.publicacoes||[]).find(y=>y.id===id);if(!x)return;
  pubTarefas(x).filter(t=>t.tipo==='prazo'&&t.conferir).forEach(marcarConferida);
  fecharPubSeConferida(x);podarPublicacoes();
  salvarDB();refreshUI();
  mostrarToast('Prazo confirmado e mantido na Rotina.');
}
function confirmarTarefaPub(id,tid){
  const x=(DB.publicacoes||[]).find(y=>y.id===id);const t=DB.tarefas.find(y=>y.id===tid);
  if(!x||!t)return;
  marcarConferida(t);fecharPubSeConferida(x);podarPublicacoes();
  salvarDB();refreshUI();
}
// tira da Rotina as tarefas automáticas ainda não conferidas desta publicação
function removerTarefasAuto(x,soPrazo){
  const remover=pubTarefas(x).filter(t=>t.conferir&&t.status!=='concluido'&&(!soPrazo||t.tipo==='prazo'));
  const ids=new Set(remover.map(t=>t.id));
  DB.tarefas=DB.tarefas.filter(t=>!ids.has(t.id));
  x.tarefaIds=(x.tarefaIds||[]).filter(i=>!ids.has(i));
  return remover;
}
function semPrazoPub(id){
  const x=(DB.publicacoes||[]).find(y=>y.id===id);if(!x)return;
  const antes={status:x.status,tarefaIds:[...(x.tarefaIds||[])]};
  const removidas=removerTarefasAuto(x,true);
  x.regra={...(x.regra||{}),dias:0,fonte:'nenhum',motivo:'marcado sem prazo por '+(EU?EU.nome:'usuário')};
  if(!pubConferirPendente(x)){x.status='tratada';x.tratadaEm=Date.now();x.tratadaPor=EU?EU.nome:'';}
  salvarDB();refreshUI();
  mostrarToast('Prazo retirado da Rotina.','Desfazer',()=>{DB.tarefas.push(...removidas);Object.assign(x,antes);salvarDB();refreshUI();});
}
function ignorarPub(id){
  const x=(DB.publicacoes||[]).find(y=>y.id===id);if(!x)return;
  const antes={status:x.status,tarefaIds:[...(x.tarefaIds||[])]};
  const removidas=removerTarefasAuto(x,false);
  x.status='ignorada';x.tratadaEm=Date.now();x.tratadaPor=EU?EU.nome:'';
  podarPublicacoes();
  salvarDB();refreshUI();
  mostrarToast('Publicação ignorada'+(removidas.length?' e '+removidas.length+' tarefa'+(removidas.length>1?'s':'')+' retirada'+(removidas.length>1?'s':'')+' da Rotina':'')+'.','Desfazer',
    ()=>{DB.tarefas.push(...removidas);Object.assign(x,antes);salvarDB();refreshUI();});
}
function marcarPub(id,status){
  const x=(DB.publicacoes||[]).find(y=>y.id===id);if(!x)return;
  x.status=status;
  if(status!=='nova'){x.tratadaEm=Date.now();x.tratadaPor=EU?EU.nome:'';}
  podarPublicacoes();
  salvarDB();refreshUI();
}
function reabrirPub(id){
  const x=(DB.publicacoes||[]).find(y=>y.id===id);if(!x)return;
  x.status=pubTarefas(x).length?'auto':'nova';
  pubTarefas(x).forEach(t=>{if(t.status!=='concluido')t.conferir=true;});
  salvarDB();refreshUI();
}
function vincularPubManual(pubId,pid){
  const x=(DB.publicacoes||[]).find(y=>y.id===pubId);const p=processoPorId(pid);
  if(!x||!p)return;
  if(normalizarCNJ(p.num)!==x.num&&normalizarCNJ(p.numCNJ)!==x.num&&x.num.length===20&&!p.numCNJ)p.numCNJ=x.numMask;
  const r=vincularPublicacao(x,p);
  salvarDB();refreshUI();
  if(r.prazos||r.audiencias)mostrarToast('Publicação vinculada e prazo calculado — confira.');
}
function cadastrarProcessoDaPub(pubId){
  const x=(DB.publicacoes||[]).find(y=>y.id===pubId);if(!x)return;
  abrirModalProc(null,null);
  mpCtx.pubId=pubId;
  document.getElementById('mp-num').value=x.numMask||x.num;
  document.getElementById('mp-ativo').value=x.partes.filter(d=>/^a/i.test(d.polo)).map(d=>d.nome).join(', ');
  document.getElementById('mp-passivo').value=x.partes.filter(d=>/^p/i.test(d.polo)).map(d=>d.nome).join(', ');
  document.getElementById('mp-orgao').value=[x.tribunal,x.orgao].filter(Boolean).join(' — ');
  const a=areaPorNumero(x.num,x.tribunal);
  if(a&&areaInfo(a))document.getElementById('mp-area').value=a;
  const r=respDaPublicacao(null,x);
  if(RESP.includes(r))document.getElementById('mp-resp').value=r;
}

// ─── MODAL: CONFIGURAÇÃO DO DJEN ──────────────────────────
function abrirConfigDJEN(){
  const c=djenCfg();
  renderOabsDJEN();
  document.getElementById('djen-antecedencia').value=c.antecedencia;
  document.getElementById('djen-auto').checked=c.autoBuscar;
  document.getElementById('djen-autocad').checked=c.autoCadastrar;
  document.getElementById('djen-feriados').value=c.feriados.map(fmtData).join('\n');
  const {inicio,fim}=janelaBuscaDJEN();
  document.getElementById('djen-links').innerHTML=c.oabs.length
    ?c.oabs.map(o=>`<a href="${esc(urlDJEN(o,inicio,fim,1))}" target="_blank" rel="noopener noreferrer" style="color:var(--navy)">Publicações da OAB ${esc(o.numero)}/${esc(o.uf)} de ${fmtData(inicio)} a ${fmtData(fim)}</a>`).join('<br>')
    :'<span style="color:var(--t3)">Cadastre uma OAB para gerar o link.</span>';
  abrirOverlay('overlay-djen');
}
function renderOabsDJEN(){
  const c=djenCfg();
  document.getElementById('djen-oabs').innerHTML=c.oabs.length?c.oabs.map((o,i)=>`
    <div class="cfgtipo-row">
      <i class="ti ti-id-badge-2" style="font-size:18px;color:var(--t3)"></i>
      <span style="flex:1;font-size:14px"><b>${esc(o.numero)}/${esc(o.uf)}</b>${o.nome?' · '+esc(o.nome):''}</span>
      <button class="btn-ico" onclick="removerOabDJEN(${i})" title="Parar de monitorar"><i class="ti ti-trash"></i></button>
    </div>`).join(''):'<p style="font-size:13px;color:var(--t3);padding:6px 0">Nenhuma OAB cadastrada.</p>';
}
function adicionarOabDJEN(){
  const numero=soDigitos(document.getElementById('djen-oab-num').value);
  const uf=document.getElementById('djen-oab-uf').value.trim().toUpperCase();
  const nome=document.getElementById('djen-oab-nome').value.trim();
  if(!numero||!/^[A-Z]{2}$/.test(uf)){alert('Informe o número da OAB e a UF com duas letras.');return;}
  const c=djenCfg();
  if(c.oabs.some(o=>o.numero===numero&&o.uf===uf)){alert('Essa OAB já está na lista.');return;}
  c.oabs.push({numero,uf,nome});
  ['djen-oab-num','djen-oab-uf','djen-oab-nome'].forEach(id=>document.getElementById(id).value='');
  salvarDB();renderOabsDJEN();renderStatusDJEN();
}
function removerOabDJEN(i){
  const c=djenCfg();
  if(!confirm('Parar de monitorar a OAB '+c.oabs[i].numero+'/'+c.oabs[i].uf+'?'))return;
  c.oabs.splice(i,1);salvarDB();renderOabsDJEN();renderStatusDJEN();
}
function salvarConfigDJEN(){
  const c=djenCfg();
  const ant=parseInt(document.getElementById('djen-antecedencia').value,10);
  c.antecedencia=Number.isNaN(ant)?2:Math.max(0,Math.min(10,ant));
  c.autoBuscar=document.getElementById('djen-auto').checked;
  c.autoCadastrar=document.getElementById('djen-autocad').checked;
  const fer=[],ruins=[];
  document.getElementById('djen-feriados').value.split('\n').forEach(l=>{
    const m=l.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if(m)fer.push(m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'));
    else if(l.trim())ruins.push(l.trim());
  });
  if(ruins.length&&!confirm('Estas linhas não estão no formato dd/mm/aaaa e serão descartadas:\n\n'+ruins.join('\n')+'\n\nContinuar?'))return;
  c.feriados=[...new Set(fer)].sort();
  salvarDB();fecharOverlay('overlay-djen');refreshUI();
}
