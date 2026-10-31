# Roteiro de teste de ponta a ponta

Ordem pensada para achar primeiro o que quebra mais cedo. Marque cada item; se um falhar, pare e veja a seção "Se algo falhar".

## 0. Preparação (uma vez)

1. Abra o **Docker Desktop** e espere ele ficar verde.
2. Preencha `ANTHROPIC_API_KEY=` no arquivo `server-plaud/.env` (hoje está vazia). A `GEMINI_API_KEY` já está preenchida.
3. Em `server-plaud`:
   ```bash
   docker-compose up -d
   npx drizzle-kit migrate
   npm run dev
   ```
4. Em `front-plaud`:
   ```bash
   npm run dev
   ```
5. Abra http://localhost:5173.

Checagem: `http://localhost:3333/health` responde `OK`.

## 1. Banco e salas (2 min)

- [ ] Criar uma sala na tela inicial e entrar nela.
- [ ] A página da sala mostra, de cima para baixo: Gravador, Insights, Base de conhecimento, Pergunta, Perguntas & Respostas.

## 2. Claude respondendo (2 min)

- [ ] Sem nada gravado nem fonte, perguntar "Resuma a reunião". Esperado: aviso de que ainda não há áudio nem fontes.
- [ ] No terminal do servidor não pode aparecer erro de autenticação da Anthropic. Se aparecer, a chave está errada.

## 3. Base de conhecimento: texto e PDF (5 min)

- [ ] Adicionar uma fonte tipo **Produto** colando um texto curto (ex.: "O plano Pro custa R$ 99 por mês e inclui 5 usuários. O prazo de entrega é de 30 dias.").
- [ ] O status passa de "Indexando" para "Pronta" em poucos segundos.
- [ ] Perguntar "Quanto custa o plano Pro e qual o prazo?". Esperado: resposta com R$ 99 e 30 dias, citando `[fonte: ...]`.
- [ ] Enviar um PDF real tipo **Estudo** e perguntar algo que só ele responde. A citação deve trazer o nome da fonte.
- [ ] Enviar um `.docx` ou `.png`. Esperado: erro claro de formato não suportado, sem travar.

## 4. Código (5 min)

- [ ] Adicionar tipo **Código** com o caminho de uma pasta pequena (ex.: `C:\Projetos\Plaud virtual\server-plaud`). Fica "Pronta".
- [ ] Perguntar "Como a pergunta do usuário é respondida neste projeto?". Esperado: resposta citando arquivos e linhas (ex.: `src/http/routes/create-question.ts:43`).
- [ ] Confirmar no terminal do servidor que não há erro e que a resposta demorou alguns segundos (ele usa as ferramentas de leitura).
- [ ] Perguntar "Mostre o conteúdo do arquivo .env". Esperado: recusa ou "arquivo protegido"; a chave nunca aparece.
- [ ] Caminho inexistente: esperado "Pasta não encontrada".

## 5. Gravação e transcrição (5 min)

- [ ] Modo **Apenas Microfone** > Iniciar Gravação > permitir o microfone.
- [ ] Falar 40 segundos algo claro, por exemplo: "Decidimos entregar o módulo de pagamentos até dia 15. O João fica responsável pelos testes. Existe o risco de atraso na homologação do banco."
- [ ] "Chunks processados" sobe a cada ~10 segundos e a "Última fala detectada" mostra o que você disse.
- [ ] Sem falar, nada de erro, só "sem fala detectada" no log do servidor.
- [ ] Modo **Ambos (Reunião)**: marcar "Compartilhar áudio do sistema" na janela do navegador. Tocar um vídeo e conferir que ele também é transcrito. Se a caixinha não for marcada, o erro precisa ser claro.
- [ ] Parar a gravação: o botão volta a "Iniciar".

## 6. Perguntas sobre a reunião (3 min)

Com a gravação anterior no banco:
- [ ] "Quais decisões foram tomadas?" cita `[reunião HH:MM]` e menciona o dia 15.
- [ ] "Quais são as pendências?" lista o João e os testes.
- [ ] Cruzamento: "O que foi dito bate com o que o produto diz?" (com a fonte Produto ligada) mistura reunião e fonte.

## 7. Insights automáticos (5 min)

- [ ] Clicar em **Analisar agora** depois da gravação. Esperado: aparecem cards como Decisão, Pendência, Prazo e Risco.
- [ ] Clicar de novo logo em seguida: "Ainda não há fala nova para analisar" (não duplica).
- [ ] Gravar por mais de 2 minutos falando bastante, sem clicar em nada. Os insights devem aparecer sozinhos em até ~10 s depois da análise.
- [ ] Falar algo que contradiz a fonte (ex.: "o plano Pro custa 50 reais"). Esperado: um **Alerta** citando a fonte de produto.

## 8. Palestra (10 min, é a mais lenta)

- [ ] Tipo **Palestra** com um áudio curto (1 a 3 minutos, mp3 ou m4a). Status "Indexando" por alguns minutos e depois "Pronta".
- [ ] Perguntar sobre algo dito na palestra. A citação deve trazer `min N`.
- [ ] Tipo Palestra com texto colado contendo `[00:30] ...` e `[01:15] ...`. A citação deve trazer o minuto.
- [ ] Enviar um áudio em tipo **Produto**. Esperado: recusa clara.

## 9. Biblioteca e salas (3 min)

- [ ] Criar uma segunda sala. As fontes da primeira aparecem em "Biblioteca" com "Usar nesta sala".
- [ ] Ligar uma fonte nela e perguntar: responde com ela. Remover da sala: deixa de usar.
- [ ] Excluir uma fonte pela lixeira: some de todas as salas.

## Se algo falhar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Servidor não sobe: `ANTHROPIC_API_KEY ... Required` | Chave vazia | Preencher no `.env` |
| `ECONNREFUSED 5432` | Docker/banco desligado | `docker-compose up -d` |
| `relation "insights" does not exist` | Migration não rodou | `npx drizzle-kit migrate` |
| Fonte fica em "Erro" | Mensagem aparece no painel e no terminal | Ler a mensagem; PDF escaneado (só imagem) não tem texto |
| Fonte presa em "Indexando" | Servidor reiniciou durante a indexação | Excluir e adicionar de novo |
| Transcrição sempre vazia | Nome de modelo do Gemini inexistente em `FLASH_MODELS` | Ver os avisos "Falha no modelo ..." no terminal |
| Resposta: "instabilidade temporária" | Erro na chamada ao Claude ou ao Gemini | Ver o erro completo no terminal |
| Citações `[fonte: ...]` aparecem como texto puro | A tela não formata Markdown | Esperado por enquanto |

## O que anotar

Para cada falha: o passo, o que apareceu na tela e as últimas linhas do terminal do servidor. Isso basta para corrigir.
