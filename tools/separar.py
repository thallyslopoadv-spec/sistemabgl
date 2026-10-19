"""Separação única do index.html monolítico em src/ (usada uma vez, guardada
como registro de como a estrutura foi criada)."""
import re, base64, os, sys
RAIZ=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
linhas=open(os.path.join(RAIZ,'index.html'),encoding='utf-8').read().split('\n')
L=lambda a,b:'\n'.join(linhas[a-1:b-1])+'\n'   # linhas [a,b) em numeração 1-based

SRC=os.path.join(RAIZ,'src'); os.makedirs(SRC,exist_ok=True)
def grava(rel,txt):
    p=os.path.join(SRC,rel); os.makedirs(os.path.dirname(p),exist_ok=True)
    open(p,'w',encoding='utf-8').write(txt)

css=[('legacy/01-base.css',31,160),('legacy/02-painel.css',160,285),('legacy/03-paineis-e-cliente.css',285,522),
     ('legacy/04-financeiro-e-modais.css',522,635),('legacy/05-cards-e-caixa.css',635,722),('legacy/06-rotina.css',722,900),
     ('legacy/07-processos.css',900,1055),('legacy/08-projetos-e-prazos.css',1055,1186),('legacy/09-responsivo.css',1186,1273),
     ('legacy/10-agenda-e-metas.css',1273,1389),('legacy/11-camada-2026.css',1389,1589)]
js=[('00-sementes.js',3292,3377),('01-dados-e-nuvem.js',3377,3909),('02-utilidades.js',3909,4238),('03-sessao-e-tarefas.js',4238,4802),
    ('04-painel.js',4802,4997),('05-processos.js',4997,6231),('06-arquivados.js',6231,6520),('07-financeiro-caixa.js',6520,7084),
    ('08-agenda.js',7084,7243),('09-rotina.js',7243,7713),('10-projetos.js',7713,8334),('11-comercial.js',8334,8586),
    ('12-clientes.js',8586,8922),('13-modal-lancamento.js',8922,9258),('14-modal-processo.js',9258,9392),
    ('15-modal-cliente-e-contrato.js',9392,9638),('16-financeiro.js',9638,9774),('17-atendimento-trabalhista.js',9774,9905),
    ('18-crm-comercial.js',9905,11046),('19-atendimento-civel.js',11046,11271),('20-backup.js',11271,11921),('99-inicializacao.js',11921,11924)]
assert linhas[29]=='<style>' and linhas[1588]=='</style>' and linhas[3290]=='<script>' and linhas[11923]=='</script>'
for nome,a,b in css:grava('assets/css/'+nome,L(a,b))
for nome,a,b in js:grava('assets/js/'+nome,L(a,b))
# cobertura: as faixas precisam ser contíguas e cobrir tudo
assert [x[1] for x in css[1:]]==[x[2] for x in css[:-1]] and css[0][1]==31 and css[-1][2]==1589
assert [x[1] for x in js[1:]]==[x[2] for x in js[:-1]] and js[0][1]==3292 and js[-1][2]==11924

html=L(1,30)+'<!-- @css -->\n'+L(1590,3291)+'<!-- @js -->\n'+'\n'.join(linhas[11924:])
# logos: saem do HTML como arquivos de imagem
imgs={}
def extrai(m):
    dados=m.group(1); nome='logo-login.png' if not imgs else 'logo-barra.png'
    imgs[nome]=dados; open(os.path.join(SRC,'assets/img',nome),'wb').write(base64.b64decode(dados))
    return 'src="{{img:'+nome+'}}"'
os.makedirs(os.path.join(SRC,'assets/img'),exist_ok=True)
html=re.sub(r'src="data:image/png;base64,([A-Za-z0-9+/=]+)"',extrai,html)
grava('index.html',html)
print('css',len(css),'js',len(js),'imgs',list(imgs))
