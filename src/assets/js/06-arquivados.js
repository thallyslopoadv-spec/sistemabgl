
// ═══════════════════════════════════════════════════════════
//  PROCESSOS ARQUIVADOS — resultado (ganho/perdido) e aproveitamento
// ═══════════════════════════════════════════════════════════
let arqFiltro='todos', arqBusca='';
function filtroArquivados(f,btn){
  arqFiltro=f;
  document.querySelectorAll('#view-arquivados .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderArquivados();
}
function buscaArquivados(v){arqBusca=v;renderArquivados();}
// avança o resultado: sem resultado → ganho → perdido → sem resultado
function cicloResultado(pid){
  const p=DB.processos.find(x=>x.id===pid);
  if(!p)return;
  p.resultado=p.resultado==='ganho'?'perdido':p.resultado==='perdido'?null:'ganho';
  salvarDB();
  refreshUI();
}
function resultadoInfo(p){
  if(p.resultado==='ganho')return{cls:'resultado-ganho',txt:'Ganho'};
  if(p.resultado==='perdido')return{cls:'resultado-perdido',txt:'Perdido'};
  return{cls:'resultado-pendente',txt:'Sem resultado'};
}
function renderArquivados(){
  const st=document.getElementById('arq-stats');
  const lista=document.getElementById('arq-lista');
  if(!st||!lista)return;
  const arquivados=DB.processos.filter(p=>p.status==='Arquivado');
  const ganhos=arquivados.filter(p=>p.resultado==='ganho').length;
  const perdidos=arquivados.filter(p=>p.resultado==='perdido').length;
  const pendentes=arquivados.length-ganhos-perdidos;
  const decididos=ganhos+perdidos;
  const aproveitamento=decididos>0?Math.round(ganhos/decididos*100):0;

  st.innerHTML=`
    <div class="stat-card"><div class="stat-label">Processos arquivados</div><div class="stat-val">${arquivados.length}</div></div>
    <div class="stat-card" data-c="green"><div class="stat-label">Ganhos</div><div class="stat-val">${ganhos}</div></div>
    <div class="stat-card" data-c="red"><div class="stat-label">Perdidos</div><div class="stat-val">${perdidos}</div></div>
    <div class="stat-card" data-c="amber"><div class="stat-label">Sem resultado ainda</div><div class="stat-val">${pendentes}</div></div>`;

  const ap=document.getElementById('arq-aproveitamento');
  if(ap){
    ap.innerHTML=`
      <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px">
        <span style="font-family:var(--font-serif);font-size:38px;font-weight:600;color:var(--navy)">${aproveitamento}%</span>
        <span style="font-size:13px;color:var(--t3)">${ganhos} ganho${ganhos!==1?'s':''} em ${decididos} processo${decididos!==1?'s':''} já decidido${decididos!==1?'s':''}${pendentes?' · '+pendentes+' ainda sem resultado':''}</span>
      </div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(aproveitamento,aproveitamento>0?8:0)}%;background:${aproveitamento>=65?'var(--green)':aproveitamento>=40?'var(--amber)':'var(--red)'}">${decididos>0?aproveitamento+'%':''}</div></div>`;
  }

  let ps=[...arquivados];
  if(arqFiltro==='ganho')ps=ps.filter(p=>p.resultado==='ganho');
  else if(arqFiltro==='perdido')ps=ps.filter(p=>p.resultado==='perdido');
  else if(arqFiltro==='pendente')ps=ps.filter(p=>!p.resultado);
  if(arqBusca){
    const q=arqBusca.toLowerCase();
    ps=ps.filter(p=>{
      const c=clientePorId(p.cid);
      return (p.num||'').toLowerCase().includes(q)||(p.ativo||'').toLowerCase().includes(q)||(p.passivo||'').toLowerCase().includes(q)||(c&&c.nome.toLowerCase().includes(q));
    });
  }
  ps=ordenarProcessosPorCliente(ps);   // ordem alfabética por cliente

  lista.innerHTML=ps.length?ps.map(p=>{
    const c=clientePorId(p.cid);
    const ri=resultadoInfo(p);
    const ei=exitoInfo(p);
    return `<div class="proc-row hoverable">
      <span class="proc-num">${esc(p.num)}</span>
      <span class="proc-partes"><b>${esc(p.ativo)}</b> × ${esc(p.passivo)}${c?' · <span style="color:var(--t3)">'+esc(c.curto)+'</span>':''}</span>
      <span class="proc-polo ${p.polo==='a'?'polo-a':'polo-p'}">${p.polo==='a'?'Polo ativo':'Polo passivo'}</span>
      ${ei?`<span class="exito-badge ${ei.cls}" title="Probabilidade de êxito estimada antes do resultado">${ei.v}% estimado</span>`:''}
      <span class="proc-data">${fmtData(p.dist)}</span>
      <span class="resultado-pill ${ri.cls}" onclick="cicloResultado('${p.id}')" title="Clique para marcar o resultado">${ri.txt}</span>
      ${c?`<span class="row-act"><button class="btn-ico" onclick="irParaCliente('${c.id}')" title="Abrir ficha do cliente"><i class="ti ti-user"></i></button></span>`:''}
    </div>`;
  }).join(''):'<p style="font-size:13.5px;color:var(--t3);padding:20px 0;text-align:center">Nenhum processo arquivado encontrado neste filtro.</p>';
}
// resultado líquido por mês (recebido de clientes + entradas gerais − saídas gerais)
function caixaPorMes(){
  const meses=[];const now=new Date();
  for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);meses.push({y:d.getFullYear(),m:d.getMonth(),v:0});}
  DB.clientes.forEach(c=>c.fin.forEach(f=>{
    if((f.t!=='alc'&&f.t!=='saida')||!f.dt)return;
    const[ay,am]=f.dt.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));
    if(alvo)alvo.v+=(f.t==='alc'?f.v:-f.v);
  }));
  (DB.lancamentos||[]).forEach(l=>{
    if(!l.data)return;
    const[ay,am]=l.data.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));
    if(alvo)alvo.v+=(l.tipo==='entrada'?l.valor:-l.valor);
  });
  // dinheiro guardado no Fundo do Escritório sai do caixa disponível no mês em que foi guardado
  (DB.fundoAportes||[]).forEach(f=>{
    if(!f.data)return;
    const[ay,am]=f.data.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));
    if(alvo)alvo.v-=f.valor;
  });
  // retirada do fundo com destino "caixa" volta a entrar no resultado do mês da retirada;
  // a retirada em saque não entra (o dinheiro já tinha saído do caixa quando foi guardado)
  (DB.fundoRetiradas||[]).forEach(r=>{
    if(!r.data||r.destino==='saque')return;
    const[ay,am]=r.data.split('-').map(Number);
    const alvo=meses.find(x=>x.y===ay&&x.m===(am-1));
    if(alvo)alvo.v+=r.valor;
  });
  return meses;
}
// soma bruta do caixa sem o ajuste de saldo inicial (usada também para calcular o ajuste)
function caixaSemAjuste(){
  const recebidoClientes=DB.clientes.reduce((a,c)=>a+clienteAlc(c),0);
  const saidaClientes=DB.clientes.reduce((a,c)=>a+clienteSaida(c),0);
  const entradasGerais=(DB.lancamentos||[]).filter(l=>l.tipo==='entrada').reduce((a,l)=>a+l.valor,0);
  const saidasGerais=(DB.lancamentos||[]).filter(l=>l.tipo==='saida').reduce((a,l)=>a+l.valor,0);
  const guardadoFundo=guardadoFundoEscritorio();
  // o saque é descontado de novo porque a queda do saldo do fundo, sozinha, devolveria
  // o valor ao caixa — e no saque o dinheiro sai do escritório, não volta para o caixa
  const saques=saquesFundoEscritorio();
  return recebidoClientes-saidaClientes+entradasGerais-saidasGerais-guardadoFundo-saques;
}
// caixa atual = recebido de clientes − saídas de clientes + entradas gerais − saídas gerais + ajuste de saldo inicial
function caixaAtualValor(){
  return caixaSemAjuste()+((DB.saldoInicial&&DB.saldoInicial.valor)||0);
}
// ─── RECEITA PREVISTA (regra de negócio): honorário estimado × peso da etapa,
// reduzido à metade se o lead está sem contato há mais de 7 dias. Cobre tanto
// os leads ainda no funil (Qualificado…Em negociação) quanto os "previstos" já
// pertencentes a clientes fechados (aceite verbal 90% / contratado 100%).
function receitaPrevistaLeads(){
  return todosLeadsCRM().reduce((soma,l)=>{
    const peso=PESO_ETAPA_LEAD[l.statusCRM];
    if(!peso)return soma;
    const dias=leadDiasSemContato(l);
    const fator=(dias!==null&&dias>7)?0.5:1;
    return soma+(l.valorHonorarioEstimado||0)*peso*fator;
  },0);
}
function receitaPrevistaClientes(){
  let total=0;
  DB.clientes.forEach(c=>c.fin.forEach(f=>{
    if(f.t!=='prev')return;
    total+=f.v*(f.aceiteVerbal?PESO_PREVISTO_CLIENTE.aceiteVerbal:PESO_PREVISTO_CLIENTE.contratado);
  }));
  return total;
}
function receitaPrevistaTotal(){return receitaPrevistaLeads()+receitaPrevistaClientes()}

// ─── CRÉDITOS DEPENDENTES DE TERCEIRO: classificação de "esquecido" ───
// um previsto sem lançamento/atividade recente normalmente seria sinalizado como
// esquecido — mas se for um crédito de execução/terceiro com data prevista de
// recebimento preenchida e ainda não vencida, ele fica isento dessa marcação
const CREDITO_ESQUECIDO_DIAS=30;
function finPrevistoEsquecido(f){
  if(f.t!=='prev')return false;
  if(f.dependeTerceiro&&f.dataPrevistaRecebimento){
    return f.dataPrevistaRecebimento<hojeISO(); // só "esquecido" se a própria data prevista já venceu
  }
  // parcela com vencimento ainda por vir (ex.: série recorrente de 12 meses) não
  // está esquecida: só passa a contar depois que a própria data passar
  if(f.dt&&f.dt>=hojeISO())return false;
  const criado=f.criadoEm||0;
  return (Date.now()-criado)/86400000>CREDITO_ESQUECIDO_DIAS;
}
function creditosEsquecidos(){
  const lista=[];
  DB.clientes.forEach(c=>c.fin.forEach(f=>{if(finPrevistoEsquecido(f))lista.push({c,f});}));
  return lista;
}
function renderCaixa(sufixo){
  const valEl=document.getElementById('caixa-val'+sufixo);
  if(!valEl)return;
  const recebidoClientes=DB.clientes.reduce((a,c)=>a+clienteAlc(c),0);
  const saidaClientes=DB.clientes.reduce((a,c)=>a+clienteSaida(c),0);
  const saidasGerais=(DB.lancamentos||[]).filter(l=>l.tipo==='saida').reduce((a,l)=>a+l.valor,0);
  const totalSaidas=saidaClientes+saidasGerais;
  const guardadoFundo=guardadoFundoEscritorio();
  const ajuste=(DB.saldoInicial&&DB.saldoInicial.valor)||0;
  const totalCaixa=caixaAtualValor();
  const custosAtivosMes=(DB.custosFixos||[]).filter(c=>c.ativo!==false).reduce((a,c)=>a+c.valor,0);
  const meses=caixaPorMes();
  const atual=meses[meses.length-1], anterior=meses[meses.length-2];
  valEl.textContent=money(totalCaixa);
  document.getElementById('caixa-sub'+sufixo).innerHTML=
    money(recebidoClientes)+' de clientes'+(totalSaidas>0?' · '+money(totalSaidas)+' em saídas':'')+
    (guardadoFundo>0?' · '+money(guardadoFundo)+' no fundo':'')+
    (ajuste?' · <span style="color:'+(ajuste<0?'#e0a5a5':'#7dbf88')+'">ajuste de saldo '+(ajuste>0?'+':'')+money(ajuste)+'</span>':'')+
    ' · <a onclick="abrirExtratoCaixa()" style="color:var(--silver-light);text-decoration:underline;cursor:pointer">ver extrato</a>'+
    ' · <a onclick="abrirModalSaldo()" style="color:var(--silver-light);text-decoration:underline;cursor:pointer">ajustar saldo</a>';
  const receitaPrevistaItem=sufixo===''?`<div class="caixa-trend-item"><div class="caixa-trend-lbl">Receita prevista (funil)</div><div class="caixa-trend-val">${money(receitaPrevistaTotal())}</div></div>`:'';
  document.getElementById('caixa-trend'+sufixo).innerHTML=`
    <div class="caixa-trend-item"><div class="caixa-trend-lbl">Resultado este mês</div><div class="caixa-trend-val ${atual.v<0?'down':atual.v>0?'up':''}">${money(atual.v)}</div></div>
    <div class="caixa-trend-item"><div class="caixa-trend-lbl">Mês anterior</div><div class="caixa-trend-val">${money(anterior.v)}</div></div>
    <div class="caixa-trend-item"><div class="caixa-trend-lbl">Custos fixos/mês</div><div class="caixa-trend-val ${custosAtivosMes>0?'down':''}">${money(custosAtivosMes)}</div></div>${receitaPrevistaItem}`;
}

// ─── EXTRATO DO CAIXA (todas as movimentações, tipo extrato bancário) ──
// junta toda fonte que compõe o caixa atual num único "livro-razão"
// cronológico, com saldo acumulado — pra sempre dar pra rastrear pra
// onde o dinheiro foi (a soma de tudo aqui bate com caixaAtualValor())
function extratoCaixaMovimentos(){
  const mov=[];
  const ajuste=(DB.saldoInicial&&DB.saldoInicial.valor)||0;
  if(ajuste){
    mov.push({data:(DB.saldoInicial.atualizadoEm)||'','desc':'Ajuste de saldo inicial'+(DB.saldoInicial.obs?' — '+DB.saldoInicial.obs:''),valor:ajuste,cid:null});
  }
  DB.clientes.forEach(c=>c.fin.forEach(f=>{
    if(f.t==='alc')mov.push({data:f.dt||'',desc:c.nome+' — '+f.d,valor:f.v,cid:c.id});
    else if(f.t==='saida')mov.push({data:f.dt||'',desc:c.nome+' — '+f.d,valor:-f.v,cid:c.id});
  }));
  (DB.lancamentos||[]).forEach(l=>{
    mov.push({data:l.data||'',desc:l.descricao+(l.categoria?' ('+l.categoria+')':''),valor:l.tipo==='entrada'?l.valor:-l.valor,cid:null});
  });
  (DB.fundoAportes||[]).forEach(f=>{
    const desc=f.origem?'Guardado no Fundo do Escritório — '+f.origem.cnome+' ('+f.origem.finDesc+')':'Guardado no Fundo do Escritório'+(f.obs?' — '+f.obs:'');
    mov.push({data:f.data||'',desc,valor:-f.valor,cid:f.origem?f.origem.cid:null});
  });
  // só a retirada que volta para o caixa aparece aqui; o saque não passa pelo caixa
  (DB.fundoRetiradas||[]).filter(r=>r.destino!=='saque').forEach(r=>{
    mov.push({data:r.data||'',desc:'Retirado do Fundo do Escritório para o caixa'+(r.obs?' — '+r.obs:''),valor:r.valor,cid:null});
  });
  // ordena por data (mais antiga primeiro) pra calcular o saldo acumulado corretamente;
  // sem data fica no fim, tratado como "aconteceu, mas sem data registrada"
  mov.sort((a,b)=>{
    if(!a.data&&!b.data)return 0;
    if(!a.data)return 1;
    if(!b.data)return -1;
    return a.data<b.data?-1:a.data>b.data?1:0;
  });
  let saldo=0;
  mov.forEach(m=>{saldo+=m.valor;m.saldoApos=saldo;});
  return mov;
}
function abrirExtratoCaixa(){
  // abre mostrando tudo (mesmo comportamento de antes); o filtro por período é opcional
  const de=document.getElementById('extrato-de'), ate=document.getElementById('extrato-ate');
  if(de)de.value=''; if(ate)ate.value='';
  renderExtratoCaixa();
  abrirOverlay('overlay-extrato');
}
// lista as movimentações do caixa, opcionalmente filtradas por período. O saldo acumulado
// (saldoApos) é sempre o real — calculado sobre TODAS as movimentações — mesmo quando o
// filtro esconde as anteriores, então continua batendo com o extrato completo.
function renderExtratoCaixa(){
  const de=(document.getElementById('extrato-de')||{}).value||'';
  const ate=(document.getElementById('extrato-ate')||{}).value||'';
  let mov=[...extratoCaixaMovimentos()].reverse(); // mais recente primeiro, como extrato de banco
  if(de||ate){
    mov=mov.filter(m=>{
      if(!m.data)return false; // sem data não entra num filtro por período
      if(de&&m.data<de)return false;
      if(ate&&m.data>ate)return false;
      return true;
    });
  }
  const entradas=mov.filter(m=>m.valor>0).reduce((a,m)=>a+m.valor,0);
  const saidas=mov.filter(m=>m.valor<0).reduce((a,m)=>a-m.valor,0);
  const resumo=document.getElementById('extrato-resumo');
  if(resumo)resumo.innerHTML=mov.length?(mov.length+' mov. · <span style="color:var(--green-hi)">+ '+money(entradas)+'</span> · <span style="color:var(--red-hi)">− '+money(saidas)+'</span>'):'';
  const el=document.getElementById('extrato-lista');
  el.innerHTML=mov.length?mov.map(m=>`
    <div class="fin-item ${m.cid?'hoverable':''}" ${m.cid?`onclick="fecharOverlay('overlay-extrato');irParaCliente('${m.cid}')"`:'style="cursor:default"'}>
      <span class="fin-item-nome">${esc(m.desc)}<br><span style="font-size:11px;color:var(--t3)">${m.data?fmtData(m.data):'sem data'} · saldo após: ${money(m.saldoApos)}</span></span>
      <div class="fin-item-r"><span class="fin-item-val" style="color:${m.valor<0?'var(--red-hi)':'var(--green-hi)'}">${m.valor<0?'− ':'+ '}${money(Math.abs(m.valor))}</span></div>
    </div>`).join(''):'<p style="font-size:12.5px;color:var(--t3)">Nenhuma movimentação'+((de||ate)?' no período selecionado':' registrada ainda')+'.</p>';
}

// ─── AJUSTE DE SALDO INICIAL (corrige o caixa sem virar lançamento de hoje) ─
function abrirModalSaldo(){
  const atual=caixaAtualValor();
  document.getElementById('sld-valor').value=atual.toLocaleString('pt-BR',{minimumFractionDigits:2});
  document.getElementById('sld-obs').value=(DB.saldoInicial&&DB.saldoInicial.obs)||'';
  abrirOverlay('overlay-saldo');
  setTimeout(()=>document.getElementById('sld-valor').focus(),100);
}
function salvarAjusteSaldo(){
  const desejado=parseValor(document.getElementById('sld-valor').value);
  if(Number.isNaN(desejado)){alert('Informe um valor válido (pode ser 0,00 ou negativo).');return;}
  const obs=document.getElementById('sld-obs').value.trim();
  const semAjuste=caixaSemAjuste();
  DB.saldoInicial={valor:desejado-semAjuste,obs,atualizadoEm:hojeISO()};
  salvarDB();
  fecharOverlay('overlay-saldo');
  refreshUI();
}
