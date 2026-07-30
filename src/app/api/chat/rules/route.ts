import { NextRequest, NextResponse } from 'next/server';
import { deleteLearningRule } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID da regra não fornecido' }, { status: 400 });
    }

    deleteLearningRule(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar regra:', error);
    return NextResponse.json({ 
      error: 'Erro ao deletar regra',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
