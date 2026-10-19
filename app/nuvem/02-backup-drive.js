// ═══════ BACKUP AUTOMÁTICO NA PASTA DO GOOGLE DRIVE ═══════
// O aplicativo grava uma cópia da base, uma vez por dia, numa pasta deste
// computador escolhida pelo usuário. Apontando para uma pasta do Google
// Drive para computador (ex.: "G:\Meu Drive\BGL Backups" no Windows ou
// "Google Drive/Meu Drive/BGL Backups" no Mac), o próprio Drive sobe o
// arquivo para a nuvem. Não há login Google no aplicativo.
//
// A escrita no disco é feita pelo processo principal (window.bglApp.backup),
// que só aceita gravar arquivos com o nome padrão, dentro da pasta escolhida.
const LS_BACKUP_DRIVE='bgl_app_backup_drive';      // quando foi a última cópia automática
const BACKUP_DRIVE_INTERVALO_H=20;                 // uma cópia por dia de uso
let __backupDriveTimer=null;

function pontePronta(){return !!(window.bglApp&&window.bglApp.backup)}
function ultimoBackupDrive(){return Number(localStorage.getItem(LS_BACKUP_DRIVE)||0)}

async function fazerBackupDrive(manual){
  if(!pontePronta()||!DB||MODO_OFFLINE)return false;
  const pasta=await window.bglApp.backup.pasta();
  if(!pasta){
    if(manual)alert('Escolha primeiro a pasta do Google Drive onde os backups serão gravados.');
    return false;
  }
  const quem=(EU&&EU.nome?EU.nome:'usuario').normalize('NFD').replace(/[^\w]/g,'').toLowerCase()||'usuario';
  const r=await window.bglApp.backup.gravar({quem,conteudo:JSON.stringify(pacoteBackup(),null,2)});
  if(!r||!r.ok){
    console.warn('[backup drive]',r&&r.erro);
    if(manual)alert('Não foi possível gravar o backup na pasta escolhida: '+(r&&r.erro||'erro desconhecido'));
    return false;
  }
  try{localStorage.setItem(LS_BACKUP_DRIVE,String(Date.now()));}catch(e){}
  marcarBackupFeito();
  renderPainelBackupDrive();
  if(manual)mostrarToast('Backup gravado na pasta do Drive: '+r.arquivo);
  return true;
}
async function backupDriveSeVencido(){
  if(Date.now()-ultimoBackupDrive()<BACKUP_DRIVE_INTERVALO_H*3600000)return;
  try{await fazerBackupDrive(false);}catch(e){console.warn('[backup drive]',e);}
}
async function iniciarBackupDrive(){
  pararBackupDrive();
  if(!pontePronta())return;
  if(!(await window.bglApp.backup.pasta())){
    // primeira vez neste computador: pede a pasta uma vez, sem insistir depois
    if(localStorage.getItem(LS_BACKUP_DRIVE+'_perguntado'))return;
    try{localStorage.setItem(LS_BACKUP_DRIVE+'_perguntado','1');}catch(e){}
    if(confirm('Backup automático\n\nEscolha uma pasta do Google Drive deste computador para o aplicativo gravar uma cópia dos dados por dia.\n\nVocê pode mudar isso depois em Backup → Segurança.'))
      await escolherPastaBackupDrive();
    return;
  }
  setTimeout(backupDriveSeVencido,30000);   // dá tempo de a tela abrir antes de gerar o arquivo
  __backupDriveTimer=setInterval(backupDriveSeVencido,3600000);
}
function pararBackupDrive(){if(__backupDriveTimer){clearInterval(__backupDriveTimer);__backupDriveTimer=null;}}
async function escolherPastaBackupDrive(){
  if(!pontePronta())return;
  const pasta=await window.bglApp.backup.escolherPasta();
  if(!pasta)return;
  renderPainelBackupDrive();
  if(await fazerBackupDrive(true))iniciarBackupDrive();
}
async function renderPainelBackupDrive(){
  const el=document.getElementById('bk-seg-drive');
  if(!el)return;
  if(!pontePronta()){el.innerHTML='<div class="bk-info">Disponível só no aplicativo.</div>';return;}
  const pasta=await window.bglApp.backup.pasta();
  const ult=ultimoBackupDrive();
  el.innerHTML=
    '<div class="bk-info'+(pasta?'':' bk-alerta')+'">'+
      (pasta
        ?('Pasta: <b>'+esc(pasta)+'</b><br>Último backup automático: <b>'+(ult?esc(new Date(ult).toLocaleString('pt-BR')):'nenhum ainda')+
          '</b>. O aplicativo guarda os 30 arquivos mais recentes e apaga os mais antigos.')
        :'<b>Nenhuma pasta escolhida.</b> Sem ela, não há backup automático neste computador.')+
    '</div>'+
    '<button class="det-add" onclick="escolherPastaBackupDrive()"><i class="ti ti-folder"></i> '+(pasta?'Trocar pasta':'Escolher pasta do Drive')+'</button> '+
    (pasta?'<button class="det-add" onclick="fazerBackupDrive(true)"><i class="ti ti-cloud-upload"></i> Fazer backup agora</button>':'');
}
