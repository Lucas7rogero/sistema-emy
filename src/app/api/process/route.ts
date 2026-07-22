import { NextRequest, NextResponse } from 'next/server';
import { parseFile, removeDuplicates, RawTransaction } from '@/lib/fileParser';
import { downloadMasterExcel, extractCategoryMapping, extractUniqueValues, getSheetConfig } from '@/lib/excel';
import { categorizeTransactions, CategorizedTransaction } from '@/lib/gemini';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const sheetType = formData.get('sheetType') as string;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    if (!sheetType || !['ordinarios', 'extraordinarios', 'bioenergia'].includes(sheetType)) {
      return NextResponse.json({ error: 'Tipo de aba inválido' }, { status: 400 });
    }

    // Baixar arquivo mestre para extrair listas de referência
    const workbook = await downloadMasterExcel();
    const config = getSheetConfig(sheetType);
    
    // Extrair listas de referência
    const categoryMapping = extractCategoryMapping(workbook, config.name);
    const validResponsaveis = extractUniqueValues(workbook, config.name, 'RESPONSÁVEL');
    const validFormasPgto = extractUniqueValues(workbook, config.name, 'FORMA DE PGTO');

    // Processar todos os arquivos
    let allRawTransactions: RawTransaction[] = [];
    
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const transactions = await parseFile(buffer, file.name);
      allRawTransactions = [...allRawTransactions, ...transactions];
    }

    // Remover duplicatas
    const uniqueTransactions = removeDuplicates(allRawTransactions);
    
    if (uniqueTransactions.length === 0) {
      return NextResponse.json({ error: 'Nenhuma transação encontrada nos arquivos' }, { status: 400 });
    }

    // Categorizar com Gemini
    const categorized = await categorizeTransactions(
      uniqueTransactions,
      categoryMapping,
      validResponsaveis,
      validFormasPgto,
      sheetType
    );

    return NextResponse.json({
      success: true,
      transactions: categorized,
      total: categorized.length,
    });
  } catch (error) {
    console.error('Erro ao processar extratos:', error);
    return NextResponse.json({ 
      error: 'Erro ao processar extratos',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
