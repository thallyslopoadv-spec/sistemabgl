// Imitação mínima da API do Supabase, só para os testes automáticos do
// aplicativo. Reproduz as regras de supabase/schema.sql (membros, versão,
// mescla de chaves, importação só em base vazia), que são testadas à parte
// contra um Postgres de verdade.
import http from 'node:http';
import {randomUUID} from 'node:crypto';

export function criarSupabaseFalso({chave}){
  const contas=new Map();   // email → {id,email,senha}
  const membros=new Map();  // user_id → {usuario,nome}
  const tokens=new Map();   // access/refresh token → user_id
  const estado={dados:{},versao:0};
  const chamadas=[];

  const usuarioDe=req=>{
    const t=(req.headers.authorization||'').replace(/^Bearer /,'');
    return tokens.has(t)?tokens.get(t):null;
  };
  const sessao=u=>{
    const access=randomUUID(),refresh=randomUUID();
    tokens.set(access,u.id);tokens.set(refresh,u.id);
    return {access_token:access,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,
      refresh_token:refresh,user:{id:u.id,aud:'authenticated',role:'authenticated',email:u.email,app_metadata:{},user_metadata:{}}};
  };
  function gravarAlteracoes(uid,versaoBase,alt){
    if(!membros.has(uid))return [403,{message:'sem acesso à base do escritório',code:'42501'}];
    if(estado.versao===0)return [400,{message:'a base ainda está vazia; faça primeiro a importação inicial'}];
    if(estado.versao!==versaoBase)return [200,{ok:false,versao:estado.versao}];
    for(const [k,v] of Object.entries(alt)){if(v===null)delete estado.dados[k];else estado.dados[k]=v;}
    estado.versao++;
    return [200,{ok:true,versao:estado.versao}];
  }

  const servidor=http.createServer((req,res)=>{
    let corpo='';
    req.on('data',c=>corpo+=c);
    req.on('end',()=>{
      const url=new URL(req.url,'http://x');
      const responder=(status,obj)=>{
        res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*',
          'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'});
        res.end(obj===undefined?'':JSON.stringify(obj));
      };
      if(req.method==='OPTIONS')return responder(204);
      if(url.pathname.startsWith('/__teste/'))return responder(404);
      if(req.headers.apikey!==chave)return responder(401,{message:'chave inválida'});
      const json=corpo?JSON.parse(corpo):{};
      const uid=usuarioDe(req);
      chamadas.push({metodo:req.method,caminho:url.pathname,busca:url.search,corpo:json,uid});

      // ─── autenticação ───
      if(url.pathname==='/auth/v1/token'){
        if(url.searchParams.get('grant_type')==='password'){
          const c=contas.get(String(json.email||'').toLowerCase());
          if(!c||c.senha!==json.password)return responder(400,{error:'invalid_grant',error_description:'Invalid login credentials',code:'invalid_credentials',msg:'Invalid login credentials'});
          return responder(200,sessao(c));
        }
        const id=tokens.get(json.refresh_token);
        const c=[...contas.values()].find(x=>x.id===id);
        return c?responder(200,sessao(c)):responder(400,{error:'invalid_grant',msg:'Invalid Refresh Token'});
      }
      if(url.pathname==='/auth/v1/user'){
        const c=[...contas.values()].find(x=>x.id===uid);
        if(!c)return responder(401,{msg:'not authenticated'});
        if(req.method==='PUT'&&json.password)c.senha=json.password;
        return responder(200,{id:c.id,aud:'authenticated',role:'authenticated',email:c.email,app_metadata:{},user_metadata:{}});
      }
      if(url.pathname==='/auth/v1/logout')return responder(204);

      // ─── tabelas ───
      const objeto=/vnd\.pgrst\.object/.test(req.headers.accept||'');
      const devolver=linhas=>objeto
        ?(linhas.length===1?responder(200,linhas[0]):responder(406,{message:'JSON object requested, multiple (or no) rows returned',code:'PGRST116'}))
        :responder(200,linhas);
      if(url.pathname==='/rest/v1/membros'){
        const m=uid&&membros.get(uid);
        return devolver(m?[{usuario:m.usuario,nome:m.nome}]:[]);
      }
      if(url.pathname==='/rest/v1/base'){
        if(!uid||!membros.has(uid))return devolver([]);
        const cols=(url.searchParams.get('select')||'').split(',');
        const linha={};cols.forEach(c=>{if(c==='dados')linha.dados=estado.dados;if(c==='versao')linha.versao=estado.versao;});
        return devolver([linha]);
      }
      if(url.pathname==='/rest/v1/rpc/gravar_alteracoes'){
        const [st,r]=gravarAlteracoes(uid,json.p_versao_base,json.p_alteracoes||{});
        return responder(st,r);
      }
      if(url.pathname==='/rest/v1/rpc/importar_base_inicial'){
        if(!membros.has(uid))return responder(403,{message:'sem acesso à base do escritório'});
        if(!json.p_dados||!Array.isArray(json.p_dados.usuarios))return responder(400,{message:'o arquivo não contém uma base válida do sistema'});
        if(estado.versao!==0)return responder(400,{message:'a base já tem dados; a importação inicial só vale para uma base vazia'});
        estado.dados=json.p_dados;estado.versao=1;
        return responder(200,{ok:true,versao:1});
      }
      responder(404,{message:'rota não imitada: '+req.method+' '+url.pathname});
    });
  });

  return {
    servidor,estado,chamadas,
    criarConta(email,senha,membro){
      const c={id:randomUUID(),email:email.toLowerCase(),senha};
      contas.set(c.email,c);
      if(membro)membros.set(c.id,membro);
      return c;
    },
    // grava como se fosse outra pessoa, em outro computador
    gravarComo(email,mudar){
      const c=contas.get(email);
      const alt={};
      const copia=JSON.parse(JSON.stringify(estado.dados));
      mudar(copia);
      for(const k of new Set([...Object.keys(copia),...Object.keys(estado.dados)]))
        if(JSON.stringify(copia[k])!==JSON.stringify(estado.dados[k]))alt[k]=copia[k]===undefined?null:copia[k];
      return gravarAlteracoes(c.id,estado.versao,alt)[1];
    },
  };
}
