
// ═══════════════════════════════════════════════════════════
//  PRÓ-LABORE RECOMENDADO — mediana móvel de receita mensal
//  ───────────────────────────────────────────────────────
//  Para mudar o tamanho da janela (ex.: 6 ou 24 meses em vez de
//  12), troque só esta constante — todo o cálculo abaixo já se
//  adapta sozinho (receitaMensalProLabore, calcularProLaboreRecomendado).
//  Não existe "recálculo trimestral" separado porque isso é uma
//  página estática sem servidor: o valor já é recalculado do zero
//  toda vez que a aba Financeiro é aberta, sempre usando os últimos
//  PROLABORE_JANELA_MESES meses a partir de hoje — ou seja, a janela
//  móvel de 12 meses está sempre em dia, não só a cada trimestre.
// ═══════════════════════════════════════════════════════════
const PROLABORE_JANELA_MESES=12;
let prolaboreDetalheAberto=false;

// receita bruta mensal (recebido de clientes + lançamentos gerais de
// entrada — sem descontar saídas) nos últimos PROLABORE_JANELA_MESES meses
function receitaMensalProLabore(){
  const meses=[];const now=new Date();
  for(let i=PROLABORE_JANELA_MESES-1;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    meses.push({y:d.getFullYear(),m:d.getMonth(),v:0,chave:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')});
  }
  DB.clientes.forEach(c=>c.fin.forEach(f=>{
    if(f.t!=='alc'||!f.dt)return;
    const[ay,am]=f.dt.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));if(alvo)alvo.v+=f.v;
  }));
  (DB.lancamentos||[]).forEach(l=>{
    if(l.tipo!=='entrada'||!l.data)return;
    const[ay,am]=l.data.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));if(alvo)alvo.v+=l.valor;
  });
  return meses;
}
// mês (YYYY-MM) mais antigo com QUALQUER dado real registrado — evita
// tratar "ainda não tínhamos o sistema nesse mês" como "faturou zero"
function primeiroMesComDados(){
  const chaves=[];
  DB.clientes.forEach(c=>c.fin.forEach(f=>{if(f.t==='alc'&&f.dt)chaves.push(f.dt.slice(0,7));}));
  (DB.lancamentos||[]).forEach(l=>{if(l.tipo==='entrada'&&l.data)chaves.push(l.data.slice(0,7));});
  return chaves.length?chaves.sort()[0]:null;
}
function mediana(valores){
  if(!valores.length)return 0;
  const s=[...valores].sort((a,b)=>a-b);
  const meio=Math.floor(s.length/2);
  return s.length%2!==0?s[meio]:(s[meio-1]+s[meio])/2;
}
function calcularProLaboreRecomendado(){
  const meses=receitaMensalProLabore();
  const primeiro=primeiroMesComDados();
  const dentroDoHistorico=primeiro?meses.filter(m=>m.chave>=primeiro):meses;
  const excluidos=new Set(DB.mesesExcluidosProLabore||[]);
  const considerados=dentroDoHistorico.filter(m=>!excluidos.has(m.chave));
  return{
    valor:mediana(considerados.map(m=>m.v)),
    mesesUsados:considerados.length,
    mesesJanela:PROLABORE_JANELA_MESES,
    amostraIncompleta:dentroDoHistorico.length<PROLABORE_JANELA_MESES,
    detalhes:dentroDoHistorico,
  };
}
function toggleMesProLabore(chave){
  if(!Array.isArray(DB.mesesExcluidosProLabore))DB.mesesExcluidosProLabore=[];
  const idx=DB.mesesExcluidosProLabore.indexOf(chave);
  if(idx>=0)DB.mesesExcluidosProLabore.splice(idx,1);
  else DB.mesesExcluidosProLabore.push(chave);
  salvarDB();
  renderProLabore();
}
function toggleDetalheProLabore(){
  prolaboreDetalheAberto=!prolaboreDetalheAberto;
  renderProLabore();
}
function renderProLabore(){
  const el=document.getElementById('prolabore-card');
  if(!el)return;
  const r=calcularProLaboreRecomendado();
  const nomesM=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  el.innerHTML=`
    <div class="caixa-label" style="color:var(--t3);text-transform:uppercase;font-size:11px;font-weight:600;letter-spacing:.14em;margin-bottom:8px">Valor recomendado</div>
    <div style="font-family:var(--font-serif);font-size:34px;font-weight:600;color:var(--navy)">${money(r.valor)}</div>
    <div style="font-size:12.5px;color:var(--t3);margin-top:6px">mediana de ${r.mesesUsados} ${r.mesesUsados===1?'mês':'meses'} de receita (janela de ${r.mesesJanela})</div>
    ${r.amostraIncompleta?`<div style="font-size:11.5px;color:var(--amber-hi);background:var(--amber-bg);border:1px solid rgba(169,116,27,.24);border-radius:var(--rs);padding:7px 12px;margin-top:10px;display:inline-flex;align-items:center;gap:6px"><i class="ti ti-alert-triangle"></i> Amostra incompleta — só ${r.mesesUsados} de ${r.mesesJanela} meses de histórico disponíveis ainda</div>`:''}
    <div style="margin-top:12px">
      <button class="modulo-link" onclick="toggleDetalheProLabore()">${prolaboreDetalheAberto?'Ocultar meses considerados':'Ver meses considerados'} <i class="ti ti-chevron-${prolaboreDetalheAberto?'up':'down'}"></i></button>
    </div>
    <div id="prolabore-meses" style="display:${prolaboreDetalheAberto?'block':'none'};margin-top:10px">
      ${r.detalhes.map(m=>{
        const excluido=(DB.mesesExcluidosProLabore||[]).includes(m.chave);
        return `<div class="fin-item" style="cursor:default">
          <span class="fin-item-nome" style="${excluido?'text-decoration:line-through;color:var(--t3)':''}">${nomesM[m.m]}/${m.y}</span>
          <div class="fin-item-r">
            <span class="fin-item-val" style="${excluido?'color:var(--t3)':''}">${money(m.v)}</span>
            <label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--t3);cursor:pointer;white-space:nowrap">
              <input type="checkbox" ${excluido?'checked':''} onchange="toggleMesProLabore('${m.chave}')"> não recorrente
            </label>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  FUNDO DO ESCRITÓRIO (reserva de ao menos 10% de tudo que entra)
// ═══════════════════════════════════════════════════════════
// dispara um lembrete sempre que dinheiro novo entra (recebido de
// cliente ou lançamento geral de entrada) — não altera nenhum valor
// automaticamente, é só um alerta para o sócio decidir guardar
function avisarFundoEscritorio(valor){
  const dez=valor*0.10;
  alert('Entrada de '+money(valor)+' registrada.\n\nLembre-se de guardar pelo menos '+money(dez)+' (10%) no Fundo do Escritório, para não repetir a história de faturar bem e não sobrar caixa.');
}
// meta acumulada = 10% de tudo que já entrou (recebido de clientes + lançamentos gerais de entrada)
function metaFundoEscritorio(){
  const recebidoClientes=DB.clientes.reduce((a,c)=>a+clienteAlc(c),0);
  const entradasGerais=(DB.lancamentos||[]).filter(l=>l.tipo==='entrada').reduce((a,l)=>a+l.valor,0);
  return (recebidoClientes+entradasGerais)*0.10;
}
// tudo que já foi guardado no fundo, sem descontar retiradas
function totalGuardadoFundo(){
  return (DB.fundoAportes||[]).reduce((a,f)=>a+f.valor,0);
}
// tudo que já saiu do fundo (voltando para o caixa ou sacado)
function totalRetiradoFundo(){
  return (DB.fundoRetiradas||[]).reduce((a,r)=>a+r.valor,0);
}
// só o que saiu em saque — dinheiro que deixou o escritório e não voltou ao caixa
function saquesFundoEscritorio(){
  return (DB.fundoRetiradas||[]).filter(r=>r.destino==='saque').reduce((a,r)=>a+r.valor,0);
}
// saldo atual do fundo = guardado − retirado
function guardadoFundoEscritorio(){
  return totalGuardadoFundo()-totalRetiradoFundo();
}
function renderFundoEscritorio(){
  const el=document.getElementById('fundo-resumo');
  if(!el)return;
  const meta=metaFundoEscritorio();
  const guardado=guardadoFundoEscritorio();
  const falta=Math.max(0,meta-guardado);
  const pct=meta>0?Math.min(100,Math.round(guardado/meta*100)):0;
  const totalGuardado=totalGuardadoFundo();
  const retirado=totalRetiradoFundo();
  const sacado=saquesFundoEscritorio();
  el.innerHTML=`
    <div class="fin-totais">
      <div class="fin-bloco"><div class="fin-label">Meta acumulada (10%)</div><div class="fin-val">${money(meta)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Saldo no fundo</div><div class="fin-val g">${money(guardado)}</div></div>
      <div class="fin-bloco"><div class="fin-label">Falta guardar</div><div class="fin-val" style="color:${falta>0?'var(--red-hi)':'var(--green-hi)'}">${money(falta)}</div></div>
    </div>
    <div class="hbar-row" style="cursor:default">
      <div class="hbar-label" style="width:auto;margin-right:10px">${pct}%</div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(pct,pct>0?8:0)}%;background:${pct>=100?'var(--green)':pct>=50?'var(--amber)':'var(--red)'}"></div></div>
    </div>
    <div style="font-size:12px;color:var(--t3);margin-top:12px;line-height:1.6">
      ${money(totalGuardado)} já guardados${retirado>0?' · '+money(retirado)+' retirados':''}${sacado>0?' (sendo '+money(sacado)+' em saque)':''}
    </div>`;
  const lista=document.getElementById('fundo-lista');
  if(!lista)return;
  // guardas e retiradas no mesmo histórico, da mais recente para a mais antiga
  const mov=[
    ...(DB.fundoAportes||[]).map(f=>({...f,_mov:'guarda'})),
    ...(DB.fundoRetiradas||[]).map(r=>({...r,_mov:'retirada'})),
  ].sort((a,b)=>(b.data||'')<(a.data||'')?-1:1);
  lista.innerHTML=mov.length?mov.map(f=>{
    if(f._mov==='retirada'){
      const saque=f.destino==='saque';
      const rotulo=saque?'Saque do fundo':'Retirado para o caixa';
      return `<div class="fin-item hoverable">
        <span class="fin-item-nome" style="cursor:pointer" onclick="abrirModalRetiradaFundo('${f.id}')">
          <i class="ti ${saque?'ti-cash-banknote':'ti-corner-down-left'}" style="color:var(--red-hi)"></i>
          ${esc(rotulo)}${f.obs?' <span style="color:var(--t3)">— '+esc(f.obs)+'</span>':''}
        </span>
        <div class="fin-item-r">
          <span class="fin-item-val" style="color:var(--red-hi)">− ${money(f.valor)}</span>
          <span style="font-size:11px;color:var(--t3)">${f.data?fmtData(f.data):'—'}</span>
          <button class="btn-ico" onclick="abrirModalRetiradaFundo('${f.id}')" title="Editar retirada"><i class="ti ti-pencil"></i></button>
        </div>
      </div>`;
    }
    const origemTxt=f.origem?esc(f.origem.cnome)+' <span style="color:var(--t3)">— '+esc(f.origem.finDesc||'')+'</span>':esc(f.obs||'Guarda manual');
    const editOnclick=f.origem?`irParaCliente('${f.origem.cid}')`:`abrirModalAporte('${f.id}')`;
    return `<div class="fin-item hoverable">
      <span class="fin-item-nome" style="cursor:pointer" onclick="${editOnclick}"><i class="ti ti-pig-money" style="color:var(--green-hi)"></i> ${origemTxt}</span>
      <div class="fin-item-r">
        <span class="fin-item-val">${money(f.valor)}</span>
        <span style="font-size:11px;color:var(--t3)">${f.data?fmtData(f.data):'—'}</span>
        <button class="btn-ico" onclick="transferirFundoParaCaixa('${f.id}')" title="Desfazer esta guarda — o valor inteiro volta para o caixa"><i class="ti ti-arrow-back-up"></i></button>
      </div>
    </div>`;
  }).join(''):'<p style="font-size:12.5px;color:var(--t3)">Nenhuma movimentação no fundo ainda.</p>';
}
// ─── RETIRADA DE VALOR PERSONALIZADO DO FUNDO ───
// O botão de cada guarda só desfaz o depósito inteiro. Aqui o sócio tira a quantia
// que quiser, escolhendo se o dinheiro volta para o caixa ou sai de vez (saque).
let mfrCtx={id:null,destino:'caixa'};
function mfrDestino(d){
  mfrCtx.destino=d;
  document.getElementById('mfr-dest-caixa').classList.toggle('on',d==='caixa');
  document.getElementById('mfr-dest-saque').classList.toggle('on',d==='saque');
  document.getElementById('mfr-dest-hint').textContent=d==='caixa'
    ? 'O valor deixa a reserva e volta a contar no caixa disponível.'
    : 'O dinheiro sai do escritório: baixa no fundo e o caixa não aumenta.';
}
function abrirModalRetiradaFundo(id){
  mfrCtx={id,destino:'caixa'};
  const saldo=guardadoFundoEscritorio();
  document.getElementById('mfr-saldo').textContent=money(saldo);
  if(id){
    const r=(DB.fundoRetiradas||[]).find(x=>x.id===id);
    if(!r)return;
    document.getElementById('mfr-titulo').textContent='Editar retirada do fundo';
    document.getElementById('mfr-valor').value=r.valor.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('mfr-data').value=r.data||hojeISO();
    document.getElementById('mfr-obs').value=r.obs||'';
    document.getElementById('mfr-del').style.display='inline-flex';
    mfrDestino(r.destino==='saque'?'saque':'caixa');
  }else{
    if(!(saldo>0)){alert('Não há saldo no Fundo do Escritório para retirar.');return;}
    document.getElementById('mfr-titulo').textContent='Retirar do fundo';
    document.getElementById('mfr-valor').value='';
    document.getElementById('mfr-data').value=hojeISO();
    document.getElementById('mfr-obs').value='';
    document.getElementById('mfr-del').style.display='none';
    mfrDestino('caixa');
  }
  abrirOverlay('overlay-fundoret');
  setTimeout(()=>document.getElementById('mfr-valor').focus(),100);
}
function salvarRetiradaFundo(){
  const valor=parseValor(document.getElementById('mfr-valor').value);
  const data=document.getElementById('mfr-data').value;
  const obs=document.getElementById('mfr-obs').value.trim();
  if(!(valor>0)){alert('Informe um valor válido (ex.: 500,00).');return;}
  // o saldo disponível desconsidera a própria retirada quando ela está sendo editada
  const atual=mfrCtx.id?(DB.fundoRetiradas||[]).find(x=>x.id===mfrCtx.id):null;
  const disponivel=guardadoFundoEscritorio()+(atual?atual.valor:0);
  if(valor>disponivel+0.005){
    alert('O fundo tem apenas '+money(disponivel)+' disponíveis. Reduza o valor da retirada.');
    return;
  }
  if(!DB.fundoRetiradas)DB.fundoRetiradas=[];
  if(atual){
    atual.valor=valor;atual.data=data;atual.obs=obs;atual.destino=mfrCtx.destino;
  }else{
    DB.fundoRetiradas.push({id:uid(),valor,data,obs,destino:mfrCtx.destino,criadoEm:Date.now()});
  }
  salvarDB();
  fecharOverlay('overlay-fundoret');
  refreshUI();
}
function excluirRetiradaFundo(){
  const r=(DB.fundoRetiradas||[]).find(x=>x.id===mfrCtx.id);
  if(!r)return;
  if(!confirm('Excluir esta retirada de '+money(r.valor)+'?\n\nO valor volta a contar como saldo do Fundo do Escritório.'))return;
  DB.fundoRetiradas=DB.fundoRetiradas.filter(x=>x.id!==mfrCtx.id);
  salvarDB();
  fecharOverlay('overlay-fundoret');
  refreshUI();
}
// remove um aporte do fundo e devolve o valor ao caixa disponível — usado
// tanto pelo botão de cada linha no Fundo quanto pelo "desfazer" no lançamento
function transferirFundoParaCaixa(id){
  const f=(DB.fundoAportes||[]).find(a=>a.id===id);
  if(!f)return;
  if(!confirm('Transferir '+money(f.valor)+' de volta para o caixa?\n\nEsse valor deixa de ser contado como reserva no Fundo do Escritório.'))return;
  if(f.origem&&f.origem.finId){
    const c=DB.clientes.find(x=>x.id===f.origem.cid);
    const fin=c&&c.fin.find(x=>x.id===f.origem.finId);
    if(fin)fin.fundoAporteId=null;
  }
  DB.fundoAportes=(DB.fundoAportes||[]).filter(a=>a.id!==id);
  salvarDB();
  refreshUI();
  atualizarFundoNoModalFin();
}
let mfeCtx={id:null};
function abrirModalAporte(id){
  mfeCtx={id};
  if(id){
    const f=DB.fundoAportes.find(x=>x.id===id);
    document.getElementById('mfe-titulo').textContent='Editar guarda no fundo';
    document.getElementById('mfe-valor').value=f.valor.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('mfe-data').value=f.data||hojeISO();
    document.getElementById('mfe-obs').value=f.obs||'';
    document.getElementById('mfe-del').style.display='inline-flex';
  }else{
    document.getElementById('mfe-titulo').textContent='Registrar guarda no fundo';
    document.getElementById('mfe-valor').value='';
    document.getElementById('mfe-data').value=hojeISO();
    document.getElementById('mfe-obs').value='';
    document.getElementById('mfe-del').style.display='none';
  }
  abrirOverlay('overlay-fundo');
  setTimeout(()=>document.getElementById('mfe-valor').focus(),100);
}
function salvarAporte(){
  const valor=parseValor(document.getElementById('mfe-valor').value);
  const data=document.getElementById('mfe-data').value;
  const obs=document.getElementById('mfe-obs').value.trim();
  if(!(valor>0)){alert('Informe um valor válido (ex.: 500,00).');return;}
  if(mfeCtx.id){
    const f=DB.fundoAportes.find(x=>x.id===mfeCtx.id);
    f.valor=valor;f.data=data;f.obs=obs;
  }else{
    DB.fundoAportes.push({id:uid(),valor,data,obs});
  }
  salvarDB();
  fecharOverlay('overlay-fundo');
  refreshUI();
}
function excluirAporte(){
  const f=DB.fundoAportes.find(x=>x.id===mfeCtx.id);
  if(!f)return;
  if(!confirm('Excluir esta guarda de '+money(f.valor)+' do fundo?\n\nO valor volta a ser contado no caixa disponível.'))return;
  if(f.origem&&f.origem.finId){
    const c=DB.clientes.find(x=>x.id===f.origem.cid);
    const fin=c&&c.fin.find(x=>x.id===f.origem.finId);
    if(fin)fin.fundoAporteId=null;
  }
  DB.fundoAportes=DB.fundoAportes.filter(x=>x.id!==mfeCtx.id);
  salvarDB();
  fecharOverlay('overlay-fundo');
  refreshUI();
}

// ═══════════════════════════════════════════════════════════
//  CUSTOS FIXOS (catálogo de despesas recorrentes do escritório)
// ═══════════════════════════════════════════════════════════
let mcuCtx={id:null,ativo:true};
function mcuStatus(ativo){
  mcuCtx.ativo=ativo;
  document.getElementById('mcu-st-a').classList.toggle('on',ativo);
  document.getElementById('mcu-st-x').classList.toggle('on',!ativo);
}
function abrirModalCusto(id){
  mcuCtx={id,ativo:true};
  if(id){
    const c=DB.custosFixos.find(x=>x.id===id);
    document.getElementById('mcu-titulo').textContent='Editar custo fixo';
    document.getElementById('mcu-nome').value=c.nome;
    document.getElementById('mcu-categoria').value=c.categoria||'';
    document.getElementById('mcu-valor').value=c.valor.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('mcu-venc').value=c.vencimento||'';
    mcuStatus(c.ativo!==false);
    document.getElementById('mcu-del').style.display='inline-flex';
  }else{
    document.getElementById('mcu-titulo').textContent='Novo custo fixo';
    document.getElementById('mcu-nome').value='';
    document.getElementById('mcu-categoria').value='';
    document.getElementById('mcu-valor').value='';
    document.getElementById('mcu-venc').value='';
    mcuStatus(true);
    document.getElementById('mcu-del').style.display='none';
  }
  abrirOverlay('overlay-custo');
  setTimeout(()=>document.getElementById('mcu-nome').focus(),100);
}
function salvarCusto(){
  const nome=document.getElementById('mcu-nome').value.trim();
  const categoria=document.getElementById('mcu-categoria').value.trim();
  const valor=parseValor(document.getElementById('mcu-valor').value);
  const vencRaw=document.getElementById('mcu-venc').value.trim();
  let vencimento=null;
  if(vencRaw!==''){
    vencimento=Math.round(Number(vencRaw));
    if(Number.isNaN(vencimento)||vencimento<1||vencimento>31){alert('Dia de vencimento deve ser um número de 1 a 31.');return;}
  }
  if(!nome){alert('Informe o nome do custo.');return;}
  if(!(valor>0)){alert('Informe um valor válido (ex.: 2.500,00).');return;}
  if(mcuCtx.id){
    const c=DB.custosFixos.find(x=>x.id===mcuCtx.id);
    c.nome=nome;c.categoria=categoria;c.valor=valor;c.vencimento=vencimento;c.ativo=mcuCtx.ativo;
  }else{
    DB.custosFixos.push({id:uid(),nome,categoria,valor,vencimento,ativo:mcuCtx.ativo});
  }
  salvarDB();
  fecharOverlay('overlay-custo');
  refreshUI();
}
function excluirCusto(){
  const c=DB.custosFixos.find(x=>x.id===mcuCtx.id);
  if(!c)return;
  if(!confirm('Excluir o custo "'+c.nome+'"?\n\nLançamentos já registrados não são afetados — só deixa de aparecer no catálogo.'))return;
  DB.custosFixos=DB.custosFixos.filter(x=>x.id!==mcuCtx.id);
  salvarDB();
  fecharOverlay('overlay-custo');
  refreshUI();
}
// lança o pagamento deste mês como uma saída (com um clique, a partir do catálogo)
function lancarCustoMes(custoId){
  const c=DB.custosFixos.find(x=>x.id===custoId);
  if(!c)return;
  if(!confirm('Lançar "'+c.nome+'" ('+fmt(c.valor)+') como saída de hoje?'))return;
  DB.lancamentos.push({id:uid(),tipo:'saida',categoria:c.categoria||'Custo fixo',descricao:c.nome,valor:c.valor,data:hojeISO(),custoFixoId:c.id});
  salvarDB();
  refreshUI();
}
function vencimentoTxt(dia){return dia?' · vence dia '+dia:''}
function renderCustos(){
  const el=document.getElementById('custos-list');
  if(!el)return;
  if(!DB.custosFixos.length){
    el.innerHTML='<p style="font-size:13px;color:var(--t3);padding:6px 0 10px">Nenhum custo fixo cadastrado ainda.</p>';
  }else{
    el.innerHTML=DB.custosFixos.map(c=>`
      <div class="custo-row ${c.ativo===false?'inativo':''}">
        <div class="custo-info">
          <div class="custo-nome">${esc(c.nome)}</div>
          <div class="custo-cat">${esc(c.categoria||'sem categoria')}${vencimentoTxt(c.vencimento)}${c.ativo===false?' · inativo':''}</div>
        </div>
        <div class="custo-val">${money(c.valor)}<span class="custo-val-sufixo">/mês</span></div>
        <div class="row-act" style="opacity:1">
          <button class="btn-ico ok" onclick="lancarCustoMes('${c.id}')" title="Lançar pagamento deste mês como saída"><i class="ti ti-cash-banknote"></i></button>
          <button class="btn-ico" onclick="abrirModalCusto('${c.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
        </div>
      </div>`).join('');
  }
  const resumo=document.getElementById('custos-resumo');
  if(!resumo)return;
  const ativos=DB.custosFixos.filter(c=>c.ativo!==false);
  const total=ativos.reduce((a,c)=>a+c.valor,0);
  const porCategoria={};
  ativos.forEach(c=>{const k=c.categoria||'Sem categoria';porCategoria[k]=(porCategoria[k]||0)+c.valor;});
  const linhas=Object.entries(porCategoria).sort((a,b)=>b[1]-a[1]);
  resumo.innerHTML=`
    <div class="fin-bloco" style="margin-bottom:14px">
      <div class="fin-label">Total de custos fixos ativos</div>
      <div class="fin-val" style="color:var(--red-hi)">${money(total)}<span style="font-size:13px;font-weight:400;color:var(--t3)">/mês</span></div>
    </div>
    ${linhas.length?linhas.map(([k,v])=>`<div class="fin-item"><span class="fin-item-nome">${esc(k)}</span><span class="fin-item-val">${money(v)}</span></div>`).join(''):'<p style="font-size:12.5px;color:var(--t3)">Sem custos ativos no momento.</p>'}`;
}

// ═══════════════════════════════════════════════════════════
//  LANÇAMENTOS DO CAIXA (entradas/saídas gerais, sem cliente)
// ═══════════════════════════════════════════════════════════
let mlCtx={id:null,tipo:'saida'};
function mlTipo(t){
  mlCtx.tipo=t;
  document.getElementById('ml-t-entrada').classList.toggle('on',t==='entrada');
  document.getElementById('ml-t-saida').classList.toggle('on',t==='saida');
}
function abrirModalLancamento(id){
  mlCtx={id,tipo:'saida'};
  if(id){
    const l=DB.lancamentos.find(x=>x.id===id);
    document.getElementById('ml-titulo').textContent='Editar lançamento';
    document.getElementById('ml-desc').value=l.descricao;
    document.getElementById('ml-valor').value=l.valor.toLocaleString('pt-BR',{minimumFractionDigits:2});
    document.getElementById('ml-data').value=l.data||'';
    document.getElementById('ml-categoria').value=l.categoria||'';
    mlTipo(l.tipo);
    document.getElementById('ml-del').style.display='inline-flex';
  }else{
    document.getElementById('ml-titulo').textContent='Novo lançamento';
    document.getElementById('ml-desc').value='';
    document.getElementById('ml-valor').value='';
    document.getElementById('ml-data').value=hojeISO();
    document.getElementById('ml-categoria').value='';
    mlTipo('saida');
    document.getElementById('ml-del').style.display='none';
  }
  abrirOverlay('overlay-lanc');
  setTimeout(()=>document.getElementById('ml-desc').focus(),100);
}
function salvarLancamento(){
  const descricao=document.getElementById('ml-desc').value.trim();
  const valor=parseValor(document.getElementById('ml-valor').value);
  const data=document.getElementById('ml-data').value;
  const categoria=document.getElementById('ml-categoria').value.trim();
  if(!descricao){alert('Informe a descrição do lançamento.');return;}
  if(!(valor>0)){alert('Informe um valor válido (ex.: 500,00).');return;}
  const isNovaEntrada=!mlCtx.id&&mlCtx.tipo==='entrada';
  if(mlCtx.id){
    const l=DB.lancamentos.find(x=>x.id===mlCtx.id);
    l.descricao=descricao;l.valor=valor;l.data=data;l.categoria=categoria;l.tipo=mlCtx.tipo;
  }else{
    DB.lancamentos.push({id:uid(),descricao,valor,data,categoria,tipo:mlCtx.tipo});
  }
  salvarDB();
  fecharOverlay('overlay-lanc');
  // o recorte padrão é o mês corrente: se o lançamento é de outro mês, amplia
  // o período para ele não sumir da tela logo depois de salvo
  if(lancPeriodo==='mes'&&(!data||data.slice(0,7)!==hojeISO().slice(0,7))){
    lancPeriodo='tudo';
    const dEl=document.getElementById('lanc-de'), aEl=document.getElementById('lanc-ate');
    if(dEl)dEl.value=''; if(aEl)aEl.value='';
  }
  refreshUI();
  if(isNovaEntrada)avisarFundoEscritorio(valor);
}
function excluirLancamento(){
  const l=DB.lancamentos.find(x=>x.id===mlCtx.id);
  if(!l)return;
  if(!confirm('Excluir o lançamento "'+l.descricao+'"?'))return;
  DB.lancamentos=DB.lancamentos.filter(x=>x.id!==mlCtx.id);
  salvarDB();
  fecharOverlay('overlay-lanc');
  refreshUI();
}
// período dos lançamentos do caixa: por padrão só o mês corrente, para a tabela
// não abrir com a base inteira. As datas do filtro, quando preenchidas, mandam.
let lancPeriodo='mes';
function setLancPeriodo(p){
  lancPeriodo=p;
  document.getElementById('lanc-de').value='';
  document.getElementById('lanc-ate').value='';
  renderLancamentos();
}
function limparPeriodoLanc(){
  document.getElementById('lanc-de').value='';
  document.getElementById('lanc-ate').value='';
  renderLancamentos();
}
function renderLancamentos(){
  const el=document.getElementById('lancamentos-rows');
  if(!el)return;
  const painel=document.getElementById('lanc-panel');
  if(painel)painel.classList.toggle('recolhida',blocoRecolhido('fin:lancamentos',true));
  const de=(document.getElementById('lanc-de')||{}).value||'';
  const ate=(document.getElementById('lanc-ate')||{}).value||'';
  const usandoDatas=!!(de||ate);
  const mesAtual=hojeISO().slice(0,7);
  document.querySelectorAll('#lanc-chips .chip[data-p]').forEach(b=>
    b.classList.toggle('active',!usandoDatas&&b.dataset.p===lancPeriodo));
  let rows=[...DB.lancamentos].sort((a,b)=>(b.data||'')<(a.data||'')?-1:((b.data||'')>(a.data||'')?1:0));
  if(usandoDatas)rows=rows.filter(l=>{if(!l.data)return false;if(de&&l.data<de)return false;if(ate&&l.data>ate)return false;return true;});
  else if(lancPeriodo==='mes')rows=rows.filter(l=>l.data&&l.data.slice(0,7)===mesAtual);
  const ent=rows.filter(l=>l.tipo==='entrada').reduce((a,l)=>a+l.valor,0);
  const sai=rows.filter(l=>l.tipo==='saida').reduce((a,l)=>a+l.valor,0);
  const periodoTxt=usandoDatas
    ? 'período de '+(de?fmtData(de):'início')+' a '+(ate?fmtData(ate):'hoje')
    : (lancPeriodo==='mes'?nomeMesChave(mesAtual):'todo o período');
  // cabeçalho do painel: dá o essencial mesmo com o card fechado
  const badge=document.getElementById('lanc-badge');
  if(badge)badge.textContent=rows.length+' lançamento'+(rows.length!==1?'s':'');
  const resumo=document.getElementById('lanc-resumo');
  if(resumo)resumo.textContent=periodoTxt+' · + '+money(ent)+' · − '+money(sai)
    +(rows.length!==DB.lancamentos.length?' · '+DB.lancamentos.length+' no total':'');
  const ptxt=document.getElementById('lanc-periodo-txt');
  if(ptxt)ptxt.textContent='Exibindo '+periodoTxt+'.';
  if(!rows.length){
    const vazio=usandoDatas?'Nenhum lançamento no período selecionado.'
      :(lancPeriodo==='mes'
        ?'Nenhum lançamento em '+nomeMesChave(mesAtual)+'. Use “Todo o período” ou o filtro de datas para ver os meses anteriores.'
        :'Nenhum lançamento registrado ainda. Use "Novo lançamento" para entradas e saídas gerais, ou o catálogo de custos fixos acima.');
    el.innerHTML='<div class="fin-empty">'+vazio+'</div>';return;
  }
  el.innerHTML=rows.map(l=>`
    <div class="fin-row hoverable" onclick="abrirModalLancamento('${l.id}')">
      <div class="fin-c-desc">${esc(l.descricao)}</div>
      <div class="fin-c-data">${l.data?fmtData(l.data):'—'}</div>
      <div class="fin-c-tipo"><span class="fin-tipo ft-cat">${esc(l.categoria||'—')}</span></div>
      <div class="fin-c-tipo"><span class="fin-tipo ${l.tipo==='entrada'?'ft-e':'ft-saida'}">${l.tipo==='entrada'?'entrada':'saída'}</span></div>
      <div class="fin-c-val" style="color:${l.tipo==='saida'?'var(--red-hi)':'inherit'}">${l.tipo==='saida'?'− ':''}${money(l.valor)}</div>
      <div class="fin-c-act row-act">
        <button class="btn-ico ${l.comprovante?'ok':''}" onclick="event.stopPropagation();abrirComprovanteLanc('${l.id}')" title="${l.comprovante?'Ver comprovante':'Anexar comprovante (Google Drive)'}"><i class="ti ti-paperclip"></i></button>
        <button class="btn-ico" onclick="event.stopPropagation();abrirModalLancamento('${l.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
      </div>
    </div>`).join('');
}
