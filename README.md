# Sistema Emy - Processamento de Extratos Bancários

Sistema web para processamento de extratos bancários usando IA (Gemini), com integração direta com planilha Excel de controle financeiro.

## Funcionalidades

- Upload de extratos bancários em múltiplos formatos (PDF, CSV, OFX, XLSX)
- Processamento com IA para categorização automática de transações
- Tabela editável para revisão antes de salvar
- Integração direta com planilha Excel via Vercel Blob Storage
- Suporte a 3 abas: Ordinários, Extraordinários e Bioenergia

## Stack Tecnológica

- **Frontend**: Next.js 14 (App Router), React, TypeScript, TailwindCSS
- **Backend**: Next.js API Routes (serverless)
- **IA**: Google Gemini API
- **Excel**: exceljs
- **Storage**: Vercel Blob Storage
- **Parsing**: pdf-parse, papaparse, ofx-js

## Pré-requisitos

- Node.js 18+ instalado
- Conta na Vercel
- API Key do Google Gemini (obter em https://makersuite.google.com/app/apikey)

## Instalação Local

1. Clone o repositório
2. Instale as dependências:
```bash
npm install
```

3. Configure as variáveis de ambiente:
```bash
cp .env.local.example .env.local
```

Edite `.env.local` e adicione:
```
GEMINI_API_KEY=sua_chave_gemini_aqui
BLOB_READ_WRITE_TOKEN=seu_token_blob_aqui
```

4. Execute em modo de desenvolvimento:
```bash
npm run dev
```

Acesse `http://localhost:3000`

## Deploy na Vercel

### 1. Configurar Vercel Blob Storage

No dashboard da Vercel:
1. Vá em Settings > Blob Storage
2. Crie um novo store
3. Copie o `BLOB_READ_WRITE_TOKEN` gerado

### 2. Configurar Variáveis de Ambiente

No projeto Vercel:
1. Vá em Settings > Environment Variables
2. Adicione:
   - `GEMINI_API_KEY`: Sua chave do Google Gemini
   - `BLOB_READ_WRITE_TOKEN`: Token do Blob Storage

### 3. Deploy

```bash
vercel
```

Ou conecte o repositório Git no dashboard da Vercel e faça deploy automático.

### 4. Upload Inicial do Arquivo Mestre

Após o primeiro deploy, você precisa fazer upload inicial da planilha mestre:

1. Acesse: `https://seu-produto.vercel.app/api/upload-master` (via POST)
2. Envie o arquivo `Controle_de_despesas_mensais.xlsx` como multipart/form-data
3. O arquivo será salvo no Blob Storage

**Exemplo usando curl:**
```bash
curl -X POST https://seu-produto.vercel.app/api/upload-master \
  -F "file=@Controle_de_despesas_mensais.xlsx"
```

Ou use Postman/Insomnia para fazer o upload.

## Estrutura do Projeto

```
sistema-emy/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload-master/    # Upload inicial do arquivo mestre
│   │   │   ├── process/          # Processamento de extratos
│   │   │   └── save/             # Salvar transações no Excel
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Interface principal
│   │   └── globals.css
│   └── lib/
│       ├── excel.ts             # Funções de leitura/escrita Excel
│       ├── fileParser.ts        # Parsing de PDF, CSV, OFX, XLSX
│       └── gemini.ts            # Integração com Gemini API
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── .env.local.example
```

## Uso

1. **Selecione a aba de destino**: Ordinários, Extraordinários ou Bioenergia
2. **Upload do extrato**: Arraste ou selecione arquivos (PDF, CSV, OFX ou XLSX)
3. **Processar com IA**: Clique para processar as transações
4. **Revisar**: Edite campos marcados como "COMPLETAR" em vermelho
5. **Salvar**: Clique para salvar no Excel e baixar o arquivo atualizado
6. **Atualizar Excel**: Após abrir o arquivo, clique em Dados > Atualizar Tudo

## Formato das Abas

### Base Ordinarios
- DATA, CATEGORIA, SUBCATEGORIA, DESCRIÇÃO, RESPONSÁVEL, FORMA DE PGTO, VALOR

### Base Extraordinarios
- DATA, CATEGORIA, SUBCATEGORIA, DESCRIÇÃO, RESPONSÁVEL, VALOR

### Base Bioenergia
- DATA, CATEGORIA, SUBCATEGORIA, DESCRIÇÃO, VALOR

## Limitações

- Funções serverless da Vercel têm timeout (configurado até 300s)
- Payload limitado a ~4.5MB por requisição
- Extratos PDF muito grandes podem precisar de timeout maior
- Tabelas dinâmicas do Excel precisam ser atualizadas manualmente após abrir o arquivo

## Segurança

- GEMINI_API_KEY fica apenas em variáveis de ambiente no servidor
- Nenhum dado do usuário é persistido em disco/banco
- Processamento é feito em memória e descartado após resposta
- Validação de tipo/tamanho de arquivo no upload

## Troubleshooting

### Erro "Arquivo mestre não encontrado"
- Você precisa fazer o upload inicial via `/api/upload-master`
- Verifique se o `BLOB_READ_WRITE_TOKEN` está configurado

### Erro ao processar PDF
- PDFs complexos podem não ser parseados corretamente
- O sistema tenta usar Gemini para extrair dados do PDF se o parser falhar

### Timeout no processamento
- Aumente `maxDuration` nas rotas API se necessário
- Considere dividir arquivos grandes em partes menores

## Licença

Uso pessoal.
