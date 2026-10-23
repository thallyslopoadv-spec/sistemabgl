}
// ═══════════════════════════════════════════════════════════
//  PROJETOS EM ANDAMENTO (painel da aba Rotina)
// ═══════════════════════════════════════════════════════════
// Não existe uma lista separada de projetos: o painel lê as próprias tarefas da
// Rotina. Entram as que estão em aberto e têm cara de trabalho de elaboração
// (peça, inicial, prazo, regulamento, parecer…). Tarefa simples ou administrativa
// fica de fora, e qualquer tarefa pode ser incluída/excluída à mão no modal.
// O painel abre em grupos por tipo de tarefa (Iniciais, Petições…) e cada card
// mostra o andamento em barra de carregamento — o percentual sai das etapas
// cadastradas dentro do projeto (nada de número inventado).
// Campos guardados na própria tarefa:
//   projeto · statusExec · statusExecEm · statusExecPor · etapas[{id,nome,feita,feitaEm}]
const TIPOS_PROJETO=['inicial','peticao','prazo'];
const PALAVRAS_PROJETO=['contestacao','peticao','inicial','recurso','apelacao','agravo','embargo',
  'memorial','alegacoes','replica','impugnacao','manifestacao','defesa','contrarrazoes','razoes',
  'parecer','minuta','contrato','regulamento','estatuto','politica interna','compliance','projeto',
  'tese','reclamatoria','habeas','mandado de seguranca','relatorio','laudo','elaborar','elaboracao','redigir'];
// controle administrativo puro: nunca entra no painel, mesmo com tipo de projeto
const PALAVRAS_NAO_PROJETO=['conferir recebimento','cobrar','cobranca','ligar para','telefonar',
  'agendar','confirmar presenca','enviar boleto','emitir boleto','arquivar'];
function semAcento(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')}
// tarefa com cara de projeto, pelo tipo ou pelo próprio título
function ehProjetoAuto(t){
  if(!t)return false;
  if(t.tipo==='followup'||t.tipo==='lead')return false;
  const tit=semAcento(t.titulo);
  if(PALAVRAS_NAO_PROJETO.some(p=>tit.includes(p)))return false;
  if(TIPOS_PROJETO.includes(t.tipo))return true;
  return PALAVRAS_PROJETO.some(p=>tit.includes(p));
}
// t.projeto: true/false marcado à mão · ausente = decisão automática
function projetoMarcado(t){return t&&t.projeto!==undefined?t.projeto===true:ehProjetoAuto(t)}
function ehProjeto(t){return !!t&&t.status!=='concluido'&&projetoMarcado(t)}
function projetosEmAndamento(){
  const hoje=hojeISO();
  return DB.tarefas.filter(ehProjeto).sort((a,b)=>{
    const aAtr=!!(a.prazo&&a.prazo<hoje),bAtr=!!(b.prazo&&b.prazo<hoje);
    if(aAtr!==bAtr)return aAtr?-1:1;                       // atrasados primeiro
    const pa=a.prazo||'9999-99-99',pb=b.prazo||'9999-99-99';
    if(pa!==pb)return pa<pb?-1:1;                          // depois, prazo mais próximo
    return (b.statusExecEm||0)-(a.statusExecEm||0);        // e o que foi atualizado por último
  });
}

// ─── ETAPAS E PERCENTUAL DE ANDAMENTO ────────────────────
// O andamento é contado: etapas marcadas ÷ etapas cadastradas. Projeto sem
// etapa nenhuma fica em 0% e pede o cadastro — nunca se inventa progresso.
const ETAPAS_MODELO=['Levantamento de documentos','Estudo do caso e da tese',
  'Elaboração dos tópicos de direito','Revisão','Protocolo / entrega'];
function etapasDe(t){return Array.isArray(t.etapas)?t.etapas:[]}
// null = ainda sem etapas cadastradas
function pctProjeto(t){
  const e=etapasDe(t);
  if(!e.length)return null;
  return Math.round(e.filter(x=>x.feita).length*100/e.length);
}
// carimba quem mexeu no projeto e quando (vale para etapa em texto e para as etapas)
function carimbarProjeto(t){t.statusExecEm=Date.now();t.statusExecPor=EU?EU.nome:'';}
// atalhos de etapa — o texto continua livre, isto só poupa digitação
const STATUS_EXEC_SUGESTOES=[
  'COM THALLYS — INÍCIO DO PROJETO',
  'COM THALLYS — elaboração dos tópicos de direito',
  'COM CECÍLIA — revisão da fundamentação',
  'COM CECÍLIA E THALLYS — alinhamento da estratégia',
  'AGUARDANDO DOCUMENTOS DO CLIENTE',
  'EM REVISÃO',
  'FINALIZAÇÃO',
];
function definirStatusExec(t,texto){
  const novo=(texto||'').trim();
  if(novo===(t.statusExec||'').trim())return false;
  t.statusExec=novo;
  carimbarProjeto(t);
  return true;
}
function tempoRelativo(ts){
  if(!ts)return '';
  const dif=Date.now()-ts;
  if(dif<0)return fmtDataHora(ts);
  const min=Math.floor(dif/60000);
  if(min<1)return 'agora há pouco';
  if(min<60)return 'há '+min+' min';
  const h=Math.floor(min/60);
  if(h<24)return 'há '+h+'h';
  const d=Math.floor(h/24);
  if(d===1)return 'ontem';
  if(d<30)return 'há '+d+' dias';
  return fmtDataHora(ts);
}

let projEditando=null;    // id da tarefa com a etapa em texto aberta para edição
let projFocoEtapa=null;   // id da tarefa cujo campo "nova etapa" deve receber o foco
const PROJ_BLOCOS=10;     // blocos da barra de carregamento

// barra estilo "loading": blocos acesos conforme o percentual real
function barraCarregamento(pct){
  const acesos=Math.round((pct||0)/100*PROJ_BLOCOS);
  let segs='';
  for(let i=0;i<PROJ_BLOCOS;i++){
    const on=i<acesos;
    const frente=on&&i===acesos-1&&pct<100;   // último bloco pulsa: trabalho em curso
    segs+=`<span class="proj-load-seg${on?' on':''}${frente?' frente':''}"></span>`;
  }
  return `<div class="proj-load"><div class="proj-load-track">${segs}</div><span class="proj-pct">${pct||0}%</span></div>`;
}
function projCard(t){
  const av=corResp(t.resp),cli=nomeCliente(t.cid),pi=prazoInfo(t);
  const atrasado=!!(t.prazo&&t.prazo<hojeISO());
  const editando=projEditando===t.id;
  const status=(t.statusExec||'').trim();
  const quando=t.statusExecEm?tempoRelativo(t.statusExecEm):'';
  const porQuem=t.statusExecPor?' · por '+esc(t.statusExecPor):'';
  const stCls=t.status==='andamento'?'st-andamento':'st-pendente';
  const etapas=etapasDe(t);
  const pct=pctProjeto(t);
  const feitas=etapas.filter(e=>e.feita).length;
  const subBarra=etapas.length
    ? (pct===100
        ? `<div class="proj-load-sub pronto">Todas as ${etapas.length} etapas concluídas — pronto para encerrar.</div>`
        : `<div class="proj-load-sub">${feitas} de ${etapas.length} etapa${etapas.length!==1?'s':''} concluída${feitas!==1?'s':''}</div>`)
    : '<div class="proj-load-sub">Sem etapas cadastradas — o andamento começa em 0%.</div>';
  const blocoStatus=editando
    ? `<div class="proj-status">
         <div class="proj-status-lbl"><i class="ti ti-activity"></i>Etapa atual</div>
         <input type="text" class="proj-input" id="proj-input-${t.id}" value="${esc(status)}"
           placeholder="Ex.: COM THALLYS — elaboração dos tópicos de direito"
           onkeydown="if(event.key==='Enter'){event.preventDefault();projSalvarStatus('${t.id}')}else if(event.key==='Escape')projCancelarStatus()">
         <div class="proj-sug">${STATUS_EXEC_SUGESTOES.map((x,i)=>`<button type="button" onclick="projSugestao('${t.id}',${i})">${esc(x)}</button>`).join('')}</div>
         <div class="proj-edit-btns">
           <button class="proj-btn" onclick="projSalvarStatus('${t.id}')">Salvar etapa</button>
           <button class="proj-btn sec" onclick="projCancelarStatus()">Cancelar</button>
         </div>
       </div>`
    : `<div class="proj-status clicavel" onclick="projEditarStatus('${t.id}')" title="Clique para atualizar a etapa atual">
         <div class="proj-status-lbl"><i class="ti ti-activity"></i>Etapa atual<i class="ti ti-pencil" style="margin-left:auto"></i></div>
         <div class="proj-status-txt ${status?'':'vazio'}">${status?esc(status):'Sem etapa informada — clique para escrever em que ponto está.'}</div>
       </div>`;
  const listaEtapas=etapas.length
    ? etapas.map(e=>`<div class="proj-etapa ${e.feita?'feita':''}">
         <span class="proj-etapa-check" onclick="projToggleEtapa('${t.id}','${e.id}')" title="${e.feita?'Desmarcar':'Marcar como concluída'}"><i class="ti ti-check"></i></span>
         <span class="proj-etapa-nome" onclick="projToggleEtapa('${t.id}','${e.id}')"${e.feitaEm?` title="Concluída em ${esc(fmtDataHora(e.feitaEm))}"`:''}>${esc(e.nome)}</span>
         <button class="proj-etapa-del" onclick="projExcluirEtapa('${t.id}','${e.id}')" title="Excluir etapa"><i class="ti ti-x"></i></button>
       </div>`).join('')
    : `<div class="proj-etapas-vazio">Cadastre as etapas deste projeto para acompanhar o andamento.</div>
       <button class="proj-modelo" onclick="projEtapasModelo('${t.id}')">usar etapas padrão de uma peça</button>`;
  return `<div class="proj-card" id="proj-card-${t.id}" data-atraso="${atrasado?1:0}" data-pct="${pct===null?0:pct}">
    <div class="proj-body">
      <div class="proj-titulo">${esc(t.titulo)}</div>
      <div class="proj-meta">
        ${cli?`<span class="task-cli" onclick="irParaCliente('${t.cid}')">${esc(cli)}</span>`:''}
        <span class="prazo-badge ${pi.cls}"${pi.titulo?` title="${esc(pi.titulo)}"`:''}>${pi.txt}</span>
      </div>
      <div class="proj-resp" title="Responsável">
        <div class="av" style="background:${av[0]};color:${av[1]}">${avatarResp(t.resp)}</div>
        <span class="nm">${esc(t.resp||'—')}</span>
      </div>
      ${barraCarregamento(pct)}
      ${subBarra}
      ${blocoStatus}
      <div class="proj-etapas">
        <div class="proj-etapas-lbl"><i class="ti ti-list-check"></i>Etapas do projeto</div>
        ${listaEtapas}
        <div class="proj-etapa-nova">
          <input type="text" class="proj-input" id="proj-etapa-${t.id}" placeholder="Nova etapa…"
            onkeydown="if(event.key==='Enter'){event.preventDefault();projAdicionarEtapa('${t.id}')}">
          <button class="proj-etapa-add" onclick="projAdicionarEtapa('${t.id}')">Incluir</button>
        </div>
      </div>
      <div class="proj-foot">
        <span class="proj-atualizado"><i class="ti ti-clock"></i>${quando?'Atualizado '+esc(quando)+porQuem:'Ainda sem atualização'}</span>
        <span class="proj-acoes">
          <span class="st-pill ${stCls}" onclick="cicloTarefa('${t.id}')" title="Clique para avançar o status (ao concluir, sai do painel)">${ST_LBL[t.status]}</span>
          <button class="btn-ico" onclick="abrirModalTarefa('${t.id}',null)" title="Editar rotina"><i class="ti ti-pencil"></i></button>
        </span>
      </div>
    </div>
  </div>`;
}
// ─── SELO NAS ROTINAS ────────────────────────────────────
// Nas colunas da Rotina, a tarefa que é projeto ganha um selo com o andamento.
// Em âmbar quando falta alimentar (sem etapas cadastradas ou parada há mais de
// uma semana), para o acompanhamento não passar em branco.
const PROJ_DIAS_PARADO=7;
function projetoParado(t){
  return !t.statusExecEm||(Date.now()-t.statusExecEm)>PROJ_DIAS_PARADO*86400000;
}
function seloProjeto(t){
  if(!ehProjeto(t))return '';
  const pct=pctProjeto(t);
  const parado=projetoParado(t);
  const alerta=(pct===null||parado)?1:0;
  const pronto=pct===100?1:0;
  const txt=pct===null?'Projeto · sem etapas':'Projeto '+pct+'%';
  const dica=[
    pct===null?'Este projeto ainda não tem etapas cadastradas.':'Andamento: '+pct+'% das etapas concluídas.',
    (t.statusExec||'').trim()?'Etapa atual: '+t.statusExec:'Sem etapa atual informada.',
    t.statusExecEm?'Última atualização '+tempoRelativo(t.statusExecEm)+(t.statusExecPor?' por '+t.statusExecPor:''):'Ainda sem atualização.',
    'Clique para abrir em Projetos em andamento.'
  ].join('\n');
  return `<span class="task-proj" data-alerta="${alerta}" data-pronto="${pronto}" onclick="event.stopPropagation();irParaProjeto('${t.id}')" title="${esc(dica)}"><i class="ti ti-${alerta?'alert-circle':'rocket'}"></i>${esc(txt)}</span>`;
}
// abre o painel no grupo certo e rola até o card do projeto
function irParaProjeto(id){
  const t=DB.tarefas.find(x=>x.id===id);
  if(!t)return;
  navegarPara('rotina');
  blocosRecolhidos['projetos:painel']=false;
  blocosRecolhidos['projetos:tipo:'+(t.tipo||'outro')]=false;
  try{localStorage.setItem(LS_RECOLHIDAS,JSON.stringify(blocosRecolhidos))}catch(e){}
  renderProjetos();
  setTimeout(()=>{
    const card=document.getElementById('proj-card-'+id);
    if(!card)return;
    card.scrollIntoView({behavior:'smooth',block:'center'});
    card.classList.add('destaque');
    setTimeout(()=>card.classList.remove('destaque'),1800);
  },80);
}
function renderProjetos(){
  const el=document.getElementById('proj-panel');
  if(!el)return;
  const lista=projetosEmAndamento();
  if(projEditando&&!lista.some(t=>t.id===projEditando))projEditando=null;
  const fechado=blocoRecolhido('projetos:painel',true);
  // agrupa por tipo de tarefa: Iniciais, Petições, Prazos…
  const grupos={};
  lista.forEach(t=>{const k=t.tipo||'outro';(grupos[k]=grupos[k]||[]).push(t)});
  const chaves=Object.keys(grupos).sort((a,b)=>tipoInfo(a).lbl.localeCompare(tipoInfo(b).lbl,'pt-BR'));
  const pctsGeral=lista.map(pctProjeto).filter(p=>p!==null);
  const mediaGeral=pctsGeral.length?Math.round(pctsGeral.reduce((a,b)=>a+b,0)/pctsGeral.length):null;
  const corpo=lista.length?chaves.map(k=>{
    const ts=grupos[k],info=tipoInfo(k);
    const chave='projetos:tipo:'+k;
    const gf=blocoRecolhido(chave,true);
    const pcts=ts.map(pctProjeto).filter(p=>p!==null);
    const media=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;
    return `<div class="proj-grupo ${gf?'recolhida':''}">
      <div class="proj-grupo-head" onclick="alternarBloco('${chave}',true)" title="${gf?'Clique para ver os projetos':'Clique para recolher'}">
        ${chevron()}
        <span class="proj-grupo-nome" style="border-left-color:${info.cor}">${esc(info.lbl)}</span>
        <span class="ct">${ts.length} projeto${ts.length!==1?'s':''}</span>
        ${media!==null?`<span class="proj-grupo-media"><span class="proj-grupo-mini"><i style="width:${media}%"></i></span>${media}% em média</span>`:''}
      </div>
      <div class="proj-grupo-corpo"><div class="proj-grid">${ts.map(projCard).join('')}</div></div>
    </div>`;
  }).join('')
  :`<div class="proj-vazio">Nenhum projeto em execução no momento.<br>
     As rotinas de elaboração em aberto (peças, iniciais, regulamentos, pareceres…) aparecem aqui automaticamente.</div>`;
  el.className='proj-panel'+(fechado?' recolhida':'');
  el.innerHTML=`
    <div class="proj-panel-head" onclick="alternarBloco('projetos:painel',true)" title="${fechado?'Clique para abrir':'Clique para recolher'}">
      ${chevron()}
      <h3>Projetos em andamento</h3>
      <span class="ct">${lista.length} projeto${lista.length!==1?'s':''}</span>
      <span class="sub">${lista.length?(mediaGeral!==null?'andamento médio '+mediaGeral+'% · agrupados por tipo':'agrupados por tipo · cadastre as etapas para medir o andamento'):'nada em execução'}</span>
    </div>
    <div class="proj-panel-corpo">${corpo}</div>`;
  // devolve o foco para onde o usuário estava digitando
  const foco=projEditando?document.getElementById('proj-input-'+projEditando)
            :projFocoEtapa?document.getElementById('proj-etapa-'+projFocoEtapa):null;
  if(foco){foco.focus();foco.setSelectionRange(foco.value.length,foco.value.length);}
  projFocoEtapa=null;
}
function projEditarStatus(id){projEditando=id;renderProjetos();}
function projCancelarStatus(){projEditando=null;renderProjetos();}
function projSugestao(id,i){
  const inp=document.getElementById('proj-input-'+id);
  if(!inp)return;
  inp.value=STATUS_EXEC_SUGESTOES[i];
  inp.focus();
}
function projSalvarStatus(id){
  const t=DB.tarefas.find(x=>x.id===id);
  const inp=document.getElementById('proj-input-'+id);
  if(!t||!inp)return;
  const mudou=definirStatusExec(t,inp.value);
  projEditando=null;
  if(mudou){salvarDB();refreshUI();}
  else renderProjetos();
}
// ─── etapas do projeto ───
function projAdicionarEtapa(id){
  const t=DB.tarefas.find(x=>x.id===id);
  const inp=document.getElementById('proj-etapa-'+id);
  if(!t||!inp)return;
  const nome=inp.value.trim();
  if(!nome)return;
  if(!Array.isArray(t.etapas))t.etapas=[];
  t.etapas.push({id:uid(),nome,feita:false,feitaEm:''});
  carimbarProjeto(t);
  inp.value='';
  projFocoEtapa=id;   // segue no campo, para cadastrar as etapas em sequência
  salvarDB();refreshUI();
}
function projEtapasModelo(id){
  const t=DB.tarefas.find(x=>x.id===id);
  if(!t)return;
  if(!Array.isArray(t.etapas))t.etapas=[];
  ETAPAS_MODELO.forEach(nome=>{
    if(!t.etapas.some(e=>e.nome===nome))t.etapas.push({id:uid(),nome,feita:false,feitaEm:''});
  });
  carimbarProjeto(t);
  salvarDB();refreshUI();
}
function projToggleEtapa(id,eid){
  const t=DB.tarefas.find(x=>x.id===id);
  if(!t)return;
  const e=etapasDe(t).find(x=>x.id===eid);
  if(!e)return;
  e.feita=!e.feita;
  e.feitaEm=e.feita?Date.now():'';
  carimbarProjeto(t);
  salvarDB();refreshUI();
}
function projExcluirEtapa(id,eid){
  const t=DB.tarefas.find(x=>x.id===id);
  if(!t)return;
  const e=etapasDe(t).find(x=>x.id===eid);
  if(!e)return;
  if(!confirm('Excluir a etapa "'+e.nome+'"?'))return;
  t.etapas=etapasDe(t).filter(x=>x.id!==eid);
  carimbarProjeto(t);
  salvarDB();refreshUI();
}

// ─── PAINEL: CUMPRIMENTO DE PRAZOS ───────────────────────
// Responde, olhando as tarefas concluídas: quantas saíram em atraso,
// quantos dias de atraso, quantas ficaram no prazo e quantas antes.
let desempenhoPeriodo='tudo';
function filtroDesempenho(p,btn){
  desempenhoPeriodo=p;
  document.querySelectorAll('#view-rotina .desemp-chips .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderDesempenhoRotina();
}
// data ISO de corte do período escolhido ('' = sem corte)
function cortePeriodoDesempenho(){
  const hoje=hojeISO();
  if(desempenhoPeriodo==='mes')return hoje.slice(0,8)+'01';
  if(desempenhoPeriodo==='30'||desempenhoPeriodo==='90'){
    const d=new Date(hojeTS()-Number(desempenhoPeriodo)*86400000);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  return '';
}
// resumo de um conjunto de tarefas concluídas
function resumoConclusao(tarefas){
  const r={total:tarefas.length,antecipada:0,noprazo:0,atrasada:0,semprazo:0,semregistro:0,
           diasAtraso:0,maiorAtraso:0,diasAntes:0,comPrazo:0,adiadas:0,foraDoOriginal:0};
  tarefas.forEach(t=>{
    const ci=conclusaoInfo(t);
    r[ci.cat]++;
    // "no prazo" depois de adiar não é o mesmo que no prazo combinado: conta à parte
    if(t.adiamentos){r.adiadas++;if(t.prazoOriginal&&t.concluidoEm&&t.concluidoEm>t.prazoOriginal)r.foraDoOriginal++;}
    if(ci.cat==='atrasada'){r.diasAtraso+=ci.dias;r.comPrazo++;if(ci.dias>r.maiorAtraso)r.maiorAtraso=ci.dias;}
    else if(ci.cat==='noprazo'){r.comPrazo++;}
    else if(ci.cat==='antecipada'){r.diasAntes+=-ci.dias;r.comPrazo++;}
  });
  r.dentroDoPrazo=r.antecipada+r.noprazo;
  r.pctNoPrazo=r.comPrazo?Math.round(r.dentroDoPrazo*100/r.comPrazo):null;
  r.mediaAtraso=r.atrasada?(r.diasAtraso/r.atrasada):0;
  r.mediaAntes=r.antecipada?(r.diasAntes/r.antecipada):0;
  return r;
}
function numDias(n){return (Math.round(n*10)/10).toString().replace('.',',')}
function renderDesempenhoRotina(){
  const el=document.getElementById('rotina-desempenho');
  if(!el)return;
  const corte=cortePeriodoDesempenho();
  const concluidas=DB.tarefas.filter(t=>t.tipo!=='followup'&&t.status==='concluido');
  // o corte de período só se aplica ao que tem data registrada; as sem data
  // ficam de fora do recorte (mas continuam contadas em "Tudo")
  const lista=corte?concluidas.filter(t=>t.concluidoEm&&t.concluidoEm>=corte):concluidas;
  const r=resumoConclusao(lista);
  if(!r.total){
    el.innerHTML='<p class="desemp-vazio">Nenhuma tarefa concluída neste período.</p>';
    return;
  }
  const semData=r.semregistro;
  const boxes=`
    <div class="desemp-grid">
      <div class="desemp-box" data-c="green">
        <div class="desemp-lbl">Dentro do prazo</div>
        <div class="desemp-val">${r.dentroDoPrazo}</div>
        <div class="desemp-sub">${r.antecipada} antes · ${r.noprazo} no dia${r.mediaAntes?' · média '+numDias(r.mediaAntes)+'d antes':''}</div>
      </div>
      <div class="desemp-box" data-c="red">
        <div class="desemp-lbl">Em atraso</div>
        <div class="desemp-val">${r.atrasada}</div>
        <div class="desemp-sub">${r.atrasada?'média '+numDias(r.mediaAtraso)+'d · pior '+r.maiorAtraso+'d':'nenhuma tarefa entregue com atraso'}</div>
      </div>
      <div class="desemp-box">
        <div class="desemp-lbl">% no prazo</div>
        <div class="desemp-val">${r.pctNoPrazo===null?'—':r.pctNoPrazo+'%'}</div>
        <div class="desemp-sub">${r.comPrazo} tarefa${r.comPrazo!==1?'s':''} com prazo definido${r.adiadas?' · '+r.adiadas+' adiada'+(r.adiadas>1?'s':'')+(r.foraDoOriginal?', '+r.foraDoOriginal+' entregue'+(r.foraDoOriginal>1?'s':'')+' depois da data original':''):''}</div>
      </div>
      <div class="desemp-box">
        <div class="desemp-lbl">Fora da conta</div>
        <div class="desemp-val">${r.semprazo+semData}</div>
        <div class="desemp-sub">${r.semprazo} sem prazo · ${semData} sem data de conclusão</div>
      </div>
    </div>`;
  const linhas=RESP.map(nome=>{
    const rr=resumoConclusao(lista.filter(t=>t.resp===nome));
    if(!rr.total)return `<tr><td class="nome">${esc(nome)}</td><td colspan="5" style="text-align:right;color:var(--t3)">nenhuma conclusão no período</td></tr>`;
    return `<tr>
      <td class="nome">${esc(nome)}</td>
      <td>${rr.total}</td>
      <td class="ok">${rr.antecipada}</td>
      <td>${rr.noprazo}</td>
      <td class="${rr.atrasada?'atraso':''}">${rr.atrasada}</td>
      <td class="${rr.atrasada?'atraso':''}">${rr.atrasada?numDias(rr.mediaAtraso)+'d':'—'}</td>
    </tr>`;
  }).join('');
  el.innerHTML=boxes+`
    <div class="desemp-tab-wrap"><table class="desemp-tab">
      <thead><tr>
        <th>Responsável</th><th>Concluídas</th><th>Antes</th><th>No dia</th><th>Em atraso</th><th>Atraso médio</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>
    ${semData?`<p class="desemp-vazio">${semData} tarefa${semData>1?'s':''} concluída${semData>1?'s':''} antes deste controle não tem data registrada — abra a tarefa e informe a data para ela entrar na conta.</p>`:''}`;
}

// avança status: pendente → andamento → concluído → pendente
// ao entrar em "concluído" carimba a data de hoje; ao sair, apaga
function cicloTarefa(id){
  const t=DB.tarefas.find(x=>x.id===id);if(!t)return;
  const proximo=t.status==='pendente'?'andamento':t.status==='andamento'?'concluido':'pendente';
  if(proximo==='concluido'&&revBloqueiaConclusao(t)){mostrarToast(avisoRevConclusao(t));return;}
  aplicarStatusTarefa(t,proximo);
  salvarDB();refreshUI();
}

// ─── MODAL: TAREFA ────────────────────────────────────────
let mtCtx={id:null,status:'pendente',projTocado:false};
// naoPreencher: ao abrir uma tarefa já concluída não inventamos data —
// se ela veio sem registro, o campo fica vazio para o usuário informar
function mtStatus(s,naoPreencher){
  mtCtx.status=s;
  document.getElementById('mt-st-p').classList.toggle('on',s==='pendente');
  document.getElementById('mt-st-a').classList.toggle('on',s==='andamento');
  document.getElementById('mt-st-c').classList.toggle('on',s==='concluido');
  // a data de conclusão só faz sentido (e só aparece) quando a tarefa está concluída
  const wrap=document.getElementById('mt-conc-wrap');
  const campo=document.getElementById('mt-conc');
  if(!wrap||!campo)return;
  wrap.style.display=s==='concluido'?'block':'none';
  if(s==='concluido'&&!campo.value&&!naoPreencher)campo.value=hojeISO();
  mtAtualizarHintConclusao();
}
// mostra, ainda no modal, se a data informada fica antes, no dia ou depois do prazo
function mtAtualizarHintConclusao(){
  const el=document.getElementById('mt-conc-hint');
  if(!el)return;
  el.className='mt-conc-hint';
  const data=document.getElementById('mt-conc').value;
  const prazo=document.getElementById('mt-prazo').value;
  if(!data){el.textContent='Sem data informada, esta tarefa fica fora da contagem de prazos.';return;}
  if(!prazo){el.textContent='A tarefa não tem prazo definido — só a data de conclusão é registrada.';return;}
  const dias=diasEntreISO(prazo,data);
  if(dias>0){el.classList.add('atraso');el.textContent='Concluída com '+plural(dias,' de atraso')+' (prazo em '+fmtData(prazo)+').';}
  else if(dias===0){el.classList.add('antes');el.textContent='Concluída no próprio dia do prazo.';}
  else{el.classList.add('antes');el.textContent='Concluída '+plural(-dias,' antes do prazo')+' (prazo em '+fmtData(prazo)+').';}
}
// ── acompanhamento em "Projetos em andamento" (dentro do modal de tarefa) ──
// A marcação é automática pelo tipo/título; enquanto o usuário não mexer na
// caixinha, ela acompanha essa decisão. Se ele mexer, a escolha dele manda.
function mtAlternarProjeto(){
  mtCtx.projTocado=true;
  mtAplicarProjetoUI();
}
function mtAplicarProjetoUI(){
  const cb=document.getElementById('mt-proj');
  if(!cb)return;
  document.getElementById('mt-status-wrap').style.display=cb.checked?'block':'none';
  const hint=document.getElementById('mt-proj-hint');
  if(hint)hint.textContent=cb.checked
    ?'Aparece no painel “Projetos em andamento” enquanto não estiver concluída.'
    :'Fica fora do painel de projetos.';
}
function mtRecalcProjetoAuto(){
  if(mtCtx.projTocado)return;
  const cb=document.getElementById('mt-proj');
  if(!cb)return;
  cb.checked=ehProjetoAuto({titulo:document.getElementById('mt-titulo-in').value,tipo:document.getElementById('mt-tipo').value});
  mtAplicarProjetoUI();
}
// guarda a marcação só quando ela diverge da automática — assim o campo
// continua se ajustando sozinho nos casos comuns
function aplicarProjetoTarefa(t,marcado,tocado){
  if(!tocado)return;
  if(marcado===ehProjetoAuto(t))delete t.projeto;
  else t.projeto=marcado;
}
// responsável em "pills": guarda o valor num input oculto e reflete nos botões.
// Ao trocar o responsável, o texto do bloco de revisão aponta para o outro sócio.
function mtSetResp(r){
  if(!RESP.includes(r))r='Cecília';
  document.getElementById('mt-resp').value=r;
  document.querySelectorAll('#mt-resp-pills button').forEach(b=>b.classList.toggle('on',b.dataset.r===r));
  mtAtualizarRevHint();
}
function mtSetRev(v){
  if(!['','revisar','aprovar','ambos'].includes(v))v='';
  document.getElementById('mt-rev').value=v;
  document.querySelectorAll('#mt-rev-pills button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  mtAtualizarRevHint();
}
function mtAtualizarRevHint(){
  const resp=document.getElementById('mt-resp').value||'Cecília';
  const outro=outroSocio(resp)||'o outro sócio';
  const porEl=document.getElementById('mt-rev-por');
  if(porEl)porEl.textContent='(cabe a '+outro+')';
  const v=document.getElementById('mt-rev').value;
  const hint=document.getElementById('mt-rev-hint');
  if(hint)hint.textContent=
    v==='revisar'?'Ao terminar sua parte, '+resp+' envia para '+outro+' revisar; só então a tarefa pode ser concluída.'
    :v==='aprovar'?'Ao terminar sua parte, '+resp+' envia para '+outro+' aprovar; só então a tarefa pode ser concluída.'
    :v==='ambos'?'Ao terminar, '+resp+' envia para '+outro+' revisar e, depois, aprovar; só então a tarefa pode ser concluída.'
    :'A tarefa é de '+resp+' e não precisa passar pelo outro sócio.';
  mtAtualizarEstadoRev();
}
// mostra, no modal, em que etapa do fluxo está a revisão/aprovação, e oferece
// o botão de envio quando a tarefa (já salva) ainda está com o responsável.
function mtAtualizarEstadoRev(){
  const est=document.getElementById('mt-rev-estado');
  const btn=document.getElementById('mt-rev-enviar');
  if(!est||!btn)return;
  const t=mtCtx.id?DB.tarefas.find(x=>x.id===mtCtx.id):null;
  const pediu=document.getElementById('mt-rev').value;
  // só faz sentido para uma tarefa já salva, com pedido de revisão gravado
  if(!t||!t.revPede||t.revPede!==pediu){est.style.display='none';btn.style.display='none';return;}
  const prox=revProximaAcao(t), quem=revisorDa(t);
  est.style.display='block';
  if(!prox){est.textContent=(t.revEstado==='aprovado'?'Aprovada':'Revisada')+(t.revPorQuem?' por '+t.revPorQuem:'')+'.';est.className='mt-rev-estado ok';btn.style.display='none';return;}
  if(!t.revEnviado){est.textContent='Ainda com '+t.resp+' (em elaboração). Envie quando terminar sua parte.';est.className='mt-rev-estado';btn.style.display='inline-flex';btn.innerHTML='<i class="ti ti-send"></i> Enviar para '+(prox==='aprovar'?'aprovação':'revisão')+' de '+quem;return;}
  est.textContent='Enviada — aguarda '+(prox==='aprovar'?'aprovação':'revisão')+' de '+quem+'.';est.className='mt-rev-estado aguarda';btn.style.display='none';
}
function mtEnviarRevisao(){
  if(!mtCtx.id)return;
  enviarParaRevisao(mtCtx.id);
  fecharOverlay('overlay-tarefa');
}
// atalhos de data no campo Prazo (Hoje / Amanhã / próxima Sexta)
function mtDataRapida(k){
  const h=hojeISO();
  const v=k==='hoje'?h:k==='amanha'?isoAdd(h,1):k==='sexta'?proximaSexta():h;
  const el=document.getElementById('mt-prazo');
  el.value=v;
  mtAtualizarHintConclusao();mtAtualizarHintFatal();
}
function abrirModalTarefa(id,respOuCid){
  mtCtx={id,status:'pendente',projTocado:false};
  const selCli=document.getElementById('mt-cli');
  selCli.innerHTML='<option value="">— sem cliente —</option>'+ordenarPorNome(DB.clientes).map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  const selTipo=document.getElementById('mt-tipo');
  selTipo.innerHTML=tiposTarefa().map(x=>`<option value="${x.key}">${esc(x.lbl)}</option>`).join('');
  const tAtual=id?DB.tarefas.find(x=>x.id===id):null;
  const selProc=document.getElementById('mt-proc');
  selProc.innerHTML='<option value="">— sem processo —</option>'+ordenarProcessosPorCliente(DB.processos.filter(p=>p.status!=='Arquivado'||(tAtual&&tAtual.pid===p.id)))
    .map(p=>`<option value="${p.id}">${esc(rotuloProcesso(p))}</option>`).join('');
  selProc.value=tAtual&&tAtual.pid&&processoPorId(tAtual.pid)?tAtual.pid:'';
  document.getElementById('mt-fatal').value=tAtual?(tAtual.prazoFatal||''):'';
  document.getElementById('mt-conferir-wrap').style.display=tAtual&&tAtual.conferir?'block':'none';
  document.getElementById('mt-conferido').checked=false;
  if(tAtual&&tAtual.conferir)document.getElementById('mt-conferir-txt').textContent=tAtual.tipo==='audiencia'
    ?'Esta audiência foi lida automaticamente da publicação do DJEN — confirme data e horário no processo.'
    :'Este prazo foi calculado automaticamente a partir da publicação do DJEN — confirme a quantidade de dias e o vencimento antes de marcar.';
  if(id){
    const t=tAtual;
    document.getElementById('mt-titulo').textContent='Editar tarefa';
    document.getElementById('mt-titulo-in').value=t.titulo;
    mtSetResp(RESP.includes(t.resp)?t.resp:'Cecília');
    mtSetRev(t.revPede||'');
    document.getElementById('mt-tipo').value=t.tipo;
    selCli.value=t.cid||'';
    document.getElementById('mt-prazo').value=t.prazo||'';
    document.getElementById('mt-hora').value=t.hora||'';
    document.getElementById('mt-conc').value=t.concluidoEm||'';
    mtStatus(t.status,true);
    document.getElementById('mt-del').style.display='inline-flex';
    document.getElementById('mt-desc-wrap').style.display=t.descricao?'block':'none';
    document.getElementById('mt-desc').value=t.descricao||'';
    document.getElementById('mt-proj').checked=projetoMarcado(t);
    document.getElementById('mt-status').value=t.statusExec||'';
    document.getElementById('mt-status-hint').textContent=t.statusExecEm
      ?'Última atualização '+tempoRelativo(t.statusExecEm)+(t.statusExecPor?' · por '+t.statusExecPor:'')
      :'A data/hora é registrada automaticamente a cada mudança de etapa.';
    mtAplicarProjetoUI();
  }else{
    document.getElementById('mt-titulo').textContent='Nova tarefa';
    document.getElementById('mt-titulo-in').value='';
    // respOuCid: se for um responsável conhecido, pré-seleciona; se for id de cliente, vincula
    mtSetResp(RESP.includes(respOuCid)?respOuCid:(EU&&RESP.includes(EU.nome)?EU.nome:'Cecília'));
    mtSetRev('');
    document.getElementById('mt-tipo').value='peticao';
    selCli.value=(respOuCid&&!RESP.includes(respOuCid))?respOuCid:'';
    document.getElementById('mt-prazo').value='';
    document.getElementById('mt-hora').value='';
    document.getElementById('mt-conc').value='';
    mtStatus('pendente');
    document.getElementById('mt-del').style.display='none';
    document.getElementById('mt-desc-wrap').style.display='none';
    document.getElementById('mt-desc').value='';
    document.getElementById('mt-proj').checked=false;
    document.getElementById('mt-status').value='';
    document.getElementById('mt-status-hint').textContent='A data/hora é registrada automaticamente a cada mudança de etapa.';
    mtRecalcProjetoAuto();
  }
  mtAtualizarHintFatal();
  abrirOverlay('overlay-tarefa');
  setTimeout(()=>document.getElementById('mt-titulo-in').focus(),100);
}
function salvarTarefa(){
  const titulo=document.getElementById('mt-titulo-in').value.trim();
  if(!titulo){alert('Descreva a tarefa.');return;}
  const dados={
    titulo,
    resp:document.getElementById('mt-resp').value,
    revPede:document.getElementById('mt-rev').value,
    tipo:document.getElementById('mt-tipo').value,
    cid:document.getElementById('mt-cli').value||null,
    prazo:document.getElementById('mt-prazo').value,
    hora:document.getElementById('mt-hora').value,
    pid:document.getElementById('mt-proc').value||null,
    prazoFatal:document.getElementById('mt-fatal').value,
  };
  if(dados.prazoFatal&&!dados.prazo)dados.prazo=internoPara(dados.prazoFatal);
  if(dados.prazoFatal&&dados.prazo>dados.prazoFatal&&!confirm('A data de entrega ('+fmtData(dados.prazo)+') ficou DEPOIS do prazo fatal ('+fmtData(dados.prazoFatal)+'). Salvar assim mesmo?'))return;
  if(dados.pid&&!dados.cid){const p=processoPorId(dados.pid);if(p&&p.cid)dados.cid=p.cid;}
  // só conclui se a revisão/aprovação pedida já estiver cumprida pelo outro sócio
  let statusFinal=mtCtx.status;
  if(statusFinal==='concluido'){
    const atual=mtCtx.id?(DB.tarefas.find(x=>x.id===mtCtx.id)||{}):{};
    const checar={resp:dados.resp,revPede:dados.revPede,revEstado:atual.revEstado,revEnviado:atual.revEnviado};
    if(revBloqueiaConclusao(checar)){alert(avisoRevConclusao(checar));return;}
  }
  // concluída: vale a data informada no modal; em qualquer outro status a data sai
  const concluidoEm=statusFinal==='concluido'?document.getElementById('mt-conc').value:'';
  let t;
  if(mtCtx.id){
    t=DB.tarefas.find(x=>x.id===mtCtx.id);
    // empurrar a data para frente numa tarefa em aberto conta como adiamento
    if(t.status!=='concluido'&&statusFinal!=='concluido'&&t.prazo&&dados.prazo&&dados.prazo>t.prazo)registrarAdiamento(t);
    Object.assign(t,dados);
    if(!t.prazoFatal)delete t.prazoFatal;
    if(!t.pid)delete t.pid;
    // sem pedido de revisão: limpa qualquer estado de revisão anterior
    if(!t.revPede){delete t.revPede;delete t.revEstado;delete t.revEm;delete t.revPorQuem;}
    if(t.conferir&&document.getElementById('mt-conferido').checked)marcarConferida(t);
    aplicarStatusTarefa(t,statusFinal,concluidoEm);
  }
  else{t={id:uid(),...dados,status:statusFinal,concluidoEm};if(!t.revPede)delete t.revPede;DB.tarefas.push(t);}
  // acompanhamento de projeto + etapa atual (o carimbo de data/hora é automático)
  const marcado=document.getElementById('mt-proj').checked;
  aplicarProjetoTarefa(t,marcado,mtCtx.projTocado);
  if(marcado)definirStatusExec(t,document.getElementById('mt-status').value);
  salvarDB();fecharOverlay('overlay-tarefa');refreshUI();
}
function mtProcessoMudou(){
  mtAtualizarHintFatal();
  const p=processoPorId(document.getElementById('mt-proc').value);
  if(!p)return;
  const cli=document.getElementById('mt-cli');
  if(p.cid&&!cli.value)cli.value=p.cid;
}
function mtAtualizarHintFatal(){
  const el=document.getElementById('mt-fatal-hint');
  if(!el)return;
  const f=document.getElementById('mt-fatal').value;
  // prazo fatal só aparece em prazo processual ou tarefa ligada a processo
  const tipo=document.getElementById('mt-tipo').value;
  const mostra=!!f||tipo==='prazo'||(!!document.getElementById('mt-proc').value&&tipo!=='audiencia');
  document.getElementById('mt-fatal-wrap').style.display=mostra?'':'none';
  document.getElementById('mt-prazo-lbl').textContent=f?'Entregar até (prazo interno)':'Prazo (data de entrega)';
  el.className='mt-conc-hint';
  if(!f){el.textContent='Deixe em branco se não for prazo de processo. Quando preenchido, o prazo de entrega acima funciona como prazo interno, antes do fatal.';return;}
  const pr=document.getElementById('mt-prazo');
  if(!pr.value){pr.value=internoPara(f);}
  const folga=contarDiasUteis(pr.value,f);
  if(pr.value>f){el.classList.add('atraso');el.textContent='A data de entrega está depois do prazo fatal.';}
  else el.textContent='Vence '+fmtDataSem(f)+' · entrega interna '+fmtDataSem(pr.value)+(folga?' ('+folga+(folga>1?' dias úteis':' dia útil')+' de folga)':' (sem folga)')+'.';
}
function excluirTarefa(){
  const t=DB.tarefas.find(x=>x.id===mtCtx.id);if(!t)return;
  if(!confirm('Excluir a tarefa "'+t.titulo+'"?'))return;
  DB.tarefas=DB.tarefas.filter(x=>x.id!==mtCtx.id);
  salvarDB();fecharOverlay('overlay-tarefa');refreshUI();
}
