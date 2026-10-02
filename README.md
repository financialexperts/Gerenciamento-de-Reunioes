# Gestão de Reuniões

Sistema da Financial Experts para organizar as reuniões de alinhamento com os professores. Usa o mesmo banco de dados e os mesmos logins do **Sistema de Presença** (Supabase).

Por enquanto tem:

- **Login** com o e-mail e a senha do Sistema de Presença, incluindo "Esqueci minha senha".
- **Alinhamento** (página inicial): um cartão por professor com e-mail e cursos em que dá aula, busca por nome ou e-mail e filtros de curso e turma. Clicar num cartão abre a página do professor.
- **Página do professor** (`?professor=<id>`): nome, e-mail, cursos e as **categorias de reunião** em quadrados (Feedback, Atualização de aulas…). Clicar numa categoria abre a página dela. Voltar, recarregar e abrir em outra aba funcionam como num site comum.
- **Página da categoria** (`?professor=<id>&categoria=<id>`): as reuniões do professor naquela categoria, em "Próximas" e "Já aconteceram". O **dia** é o destaque de cada reunião: uma folha de calendário (mês, dia e dia da semana; a de hoje fica vermelha) e "Hoje", "Em 6 dias", "Há 3 dias"… Abaixo vêm o horário, a duração, presencial (sala) ou online (link clicável) e a pauta.
- **Nova reunião** (só administradores, dentro da categoria): dia, horário de início, duração, formato, local ou link e pauta. O dia escolhido aparece em destaque no topo da janela e pode ser no passado, para registrar uma reunião que já aconteceu.
- **Nova categoria** (só administradores): cria uma categoria com nome e ícone. As categorias são uma lista só: a nova aparece para todos os professores.
- **Novo professor** (só administradores): cria o login e o cadastro do professor do mesmo jeito que o Sistema de Presença. O professor aparece nos dois sistemas e entra nos dois com o mesmo e-mail e senha.

## Antes do primeiro uso: tabela de categorias

As categorias ficam numa tabela nova, `categorias_reuniao`, que o Sistema de Presença não tinha. Rode **uma vez** o arquivo [`sql/categorias_reuniao.sql`](sql/categorias_reuniao.sql) no Supabase (SQL Editor › New query › colar tudo › Run). Ele cria a tabela, as regras de acesso e as duas primeiras categorias, e pode ser rodado de novo sem duplicar nada. Enquanto isso não for feito, a página do professor mostra "Categorias ainda não configuradas".

As reuniões ficam na tabela `reunioes`, criada por [`sql/reunioes.sql`](sql/reunioes.sql) (rodar do mesmo jeito, depois do arquivo das categorias). Sem ela, a página da categoria mostra "Reuniões ainda não configuradas".

## Como rodar

Precisa do Node.js 18 ou mais novo.

```
npm start
```

Abra <http://localhost:5500>. Abrir o `index.html` direto do disco não funciona, porque os módulos JavaScript precisam ser servidos por HTTP.

Não há dependências nem passo de build. Para publicar, suba a pasta como site estático (por exemplo, na Vercel, como o Sistema de Presença).

## Estrutura

```
index.html                  telas (login e aplicativo) e os ícones
servidor.mjs                servidor local de desenvolvimento (npm start)
sql/categorias_reuniao.sql  tabela de categorias de reunião (rodar uma vez no Supabase)
sql/reunioes.sql            tabela de reuniões (rodar uma vez no Supabase, depois da de categorias)
backend/
  config/env.js             URL e chave pública do Supabase (as mesmas do Sistema de Presença)
  api/                      consultas ao banco: professoresRepo.js, turmasRepo.js, categoriasRepo.js, reunioesRepo.js
  domain/turmas.js          regras trazidas do Sistema de Presença: turma ativa, cor do curso, ordem por dia
  domain/reunioes.js        reunião próxima, em andamento ou que já aconteceu; ordem das listas; link da chamada
frontend/
  main.js                   liga as telas, decide entre login e aplicativo e mostra a tela do endereço
  features/auth/            entrar, sair, "Esqueci minha senha"
  features/app/             barra lateral, menu da conta e rotas.js (endereço de cada tela)
  features/alinhamento/     busca, filtros e cartões de professores
  features/professores/     página do professor e janela "Novo professor"
  features/categorias/      janela "Nova categoria" e os ícones que uma categoria pode ter
  features/reunioes/        página da categoria (reuniões), janela "Nova reunião" e datas por extenso
  shared/menuFiltro.js      menu dos filtros de curso e turma (com busca)
  shared/grade.js           teclado das grades de cartões (setas, Home/End, digitar o nome)
  shared/, state/           outros utilitários e estado da tela
  styles/                   tokens.css (cores, tipografia) → base → auth / app / cartoes / alinhamento / professor / reunioes
```

## Dados usados

| Tabela | Colunas | Para quê |
|---|---|---|
| `professores` | `id`, `nome`, `email`, `papel`, `user_id` | cartões, nome no menu da conta e quem pode cadastrar (`papel = 'admin'`) |
| `turmas` | `id`, `turma`, `curso`, `professor_id`, `ativa` | cursos de cada professor e filtros |
| `categorias_reuniao` | `id`, `nome`, `icone`, `criado_por`, `created_at` | categorias de reunião, iguais para todos os professores (tabela nova, só deste sistema) |
| `reunioes` | `id`, `professor_id`, `categoria_id`, `inicio`, `duracao_min`, `formato`, `local`, `pauta`, `criado_por` | reuniões de uma categoria com um professor (tabela nova, só deste sistema) |

Turmas com `ativa = false` ficam de fora, como no Sistema de Presença.

**Nova categoria** grava uma linha em `categorias_reuniao`. Pelo RLS do arquivo SQL, qualquer pessoa logada lê as categorias, só admin cria, e a chave anônima não acessa nada. Nome repetido é recusado (sem diferenciar maiúsculas).

**Nova reunião** grava uma linha em `reunioes`. `inicio` é o instante (com fuso), e cada pessoa vê no horário do próprio computador. `formato` é `presencial` ou `online`, e `local` guarda a sala ou o link. `criado_por` é preenchido pelo banco com quem está logado. Pelo RLS do arquivo SQL, só admin cria; admin vê todas as reuniões e o professor vê só as dele. A tela também recusa uma segunda reunião da mesma categoria com o mesmo professor no mesmo dia e horário.

**Novo professor** grava com os mesmos dois passos do Sistema de Presença:

1. cria o login pelo cadastro público do Supabase Auth (`/auth/v1/signup`), sem trocar a sessão de quem está logado;
2. insere `nome`, `email`, `papel` e `user_id` em `professores`.

A senha inicial sugerida é a mesma do Sistema de Presença (`Teste1234`). Se o Supabase exigir confirmação de e-mail, o professor precisa confirmar antes do primeiro acesso.

## Bom saber

- **Quem vê o quê é decidido pelo RLS do Supabase**, não por este código. Pelas políticas descritas no Sistema de Presença, admin vê todos os professores e professor comum vê só o próprio cadastro.
- **Link de "Esqueci minha senha":** para o e-mail trazer a pessoa de volta a este sistema, a URL dele precisa estar em Supabase → Authentication → URL Configuration → Redirect URLs. Sem isso, o link cai na Site URL configurada, onde a troca de senha também funciona se for o Sistema de Presença.
- **Aparência:** sempre clara, no estilo Apple (cinzas neutros, cartões brancos e azul do sistema nas ações), mesmo com o Windows/macOS no modo escuro.
