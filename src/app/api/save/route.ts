import { NextRequest, NextResponse } from 'next/server';
import { downloadMasterExcel, uploadMasterExcel, addTransactionsToSheet, Transaction } from '@/lib/excel';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions, sheetType } = body;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json({ error: 'Nenhuma transação fornecida' }, { status: 400 });
    }

    if (!sheetType || !['ordinarios', 'extraordinarios', 'bioenergia'].includes(sheetType)) {
      return NextResponse.json({ error: 'Tipo de aba inválido' }, { status: 400 });
    }

    // Baixar arquivo mestre atual
    const workbook = await downloadMasterExcel();

    // Adicionar transações
    const updatedWorkbook = await addTransactionsToSheet(workbook, sheetType, transactions);

    // Salvar de volta no Blob
    await uploadMasterExcel(updatedWorkbook);

    // Gerar buffer para download
    const buffer = await updatedWorkbook.xlsx.writeBuffer();

    // Retornar arquivo atualizado
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Controle_de_despesas_mensais_atualizado.xlsx"',
      },
    });
  } catch (error) {
    console.error('Erro ao salvar transações:', error);
    return NextResponse.json({ 
      error: 'Erro ao salvar transações',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
