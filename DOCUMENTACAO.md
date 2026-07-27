# Sistema Emy - Documentação Completa

## Visão Geral

Sistema para processamento automático de extratos bancários com categorização por IA (Google Gemini). O sistema extrai transações de PDFs, CSVs, OFXs e XLSXs, categoriza automaticamente baseado em um Excel mestre, e permite edição manual antes de salvar.

## Tecnologias

- **Frontend**: Next.js 14, React, TailwindCSS
- **Backend**: Next.js API Routes
- **IA**: Google Gemini API (gemini-1.5-flash)
- **Processamento de Arquivos**: 
  - PDF: pdf-parse + Gemini para extração
  - CSV: PapaParse
  - OFX: ofx-js
  - Excel: ExcelJS
- **Armazenamento**: Vercel Blob Storage (produção) ou arquivo local (desenvolvimento)

## Estrutura do Projeto

```
sistema-emy/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload-master/    # Upload do Excel base
│   │   │   ├── process/          # Processamento de extratos
│   │   │   └── save/             # Salvamento de transações
│   │   └── page.tsx              # Frontend principal
│   └── lib/
│       ├── excel.ts              # Funções Excel
│       ├── fileParser.ts         # Parsers de arquivos
│       └── gemini.ts             # Integração Gemini
├── .env.local.example            # Exemplo de variáveis de ambiente
├── package.json
└── README.md
```

## Configuração Inicial

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz do projeto:

```bash
# Copie o exemplo
cp .env.local.example .env.local
```

Edite o `.env.local`:

```env
GEMINI_API_KEY=sua_chave_gemini_aqui
BLOB_READ_WRITE_TOKEN=  # Opcional para desenvolvimento local
```

**Obter GEMINI_API_KEY:**
1. Acesse https://makersuite.google.com/app/apikey
2. Crie uma nova API key
3. Cole no arquivo `.env.local`

### 3. Executar em Desenvolvimento

```bash
npm run dev
```

Acesse http://localhost:3000

## Fluxo Completo do Usuário

### Passo 1: Carregar Excel Base

**O QUE É:** O arquivo Excel mestre contém as categorias, subcategorias, responsáveis e formas de pagamento válidas. É sempre o mesmo arquivo.

**COMO FAZER:**
1. Na página inicial, clique no campo "Arquivo Excel Base"
2. Selecione seu arquivo Excel (ex: `Controle_de_despesas_mensais.xlsx`)
3. Clique no botão verde "Carregar Excel Base"
4. Aguarde a mensagem de sucesso

**IMPORTANTE:**
- O Excel deve ter 3 abas: "Base Ordinarios", "Base Extraordinarios", "Base Bioenergia"
- Cada aba deve ter as colunas: DATA, CATEGORIA, SUBCATEGORIA, DESCRIÇÃO, etc.
- Este passo só precisa ser feito uma vez (ou quando o Excel mudar)

### Passo 2: Selecionar Aba de Destino

**O QUE É:** Escolher para qual aba do Excel as transações serão adicionadas.

**COMO FAZER:**
1. Clique em um dos botões:
   - **Ordinários**: Despesas recorrentes mensais
   - **Extraordinários**: Despesas não recorrentes
   - **Bioenergia**: Despesas relacionadas a bioenergia

### Passo 3: Upload do Extrato Bancário

**O QUE É:** Carregar o arquivo do extrato bancário para processamento.

**COMO FAZER:**
1. Arraste e solte o arquivo na área indicada OU
2. Clique para selecionar o arquivo
3. Formatos aceitos: PDF, CSV, OFX, XLSX
4. Pode enviar múltiplos arquivos de uma vez

### Passo 4: Processar com IA

**O QUE É:** O sistema extrai as transações do arquivo e usa a IA (Gemini) para categorizar automaticamente.

**COMO FAZER:**
1. Clique no botão verde "Processar com IA"
2. Aguarde o processamento (pode levar alguns segundos dependendo do tamanho)
3. O sistema:
   - Extrai transações do arquivo (usando Gemini para PDFs)
   - Remove duplicatas
   - Categoriza baseado no Excel mestre
   - Usa exemplos reais do Excel para melhor precisão

### Passo 5: Revisar e Editar Transações

**O QUE É:** Verificar as transações categorizadas e fazer ajustes manuais se necessário.

**COMO FAZER:**
1. Revise a tabela de transações
2. Campos em vermelho indicam "COMPLETAR" - precisam ser preenchidos manualmente
3. Edite qualquer campo diretamente na tabela
4. Clique em "Remover" para excluir transações indesejadas

**CAMPOS:**
- **DATA**: Data da transação (DD/MM/YYYY)
- **CATEGORIA**: Categoria do Excel mestre
- **SUBCATEGORIA**: Subcategoria da categoria
- **DESCRIÇÃO**: Nome do estabelecimento/empresa
- **RESPONSÁVEL** (Ordinários/Extraordinários): Quem fez a despesa
- **FORMA DE PGTO** (Ordinários): Como foi pago
- **VALOR**: Valor da transação

### Passo 6: Salvar e Baixar

**O QUE É:** Salvar as transações no Excel mestre e baixar o arquivo atualizado.

**COMO FAZER:**
1. Clique no botão azul "Salvar e Baixar Arquivo Atualizado"
2. O arquivo será baixado automaticamente
3. Nome do arquivo: `Controle_de_despesas_mensais_atualizado.xlsx`

### Passo 7: Atualizar Tabelas Dinâmicas

**O QUE É:** As tabelas dinâmicas do Excel precisam ser atualizadas para refletir os novos dados.

**COMO FAZER:**
1. Abra o arquivo Excel baixado
2. Clique em **Dados > Atualizar Tudo**
3. As tabelas dinâmicas serão atualizadas com os novos lançamentos

## API Routes

### POST /api/upload-master

**Descrição:** Faz upload do arquivo Excel mestre.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: FormData com campo `file` (arquivo .xlsx ou .xls)

**Response:**
```json
{
  "success": true,
  "message": "Arquivo mestre salvo localmente com sucesso"
}
```

### POST /api/process

**Descrição:** Processa extratos bancários e categoriza com IA.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: FormData com:
  - `files`: Array de arquivos (PDF, CSV, OFX, XLSX)
  - `sheetType`: Tipo de aba ('ordinarios', 'extraordinarios', 'bioenergia')

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "data": "01/08/2020",
      "categoria": "Lazer/Bem-estar",
      "subcategoria": "Lazer",
      "descricao": "Netflix",
      "responsavel": "COMPLETAR",
      "forma_pgto": "COMPLETAR",
      "valor": 55.90
    }
  ],
  "total": 1
}
```

### POST /api/save

**Descrição:** Salva transações no Excel mestre e retorna arquivo atualizado.

**Request:**
- Method: POST
- Content-Type: application/json
- Body:
```json
{
  "transactions": [...],
  "sheetType": "ordinarios"
}
```

**Response:**
- Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- Arquivo Excel atualizado para download

## Funções Principais

### excel.ts

**downloadMasterExcel()**: Baixa o arquivo Excel mestre (Blob ou local)

**uploadMasterExcel()**: Salva o arquivo Excel mestre (Blob ou local)

**extractCategoryMapping()**: Extrai mapeamento de categorias e subcategorias

**extractUniqueValues()**: Extrai valores únicos de uma coluna (responsáveis, formas de pgto)

**extractRealExamples()**: Extrai exemplos reais do Excel para contexto da IA

**addTransactionsToSheet()**: Adiciona transações à aba especificada do Excel

### fileParser.ts

**parsePDF()**: Extrai transações de PDF (usa Gemini como fallback)

**parseCSV()**: Extrai transações de CSV

**parseOFX()**: Extrai transações de OFX

**parseXLSX()**: Extrai transações de Excel

**removeDuplicates()**: Remove transações duplicadas

### gemini.ts

**categorizeTransactions()**: Categoriza transações usando Gemini com:
- Vocabulário fechado do Excel mestre
- Exemplos reais do Excel
- Validação case-insensitive
- Fallback para "COMPLETAR" quando incerto

**extractTransactionsFromPDFText()**: Extrai transações de texto PDF usando Gemini

## Tratamento de Erros

### Erros Comuns e Soluções

**1. "Erro: Carregue o arquivo Excel Base antes de processar extratos"**
- **Causa**: Excel mestre não foi carregado
- **Solução**: Carregue o Excel base no primeiro campo

**2. "Erro: Configure a GEMINI_API_KEY no arquivo .env.local"**
- **Causa**: API key do Gemini não configurada
- **Solução**: Adicione GEMINI_API_KEY no .env.local

**3. "Nenhuma transação encontrada nos arquivos"**
- **Causa**: Arquivo não contém transações reconhecíveis
- **Solução**: Verifique se o arquivo está no formato correto

**4. "Arquivo mestre local não encontrado"**
- **Causa**: Excel base não foi carregado ainda
- **Solução**: Faça upload do Excel base

## Desenvolvimento vs Produção

### Desenvolvimento Local

- Usa armazenamento local (`master.xlsx` na raiz)
- Não precisa de `BLOB_READ_WRITE_TOKEN`
- Excel base é salvo localmente

### Produção (Vercel)

- Usa Vercel Blob Storage
- Requer `BLOB_READ_WRITE_TOKEN`
- Excel base é salvo no Blob Storage

## Boas Práticas

1. **Sempre carregue o Excel base primeiro** antes de processar extratos
2. **Revise as transações** antes de salvar - a IA pode errar
3. **Atualize tabelas dinâmicas** após abrir o Excel
4. **Use descrições claras** no Excel mestre para melhor categorização
5. **Mantenha o vocabulário consistente** no Excel mestre
6. **Teste com um arquivo pequeno** primeiro para validar

## Troubleshooting

### Build falha

```bash
# Limpar cache e rebuild
rm -rf .next
npm run build
```

### Dependências quebradas

```bash
# Reinstalar dependências
rm -rf node_modules package-lock.json
npm install
```

### Porta já em uso

```bash
# Usar porta diferente
npm run dev -- -p 3001
```

## Suporte

Para problemas ou dúvidas, verifique:
1. Logs do console do navegador (F12)
2. Logs do terminal onde `npm run dev` está rodando
3. Mensagens de erro na interface
