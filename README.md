# Remix of Gruposvdcontroledesaldos

Aqui está a documentação técnica formatada para envio direto ao robô ou programador responsável pelo desenvolvimento:

Especificação Técnica: Leitor de Extrato PDF & Controle de Saldo

1. Objetivo do Sistema

Desenvolver um módulo em Python para extração automática de transações a partir de arquivos de extrato bancário em formato PDF, com processamento dos dados e consolidação do saldo financeiro.

2. Arquitetura do Fluxo de Dados
Entrada: Arquivo PDF do extrato bancário.

Extração: Captura de texto estruturado por tabelas/linhas.

Regex & Normalização: Filtro de data, descrição, valor e tipo (Crédito/Débito).

Cálculo do Saldo: Consolidação de saldo inicial, entradas, saídas e saldo final.

Saída: Exportação em JSON, CSV ou gravação em banco de dados.

3. Requisitos Técnicos & Bibliotecas Recomendadas

Linguagem: Python 3.10+

Leitura de PDF: pdfplumber (Recomendado para tabelas/texto) ou pypdf / fitz (PyMuPDF).

Manipulação de Dados: pandas

Expressões Regulares: re

4. Estrutura de Saída dos Dados (JSON)

As transações extraídas devem ser padronizadas conforme o schema abaixo:
6. Tarefas de Desenvolvimento (Backlog)

[ ] Reconhecimento de Layout: Mapear o layout do banco alvo (posição da data, descrição, valor e saldo).

[ ] Tratamento de PDFs Escaneados: Caso o PDF seja imagem, integrar pytesseract (OCR).

[ ] Validação de Consistência: Validar se a soma do saldo_inicial + movimentacoes é igual ao saldo_final informado no PDF.


quero controlar saldo diario com relatorio gerencial para demostração, multi bancos.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://saldo-svd-seminovos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3ab518d2-f979-4414-97bc-adadf40ea3aa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
