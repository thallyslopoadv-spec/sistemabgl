# Aplicativo do Sistema BGL

Aplicativo de computador (Windows e Mac) do sistema do escritório. Usa as mesmas telas do site, montadas a partir do mesmo `src/`, mas guarda os dados num banco Supabase com login próprio, em vez do Gist. O site continua funcionando como sempre: nada aqui altera o `index.html` publicado.

## Como funciona

A base do escritório continua sendo um documento JSON, agora guardado na tabela `base` do Supabase. O acesso é restrito às contas cadastradas na tabela `membros`. Cada gravação envia só as partes que mudaram e informa sobre qual versão foi feita; se a outra pessoa gravou antes, o servidor recusa sem apagar nada, o aplicativo mescla as duas versões e tenta de novo. Quando os dois alteram o mesmo campo do mesmo registro ao mesmo tempo, prevalece quem gravou por último e aparece um aviso.

O banco guarda uma cópia da base a cada hora de uso (tudo das últimas 48 horas e uma por dia até 60 dias) e registra quem gravou o quê. Além disso, o aplicativo grava um backup por dia numa pasta do Google Drive do computador, mantendo os 30 mais recentes.

A sessão vive só enquanto o aplicativo está aberto: fechou, pede a senha de novo. O encerramento por inatividade de 30 minutos continua valendo.

## Configuração do Supabase (uma vez)

1. Crie a conta em supabase.com e ative a verificação em duas etapas da conta (Account, Security).
2. Crie um projeto (New project) no plano gratuito, região South America (São Paulo). Guarde a senha do banco num gerenciador de senhas; o aplicativo não a usa.
3. Em SQL Editor, abra uma consulta nova, cole o conteúdo de `supabase/schema.sql` e execute.
4. Em Authentication, nas configurações de cadastro, desligue a opção que permite novos usuários se cadastrarem sozinhos (Allow new users to sign up). Só vocês criam contas.
5. Em Authentication, Users, crie um usuário para cada sócio (Add user, Create new user), com e-mail e senha, marcando a confirmação automática.
6. No SQL Editor, cadastre cada conta como membro. Em `usuario`, use exatamente o que cada um digita hoje no campo "Usuário" do site, para o sistema reconhecer a mesma pessoa:

```sql
insert into public.membros(user_id, usuario, nome)
select id, 'USUARIO-DE-HOJE-NO-SITE', 'Thallys' from auth.users where email = 'EMAIL-DO-LOGIN-NO-APP';
```

7. Em Project Settings, API Keys, copie a Project URL e a publishable key (começa com `sb_publishable_`). Nunca use a secret key nem a service_role no aplicativo.

Atenção ao plano gratuito: o Supabase pausa projetos sem nenhum acesso por 7 dias. Os dados não se perdem, mas é preciso reativar o projeto no painel. Com uso diário isso não acontece.

## Montar e testar

Requer Node 22 ou superior.

```
cp config.exemplo.json config.local.json   # e preencha URL e publishable key
npm install
npm start                                  # monta app/sistema/index.html e abre o aplicativo
npm run testar                             # teste de ponta a ponta contra um Supabase imitado
npm run dist:win                           # gera o pacote do Windows em dist/
npm run dist:mac                           # gera os pacotes do Mac (Apple Silicon e Intel) em dist/
```

No Linux sem tela, os testes rodam com `xvfb-run -a npm run testar`.

## Primeira abertura

Com a base vazia, o login mostra a área "Primeira carga da base". Escolha o backup mais recente do site (o `.json` ou o "sistema completo" `.html`) e importe. O servidor só aceita essa importação com a base vazia, então não há como substituir por engano uma base em uso.

Enquanto o site continuar no ar, ele é a base oficial e o aplicativo trabalha sobre uma cópia. No dia da virada, apague a base de teste (no SQL Editor: `update public.base set dados = '{}', versao = 0 where id = 1;`), importe o backup mais recente do site e só então tire o site do ar.

## Arquivos

| Arquivo | Papel |
|---|---|
| `main.js` | janela, links externos, fechamento com gravação pendente, gravação dos backups no disco |
| `preload.js` | ponte mínima entre a página e o aplicativo |
| `scripts/montar.mjs` | monta `sistema/index.html` a partir do `src/` do site com as diferenças do aplicativo |
| `nuvem/01-nuvem-supabase.js` | leitura, gravação com mescla, login, importação inicial, troca de senha |
| `nuvem/02-backup-drive.js` | backup diário na pasta do Google Drive |
| `nuvem/app.css` | diferenças visuais do aplicativo |
| `supabase/schema.sql` | tabelas, regras de acesso e funções de gravação |
| `sistema/diagnostico.html` | testes de ambiente (menu Protótipo, Diagnóstico) |
| `testes/` | teste de ponta a ponta e o Supabase imitado que ele usa |
