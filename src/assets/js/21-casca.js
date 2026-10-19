// ═══════════════════════════════════════════════════════════
//  CASCA DO SISTEMA — barra lateral e cabeçalho
// ═══════════════════════════════════════════════════════════
// A barra lateral agrupa as telas por fluxo de trabalho (operação, carteira,
// comercial). No computador ela pode ser recolhida só para os ícones; no
// celular vira uma gaveta que abre pelo botão de menu do cabeçalho.
const LS_SIDEBAR='bgl_sidebar_recolhida';
const TITULO_TELA={dash:'Visão geral',rotina:'Rotina',processos:'Processos',arquivados:'Arquivados',
  crm:'Clientes',fin:'Financeiro',trab:'Atendimento',comercial:'Comercial'};

function prepararCasca(){
  const av=document.getElementById('sb-av');
  if(av&&EU)av.textContent=iniciais(EU.nome||EU.user||'?');
  let recolhida=false;
  try{recolhida=localStorage.getItem(LS_SIDEBAR)==='1';}catch(e){}
  document.getElementById('screen-dashboard').classList.toggle('sb-mini',recolhida);
  const ativa=document.querySelector('.view.active');
  aoNavegar(ativa?ativa.id.replace('view-',''):'dash');
}
function aoNavegar(id){
  const t=document.getElementById('cb-titulo');
  if(t)t.textContent=TITULO_TELA[id]||'';
  document.title=(TITULO_TELA[id]?TITULO_TELA[id]+' · ':'')+'BGL Advogados';
  fecharSidebarMovel();
  window.scrollTo(0,0);
}
function alternarSidebar(){
  const app=document.getElementById('screen-dashboard');
  const mini=!app.classList.contains('sb-mini');
  app.classList.toggle('sb-mini',mini);
  try{localStorage.setItem(LS_SIDEBAR,mini?'1':'0');}catch(e){}
}
function abrirSidebarMovel(){document.getElementById('screen-dashboard').classList.add('sb-aberta');}
function fecharSidebarMovel(){const a=document.getElementById('screen-dashboard');if(a)a.classList.remove('sb-aberta');}
