// ═══════════════════════════════════════════════════════════
//  GOOGLE DRIVE — MAPA DE PASTAS E SUGESTÃO DE LINKS
// ═══════════════════════════════════════════════════════════
// O Apps Script "gerarMapaLinks" do Drive gera mapa_links_drive.json com o
// link de cada pasta e de cada modelo. Esse mapa NÃO fica no código: o
// repositório é público e a página chega inteira a quem a abrir, e os nomes
// das pastas são nomes de clientes e de partes. Ele é importado aqui
// (Configurações → Google Drive) e guardado em DB.driveMapa, no Gist, junto
// com os demais dados do escritório. Só entram as pastas de "01 Clientes"
// até o nível das subpastas do caso e os links dos modelos.
//
// Com o mapa carregado, "Sugerir links do Drive" casa cada cliente do
// sistema com uma pasta de cliente do Drive e mostra uma prévia. Nada é
// gravado antes da confirmação, só campos vazios são preenchidos e um link
// já existente só é trocado se a caixa "substituir" for marcada.
const DRIVE_SUB={
  docs:'03 Documentos do Cliente',
  contrato:'05 Contrato e Procuração',
  consultivo:'Contratos e Procurações',
};
// subpastas-padrão que identificam uma pasta de caso
const DRIVE_SUB_CASO=/^0[1-6] /;
const DRIVE_CHAVES=['root','docs','contrato','procuracao','processos'];
const DRIVE_ROTULO={root:'Pasta do cliente',docs:'Docs pessoais',contrato:'Contrato de honorários',procuracao:'Procuração',processos:'Docs dos processos'};
const DRIVE_STOP=new Set(['de','da','do','das','dos','e','x','a','o','ltda','me','eireli','epp','sa','cia']);

function driveMapa(){return DB&&DB.driveMapa&&Array.isArray(DB.driveMapa.clientes)?DB.driveMapa:null}

// ─── IMPORTAÇÃO DOS ARQUIVOS DE INTEGRAÇÃO ─────────────────
// Aceita, juntos ou separados: mapa_links_drive.json, catalogo_modelos.json
// e dicionario_campos.json. Cada um é reconhecido pelo formato.
function linkValido(u){return typeof u==='string'&&/^https:\/\//i.test(u)?u:''}
function compactarMapaDrive(m){
  const porCliente=new Map();
  Object.entries(m.pastas||{}).forEach(([caminho,v])=>{
    const p=caminho.split('/'),url=linkValido(v&&v.url);
    if(p[0]!=='01 Clientes'||p.length<3||p.length>5||!url)return;
    if(p[1]!=='Ativos'&&p[1]!=='Inativos')return;
    if(p[2].startsWith('_'))return;           // pastas avulsas, não são clientes
    const chave=p[1]+'/'+p[2];
    if(!porCliente.has(chave))porCliente.set(chave,{nome:p[2],situacao:p[1],url:'',filhos:[]});
    const cli=porCliente.get(chave);
    if(p.length===3){cli.url=url;return;}
    let f=cli.filhos.find(x=>x.nome===p[3]);
    if(!f){f={nome:p[3],url:'',sub:{}};cli.filhos.push(f);}
    if(p.length===4)f.url=url;else f.sub[p[4]]=url;
  });
  const modelos={};
  Object.entries(m.arquivos||{}).forEach(([caminho,v])=>{
    if(!caminho.startsWith('02 Modelos/'))return;
    const cod=/^([A-Z]{2,4}-\d{3})\b/.exec(caminho.split('/').pop());
    const url=linkValido(v&&v.url);
    if(cod&&url)modelos[cod[1]]=url;
  });
  const clientes=[...porCliente.values()].filter(c=>c.url)
    .sort((a,b)=>a.situacao.localeCompare(b.situacao)||a.nome.localeCompare(b.nome,'pt-BR'));
  clientes.forEach(c=>c.filhos.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')));
  return {
    geradoEm:m.gerado_em||'',importadoEm:Date.now(),importadoPor:EU?EU.nome:'',
    pastaModelos:linkValido(m.pastas&&m.pastas['02 Modelos']&&m.pastas['02 Modelos'].url),
    clientes,modelos,
  };
}
// "22/10/2026" ou "2026-10-22T…" → "2026-10-22", para comparar catálogos e mapas
function dataCatalogo(s){
  const t=String(s||'');
  const br=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  return br?br[3]+'-'+br[2]+'-'+br[1]:(/^\d{4}-\d{2}-\d{2}/.test(t)?t.slice(0,10):'');
}
// só links do próprio Drive/Docs, em https
function linkModeloValido(u){return /^https:\/\/(docs|drive)\.google\.com\//i.test(String(u||''))?u:''}
function compactarCatalogo(c){
  return {
    geradoEm:dataCatalogo(c.gerado_em),importadoEm:Date.now(),
    // peca_de_origem fica de fora: aponta para a pasta de um cliente. O link
    // (url) entra: este registro vai para o Gist, nunca para o código.
    modelos:c.modelos.filter(m=>m&&m.codigo&&m.titulo).map(m=>[
      String(m.codigo),MODELOS_AREAS.indexOf(m.area),String(m.subpasta||'').replace(/\\/g,'/'),
      String(m.titulo),String(m.formato||''),(m.campos||[]).map(x=>String(x).replace(/^\{\{|\}\}$/g,'')),
      MODELOS_AREAS.includes(m.area)?'':String(m.area||''),
      linkModeloValido(m.url),
    ]),
  };
}
async function importarArquivosDrive(input){
  const arquivos=[...(input.files||[])];
  if(!arquivos.length)return;
  const feitos=[],erros=[];
  for(const arq of arquivos){
    try{
      const j=JSON.parse(await arq.text());
      if(j&&j.pastas&&j.arquivos){
        DB.driveMapa=compactarMapaDrive(j);
        feitos.push('mapa do Drive ('+DB.driveMapa.clientes.length+' pastas de cliente, '+Object.keys(DB.driveMapa.modelos).length+' modelos com link)');
      }else if(j&&Array.isArray(j.modelos)){
        DB.driveCatalogo=compactarCatalogo(j);
        feitos.push('catálogo ('+DB.driveCatalogo.modelos.length+' modelos, '+DB.driveCatalogo.modelos.filter(x=>x[7]).length+' com link)');
      }else if(j&&typeof j==='object'&&Object.keys(j).length&&Object.keys(j).every(k=>/^\{\{\w+\}\}$/.test(k))){
        DB.driveCampos=Object.fromEntries(Object.entries(j).map(([k,v])=>[k.replace(/^\{\{|\}\}$/g,''),String(v)]));
        feitos.push('dicionário ('+Object.keys(DB.driveCampos).length+' campos)');
      }else erros.push(arq.name+': formato não reconhecido');
    }catch(e){erros.push(arq.name+': não é um JSON válido');}
  }
  input.value='';
  if(feitos.length){salvarDB();refreshUI();}
  renderConfigDrive();
  if(erros.length)alert((feitos.length?'Importado: '+feitos.join('; ')+'.\n\n':'')+'Não importado:\n'+erros.join('\n'));
  else mostrarToast('Importado: '+feitos.join('; '));
}
function renderConfigDrive(){
  const el=document.getElementById('cfg-drive-estado');
  if(!el)return;
  const m=driveMapa();
  const cat=DB&&DB.driveCatalogo;
  const quando=s=>{const d=new Date(s);return isNaN(d)?'—':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})};
  el.innerHTML=m
    ?`<i class="ti ti-circle-check" style="color:var(--green-hi)"></i> Mapa gerado em ${quando(m.geradoEm)} e importado em ${quando(m.importadoEm)}${m.importadoPor?' por '+esc(m.importadoPor):''}: ${m.clientes.length} pastas de cliente e ${Object.keys(m.modelos).length} modelos com link.`
      +(cat?`<br><i class="ti ti-circle-check" style="color:var(--green-hi)"></i> Catálogo de modelos importado (${cat.modelos.length} modelos${cat.geradoEm?', gerado em '+cat.geradoEm.split('-').reverse().join('/'):''})${modelosCatalogoImportadoValido()?'':': o catálogo embutido no sistema é mais novo e está sendo usado no lugar dele'}.`:'')
    :'<i class="ti ti-info-circle"></i> Nenhum mapa importado ainda. Sem ele, a sugestão de pastas e os links dos modelos ficam desligados.';
  const b=document.getElementById('cfg-drive-sugerir');
  if(b)b.disabled=!m;
}

// ─── COMPARAÇÃO DE NOMES ───────────────────────────────────
function driveNorm(s){return semAcento(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function driveTokens(s){return driveNorm(s).split(' ').filter(w=>w.length>1&&!DRIVE_STOP.has(w))}
// "Padaria Exemplo (Nome Fantasia)" → nome principal e o que vem entre
// parênteses. Parênteses que só dizem o papel (sócio, causa própria) não
// valem como nome; "rep. Fulana" vale, mas com peso menor.
function driveApelidos(nome){
  const principal=nome.replace(/\(.*?\)/g,' ').trim();
  const lista=[{t:principal,peso:1}];
  (nome.match(/\(([^)]*)\)/g)||[]).forEach(par=>{
    const dentro=par.slice(1,-1).trim();
    const n=driveNorm(dentro);
    if(!n||/^(socio|socia|causa propria)$/.test(n))return;
    if(/^rep\b/.test(n))lista.push({t:dentro.replace(/^rep\.?\s*/i,''),peso:.6});
    else lista.push({t:dentro,peso:1});
  });
  return lista;
}
function driveNota(a,b){
  const na=driveNorm(a),nb=driveNorm(b);
  if(!na||!nb)return 0;
  if(na===nb)return 100;
  const ta=driveTokens(a),tb=driveTokens(b);
  if(!ta.length||!tb.length)return 0;
  const emA=tb.filter(w=>ta.includes(w)).length;
  if(emA===tb.length)return tb.length>1?90:(ta[0]===tb[0]?75:55);    // a pasta cabe inteira no nome do sistema
  const emB=ta.filter(w=>tb.includes(w)).length;
  if(emB===ta.length)return ta.length>1?85:(ta[0]===tb[0]?70:50);    // o nome do sistema cabe inteiro na pasta
  if(emA>=2)return 65;
  if(emA===1&&ta[0]===tb[0])return 45;                               // só o primeiro nome
  return emA?20:0;
}
function driveNotaCliente(c,pasta){
  let melhor=0;
  driveApelidos(pasta.nome).forEach(ap=>{
    [c.nome,c.curto].filter(Boolean).forEach(n=>{melhor=Math.max(melhor,Math.round(driveNota(n,ap.t)*ap.peso));});
  });
  return melhor;
}
function drivePastaId(p){return p.situacao+'/'+p.nome}
function drivePastaPorId(id){const m=driveMapa();return m&&m.clientes.find(p=>drivePastaId(p)===id)||null}

// Associa todos os clientes de uma vez: um cliente só fica "associado"
// quando a melhor pasta tem nota alta, nenhuma outra chega perto dela e
// nenhum outro cliente disputa a mesma pasta. O resto fica para decidir.
function associarClientesDrive(){
  const m=driveMapa();
  if(!m)return new Map();
  const res=new Map();
  DB.clientes.forEach(c=>{
    const notas=m.clientes.map(p=>({p,n:driveNotaCliente(c,p)})).filter(x=>x.n>=40).sort((a,b)=>b.n-a.n);
    const [a,b]=notas;
    let status='sem';
    if(a&&a.n>=70&&(!b||b.n<a.n-10))status='ok';
    else if(a)status='ambiguo';
    res.set(c.id,{status,pasta:status==='ok'?a.p:null,nota:a?a.n:0,candidatas:notas.slice(0,4).map(x=>x.p)});
  });
  // mesma pasta para dois clientes: fica com quem tem nota maior; empate → os dois decidem
  const porPasta=new Map();
  res.forEach((r,cid)=>{if(r.status==='ok'){const k=drivePastaId(r.pasta);if(!porPasta.has(k))porPasta.set(k,[]);porPasta.get(k).push(cid);}});
  porPasta.forEach(cids=>{
    if(cids.length<2)return;
    const max=Math.max(...cids.map(id=>res.get(id).nota));
    const vencedores=cids.filter(id=>res.get(id).nota===max);
    cids.forEach(id=>{
      if(vencedores.length===1&&id===vencedores[0])return;
      const r=res.get(id);r.status='ambiguo';r.pasta=null;
    });
  });
  return res;
}

// ─── CASO DO CLIENTE ───────────────────────────────────────
function driveCasos(pasta){return pasta?pasta.filhos.filter(f=>f.url&&Object.keys(f.sub).some(s=>DRIVE_SUB_CASO.test(s))):[]}
// Com mais de um caso, procura o caso de cada processo cadastrado: tira do
// nome do caso o nome do cliente e a área, e compara o resto com as partes
// do processo. Só escolhe sozinho quando todos os processos (os ativos, se
// houver) caem no mesmo caso; processos em casos diferentes → escolher.
function driveCasoSugerido(c,pasta){
  const casos=driveCasos(pasta);
  if(casos.length<=1)return {caso:casos[0]||null,escolher:false,casos};
  const doCliente=new Set([...driveTokens(c.nome),...driveTokens(c.curto||''),...driveApelidos(pasta.nome).flatMap(a=>driveTokens(a.t))]);
  const partesDoCaso=casos.map(caso=>driveTokens(caso.nome.replace(/\([^)]*\)\s*$/,'')).filter(w=>!doCliente.has(w)));
  const procs=procsDe(c.id);
  const ativos=procs.filter(p=>p.status!=='Arquivado');
  const achados=new Set();
  (ativos.length?ativos:procs).forEach(p=>{
    const partes=new Set([...driveTokens(p.ativo),...driveTokens(p.passivo)]);
    const notas=partesDoCaso.map(ws=>ws.filter(w=>partes.has(w)).length);
    const max=Math.max(...notas);
    if(max>0&&notas.filter(n=>n===max).length===1)achados.add(notas.indexOf(max));
  });
  if(achados.size===1)return {caso:casos[[...achados][0]],escolher:false,casos};
  return {caso:null,escolher:true,casos};
}
// Links que a pasta (e o caso) preenchem em cada card da ficha
function driveLinksSugeridos(c,pasta,caso){
  if(!pasta)return {};
  const consultivo=pasta.filhos.find(f=>f.nome===DRIVE_SUB.consultivo);
  const contrato=(caso&&caso.sub[DRIVE_SUB.contrato])||(consultivo&&consultivo.url)||'';
  const caminho=(...p)=>p.filter(Boolean).join(' › ');
  const contratoDe=caso&&caso.sub[DRIVE_SUB.contrato]?caminho(caso.nome,DRIVE_SUB.contrato):consultivo?DRIVE_SUB.consultivo:'';
  return {
    root:{url:pasta.url,de:pasta.nome},
    docs:caso&&caso.sub[DRIVE_SUB.docs]?{url:caso.sub[DRIVE_SUB.docs],de:caminho(caso.nome,DRIVE_SUB.docs)}:null,
    contrato:contrato?{url:contrato,de:contratoDe}:null,
    procuracao:contrato?{url:contrato,de:contratoDe}:null,
    processos:caso?{url:caso.url,de:caso.nome}:{url:pasta.url,de:pasta.nome,escolherCaso:driveCasos(pasta).length>1},
  };
}
// Sugestão para um cliente só (usada nos cards da ficha): só quando a
// associação é segura
function driveSugestaoCliente(c){
  if(!driveMapa())return null;
  const r=associarClientesDrive().get(c.id);
  if(!r||r.status!=='ok')return null;
  const {caso}=driveCasoSugerido(c,r.pasta);
  return {pasta:r.pasta,caso,links:driveLinksSugeridos(c,r.pasta,caso)};
}
// a pasta do Drive a que o link raiz do cliente aponta, se estiver no mapa
function drivePastaDoCliente(c){
  const m=driveMapa(),root=driveGet(c.id,'root');
  return m&&root?m.clientes.find(p=>p.url===root)||null:null;
}
// "processos" apontando para a pasta do cliente que tem mais de um caso
function driveFaltaEscolherCaso(c){
  const p=drivePastaDoCliente(c);
  return !!(p&&driveGet(c.id,'processos')===p.url&&driveCasos(p).length>1);
}
function usarPastaSugerida(cid,k){
  const c=DB.clientes.find(x=>x.id===cid);
  const s=c&&driveSugestaoCliente(c);
  const l=s&&s.links[k];
  if(!l||driveGet(cid,k))return;
  driveSet(cid,k,l.url);
  refreshUI();
  mostrarToast(DRIVE_ROTULO[k]+': pasta do Drive vinculada','Desfazer',()=>{driveSet(cid,k,'');refreshUI();});
}

// ─── PRÉVIA: "SUGERIR LINKS DO DRIVE" ──────────────────────
let drvLinhas=[], drvFiltro='todos';
const DRV_STATUS={ok:['Associado','s-ativo'],ambiguo:['Decidir','s-amb'],sem:['Sem pasta','s-arq']};

function abrirSugestaoDrive(cid){
  if(!driveMapa()){
    alert('Importe primeiro o mapa_links_drive.json em Configurações → Google Drive.');
    abrirConfiguracoes();
    return;
  }
  const assoc=associarClientesDrive();
  const lista=cid?DB.clientes.filter(c=>c.id===cid):ordenarPorNome([...DB.clientes]);
  drvLinhas=lista.map(c=>{
    const r=assoc.get(c.id);
    const pasta=r.pasta;
    const cs=pasta?driveCasoSugerido(c,pasta):{caso:null,escolher:false};
    return {cid:c.id,status:r.status,candidatas:r.candidatas,pastaId:pasta?drivePastaId(pasta):'',casoNome:cs.caso?cs.caso.nome:'',substituir:new Set()};
  });
  drvFiltro='todos';
  document.querySelectorAll('#drv-chips .chip').forEach(b=>b.classList.toggle('active',b.dataset.f==='todos'));
  document.getElementById('drv-chips').style.display=cid?'none':'';
  document.getElementById('drv-titulo').textContent=cid?'Sugerir links do Drive · '+nomeCliente(cid):'Sugerir links do Drive';
  renderSugestaoDrive();
  fecharOverlay('overlay-config');
  abrirOverlay('overlay-drive');
}
function filtroSugestaoDrive(f,btn){
  drvFiltro=f;
  document.querySelectorAll('#drv-chips .chip').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderSugestaoDrive();
}
// o que cada linha vai fazer com cada card, a partir das escolhas na tela
function drvPlano(l){
  const c=DB.clientes.find(x=>x.id===l.cid);
  const pasta=l.pastaId?drivePastaPorId(l.pastaId):null;
  if(!c||!pasta)return {c,pasta:null,itens:[]};
  const casos=driveCasos(pasta);
  const caso=casos.find(x=>x.nome===l.casoNome)||(casos.length===1?casos[0]:null);
  const links=driveLinksSugeridos(c,pasta,caso);
  const itens=DRIVE_CHAVES.map(k=>{
    const s=links[k],atual=driveGet(c.id,k);
    let acao;
    if(!s)acao=atual?'mantem':(casos.length>1&&!caso?'caso':'sem');
    else if(!atual)acao='preenche';
    else if(atual===s.url)acao='igual';
    else acao=l.substituir.has(k)?'substitui':'conflito';
    return {k,s,atual,acao};
  });
  return {c,pasta,casos,caso,itens};
}
function renderSugestaoDrive(){
  const planos=drvLinhas.map(l=>({l,...drvPlano(l)}));
  const cont={ok:0,ambiguo:0,sem:0};
  drvLinhas.forEach(l=>cont[l.status]++);
  let novos=0,trocas=0;
  planos.forEach(p=>p.itens.forEach(i=>{if(i.acao==='preenche')novos++;if(i.acao==='substitui')trocas++;}));
  document.getElementById('drv-resumo').innerHTML=drvLinhas.length>1
    ?`<b>${cont.ok}</b> associado${cont.ok===1?'':'s'} · <b>${cont.ambiguo}</b> para decidir · <b>${cont.sem}</b> sem pasta no Drive`
    :'';
  const btn=document.getElementById('drv-aplicar');
  const total=novos+trocas;
  btn.disabled=!total;
  btn.innerHTML=`<i class="ti ti-check"></i>${total?'Preencher '+total+' link'+(total>1?'s':''):'Nada a preencher'}`;
  const m=driveMapa();
  const opcoesPasta=(l)=>{
    const cand=l.candidatas.map(drivePastaId);
    const opt=p=>{const id=drivePastaId(p);return `<option value="${esc(id)}"${id===l.pastaId?' selected':''}>${esc(p.nome)}</option>`};
    return `<option value="">${l.status==='sem'?'Nenhuma pasta encontrada':'Escolher pasta…'}</option>`
      +(cand.length?`<optgroup label="Mais parecidas">${l.candidatas.map(opt).join('')}</optgroup>`:'')
      +['Ativos','Inativos'].map(s=>`<optgroup label="${s}">${m.clientes.filter(p=>p.situacao===s&&!cand.includes(drivePastaId(p))).map(opt).join('')}</optgroup>`).join('');
  };
  const visiveis=planos.map((p,i)=>({p,i})).filter(({p})=>drvFiltro==='todos'||p.l.status===drvFiltro);
  const el=document.getElementById('drv-lista');
  if(!visiveis.length){el.innerHTML='<div class="drv-vazio">Nenhum cliente nesta situação.</div>';return;}
  el.innerHTML=visiveis.map(({p,i})=>{
    const {l,c}=p;
    const [stTxt,stCls]=DRV_STATUS[l.status];
    const selCaso=p.pasta&&p.casos.length>1
      ?`<select class="drv-sel" onchange="drvEscolherCaso(${i},this.value)" aria-label="Caso">
          <option value="">Escolher caso (processos → pasta do cliente)</option>
          ${p.casos.map(x=>`<option value="${esc(x.nome)}"${x.nome===l.casoNome?' selected':''}>${esc(x.nome)}</option>`).join('')}
        </select>`:'';
    const itens=p.pasta?p.itens.map(it=>{
      const de=it.s?`<span class="drv-de">${esc(it.s.de)}</span>`:'';
      let estado;
      if(it.acao==='preenche')estado=`<span class="drv-acao novo"><i class="ti ti-plus"></i>preenche</span>`;
      else if(it.acao==='igual')estado=`<span class="drv-acao">já está assim</span>`;
      else if(it.acao==='mantem')estado=`<span class="drv-acao">mantém o atual</span>`;
      else if(it.acao==='sem')estado=`<span class="drv-acao">sem subpasta no Drive</span>`;
      else if(it.acao==='caso')estado=`<span class="drv-acao">depende do caso escolhido</span>`;
      else estado=`<label class="drv-acao troca"><input type="checkbox"${it.acao==='substitui'?' checked':''} onchange="drvSubstituir(${i},'${it.k}',this.checked)">substituir o link atual</label>`;
      const aviso=it.s&&it.s.escolherCaso?'<span class="drv-aviso">escolher caso</span>':'';
      return `<li><span class="drv-k">${DRIVE_ROTULO[it.k]}</span>${estado}${aviso}${de}</li>`;
    }).join(''):'<li class="drv-nada">Escolha a pasta para ver os links.</li>';
    return `<div class="drv-linha">
      <div class="drv-cli"><b>${esc(c.nome)}</b><span class="cli-status ${stCls}">${stTxt}</span></div>
      <div class="drv-escolha">
        <select class="drv-sel" onchange="drvEscolherPasta(${i},this.value)" aria-label="Pasta no Drive">${opcoesPasta(l)}</select>
        ${selCaso}
      </div>
      <ul class="drv-itens">${itens}</ul>
    </div>`;
  }).join('');
}
function drvEscolherPasta(i,id){
  const l=drvLinhas[i];
  l.pastaId=id;l.substituir.clear();
  const c=DB.clientes.find(x=>x.id===l.cid);
  const p=id?drivePastaPorId(id):null;
  const cs=p&&c?driveCasoSugerido(c,p):{caso:null};
  l.casoNome=cs.caso?cs.caso.nome:'';
  renderSugestaoDrive();
}
function drvEscolherCaso(i,nome){drvLinhas[i].casoNome=nome;drvLinhas[i].substituir.clear();renderSugestaoDrive();}
function drvSubstituir(i,k,on){const s=drvLinhas[i].substituir;if(on)s.add(k);else s.delete(k);renderSugestaoDrive();}
function aplicarSugestaoDrive(){
  const planos=drvLinhas.map(drvPlano);
  const trocas=planos.reduce((a,p)=>a+p.itens.filter(i=>i.acao==='substitui').length,0);
  if(trocas&&!confirm('Substituir '+trocas+' link'+(trocas>1?'s':'')+' já preenchido'+(trocas>1?'s':'')+' pelo do Drive?\n\nO link atual será perdido.'))return;
  let n=0;const clientes=new Set();
  planos.forEach(p=>p.itens.forEach(it=>{
    if(it.acao!=='preenche'&&it.acao!=='substitui')return;
    if(!p.c.drive)p.c.drive={};
    p.c.drive[it.k]=it.s.url;
    n++;clientes.add(p.c.id);
  }));
  if(!n)return;
  salvarDB();
  fecharOverlay('overlay-drive');
  refreshUI();
  mostrarToast(n+' link'+(n>1?'s':'')+' do Drive preenchido'+(n>1?'s':'')+' em '+clientes.size+' cliente'+(clientes.size>1?'s':''));
}
