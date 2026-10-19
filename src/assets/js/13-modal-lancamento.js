
// ═══════════════════════════════════════════════════════════
//  MODAL: LANÇAMENTO FINANCEIRO
// ═══════════════════════════════════════════════════════════
let mfCtx={cid:null,fid:null,t:'alc',dependeTerceiro:false,dataPrevistaRecebimento:'',aceiteVerbal:false,rec:false};
function mfTipo(t){
  mfCtx.t=t;
  document.getElementById('mf-t-alc').classList.toggle('on',t==='alc');
  document.getElementById('mf-t-prev').classList.toggle('on',t==='prev');
  document.getElementById('mf-t-saida').classList.toggle('on',t==='saida');
  atualizarFundoNoModalFin();
  atualizarTerceiroNoModalFin();
  atualizarAlvaraNoModalFin();
}
// alvará judicial entra no caixa, mas não na meta de faturamento (que mede os
// honorários pagos pelos clientes). Saída nunca é alvará.
function atualizarAlvaraNoModalFin(){
  const wrap=document.getElementById('mf-alvara-wrap');
  if(!wrap)return;
  wrap.style.display=mfCtx.t==='saida'?'none':'block';
  document.getElementById('mf-alvara-sim').classList.toggle('on',!!mfCtx.alvara);
  document.getElementById('mf-alvara-nao').classList.toggle('on',!mfCtx.alvara);
}
function mfAlvara(v){mfCtx.alvara=v;mfCtx.alvaraManual=true;atualizarAlvaraNoModalFin();}
// "alvará" na descrição já marca sozinho, enquanto ninguém escolheu à mão
function mfDescMudou(){
  if(mfCtx.alvaraManual)return;
  mfCtx.alvara=semAcento(document.getElementById('mf-desc').value).includes('alvara');
  atualizarAlvaraNoModalFin();
}
// crédito dependente de terceiro (execução judicial / honorário condicionado a pagamento
// de terceiro): só faz sentido para lançamentos do tipo "Previsto"
function atualizarTerceiroNoModalFin(){
  const wrap=document.getElementById('mf-terceiro-wrap');
  if(!wrap)return;
  wrap.style.display=mfCtx.t==='prev'&&!mfCtx.rec?'block':'none';
  document.getElementById('mf-terceiro-sim').classList.toggle('on',mfCtx.dependeTerceiro);
  document.getElementById('mf-terceiro-nao').classList.toggle('on',!mfCtx.dependeTerceiro);
  document.getElementById('mf-terceiro-data-wrap').style.display=mfCtx.dependeTerceiro?'grid':'none';
  document.getElementById('mf-data-prevista').value=mfCtx.dataPrevistaRecebimento||'';
  document.getElementById('mf-aceite-sim').classList.toggle('on',mfCtx.aceiteVerbal);
  document.getElementById('mf-aceite-nao').classList.toggle('on',!mfCtx.aceiteVerbal);
}
function mfToggleTerceiro(v){mfCtx.dependeTerceiro=v;atualizarTerceiroNoModalFin();}
function mfToggleAceiteVerbal(v){mfCtx.aceiteVerbal=v;atualizarTerceiroNoModalFin();}
// mostra/atualiza a opção de designar 10% deste lançamento ao Fundo do Escritório.
// A sugestão de designar só faz sentido para um lançamento "Recebido" — mas se o
// lançamento JÁ tem 10% guardados, o aviso (com o botão de desfazer) continua
// visível mesmo que o tipo mude depois (ex.: voltou para "Previsto" por engano),
// senão não haveria como desfazer sem procurar o aporte na aba Financeiro.
function atualizarFundoNoModalFin(){
  const wrap=document.getElementById('mf-fundo-wrap');
  if(!wrap)return;
  if(!mfCtx.fid){wrap.style.display='none';return;}
  const cid=mfCtx.cid||(document.getElementById('mf-cli')?document.getElementById('mf-cli').value:null);
  const c=DB.clientes.find(x=>x.id===cid);
  const f=c&&c.fin.find(x=>x.id===mfCtx.fid);
  if(!f){wrap.style.display='none';return;}
  if(!f.fundoAporteId&&mfCtx.t!=='alc'){wrap.style.display='none';return;}
  wrap.style.display='block';
  const box=document.getElementById('mf-fundo-status');
  if(f.fundoAporteId){
    const ap=(DB.fundoAportes||[]).find(a=>a.id===f.fundoAporteId);
    box.innerHTML=`<div class="fin-item" style="cursor:default">
      <span class="fin-item-nome" style="color:var(--green-hi)"><i class="ti ti-check"></i> ${money(ap?ap.valor:0)} guardados no fundo${ap&&ap.data?' · '+fmtData(ap.data):''}</span>
      <button class="btn-ico" onclick="desfazerDesignacaoFundo()" title="Desfazer — o valor volta para o caixa"><i class="ti ti-arrow-back-up"></i></button>
    </div>`;
  }else{
    const dez=Math.round(f.v*0.10*100)/100;
    box.innerHTML=`<div class="fin-item" style="cursor:default">
      <span class="fin-item-nome">Reservar <input type="number" id="mf-fundo-pct" value="10" min="1" max="100" step="1" data-base="${f.v}" oninput="mfFundoPctMudou()" style="width:58px;padding:3px 6px;text-align:right">% deste recebimento (<b id="mf-fundo-valor">${money(dez)}</b>)</span>
      <button class="btn-ico ok" onclick="designarFundoDoLancamento()" title="Guardar no Fundo do Escritório"><i class="ti ti-pig-money"></i></button>
    </div>`;
  }
}
// atualiza o valor exibido conforme o % digitado (o fundo aceita qualquer percentual, não só 10%)
function mfFundoPctMudou(){
  const inp=document.getElementById('mf-fundo-pct'), el=document.getElementById('mf-fundo-valor');
  if(!inp||!el)return;
  const base=Number(inp.dataset.base)||0;
  const pct=Math.min(100,Math.max(0,Number(inp.value)||0));
  el.textContent=money(Math.round(base*pct/100*100)/100);
}
function designarFundoDoLancamento(){
  const cid=mfCtx.cid||document.getElementById('mf-cli').value;
  const c=DB.clientes.find(x=>x.id===cid);
  const f=c&&c.fin.find(x=>x.id===mfCtx.fid);
  if(!f||f.fundoAporteId)return;
  const inp=document.getElementById('mf-fundo-pct');
  let pct=inp?Number(inp.value):10; if(!(pct>0))pct=10; pct=Math.min(100,pct);
  const val=Math.round(f.v*pct/100*100)/100;
  if(!confirm('Guardar '+money(val)+' ('+pct+'% de '+money(f.v)+') no Fundo do Escritório?\n\nEsse valor sai do caixa disponível e passa a contar como reserva.'))return;
  const aporte={id:uid(),valor:val,data:hojeISO(),obs:'',origem:{cid:c.id,cnome:c.nome,finId:f.id,finDesc:f.d,pct}};
  DB.fundoAportes.push(aporte);
  f.fundoAporteId=aporte.id;
  salvarDB();
  atualizarFundoNoModalFin();
  refreshUI();
}
function desfazerDesignacaoFundo(){
  const cid=mfCtx.cid||document.getElementById('mf-cli').value;
  const c=DB.clientes.find(x=>x.id===cid);
  const f=c&&c.fin.find(x=>x.id===mfCtx.fid);
  if(!f||!f.fundoAporteId)return;
  transferirFundoParaCaixa(f.fundoAporteId);
}
// select de contratos do cliente escolhido no modal (some quando ele não tem nenhum)
function mfPopularContratos(cid,selecionado){
  const c=DB.clientes.find(x=>x.id===cid);
  const lista=contratosDe(c);
  const wrap=document.getElementById('mf-contrato-wrap'), sel=document.getElementById('mf-contrato');
  wrap.style.display=lista.length?'block':'none';
  const ord=[...lista].sort((a,b)=>(a.status==='Encerrado')-(b.status==='Encerrado')||(b.inicio||'').localeCompare(a.inicio||''));
  sel.innerHTML='<option value="">— sem contrato específico —</option>'+ord.map(k=>
    `<option value="${k.id}">${esc(k.titulo||'Contrato')}${k.inicio?' · desde '+fmtData(k.inicio):''}${k.status==='Encerrado'?' (encerrado)':''}</option>`).join('');
  // sem escolha explícita, um contrato ativo único já vem marcado
  const ativos=lista.filter(k=>k.status!=='Encerrado');
  sel.value=selecionado!==undefined?(selecionado||''):(ativos.length===1?ativos[0].id:'');
}
function mfClienteMudou(){mfPopularContratos(document.getElementById('mf-cli').value);}
function abrirModalFin(cid,fid,ctId){
  mfCtx={cid,fid,t:'alc',dependeTerceiro:false,dataPrevistaRecebimento:'',aceiteVerbal:false,rec:false,alvara:false,alvaraManual:false};
  const cliWrap=document.getElementById('mf-cli-wrap');
  const sel=document.getElementById('mf-cli');
  if(!cid){ // aberto pela tela Financeiro: escolher o cliente
    cliWrap.style.display='block';
    sel.innerHTML=ordenarPorNome(DB.clientes).map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
  }else{
    cliWrap.style.display='none';
  }
  const info=document.getElementById('mf-rec-info');
  info.style.display='none';
  if(fid){
    const c=DB.clientes.find(x=>x.id===cid);
    const f=c.fin.find(x=>x.id===fid);
    document.getElementById('mf-titulo').textContent='Editar lançamento — '+c.curto;
    document.getElementById('mf-desc').value=f.d;
    document.getElementById('mf-valor').value=f.v.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('mf-data').value=f.dt||'';
    mfCtx.dependeTerceiro=!!f.dependeTerceiro;
    mfCtx.dataPrevistaRecebimento=f.dataPrevistaRecebimento||'';
    mfCtx.aceiteVerbal=!!f.aceiteVerbal;
    mfCtx.alvara=ehAlvara(f);mfCtx.alvaraManual=true;
    mfPopularContratos(cid,f.contratoId||'');
    // a repetição só se escolhe ao criar; numa parcela existente, mostra de qual série ela é
    document.getElementById('mf-rec-wrap').style.display=f.serieId?'block':'none';
    if(f.serieId){
      document.querySelector('#mf-rec-wrap .seg').style.display='none';
      info.style.display='block';
      info.textContent='Parcela '+f.parcela+' de '+f.parcelas+' de um lançamento recorrente. A alteração vale só para esta parcela, exceto o contrato, que muda na série inteira.';
    }
    mfAlternarRecorrente(false);
    mfTipo(f.t);
    document.getElementById('mf-del').style.display='inline-flex';
  }else{
    document.getElementById('mf-titulo').textContent=cid?'Novo lançamento — '+(DB.clientes.find(x=>x.id===cid)||{}).curto:'Novo lançamento';
    document.getElementById('mf-desc').value='';
    document.getElementById('mf-valor').value='';
    document.getElementById('mf-data').value='';
    document.getElementById('mf-rec-wrap').style.display='block';
    document.querySelector('#mf-rec-wrap .seg').style.display='flex';
    document.getElementById('mf-rec-n').value=12;
    document.getElementById('mf-rec-per').value='mensal';
    mfPopularContratos(cid||sel.value,ctId);
    mfAlternarRecorrente(false);
    mfTipo('alc');
    document.getElementById('mf-del').style.display='none';
  }
  abrirOverlay('overlay-fin');
  setTimeout(()=>document.getElementById('mf-desc').focus(),100);
}
// ─── LANÇAMENTO RECORRENTE ────────────────────────────────
// Gera N parcelas de uma vez (ex.: assessoria mensal). Cada parcela vira um
// lançamento próprio, com data e valor que podem ser ajustados, e todas ficam
// ligadas pelo mesmo serieId — assim entram uma a uma no "a receber" e podem
// ser baixadas separadamente conforme o cliente paga.
function mfAlternarRecorrente(v){
  mfCtx.rec=v;
  document.getElementById('mf-rec-sim').classList.toggle('on',v);
  document.getElementById('mf-rec-nao').classList.toggle('on',!v);
  document.getElementById('mf-rec-campos').style.display=v?'block':'none';
  document.getElementById('mf-valor-lbl').textContent=v?'Valor de cada parcela (R$)':'Valor (R$)';
  document.getElementById('mf-data-lbl').textContent=v?'Data da 1ª parcela':'Data';
  // parcelas futuras são, por natureza, previstas
  if(v&&mfCtx.t==='alc')mfTipo('prev');
  atualizarTerceiroNoModalFin();
  if(v)mfRecRecalcular();
}
// soma meses mantendo o dia; dia 31 em mês curto cai no último dia do mês
function isoAddMeses(iso,n){
  const[y,m,d]=iso.split('-').map(Number);
  const ultimo=new Date(Date.UTC(y,m-1+n+1,0)).getUTCDate();
  return new Date(Date.UTC(y,m-1+n,Math.min(d,ultimo))).toISOString().slice(0,10);
}
function dataDaParcela(primeira,i,per){
  if(per==='semanal')return isoAdd(primeira,7*i);
  if(per==='quinzenal')return isoAdd(primeira,15*i);
  return isoAddMeses(primeira,i);
}
function mfRecRecalcular(){
  if(!mfCtx.rec)return;
  const n=Math.min(120,Math.max(2,parseInt(document.getElementById('mf-rec-n').value,10)||0));
  const per=document.getElementById('mf-rec-per').value;
  const primeira=document.getElementById('mf-data').value||hojeISO();
  const v=parseValor(document.getElementById('mf-valor').value);
  const vTxt=v>0?v.toLocaleString('pt-BR',{minimumFractionDigits:2}):'';
  let html='';
  for(let i=0;i<n;i++){
    html+=`<div class="parc-row"><span>${i+1}/${n}</span>
      <input type="date" class="parc-dt" value="${dataDaParcela(primeira,i,per)}">
      <input type="text" class="parc-v" value="${vTxt}" placeholder="0,00" inputmode="decimal" oninput="mfRecTotal()"></div>`;
  }
  document.getElementById('mf-rec-lista').innerHTML=html;
  mfRecTotal();
}
function mfRecParcelas(){
  return [...document.querySelectorAll('#mf-rec-lista .parc-row')].map(r=>({
    dt:r.querySelector('.parc-dt').value,
    v:parseValor(r.querySelector('.parc-v').value),
  }));
}
function mfRecTotal(){
  const ps=mfRecParcelas();
  const tot=ps.reduce((a,p)=>a+(p.v>0?p.v:0),0);
  document.getElementById('mf-rec-total').textContent=ps.length+' parcelas · total '+money(tot);
}
function salvarFin(){
  const cid=mfCtx.cid||document.getElementById('mf-cli').value;
  const c=DB.clientes.find(x=>x.id===cid);
  if(!c)return;
  const d=document.getElementById('mf-desc').value.trim();
  const v=parseValor(document.getElementById('mf-valor').value);
  const dt=document.getElementById('mf-data').value;
  if(!d){alert('Informe a descrição do lançamento.');return;}
  const contratoId=document.getElementById('mf-contrato-wrap').style.display==='none'?null:(document.getElementById('mf-contrato').value||null);
  if(mfCtx.rec&&!mfCtx.fid){salvarFinRecorrente(c,d,contratoId);return;}
  if(!(v>0)){alert('Informe um valor válido (ex.: 500,00).');return;}
  mfCtx.dataPrevistaRecebimento=mfCtx.t==='prev'&&mfCtx.dependeTerceiro?document.getElementById('mf-data-prevista').value:'';
  let novoRecebido=false, f;
  if(mfCtx.fid){
    f=c.fin.find(x=>x.id===mfCtx.fid);
    novoRecebido=mfCtx.t==='alc'&&f.t!=='alc';
    f.d=d;f.v=v;f.t=mfCtx.t;f.dt=dt;
  }else{
    f={id:uid(),d,v,t:mfCtx.t,dt,criadoEm:Date.now()};
    c.fin.push(f);
    novoRecebido=mfCtx.t==='alc';
  }
  f.contratoId=contratoId;
  f.alvara=mfCtx.t!=='saida'&&!!mfCtx.alvara;
  // o contrato é da série inteira: mudar numa parcela muda em todas
  if(f.serieId)c.fin.forEach(x=>{if(x.serieId===f.serieId)x.contratoId=contratoId;});
  f.dependeTerceiro=mfCtx.t==='prev'&&mfCtx.dependeTerceiro;
  f.dataPrevistaRecebimento=f.dependeTerceiro?mfCtx.dataPrevistaRecebimento:'';
  f.aceiteVerbal=mfCtx.t==='prev'&&mfCtx.aceiteVerbal;
  sincronizarTarefaConferencia(c,f);
  salvarDB();
  fecharOverlay('overlay-fin');
  // mesma ideia da tabela de lançamentos: um honorário de outro mês (ou de um tipo
  // que o filtro esconde) não pode desaparecer no instante em que foi salvo
  if(finFiltro!=='todos'&&finFiltro!==f.t)finFiltro=f.t;
  if(!periodoMatch(f.dt))finPeriodo='tudo';
  refreshUI();
  if(novoRecebido)avisarFundoEscritorio(v);
}
function salvarFinRecorrente(c,d,contratoId){
  const ps=mfRecParcelas();
  if(ps.length<2){alert('Informe pelo menos 2 parcelas.');return;}
  const semData=ps.findIndex(p=>!p.dt), semValor=ps.findIndex(p=>!(p.v>0));
  if(semData>=0){alert('A parcela '+(semData+1)+' está sem data.');return;}
  if(semValor>=0){alert('A parcela '+(semValor+1)+' está sem valor válido (ex.: 500,00).');return;}
  const serieId=uid(), n=ps.length, total=ps.reduce((a,p)=>a+p.v,0);
  ps.forEach((p,i)=>c.fin.push({
    id:uid(),d:d+' — parcela '+(i+1)+'/'+n,v:p.v,t:mfCtx.t,dt:p.dt,criadoEm:Date.now(),
    contratoId,serieId,parcela:i+1,parcelas:n,alvara:mfCtx.t!=='saida'&&!!mfCtx.alvara,
    dependeTerceiro:false,dataPrevistaRecebimento:'',aceiteVerbal:false,
  }));
  salvarDB();
  fecharOverlay('overlay-fin');
  if(finFiltro!=='todos'&&finFiltro!==mfCtx.t)finFiltro=mfCtx.t;
  if(!ps.every(p=>periodoMatch(p.dt)))finPeriodo='tudo';
  refreshUI();
  mostrarToast(n+' parcelas lançadas · '+money(total)+(mfCtx.t==='prev'?' a receber':''));
  if(mfCtx.t==='alc')avisarFundoEscritorio(total);
}
// tarefa automática de conferência na data prevista de recebimento (créditos dependentes
// de terceiro) — criada/atualizada/removida junto com o lançamento, sem duplicar
function sincronizarTarefaConferencia(c,f){
  const existente=f.tarefaConferenciaId?DB.tarefas.find(t=>t.id===f.tarefaConferenciaId):null;
  if(!f.dependeTerceiro||!f.dataPrevistaRecebimento){
    if(existente){DB.tarefas=DB.tarefas.filter(t=>t.id!==existente.id);f.tarefaConferenciaId=null;}
    return;
  }
  const titulo='Conferir recebimento (terceiro) — '+c.curto+' — '+f.d;
  if(existente){
    existente.titulo=titulo;
    existente.prazo=f.dataPrevistaRecebimento;
  }else{
    // conferência de recebimento é controle administrativo: não é projeto
    const nova={id:uid(),cid:c.id,titulo,tipo:'prazo',resp:'Escritório',status:'pendente',prazo:f.dataPrevistaRecebimento,projeto:false};
    DB.tarefas.push(nova);
    f.tarefaConferenciaId=nova.id;
  }
}
function excluirFin(){
  const c=DB.clientes.find(x=>x.id===mfCtx.cid);
  if(!c||!mfCtx.fid)return;
  const f=c.fin.find(x=>x.id===mfCtx.fid);
  const avisoFundo=f.fundoAporteId?'\n\nO valor já guardado no Fundo do Escritório a partir dele também será removido do fundo.':'';
  if(!confirm('Excluir o lançamento "'+f.d+'" ('+fmt(f.v)+')?'+avisoFundo))return;
  if(f.fundoAporteId)DB.fundoAportes=(DB.fundoAportes||[]).filter(a=>a.id!==f.fundoAporteId);
  if(f.tarefaConferenciaId)DB.tarefas=DB.tarefas.filter(t=>t.id!==f.tarefaConferenciaId);
  c.fin=c.fin.filter(x=>x.id!==mfCtx.fid);
  if(f.serieId){
    const seguintes=c.fin.filter(x=>x.serieId===f.serieId&&x.t==='prev'&&(x.dt||'')>=(f.dt||''));
    if(seguintes.length&&confirm('Este lançamento faz parte de uma série recorrente.\n\nExcluir também as '+seguintes.length+' parcela(s) PREVISTA(S) seguintes ('+money(seguintes.reduce((a,x)=>a+x.v,0))+')? Use isto quando o contrato for encerrado.\n\nParcelas já recebidas não são tocadas.')){
      const ids=new Set(seguintes.map(x=>x.id));
      c.fin.filter(x=>ids.has(x.id)&&x.tarefaConferenciaId).forEach(x=>{DB.tarefas=DB.tarefas.filter(t=>t.id!==x.tarefaConferenciaId);});
      c.fin=c.fin.filter(x=>!ids.has(x.id));
    }
  }
  salvarDB();
  fecharOverlay('overlay-fin');
  refreshUI();
}
// atalho: previsto → recebido com a data de hoje
function marcarRecebido(cid,fid){
  const c=DB.clientes.find(x=>x.id===cid);
  const f=c&&c.fin.find(x=>x.id===fid);
  if(!f)return;
  if(!confirm('Marcar "'+f.d+'" ('+fmt(f.v)+') como RECEBIDO hoje?\n\nVocê pode ajustar a data depois no lápis de edição.'))return;
  f.t='alc';f.dt=hojeISO();
  salvarDB();
  refreshUI();
  avisarFundoEscritorio(f.v);
}
