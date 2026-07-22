import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import * as fs from 'fs';
import * as path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LOCAL_MASTER_PATH = path.join(process.cwd(), 'master.xlsx');
const USE_LOCAL_STORAGE = !process.env.BLOB_READ_WRITE_TOKEN;

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

    // Usar armazenamento local se não tiver token Blob configurado
    if (USE_LOCAL_STORAGE) {
      fs.writeFileSync(LOCAL_MASTER_PATH, buffer);
      return NextResponse.json({ 
        success: true, 
        message: 'Arquivo mestre salvo localmente com sucesso' 
      });
    }

    // Usar Blob Storage em produção
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
