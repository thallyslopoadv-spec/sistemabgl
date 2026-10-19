
// ═══════════════════════════════════════════════════════════
//  COMERCIAL (cronograma de artigos e vídeos)
// ═══════════════════════════════════════════════════════════
const CONTEUDO_STATUS=['ideia','roteiro','producao','publicado'];
const CONTEUDO_ST_LBL={ideia:'Ideia',roteiro:'Roteiro',producao:'Produção',publicado:'Publicado'};
const CONTEUDO_ST_CLS={ideia:'st-pendente',roteiro:'st-andamento',producao:'st-producao',publicado:'st-concluido'};
let comercialFiltro='todos';

// dia da semana de uma data ISO, sem risco de fuso horário deslocar o dia
function diaSemanaDe(iso){
  const dias=['dom','seg','ter','qua','qui','sex','sáb'];
  const[y,m,d]=iso.split('-').map(Number);
  return dias[new Date(y,m-1,d).getDay()];
}
function fmtDataDiaSemana(iso){return diaSemanaDe(iso)+' '+fmtData(iso)}
// próximos N sábados (inclui hoje se hoje for sábado), em ordem crescente
function proximosSabados(n){
  const out=[];
  const[y,m,d]=hojeISO().split('-').map(Number);
  const base=new Date(y,m-1,d);
  base.setDate(base.getDate()+((6-base.getDay()+7)%7));
  for(let i=0;i<n;i++){
    out.push(base.getFullYear()+'-'+String(base.getMonth()+1).padStart(2,'0')+'-'+String(base.getDate()).padStart(2,'0'));
    base.setDate(base.getDate()+7);
  }
  return out;
}
function conteudoDataInfo(c){
  if(c.status==='publicado')return {cls:'prazo-ok',txt:c.dataPublicacao?'Publicado · '+fmtData(c.dataPublicacao):'Publicado'};
  if(!c.dataPrevista)return {cls:'prazo-ok',txt:'sem data'};
  const dias=Math.round((new Date(c.dataPrevista).getTime()-hojeTS())/86400000);
  const lbl=fmtData(c.dataPrevista);
  if(dias<0)return {cls:'prazo-late',txt:'Atrasado · '+lbl};
  if(dias<=3)return {cls:'prazo-soon',txt:(dias===0?'Hoje':dias+'d')+' · '+lbl};
  return {cls:'prazo-ok',txt:lbl};
}
function conteudoCard(c){
  const di=conteudoDataInfo(c);
  return `<div class="task-card">
    <div class="task-titulo">${esc(c.titulo)}</div>
    <div class="task-meta">
      <span class="task-tipo">${c.tipo==='video'?'Vídeo':'Artigo'}</span>
      ${c.resp?`<span class="task-cli">${esc(c.resp)}</span>`:''}
      <span class="prazo-badge ${di.cls}">${di.txt}</span>
    </div>
    <div class="task-foot">
      <span class="st-pill ${CONTEUDO_ST_CLS[c.status]}" onclick="cicloConteudo('${c.id}')" title="Clique para avançar o status">${CONTEUDO_ST_LBL[c.status]}</span>
      <button class="btn-ico" onclick="abrirModalConteudo('${c.id}',null)" title="Editar pauta"><i class="ti ti-pencil"></i></button>
    </div>
  </div>`;
}
function cicloConteudo(id){
  const c=DB.conteudos.find(x=>x.id===id);if(!c)return;
  const i=CONTEUDO_STATUS.indexOf(c.status);
  c.status=CONTEUDO_STATUS[(i+1)%CONTEUDO_STATUS.length];
  if(c.status==='publicado'&&!c.dataPublicacao)c.dataPublicacao=hojeISO();
  salvarDB();refreshUI();
}
function filtroComercial(f,btn){
  comercialFiltro=f;
  document.querySelectorAll('#view-comercial .rotina-chips .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderComercial();
}
function renderComercial(){
  const board=document.getElementById('comercial-board');
  if(!board)return;
  let itens=DB.conteudos;
  if(comercialFiltro!=='todos')itens=itens.filter(c=>c.tipo===comercialFiltro);

  const mesAtual=hojeISO().slice(0,7);
  const artigosPub=DB.conteudos.filter(c=>c.tipo==='artigo'&&c.status==='publicado'&&(c.dataPublicacao||'').slice(0,7)===mesAtual).length;
  const videosPub=DB.conteudos.filter(c=>c.tipo==='video'&&c.status==='publicado'&&(c.dataPublicacao||'').slice(0,7)===mesAtual).length;
  const metas=DB.metasComercial||{artigosMes:4,videosMes:4};

  const st=document.getElementById('comercial-stats');
  if(st)st.innerHTML=`
    <div class="stat-card"><div class="stat-label">Pautas ativas</div><div class="stat-val">${DB.conteudos.filter(c=>c.status!=='publicado').length}</div></div>
    <div class="stat-card" data-c="blue"><div class="stat-label">Artigos publicados (mês)</div><div class="stat-val">${artigosPub}</div><div class="stat-sub">meta: ${metas.artigosMes}</div></div>
    <div class="stat-card" data-c="green"><div class="stat-label">Vídeos publicados (mês)</div><div class="stat-val">${videosPub}</div><div class="stat-sub">meta: ${metas.videosMes}</div></div>
    <div class="stat-card" data-c="amber"><div class="stat-label">Total de pautas</div><div class="stat-val">${DB.conteudos.length}</div></div>`;

  const metasEl=document.getElementById('comercial-metas');
  if(metasEl){
    const barras=[
      {lbl:'Artigos publicados este mês',n:artigosPub,meta:metas.artigosMes,cor:'#2f5d94'},
      {lbl:'Vídeos publicados este mês',n:videosPub,meta:metas.videosMes,cor:'#2f7d3f'},
    ];
    metasEl.innerHTML=barras.map(x=>{
      const max=Math.max(x.n,x.meta,1);
      return `<div class="hbar-row">
        <div class="hbar-label">${x.lbl}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(8,x.n/max*100)}%;background:${x.cor}">${x.n}/${x.meta}</div></div>
      </div>`;
    }).join('');
  }

  const sabEl=document.getElementById('comercial-sabados');
  if(sabEl){
    const sabados=proximosSabados(4);
    sabEl.innerHTML=sabados.map(s=>{
      const vids=DB.conteudos.filter(c=>c.tipo==='video'&&c.dataPrevista===s);
      return `<div class="fin-item" style="cursor:default">
        <span class="fin-item-nome">${fmtDataDiaSemana(s)}</span>
        ${vids.length
          ?`<div class="fin-item-r"><span class="fin-item-val" style="font-size:12.5px;font-weight:500">${vids.map(v=>esc(v.titulo)).join(', ')}</span></div>`
          :`<button class="btn-ico" onclick="abrirModalConteudo(null,'video','${s}')" title="Definir pauta desta gravação"><i class="ti ti-plus"></i></button>`}
      </div>`;
    }).join('');
  }

  board.innerHTML=CONTEUDO_STATUS.map(status=>{
    const its=itens.filter(c=>c.status===status).sort((a,b)=>(a.dataPrevista||'9999')<(b.dataPrevista||'9999')?-1:1);
    // "Publicados" é histórico: nasce fechado, vira um card só de contagem.
    // As colunas de trabalho (ideia/roteiro/produção) nascem abertas.
    const padraoFechado=(status==='publicado');
    const chave='comercial:'+status;
    const fechada=blocoRecolhido(chave,padraoFechado);
    return `<div class="rot-col ${fechada?'recolhida':''}">
      <div class="rot-col-head clicavel" onclick="alternarBloco('${chave}',${padraoFechado})" title="${fechada?'Clique para abrir':'Clique para recolher'}">
        ${chevron()}
        <span class="nm">${CONTEUDO_ST_LBL[status]}</span>
        <span class="ct">${its.length}</span>
      </div>
      <div class="rot-col-corpo">
        <div class="rot-list">
          ${its.length?its.map(conteudoCard).join(''):'<div class="rot-empty">Nada aqui</div>'}
        </div>
      </div>
    </div>`;
  }).join('');
  renderComercialRotina();
}
// rotina só do comercial: pautas em aberto (não publicadas) por responsável, atrasadas primeiro.
// Substitui o antigo comportamento de jogar o comercial na Rotina do escritório.
function renderComercialRotina(){
  const board=document.getElementById('comercial-rotina'); if(!board)return;
  const pend=(DB.conteudos||[]).filter(c=>c.status!=='publicado');
  const ordem={ideia:0,roteiro:1,producao:2};
  const hoje=hojeISO();   // fora do comparador: era recalculado a cada comparação
  board.innerHTML=RESP_CONTEUDO.map(r=>{
    const av=corResp(r);
    const itens=pend.filter(c=>(c.resp||'Escritório')===r).sort((a,b)=>{
      const aAtr=a.dataPrevista&&a.dataPrevista<hoje, bAtr=b.dataPrevista&&b.dataPrevista<hoje;
      if(aAtr!==bAtr)return aAtr?-1:1; // atrasadas primeiro
      if((ordem[a.status]??9)!==(ordem[b.status]??9))return (ordem[a.status]??9)-(ordem[b.status]??9);
      return (a.dataPrevista||'9999')<(b.dataPrevista||'9999')?-1:1;
    });
    const chave='comercial:rotina:'+r;
    const fechada=blocoRecolhido(chave,false);
    return `<div class="rot-col ${fechada?'recolhida':''}">
      <div class="rot-col-head clicavel" onclick="alternarBloco('${chave}',false)" title="${fechada?'Clique para abrir':'Clique para recolher'}">
        ${chevron()}
        <div class="av" style="background:${av[0]};color:${av[1]}">${avatarResp(r)}</div>
        <span class="nm">${r}</span>
        <span class="ct">${itens.length} pauta${itens.length!==1?'s':''}</span>
      </div>
      <div class="rot-col-corpo">
        <div class="rot-list">
          ${itens.length?itens.map(conteudoCard).join(''):'<div class="rot-empty">Nada em aberto</div>'}
          <button class="btn-nova-tarefa" style="width:100%;justify-content:center;background:transparent;border:1px dashed var(--border-hi);color:var(--t3)" onclick="abrirModalConteudo(null,null)"><i class="ti ti-plus"></i>Nova pauta</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ─── MODAL: PAUTA COMERCIAL ────────────────────────────────
let mccCtx={id:null,tipo:'artigo',status:'ideia'};
function mccTipo(t){
  mccCtx.tipo=t;
  document.getElementById('mcc-t-artigo').classList.toggle('on',t==='artigo');
  document.getElementById('mcc-t-video').classList.toggle('on',t==='video');
  // pauta nova: sugere a data de acordo com o tipo (vídeo → próximo sábado de gravação)
  if(!mccCtx.id)document.getElementById('mcc-data').value=t==='video'?proximosSabados(1)[0]:hojeISO();
}
function mccStatus(s){
  mccCtx.status=s;
  CONTEUDO_STATUS.forEach(k=>document.getElementById('mcc-st-'+k).classList.toggle('on',k===s));
  document.getElementById('mcc-link-wrap').style.display=s==='publicado'?'block':'none';
  document.getElementById('mcc-data-label').textContent=s==='publicado'?'Data de publicação':'Data prevista';
}
function abrirModalConteudo(id,tipoPreset,dataPreset){
  mccCtx={id,tipo:tipoPreset||'artigo',status:'ideia'};
  if(id){
    const c=DB.conteudos.find(x=>x.id===id);
    document.getElementById('mcc-titulo').textContent='Editar pauta';
    document.getElementById('mcc-titulo-in').value=c.titulo;
    document.getElementById('mcc-tema').value=c.tema||'';
    document.getElementById('mcc-resp').value=c.resp;
    document.getElementById('mcc-data').value=(c.status==='publicado'?c.dataPublicacao:c.dataPrevista)||'';
    document.getElementById('mcc-link').value=c.link||'';
    mccTipo(c.tipo);mccStatus(c.status);
    document.getElementById('mcc-del').style.display='inline-flex';
  }else{
    document.getElementById('mcc-titulo').textContent='Nova pauta';
    document.getElementById('mcc-titulo-in').value='';
    document.getElementById('mcc-tema').value='';
    document.getElementById('mcc-resp').value='Cecília';
    document.getElementById('mcc-link').value='';
    mccTipo(mccCtx.tipo);mccStatus('ideia');
    if(dataPreset)document.getElementById('mcc-data').value=dataPreset;
    document.getElementById('mcc-del').style.display='none';
  }
  abrirOverlay('overlay-conteudo');
  setTimeout(()=>document.getElementById('mcc-titulo-in').focus(),100);
}
function salvarConteudo(){
  const titulo=document.getElementById('mcc-titulo-in').value.trim();
  if(!titulo){alert('Dê um título ou tema para a pauta.');return;}
  const dataCampo=document.getElementById('mcc-data').value;
  const publicado=mccCtx.status==='publicado';
  const dados={
    tipo:mccCtx.tipo,
    titulo,
    tema:document.getElementById('mcc-tema').value.trim(),
    resp:document.getElementById('mcc-resp').value,
    dataPrevista:dataCampo,
    status:mccCtx.status,
    link:document.getElementById('mcc-link').value.trim(),
  };
  // quando o status é "Publicado", o campo de data representa a data de
  // publicação de fato (inclusive para cadastrar artigos antigos já no ar,
  // com a data real em que foram publicados — não a data de hoje)
  if(publicado)dados.dataPublicacao=dataCampo||hojeISO();
  if(mccCtx.id){
    Object.assign(DB.conteudos.find(x=>x.id===mccCtx.id),dados);
  }else{
    DB.conteudos.push({id:uid(),dataPublicacao:publicado?(dataCampo||hojeISO()):'',...dados});
  }
  salvarDB();fecharOverlay('overlay-conteudo');refreshUI();
}
function excluirConteudo(){
  const c=DB.conteudos.find(x=>x.id===mccCtx.id);if(!c)return;
  if(!confirm('Excluir a pauta "'+c.titulo+'"?'))return;
  DB.conteudos=DB.conteudos.filter(x=>x.id!==mccCtx.id);
  salvarDB();fecharOverlay('overlay-conteudo');refreshUI();
}
function abrirModalMetas(){
  const m=DB.metasComercial||{artigosMes:4,videosMes:4};
  document.getElementById('mm-artigos').value=m.artigosMes;
  document.getElementById('mm-videos').value=m.videosMes;
  abrirOverlay('overlay-metas');
}
function salvarMetas(){
  DB.metasComercial={
    artigosMes:Number(document.getElementById('mm-artigos').value)||0,
    videosMes:Number(document.getElementById('mm-videos').value)||0,
  };
  salvarDB();fecharOverlay('overlay-metas');refreshUI();
}
