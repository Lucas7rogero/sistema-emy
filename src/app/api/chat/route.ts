import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { addLearningRule, getLearningRules, addChatMessage, getChatHistory } from '@/lib/db';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const runtime = 'nodejs';
export const maxDuration = 60;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ParsedRule {
  keyword: string;
  category: string;
  subcategoria: string;
  responsavel?: string;
  forma_pgto?: string;
  sheet_type: string;
}

function parseLearningRule(userMessage: string): ParsedRule | null {
  // Pattern to match: "quando aparecer X, categoria Y, subcategoria Z"
  const patterns = [
    /quando\s+(?:aparecer|tiver|vier)\s+["']?([^"'\n,]+)["']?\s*(?:,|então|é|deve ser)?\s*(?:a\s+)?categoria\s+["']?([^"'\n,]+)["']?\s*(?:,|e|com)?\s*(?:a\s+)?subcategoria\s+["']?([^"'\n,]+)["']?/i,
    /["']?([^"'\n,]+)["']?\s+deve\s+ser\s+categoria\s+["']?([^"'\n,]+)["']?\s*(?:e|com)?\s*subcategoria\s+["']?([^"'\n,]+)["']?/i,
    /para\s+["']?([^"'\n,]+)["']?\s+usar\s+categoria\s+["']?([^"'\n,]+)["']?\s*(?:e|com)?\s*subcategoria\s+["']?([^"'\n,]+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = userMessage.match(pattern);
    if (match) {
      const rule: ParsedRule = {
        keyword: match[1].trim(),
        category: match[2].trim(),
        subcategoria: match[3].trim(),
        sheet_type: 'ordinarios', // Default, can be overridden
      };

      // Try to extract responsavel and forma_pgto
      const respMatch = userMessage.match(/respons[áa]vel\s+["']?([^"'\n,]+)["']?/i);
      if (respMatch) {
        rule.responsavel = respMatch[1].trim();
      }

      const pgtoMatch = userMessage.match(/forma\s+(?:de\s+)?pag[áa]mento?\s+["']?([^"'\n,]+)["']?/i);
      if (pgtoMatch) {
        rule.forma_pgto = pgtoMatch[1].trim();
      }

      // Try to extract sheet type
      const sheetMatch = userMessage.match(/(?:na\s+)?aba\s+(ordin[áa]rios|extraordin[áa]rios|bioenergia)/i);
      if (sheetMatch) {
        const sheetMap: Record<string, string> = {
          'ordinarios': 'ordinarios',
          'ordinários': 'ordinarios',
          'extraordinarios': 'extraordinarios',
          'extraordinários': 'extraordinarios',
          'bioenergia': 'bioenergia',
        };
        rule.sheet_type = sheetMap[sheetMatch[1].toLowerCase()] || 'ordinarios';
      }

      return rule;
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { message, sheetType = 'ordinarios' } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Mensagem inválida' }, { status: 400 });
    }

    console.log('Processando mensagem:', message, 'sheetType:', sheetType);

    // Save user message to chat history
    try {
      addChatMessage({ role: 'user', content: message });
    } catch (dbError) {
      console.error('Erro ao salvar mensagem no banco:', dbError);
      // Continue even if database fails
    }

    // Try to parse a learning rule from the message
    const parsedRule = parseLearningRule(message);
    
    let aiResponse = '';

    if (parsedRule) {
      // User is teaching a new rule
      parsedRule.sheet_type = sheetType;
      console.log('Regra detectada:', parsedRule);
      
      try {
        // Convert ParsedRule to LearningRule (subcategory vs subcategoria)
        addLearningRule({
          keyword: parsedRule.keyword,
          category: parsedRule.category,
          subcategoria: parsedRule.subcategoria,
          responsavel: parsedRule.responsavel,
          forma_pgto: parsedRule.forma_pgto,
          sheet_type: parsedRule.sheet_type,
        });
      } catch (dbError) {
        console.error('Erro ao salvar regra no banco:', dbError);
        // Continue with response even if database fails
      }
      
      try {
        const rules = getLearningRules(sheetType);
        aiResponse = `Entendi! Salvei a regra:\n\n` +
          `📝 Palavra-chave: "${parsedRule.keyword}"\n` +
          `📁 Categoria: "${parsedRule.category}"\n` +
          `📂 Subcategoria: "${parsedRule.subcategoria}"\n` +
          (parsedRule.responsavel ? `👤 Responsável: "${parsedRule.responsavel}"\n` : '') +
          (parsedRule.forma_pgto ? `💳 Forma de pgto: "${parsedRule.forma_pgto}"\n` : '') +
          `📊 Aba: "${parsedRule.sheet_type}"\n\n` +
          `Agora quando aparecer "${parsedRule.keyword}" nos extratos, vou usar essa classificação automaticamente.\n\n` +
          `Você tem ${rules.length} regra(s) salva(s) no total. Quer adicionar mais alguma?`;
      } catch (dbError) {
        console.error('Erro ao buscar regras:', dbError);
        aiResponse = `Entendi! Salvei a regra:\n\n` +
          `📝 Palavra-chave: "${parsedRule.keyword}"\n` +
          `📁 Categoria: "${parsedRule.category}"\n` +
          `📂 Subcategoria: "${parsedRule.subcategoria}"\n` +
          (parsedRule.responsavel ? `👤 Responsável: "${parsedRule.responsavel}"\n` : '') +
          (parsedRule.forma_pgto ? `💳 Forma de pgto: "${parsedRule.forma_pgto}"\n` : '') +
          `📊 Aba: "${parsedRule.sheet_type}"\n\n` +
          `Agora quando aparecer "${parsedRule.keyword}" nos extratos, vou usar essa classificação automaticamente.`;
      }
    } else {
      // General chat - use Gemini
      if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({ 
          error: 'Chave de API do Gemini não configurada',
          details: 'Configure a variável de ambiente GEMINI_API_KEY'
        }, { status: 500 });
      }

      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      let rulesContext = '';
      try {
        const rules = getLearningRules(sheetType);
        rulesContext = rules.length > 0 
          ? `\n\nRegras de aprendizado atuais:\n${rules.map(r => 
            `- "${r.keyword}" → ${r.category} | ${r.subcategoria}`
          ).join('\n')}`
          : '\n\nNenhuma regra de aprendizado salva ainda.';
      } catch (dbError) {
        console.error('Erro ao buscar regras:', dbError);
        rulesContext = '\n\nNão foi possível carregar as regras de aprendizado.';
      }

      const prompt = `Você é um assistente financeiro que ajuda o usuário a categorizar despesas. 
O usuário pode te ensinar regras de categorização dizendo coisas como "quando aparecer Lelo, categoria Casa 1 Baroneza, subcategoria Condomínio".

Contexto atual:
- Aba selecionada: ${sheetType}
${rulesContext}

Responda de forma conversacional e útil. Se o usuário tentar te ensinar uma regra mas não estiver claro, peça esclarecimentos.

Mensagem do usuário: ${message}`;

      const result = await model.generateContent(prompt);
      aiResponse = result.response.text();
    }

    // Save AI response to chat history
    try {
      addChatMessage({ role: 'assistant', content: aiResponse });
    } catch (dbError) {
      console.error('Erro ao salvar resposta no banco:', dbError);
      // Continue even if database fails
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      ruleLearned: !!parsedRule,
    });
  } catch (error) {
    console.error('Erro no chat:', error);
    return NextResponse.json({ 
      error: 'Erro ao processar mensagem',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sheetType = searchParams.get('sheetType') || 'ordinarios';
    
    const rules = getLearningRules(sheetType);
    const history = getChatHistory(20);

    return NextResponse.json({
      success: true,
      rules,
      history: history.reverse(), // Most recent first
    });
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    return NextResponse.json({ 
      error: 'Erro ao buscar dados',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
