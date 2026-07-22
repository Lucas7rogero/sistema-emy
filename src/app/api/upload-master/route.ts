import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Apenas arquivos Excel (.xlsx, .xls) são permitidos' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const blob = await put('master.xlsx', buffer, {
      access: 'public',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    return NextResponse.json({ 
      success: true, 
      url: blob.url,
      message: 'Arquivo mestre enviado com sucesso' 
    });
  } catch (error) {
    console.error('Erro ao fazer upload do arquivo mestre:', error);
    return NextResponse.json({ error: 'Erro ao fazer upload do arquivo mestre' }, { status: 500 });
  }
}
