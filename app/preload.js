// Ponte mínima entre a página e o aplicativo: o backup na pasta do Drive e
// os testes da página de diagnóstico. Nada mais do sistema operacional fica
// ao alcance da página.
const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('bglApp',{
  info:()=>ipcRenderer.invoke('diag:info'),
  djenPeloApp:url=>ipcRenderer.invoke('diag:djen',url),
  backup:{
    pasta:()=>ipcRenderer.invoke('backup:pasta'),
    escolherPasta:()=>ipcRenderer.invoke('backup:escolherPasta'),
    gravar:pedido=>ipcRenderer.invoke('backup:gravar',pedido),
  },
});
