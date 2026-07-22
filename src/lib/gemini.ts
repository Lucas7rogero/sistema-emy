import { GoogleGenerativeAI } from "@google/generative-ai";
import { RawTransaction } from "./fileParser";

export interface CategorizedTransaction {
  data: string;
  categoria: string;
  subcategoria: string;
  descricao: string;
  responsavel?: string;
  forma_pgto?: string;
  valor: number;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const GENERIC_WORDS = new Set([
  "pix",
  "enviado",
  "enviada",
  "recebido",
  "recebida",
  "transferencia",
  "pagamento",
  "boleto",
  "conta",
  "cartao",
  "fatura",
  "por",
  "para",
  "margareth",
  "emy",
  "funes",
  "de",
  "da",
  "do",
  "e",
]);

function categorizeLocally(
  rawTransactions: RawTransaction[],
  categoryMapping: Map<string, string[]>,
  validResponsaveis: string[],
  validFormasPgto: string[],
  sheetType: string,
  realExamples: Array<{
    descricao: string;
    categoria: string;
    subcategoria: string;
  }>,
): CategorizedTransaction[] {
  const categories = Array.from(categoryMapping.entries());
  const hasResponsavel =
    sheetType === "ordinarios" || sheetType === "extraordinarios";
  const hasFormaPgto = sheetType === "ordinarios";
  const defaultResponsavel =
    validResponsaveis.find((value) => normalizeText(value) === "familia") ||
    validResponsaveis[0] ||
    "COMPLETAR";
  const defaultFormaPgto =
    validFormasPgto.find((value) =>
      normalizeText(value).includes("conta corrente btg"),
    ) ||
    validFormasPgto[0] ||
    "COMPLETAR";

  return rawTransactions.map((raw) => {
    const description = normalizeText(raw.descricao);
    let best: {
      categoria: string;
      subcategoria: string;
      score: number;
    } | null = null;

    // A própria planilha é a fonte de verdade: tenta primeiro descrições já cadastradas.
    for (const example of realExamples) {
      const exampleText = normalizeText(example.descricao);
      if (!exampleText) continue;
      const exampleWords = new Set(
        exampleText
          .split(" ")
          .filter((word) => word.length > 3 && !GENERIC_WORDS.has(word)),
      );
      const descriptionWords = new Set(
        description
          .split(" ")
          .filter((word) => word.length > 3 && !GENERIC_WORDS.has(word)),
      );
      const overlap = [...exampleWords].filter((word) =>
        descriptionWords.has(word),
      ).length;
      const score =
        description.includes(exampleText) || exampleText.includes(description)
          ? 100 + exampleText.length / 100
          : overlap * 10;
      if (score >= 10 && (!best || score > best.score)) {
        best = {
          categoria: example.categoria,
          subcategoria: example.subcategoria,
          score,
        };
      }
    }

    const rules: Array<[string[], string, string]> = [
      [
        ["supermercado", "covabra", "mercado", "extra"],
        "Casa 1 BARONEZA",
        "Mercado",
      ],
      [
        ["comgas", "energisa", "telefonica", "claro", "conta", "boleto"],
        "Casa 1 BARONEZA",
        "Contas de consumo",
      ],
      [
        ["condominio", "lello", "clube hipico"],
        "Casa 1 BARONEZA",
        "Condomínio",
      ],
      [
        ["fisioterapia", "farmacia", "drogasil", "dentista", "medico", "saude"],
        "Saúde",
        "Consulta/exame/tratamento",
      ],
      [
        ["sem parar", "posto", "combustivel", "uber", "taxi", "estacionamento"],
        "Veículos",
        "Transporte",
      ],
      [
        ["restaurante", "pinheiros", "mesqtenis", "lazer", "cinema"],
        "Lazer/Bem-estar",
        "Lazer",
      ],
      [["escola", "fundasp", "curso", "educacao"], "Crianças", "Estudos"],
    ];
    if (!best) {
      for (const [words, category, subcategory] of rules) {
        const categoryEntry = categories.find(
          ([name, subs]) =>
            normalizeText(name) === normalizeText(category) &&
            subs.some(
              (sub) => normalizeText(sub) === normalizeText(subcategory),
            ),
        );
        if (
          categoryEntry &&
          words.some((word) => description.includes(normalizeText(word)))
        ) {
          best = {
            categoria: categoryEntry[0],
            subcategoria: categoryEntry[1].find(
              (sub) => normalizeText(sub) === normalizeText(subcategory),
            )!,
            score: 10,
          };
          break;
        }
      }
    }

    const valid =
      best &&
      categoryMapping.has(best.categoria) &&
      (categoryMapping.get(best.categoria) || []).includes(best.subcategoria);
    return {
      data: raw.data,
      categoria: valid ? best!.categoria : "COMPLETAR",
      subcategoria: valid ? best!.subcategoria : "COMPLETAR",
      descricao:
        raw.descricao.length > 80
          ? raw.descricao.substring(0, 80)
          : raw.descricao,
      valor: raw.valor,
      ...(hasResponsavel && { responsavel: defaultResponsavel }),
      ...(hasFormaPgto && { forma_pgto: defaultFormaPgto }),
    };
  });
}

export async function categorizeTransactions(
  rawTransactions: RawTransaction[],
  categoryMapping: Map<string, string[]>,
  validResponsaveis: string[],
  validFormasPgto: string[],
  sheetType: string,
  realExamples: Array<{
    descricao: string;
    categoria: string;
    subcategoria: string;
  }> = [],
): Promise<CategorizedTransaction[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Converter Map para objeto JSON
  const categoryObj: Record<string, string[]> = {};
  categoryMapping.forEach((subs, cat) => {
    categoryObj[cat] = subs;
  });

  // Construir prompt melhorado e mais específico
  let prompt = `Você é um assistente financeiro especialista em categorização de despesas pessoais. Sua tarefa é analisar as descrições das transações bancárias e inferir a categoria e subcategoria correta baseando-se no vocabulário fechado do Excel mestre.

REGRAS OBRIGATÓRIAS - LEIA COM ATENÇÃO:

1. ANALISE A DESCRIÇÃO: Leia cuidadosamente cada descrição de transação. O nome do estabelecimento/empresa indica a categoria.
2. USE APENAS CATEGORIAS EXISTENTES: CATEGORIA e SUBCATEGORIA devem ser valores EXATOS das listas abaixo. NUNCA invente categorias novas.
3. INFERÊNCIA BASEADA EM DESCRIÇÃO: Use a descrição para inferir a categoria lógica. Ex: "Supermercado Extra" → Categoria com "Mercado" como subcategoria.
4. SE NÃO TIVER CERTEZA: Se não for possível inferir com confiança a categoria/subcategoria baseado na descrição, use "COMPLETAR". É melhor deixar incompleto do que errar.
5. DESCRIÇÃO FINAL: Mantenha a descrição legível do estabelecimento.
6. Preserve DATA e VALOR exatamente como recebidos.
7. RESPONSÁVEL e FORMA DE PGTO: Use apenas valores da lista fornecida.

CATEGORIAS E SUBCATEGORIAS VÁLIDAS (use EXATAMENTE estes valores - memorize esta lista):
${JSON.stringify(categoryObj, null, 2)}`;

  if (validResponsaveis.length > 0) {
    prompt += `\n\nRESPONSÁVEIS VÁLIDOS (use exatamente): ${JSON.stringify(validResponsaveis)}`;
  }

  if (validFormasPgto.length > 0) {
    prompt += `\n\nFORMAS DE PAGAMENTO VÁLIDAS (use exatamente): ${JSON.stringify(validFormasPgto)}`;
  }

  prompt += `\n\nBASE DE APRENDIZADO — CONTROLE_DE_DESPESAS_MENSAIS.XLSX:
Esta é a base histórica real do usuário. Ela tem prioridade sobre qualquer exemplo genérico da internet.
Use a descrição do lançamento e procure o estabelecimento, pessoa, serviço ou palavra-chave mais parecido nos exemplos históricos.
Quando houver correspondência exata ou muito próxima, copie exatamente CATEGORIA e SUBCATEGORIA daquele exemplo.
Não misture subcategorias de categorias diferentes. Toda combinação precisa existir na lista fechada acima.
Descrições de transferências/Pix devem ser classificadas pelo beneficiário quando houver um exemplo histórico do mesmo beneficiário.
Lançamentos recorrentes (condomínio, contas, mensalidades, escolas, clubes e serviços) devem manter o padrão histórico da planilha.
Valores positivos podem ser recebimentos e valores negativos normalmente são despesas; use o contexto e os exemplos, mas nunca altere DATA ou VALOR.
Se não houver evidência suficiente nos exemplos, use COMPLETAR somente para CATEGORIA e SUBCATEGORIA.

HISTÓRICO REAL DE DESCRIÇÕES → CLASSIFICAÇÃO:
${realExamples.map((ex) => `- ${ex.descricao} => ${ex.categoria} | ${ex.subcategoria}`).join("\n")}`;

  prompt += `\n\nTRANSAÇÕES PARA CATEGORIZAR (analise cada descrição):
${JSON.stringify(rawTransactions, null, 2)}`;

  // Definir campos esperados baseado na aba
  const hasResponsavel =
    sheetType === "ordinarios" || sheetType === "extraordinarios";
  const hasFormaPgto = sheetType === "ordinarios";

  prompt += `\n\nEXEMPLOS ADICIONAIS DE CATEGORIZAÇÃO:
- Descrição: "Netflix" → Categoria: "Lazer/Bem-estar", Subcategoria: "Lazer"
- Descrição: "Shell Posto" → Categoria: "Veículos", Subcategoria: "Combustível"
- Descrição: "Supermercado Extra" → Categoria: "Casa 1 BARONEZA", Subcategoria: "Mercado"
- Descrição: "Dentista Dr Silva" → Categoria: "Saúde", Subcategoria: "Dentista"
- Descrição: "Uber Viagem" → Categoria: "Veículos", Subcategoria: "Estacionamento"
- Descrição: "Restaurante Outback" → Categoria: "Lazer/Bem-estar", Subcategoria: "Restaurantes"
- Descrição: "Academia Fit" → Categoria: "Lazer/Bem-estar", Subcategoria: "Lazer"
- Descrição: "Farmácia Drogasil" → Categoria: "Saúde", Subcategoria: "Medicamentos/suplementos"
- Descrição: "Condomínio" → Categoria: "Casa 1 BARONEZA", Subcategoria: "Condomínio"
- Descrição: "Conta Luz" → Categoria: "Casa 1 BARONEZA", Subcategoria: "Contas de consumo"

IMPORTANTE: Analise cada descrição individualmente. Se a descrição não indicar claramente uma categoria das listas acima, use "COMPLETAR".

Responda apenas com um JSON array, um objeto por transação, com as chaves: data, categoria, subcategoria, descricao${hasResponsavel ? ", responsavel" : ""}${hasFormaPgto ? ", forma_pgto" : ""}, valor.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extrair JSON da resposta (pode vir com markdown)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Não foi possível extrair JSON da resposta do Gemini");
    }

    const categorized = JSON.parse(jsonMatch[0]) as CategorizedTransaction[];

    // Validar e corrigir valores
    return categorized.map((t, index) => {
      const raw = rawTransactions[index];

      // Validar categoria (case insensitive)
      if (t.categoria !== "COMPLETAR") {
        const normalizedCat = t.categoria.trim();
        const foundCat = Array.from(categoryMapping.keys()).find(
          (c) => c.toLowerCase() === normalizedCat.toLowerCase(),
        );
        if (foundCat) {
          t.categoria = foundCat;
        } else {
          t.categoria = "COMPLETAR";
        }
      }

      // Validar subcategoria (case insensitive)
      if (t.subcategoria !== "COMPLETAR" && t.categoria !== "COMPLETAR") {
        const validSubs = categoryMapping.get(t.categoria) || [];
        const normalizedSub = t.subcategoria.trim();
        const foundSub = validSubs.find(
          (s) => s.toLowerCase() === normalizedSub.toLowerCase(),
        );
        if (foundSub) {
          t.subcategoria = foundSub;
        } else {
          t.subcategoria = "COMPLETAR";
        }
      }

      // Validar responsável (case insensitive)
      if (hasResponsavel && t.responsavel && t.responsavel !== "COMPLETAR") {
        const normalizedResp = t.responsavel.trim();
        const foundResp = validResponsaveis.find(
          (r) => r.toLowerCase() === normalizedResp.toLowerCase(),
        );
        if (foundResp) {
          t.responsavel = foundResp;
        } else {
          t.responsavel = "COMPLETAR";
        }
      }

      // Validar forma de pagamento (case insensitive)
      if (hasFormaPgto && t.forma_pgto && t.forma_pgto !== "COMPLETAR") {
        const normalizedPgto = t.forma_pgto.trim();
        const foundPgto = validFormasPgto.find(
          (f) => f.toLowerCase() === normalizedPgto.toLowerCase(),
        );
        if (foundPgto) {
          t.forma_pgto = foundPgto;
        } else {
          t.forma_pgto = "COMPLETAR";
        }
      }

      // Garantir que valor e data estão preservados
      t.valor = raw.valor;
      t.data = raw.data;

      // Melhorar descrição se for muito curta ou parecer código
      if (t.descricao.length < 3 || /^\d+$/.test(t.descricao)) {
        t.descricao = raw.descricao.substring(0, 50);
      }

      return t;
    });
  } catch (error) {
    console.error("Erro ao categorizar transações com Gemini:", error);
    return categorizeLocally(
      rawTransactions,
      categoryMapping,
      validResponsaveis,
      validFormasPgto,
      sheetType,
      realExamples,
    );
  }
}

export async function extractTransactionsFromPDFText(
  pdfText: string,
): Promise<RawTransaction[]> {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `Você é um especialista em extrair dados de extratos bancários brasileiros em PDF.

Extraia TODAS as transações do texto do extrato abaixo. Para cada transação, identifique:
- DATA: formato DD/MM/YYYY (ex: 01/08/2020)
- DESCRIÇÃO: nome do estabelecimento, empresa ou motivo da transação (ex: "Netflix", "Supermercado Extra", "Shell")
- VALOR: valor numérico decimal (ex: 55.90, 150.00). Preserve o sinal negativo se houver.

REGRAS IMPORTANTES:
1. Extraia TODAS as transações, não apenas algumas
2. Preserve os valores EXATOS como aparecem no extrato
3. Se houver valores negativos (estornos), preserve o sinal negativo
4. A data deve estar no formato DD/MM/YYYY
5. A descrição deve ser legível, não códigos

Texto do extrato bancário:
${pdfText}

Retorne APENAS um JSON array com objetos contendo: data, descricao, valor. Nada mais.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Não foi possível extrair JSON da resposta do Gemini");
    }

    const transactions = JSON.parse(jsonMatch[0]) as RawTransaction[];

    // Validar e limpar os dados
    return transactions
      .map((t) => ({
        data: t.data,
        descricao: t.descricao?.trim() || "",
        valor:
          typeof t.valor === "number"
            ? t.valor
            : parseFloat(String(t.valor).replace(",", ".")),
      }))
      .filter((t) => !isNaN(t.valor) && t.data && t.descricao);
  } catch (error) {
    console.error("Erro ao extrair transações do PDF com Gemini:", error);
    return [];
  }
}
