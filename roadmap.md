# Importação e composição diária
- [x] Reunir importações de PDF e planilha no topo e aceitar arquivos arrastados.
- [x] Abrir composição de receitas, despesas, saldos e total do dia em Saldo diário; filtros e CSV brasileiro cobertos por testes.
- [ ] Concluir a conferência de importação por arraste e todas as composições com conta conectada (sessão expirou; receitas, despesas, botões e arraste visual conferidos antes da expiração).

# Saldo parcial de extratos
- [x] Calcular o último saldo pelas movimentações quando faltar fechamento informado e identificar como parcial.
- [x] Testar saldo sem fechamento e continuidade após o último saldo conhecido.
- [ ] Conferir saldo parcial na tela com conta conectada (aguarda usuário entrar na prévia; acesso automático indisponível).

# Tratativas por data
- [x] Corrigir recarga do botão Hoje e excluir vencidos anteriores nesse modo, com teste e conferência na tela (53 despesas de hoje; recarga repetida validada).
- [x] Selecionar data e consultar saldos, despesas e ajustes correspondentes.
- [x] Apresentar relatório executivo com impressão e espaço para aprovação.
- [x] Testar cálculos e conferir o fluxo conectado na tela.

# Relatórios para apresentação e e-mail
- [x] Compartilhar relatório da diretoria pelo e-mail configurado no dispositivo, com arquivo visual.
- [x] Criar relatório executivo do Painel com os filtros e indicadores existentes.
- [x] Conferir impressão, compartilhamento e apresentação na tela.

# Demonstrativo interativo para a diretoria
- [x] Trocar a marca para "Financeiro SVD SEMINOVOS" nos relatórios e e-mails.
- [x] Gerar link direto (sem login) com a composição do demonstrativo.
- [x] Aprovar e anotar ressalvas no link, uma decisão por demonstrativo, com retorno por e-mail a quem gerou.
- [x] Testar o fluxo público: abrir o link, registrar decisão e bloquear segunda decisão.
- [ ] Envio automático do e-mail de retorno (aguarda configurar um domínio de e-mail do app; hoje o retorno abre no e-mail do dispositivo).

# Painel e lançamentos
- [x] Painel mostra o saldo do último dia de cada extrato, sem acumular dias.
- [x] Totais de entradas/saídas só na aba Lançamentos, com filtro de data.
- [x] Painel avisa quando a diretoria aprova pelo link, com data, nome, ressalvas e atalho para visualizar.
- [x] Previsões futuras dos extratos em linha horizontal só com totais a pagar e a receber.
- [ ] Conferir na tela o Painel e o filtro de data (aguarda sessão de teste aprovada).

# Contas vencidas no relatório
- [x] Títulos "pagar" vencidos entram junto das despesas do dia, marcados "não pago no vencimento" (tela e relatório da diretoria).
- [x] Conferir na tela a listagem de vencidos na seleção manual de data; botão Hoje exclui vencidos anteriores.
