# Gestão de Reuniões

Sistema da Financial Experts para organizar as reuniões de alinhamento com os professores. Usa o mesmo banco de dados e os mesmos logins do **Sistema de Presença** (Supabase).

Por enquanto tem:

- **Login** com o e-mail e a senha do Sistema de Presença, incluindo "Esqueci minha senha".
- **Alinhamento** (página inicial): um cartão por professor com e-mail e cursos em que dá aula, busca por nome ou e-mail e filtros de curso e turma. Os cartões são selecionáveis por clique ou teclado.
- **Novo professor** (só administradores): cria o login e o cadastro do professor do mesmo jeito que o Sistema de Presença. O professor aparece nos dois sistemas e entra nos dois com o mesmo e-mail e senha.

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
backend/
  config/env.js             URL e chave pública do Supabase (as mesmas do Sistema de Presença)
  api/                      consultas ao banco: professoresRepo.js, turmasRepo.js
  domain/turmas.js          regras trazidas do Sistema de Presença: turma ativa, cor do curso, ordem por dia
frontend/
  main.js                   liga as telas e decide entre login e aplicativo
  features/auth/            entrar, sair, "Esqueci minha senha"
  features/app/             barra lateral e menu da conta
  features/alinhamento/     busca, filtros e cartões de professores
  features/professores/     janela "Novo professor"
  shared/menuFiltro.js      menu dos filtros de curso e turma (com busca)
  shared/, state/           outros utilitários e estado da tela
  styles/                   tokens.css (cores, tipografia) → base → auth / app / alinhamento
```

## Dados usados

| Tabela | Colunas | Para quê |
|---|---|---|
| `professores` | `id`, `nome`, `email`, `papel`, `user_id` | cartões, nome no menu da conta e quem pode cadastrar (`papel = 'admin'`) |
| `turmas` | `id`, `turma`, `curso`, `professor_id`, `ativa` | cursos de cada professor e filtros |

Turmas com `ativa = false` ficam de fora, como no Sistema de Presença.

O único ponto que grava no banco é **Novo professor**, com os mesmos dois passos do Sistema de Presença:

1. cria o login pelo cadastro público do Supabase Auth (`/auth/v1/signup`), sem trocar a sessão de quem está logado;
2. insere `nome`, `email`, `papel` e `user_id` em `professores`.

A senha inicial sugerida é a mesma do Sistema de Presença (`Teste1234`). Se o Supabase exigir confirmação de e-mail, o professor precisa confirmar antes do primeiro acesso.

## Bom saber

- **Quem vê o quê é decidido pelo RLS do Supabase**, não por este código. Pelas políticas descritas no Sistema de Presença, admin vê todos os professores e professor comum vê só o próprio cadastro.
- **Link de "Esqueci minha senha":** para o e-mail trazer a pessoa de volta a este sistema, a URL dele precisa estar em Supabase → Authentication → URL Configuration → Redirect URLs. Sem isso, o link cai na Site URL configurada, onde a troca de senha também funciona se for o Sistema de Presença.
- **Aparência:** sempre clara, no estilo Apple (cinzas neutros, cartões brancos e azul do sistema nas ações), mesmo com o Windows/macOS no modo escuro.
