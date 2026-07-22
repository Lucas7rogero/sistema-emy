import { GoogleGenerativeAI } from '@google/generative-ai';
import { RawTransaction } from './fileParser';

export interface CategorizedTransaction {
  data: string;
  categoria: string;
  subcategoria: string;
  descricao: string;
  responsavel?: string;
  forma_pgto?: string;
  valor: number;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function categorizeTransactions(
  rawTransactions: RawTransaction[],
  categoryMapping: Map<string, string[]>,
  validResponsaveis: string[],
  validFormasPgto: string[],
  sheetType: string
): Promise<CategorizedTransaction[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Converter Map para objeto JSON
  const categoryObj: Record<string, string[]> = {};
  categoryMapping.forEach((subs, cat) => {
    categoryObj[cat] = subs;
  });

  // Construir prompt
  let prompt = `Você é um assistente financeiro. Vou te dar uma lista de transações extraídas de um extrato bancário e um vocabulário fechado de categorias válidas.

REGRAS OBRIGATÓRIAS:
1. Para CATEGORIA e SUBCATEGORIA, use APENAS um valor da lista fornecida abaixo. Nunca invente uma categoria nova.
2. Se não for possível identificar com confiança a CATEGORIA, SUBCATEGORIA, DESCRIÇÃO, RESPONSÁVEL ou FORMA DE PGTO de uma transação, coloque exatamente o texto "COMPLETAR" nesse campo. NÃO tente adivinhar ou chutar um valor só para preencher.
3. Nunca deixe um campo em branco — ou tem um valor da lista, ou é "COMPLETAR".
4. DESCRIÇÃO deve ser um resumo curto e legível do estabelecimento/motivo, não o texto bruto do extrato.
5. Preserve o valor exato (VALOR) e a data exata (DATA) de cada transação, sem arredondar ou alterar.

CATEGORIAS E SUBCATEGORIAS VÁLIDAS (formato categoria -> [subcategorias]):
${JSON.stringify(categoryObj, null, 2)}`;

  if (validResponsaveis.length > 0) {
    prompt += `\n\nRESPONSÁVEIS VÁLIDOS: ${JSON.stringify(validResponsaveis)}`;
  }

  if (validFormasPgto.length > 0) {
    prompt += `\n\nFORMAS DE PAGAMENTO VÁLIDAS: ${JSON.stringify(validFormasPgto)}`;
  }

  prompt += `\n\nTRANSAÇÕES EXTRAÍDAS DO EXTRATO:
${JSON.stringify(rawTransactions, null, 2)}`;

  // Definir campos esperados baseado na aba
  const hasResponsavel = sheetType === 'ordinarios' || sheetType === 'extraordinarios';
  const hasFormaPgto = sheetType === 'ordinarios';

  prompt += `\n\nResponda apenas com um JSON array, um objeto por transação, com as chaves: data, categoria, subcategoria, descricao${hasResponsavel ? ', responsavel' : ''}${hasFormaPgto ? ', forma_pgto' : ''}, valor.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extrair JSON da resposta (pode vir com markdown)
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Não foi possível extrair JSON da resposta do Gemini');
    }
    
    const categorized = JSON.parse(jsonMatch[0]) as CategorizedTransaction[];
    
    // Validar e corrigir valores
    return categorized.map((t, index) => {
      const raw = rawTransactions[index];
      
      // Validar categoria
      if (t.categoria !== 'COMPLETAR' && !categoryMapping.has(t.categoria)) {
        t.categoria = 'COMPLETAR';
      }
      
      // Validar subcategoria
      if (t.subcategoria !== 'COMPLETAR') {
        const validSubs = categoryMapping.get(t.categoria) || [];
        if (!validSubs.includes(t.subcategoria)) {
          t.subcategoria = 'COMPLETAR';
        }
      }
      
      // Validar responsável
      if (hasResponsavel && t.responsavel && t.responsavel !== 'COMPLETAR' && !validResponsaveis.includes(t.responsavel)) {
        t.responsavel = 'COMPLETAR';
      }
      
      // Validar forma de pagamento
      if (hasFormaPgto && t.forma_pgto && t.forma_pgto !== 'COMPLETAR' && !validFormasPgto.includes(t.forma_pgto)) {
        t.forma_pgto = 'COMPLETAR';
      }
      
      // Garantir que valor e data estão preservados
      t.valor = raw.valor;
      t.data = raw.data;
      
      return t;
    });
  } catch (error) {
    console.error('Erro ao categorizar transações com Gemini:', error);
    
    // Fallback: retornar transações com campos não categorizados
    return rawTransactions.map(t => ({
      data: t.data,
      categoria: 'COMPLETAR',
      subcategoria: 'COMPLETAR',
      descricao: t.descricao.substring(0, 50),
      valor: t.valor,
      ...(hasResponsavel && { responsavel: 'COMPLETAR' }),
      ...(hasFormaPgto && { forma_pgto: 'COMPLETAR' }),
    }));
  }
}

export async function extractTransactionsFromPDFText(pdfText: string): Promise<RawTransaction[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  const prompt = `Extraia todas as transações bancárias do texto abaixo do PDF de extrato bancário.
Para cada transação, identifique: DATA (formato DD/MM/YYYY), DESCRIÇÃO (nome do estabelecimento/motivo), e VALOR (número decimal).
Retorne apenas um JSON array com objetos contendo: data, descricao, valor.

Texto do PDF:
${pdfText}`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Não foi possível extrair JSON da resposta do Gemini');
    }
    
    return JSON.parse(jsonMatch[0]) as RawTransaction[];
  } catch (error) {
    console.error('Erro ao extrair transações do PDF com Gemini:', error);
    return [];
  }
}
