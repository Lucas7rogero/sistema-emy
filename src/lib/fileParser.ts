import Papa from "papaparse";
import pdfParse from "pdf-parse";
import ExcelJS from "exceljs";

export interface RawTransaction {
  data: string;
  descricao: string;
  valor: number;
}

export async function parsePDF(buffer: Buffer): Promise<RawTransaction[]> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text;
    const transactions: RawTransaction[] = [];

    // Extratos do BTG podem quebrar uma transação em várias linhas. Por isso,
    // cada bloco é delimitado pela próxima data, e não por uma única linha.
    const datePattern = /(\d{2})[\/-](\d{2})[\/-](\d{4})\s+\d{2}h\d{2}/g;
    const dates = Array.from(text.matchAll(datePattern));
    const valuePattern = /([+-]?)\s*R\$\s*([\d.]+,\d{2})/g;

    dates.forEach((dateMatch, index) => {
      const start = dateMatch.index ?? 0;
      const end =
        index + 1 < dates.length
          ? (dates[index + 1].index ?? text.length)
          : text.length;
      const block = text.slice(start, end);
      const values = Array.from(block.matchAll(valuePattern));
      const valueMatch = values[values.length - 1];

      if (!valueMatch) return;

      const date = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
      const numericValue = parseFloat(
        valueMatch[2].replace(/\./g, "").replace(",", "."),
      );
      const valor = valueMatch[1] === "-" ? -numericValue : numericValue;
      const descricao = block
        .slice(dateMatch[0].length, valueMatch.index)
        .replace(/\s+/g, " ")
        .replace(/^(Data e hora|Categoria|Transação|Descrição|Valor)\s*/i, "")
        .trim();

      // Saldo Diário não é lançamento e não deve aparecer para categorização.
      if (descricao && !/saldo\s+di[áa]rio/i.test(descricao) && !isNaN(valor)) {
        transactions.push({ data: date, descricao, valor });
      }
    });

    // Se não encontrou transações ou descrições parecem ruins, retornar vazio
    // para que a rota possa informar claramente o usuário.
    if (transactions.length === 0) {
      return [];
    }

    // Verificar se as descrições são muito repetitivas (sinal de má extração)
    const uniqueDescs = new Set(transactions.map((t) => t.descricao));
    if (uniqueDescs.size < transactions.length * 0.3) {
      // Menos de 30% de descrições únicas - provavelmente extração ruim
      return [];
    }

    return transactions;
  } catch (error) {
    console.error("Erro ao parsear PDF:", error);
    return [];
  }
}

export async function parseCSV(buffer: Buffer): Promise<RawTransaction[]> {
  return new Promise((resolve, reject) => {
    const text = buffer.toString("utf-8");

    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const transactions: RawTransaction[] = [];

        results.data.forEach((row: any) => {
          // Tentar identificar colunas automaticamente
          const keys = Object.keys(row);

          let data = "";
          let descricao = "";
          let valor = 0;

          keys.forEach((key) => {
            const value = row[key]?.toString().trim() || "";
            const keyLower = key.toLowerCase();

            // Data
            if (keyLower.includes("data") || keyLower.includes("date")) {
              data = value;
            }
            // Valor
            else if (
              keyLower.includes("valor") ||
              keyLower.includes("value") ||
              keyLower.includes("amount") ||
              keyLower.includes("saldo")
            ) {
              const numValue = parseFloat(
                value.replace(/\./g, "").replace(",", "."),
              );
              if (!isNaN(numValue)) valor = numValue;
            }
            // Descrição (se não for data nem valor)
            else if (!data || !descricao) {
              descricao = value;
            }
          });

          // Se não encontrou colunas específicas, tentar heurística
          if (!data || !descricao) {
            const values = Object.values(row);
            values.forEach((v: any) => {
              const str = v?.toString().trim() || "";
              if (str.match(/\d{2}[-\/]\d{2}[-\/]\d{4}/)) {
                data = str;
              } else if (str.match(/[-+]?\s*[\d.,]+,\d{2}/)) {
                const numValue = parseFloat(
                  str.replace(/\./g, "").replace(",", "."),
                );
                if (!isNaN(numValue)) valor = numValue;
              } else if (str.length > 3) {
                descricao = str;
              }
            });
          }

          if (data && descricao && valor !== 0) {
            transactions.push({ data, descricao, valor });
          }
        });

        resolve(transactions);
      },
      error: (error: Error) => {
        reject(error);
      },
    });
  });
}

export async function parseOFX(buffer: Buffer): Promise<RawTransaction[]> {
  const text = buffer.toString("utf-8");
  const transactions: RawTransaction[] = [];

  // Parser simples de OFX (formato SGML)
  const lines = text.split("\n");
  let currentTransaction: Partial<RawTransaction> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("<STMTTRN>")) {
      currentTransaction = {};
    } else if (trimmed.startsWith("<DTPOSTED>")) {
      // OFX usa formato YYYYMMDD
      const dateStr = trimmed
        .replace("<DTPOSTED>", "")
        .replace("</DTPOSTED>", "");
      if (dateStr.length === 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        currentTransaction.data = `${day}/${month}/${year}`;
      }
    } else if (trimmed.startsWith("<NAME>")) {
      currentTransaction.descricao = trimmed
        .replace("<NAME>", "")
        .replace("</NAME>", "")
        .trim();
    } else if (trimmed.startsWith("<TRNAMT>")) {
      const valueStr = trimmed.replace("<TRNAMT>", "").replace("</TRNAMT>", "");
      const valor = parseFloat(valueStr);
      if (!isNaN(valor)) {
        currentTransaction.valor = valor;
      }
    } else if (trimmed.startsWith("</STMTTRN>")) {
      if (
        currentTransaction.data &&
        currentTransaction.descricao &&
        currentTransaction.valor !== undefined
      ) {
        transactions.push({
          data: currentTransaction.data!,
          descricao: currentTransaction.descricao!,
          valor: currentTransaction.valor!,
        });
      }
      currentTransaction = {};
    }
  }

  return transactions;
}

export async function parseXLSX(
  buffer: ArrayBuffer,
): Promise<RawTransaction[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const transactions: RawTransaction[] = [];

  // Usar a primeira aba que tiver dados
  const worksheet = workbook.worksheets.find(
    (ws: ExcelJS.Worksheet) => ws.rowCount > 1,
  );
  if (!worksheet) return [];

  // Identificar colunas
  let dateCol = -1;
  let descCol = -1;
  let valueCol = -1;

  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
    const value = cell.value?.toString().toLowerCase() || "";

    if (value.includes("data") || value.includes("date")) {
      dateCol = colNumber;
    } else if (
      value.includes("descri") ||
      value.includes("histórico") ||
      value.includes("descricao")
    ) {
      descCol = colNumber;
    } else if (
      value.includes("valor") ||
      value.includes("value") ||
      value.includes("amount")
    ) {
      valueCol = colNumber;
    }
  });

  // Se não encontrou por nome, tentar heurística
  if (dateCol === -1 || descCol === -1 || valueCol === -1) {
    const sampleRow = worksheet.getRow(2);
    sampleRow.eachCell((cell: ExcelJS.Cell, colNumber: number) => {
      const value = cell.value?.toString() || "";

      if (value.match(/\d{2}[-\/]\d{2}[-\/]\d{4}/) && dateCol === -1) {
        dateCol = colNumber;
      } else if (value.match(/[-+]?\s*[\d.,]+,\d{2}/) && valueCol === -1) {
        valueCol = colNumber;
      } else if (value.length > 5 && descCol === -1) {
        descCol = colNumber;
      }
    });
  }

  // Extrair transações
  worksheet.eachRow((row: ExcelJS.Row, rowNumber: number) => {
    if (rowNumber > 1) {
      let data = "";
      let descricao = "";
      let valor = 0;

      if (dateCol > 0) {
        const cell = row.getCell(dateCol);
        data = cell.value?.toString() || "";
      }

      if (descCol > 0) {
        const cell = row.getCell(descCol);
        descricao = cell.value?.toString() || "";
      }

      if (valueCol > 0) {
        const cell = row.getCell(valueCol);
        const valueStr = cell.value?.toString() || "";
        valor = parseFloat(valueStr.replace(/\./g, "").replace(",", "."));
      }

      if (data && descricao && !isNaN(valor) && valor !== 0) {
        transactions.push({ data, descricao, valor });
      }
    }
  });

  return transactions;
}

export async function parseFile(
  buffer: Buffer,
  filename: string,
): Promise<RawTransaction[]> {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  switch (ext) {
    case "pdf":
      return parsePDF(buffer);
    case "csv":
      return parseCSV(buffer);
    case "ofx":
      return parseOFX(buffer);
    case "xlsx":
    case "xls":
      return parseXLSX(new Uint8Array(buffer).buffer);
    default:
      throw new Error(`Formato de arquivo não suportado: ${ext}`);
  }
}

export function removeDuplicates(
  transactions: RawTransaction[],
): RawTransaction[] {
  const seen = new Set<string>();
  const unique: RawTransaction[] = [];

  transactions.forEach((t) => {
    const key = `${t.data}-${t.descricao}-${t.valor}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  });

  return unique;
}
