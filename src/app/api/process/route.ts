import { NextRequest, NextResponse } from "next/server";
import { parseFile, removeDuplicates, RawTransaction } from "@/lib/fileParser";
import {
  downloadMasterExcel,
  extractCategoryMapping,
  extractUniqueValues,
  getSheetConfig,
  extractRealExamples,
} from "@/lib/excel";
import {
  categorizeTransactions,
  CategorizedTransaction,
  extractTransactionsFromPDFText,
} from "@/lib/gemini";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const sheetType = formData.get("sheetType") as string;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 },
      );
    }

    if (
      !sheetType ||
      !["ordinarios", "extraordinarios", "bioenergia"].includes(sheetType)
    ) {
      return NextResponse.json(
        { error: "Tipo de aba inválido" },
        { status: 400 },
      );
    }

    // Baixar arquivo mestre para extrair listas de referência
    const workbook = await downloadMasterExcel();
    const config = getSheetConfig(sheetType);

    // Extrair listas de referência
    const categoryMapping = extractCategoryMapping(workbook, config.name);
    const validResponsaveis = extractUniqueValues(
      workbook,
      config.name,
      "RESPONSÁVEL",
    );
    const validFormasPgto = extractUniqueValues(
      workbook,
      config.name,
      "FORMA DE PGTO",
    );

    // A planilha Controle_de_despesas_mensais.xlsx é a fonte de verdade. O
    // upload grava uma cópia em master.xlsx e daqui extraímos um grande conjunto
    // de descrições reais, sem duplicar lançamentos recorrentes.
    const realExamples = extractRealExamples(workbook, config.name, 1200);

    // Processar todos os arquivos
    let allRawTransactions: RawTransaction[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      // Para PDFs, sempre usar Gemini para extração (parser manual não funciona bem)
      if (file.name.toLowerCase().endsWith(".pdf")) {
        try {
          const pdfData = await pdfParse(buffer);
          const pdfText = pdfData.text;
          const geminiTransactions =
            await extractTransactionsFromPDFText(pdfText);
          if (geminiTransactions.length > 0) {
            allRawTransactions = [...allRawTransactions, ...geminiTransactions];
            continue;
          }

          // Se a IA estiver indisponível ou não conseguir interpretar o PDF,
          // ainda tentamos o parser local antes de desistir do arquivo.
          const fallbackTransactions = await parseFile(buffer, file.name);
          allRawTransactions = [...allRawTransactions, ...fallbackTransactions];
          continue;
        } catch (error) {
          console.error("Erro ao extrair transações do PDF com Gemini:", error);
          // Fallback para parser manual se Gemini falhar
          const transactions = await parseFile(buffer, file.name);
          allRawTransactions = [...allRawTransactions, ...transactions];
        }
      } else {
        // Para outros formatos, usar parser normal
        const transactions = await parseFile(buffer, file.name);
        allRawTransactions = [...allRawTransactions, ...transactions];
      }
    }

    // Remover duplicatas
    const uniqueTransactions = removeDuplicates(allRawTransactions);

    if (uniqueTransactions.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma transação encontrada nos arquivos" },
        { status: 400 },
      );
    }

    // Categorizar com Gemini (passando exemplos reais do Excel)
    const categorized = await categorizeTransactions(
      uniqueTransactions,
      categoryMapping,
      validResponsaveis,
      validFormasPgto,
      sheetType,
      realExamples,
    );

    return NextResponse.json({
      success: true,
      transactions: categorized,
      total: categorized.length,
    });
  } catch (error) {
    console.error("Erro ao processar extratos:", error);
    return NextResponse.json(
      {
        error: "Erro ao processar extratos",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    );
  }
}
