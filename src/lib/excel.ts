import ExcelJS from "exceljs";
import { put, head } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";

export interface Transaction {
  data: string;
  categoria: string;
  subcategoria: string;
  descricao: string;
  responsavel?: string;
  forma_pgto?: string;
  valor: number;
}

export interface SheetConfig {
  name: string;
  columns: string[];
}

const SHEET_CONFIGS: Record<string, SheetConfig> = {
  ordinarios: {
    name: "Base Ordinarios",
    columns: [
      "DATA",
      "CATEGORIA",
      "SUBCATEGORIA",
      "DESCRIÇÃO",
      "RESPONSÁVEL",
      "FORMA DE PGTO",
      "VALOR",
    ],
  },
  extraordinarios: {
    name: "Base Extraordinarios",
    columns: [
      "DATA",
      "CATEGORIA",
      "SUBCATEGORIA",
      "DESCRIÇÃO",
      "RESPONSÁVEL",
      "VALOR",
    ],
  },
  bioenergia: {
    name: "Base Bioenergia",
    columns: ["DATA", "CATEGORIA", "SUBCATEGORIA", "DESCRIÇÃO", "VALOR"],
  },
};

const LOCAL_MASTER_PATH = path.join(process.cwd(), "master.xlsx");
const USE_LOCAL_STORAGE = !process.env.BLOB_READ_WRITE_TOKEN;

export async function downloadMasterExcel(): Promise<ExcelJS.Workbook> {
  try {
    // Usar armazenamento local se não tiver token Blob configurado
    if (USE_LOCAL_STORAGE) {
      if (!fs.existsSync(LOCAL_MASTER_PATH)) {
        throw new Error(
          "Arquivo mestre local não encontrado. Faça upload via /api/upload-master",
        );
      }
      const buffer = fs.readFileSync(LOCAL_MASTER_PATH);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ),
      );
      return workbook;
    }

    // Usar Blob Storage em produção
    const blob = await head("master.xlsx");
    const response = await fetch(blob.url);
    const arrayBuffer = await response.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    return workbook;
  } catch (error) {
    throw new Error(
      "Erro ao baixar arquivo mestre: " +
        (error instanceof Error ? error.message : "Erro desconhecido"),
    );
  }
}

export async function uploadMasterExcel(
  workbook: ExcelJS.Workbook,
): Promise<void> {
  const buffer = await workbook.xlsx.writeBuffer();

  // Usar armazenamento local se não tiver token Blob configurado
  if (USE_LOCAL_STORAGE) {
    fs.writeFileSync(LOCAL_MASTER_PATH, Buffer.from(buffer));
    return;
  }

  // Usar Blob Storage em produção
  await put("master.xlsx", buffer, {
    access: "public",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function extractUniqueValues(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  columnName: string,
): string[] {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) return [];

  const values = new Set<string>();
  const headerRow = worksheet.getRow(1);

  let columnIndex = -1;
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value?.toString().toUpperCase() === columnName.toUpperCase()) {
      columnIndex = colNumber;
    }
  });

  if (columnIndex === -1) return [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const cell = row.getCell(columnIndex);
      if (cell.value) {
        values.add(cell.value.toString().trim());
      }
    }
  });

  return Array.from(values).filter((v) => v && v !== "");
}

export function extractCategoryMapping(
  workbook: ExcelJS.Workbook,
  sheetName: string,
): Map<string, string[]> {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) return new Map();

  const mapping = new Map<string, Set<string>>();

  let catCol = -1;
  let subCol = -1;
  const headerRow = worksheet.getRow(1);

  headerRow.eachCell((cell, colNumber) => {
    const value = cell.value?.toString().toUpperCase();
    if (value === "CATEGORIA") catCol = colNumber;
    if (value === "SUBCATEGORIA") subCol = colNumber;
  });

  if (catCol === -1 || subCol === -1) return new Map();

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const catCell = row.getCell(catCol);
      const subCell = row.getCell(subCol);

      if (catCell.value && subCell.value) {
        const category = catCell.value.toString().trim();
        const subcategory = subCell.value.toString().trim();

        if (category && subcategory) {
          if (!mapping.has(category)) {
            mapping.set(category, new Set());
          }
          mapping.get(category)!.add(subcategory);
        }
      }
    }
  });

  const result = new Map<string, string[]>();
  mapping.forEach((subs, cat) => {
    result.set(cat, Array.from(subs));
  });

  return result;
}

export async function addTransactionsToSheet(
  workbook: ExcelJS.Workbook,
  sheetType: string,
  transactions: Transaction[],
): Promise<ExcelJS.Workbook> {
  const config = SHEET_CONFIGS[sheetType];
  if (!config) {
    throw new Error(`Tipo de aba inválido: ${sheetType}`);
  }

  const worksheet = workbook.getWorksheet(config.name);
  if (!worksheet) {
    throw new Error(`Aba ${config.name} não encontrada no arquivo`);
  }

  // Encontrar a próxima linha vazia
  let nextRow = 2;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber >= nextRow) {
      let hasData = false;
      row.eachCell((cell) => {
        if (
          cell.value !== null &&
          cell.value !== undefined &&
          cell.value !== ""
        ) {
          hasData = true;
        }
      });
      if (hasData) {
        nextRow = rowNumber + 1;
      }
    }
  });

  // Adicionar transações
  transactions.forEach((transaction, index) => {
    const row = worksheet.getRow(nextRow + index);

    config.columns.forEach((colName, colIndex) => {
      const cell = row.getCell(colIndex + 1);

      switch (colName.toUpperCase()) {
        case "DATA":
          if (transaction.data && transaction.data !== "COMPLETAR") {
            cell.value = new Date(transaction.data);
          } else {
            cell.value = transaction.data;
          }
          break;
        case "CATEGORIA":
          cell.value = transaction.categoria;
          break;
        case "SUBCATEGORIA":
          cell.value = transaction.subcategoria;
          break;
        case "DESCRIÇÃO":
          cell.value = transaction.descricao;
          break;
        case "RESPONSÁVEL":
          cell.value = transaction.responsavel || "";
          break;
        case "FORMA DE PGTO":
          cell.value = transaction.forma_pgto || "";
          break;
        case "VALOR":
          if (typeof transaction.valor === "number") {
            cell.value = transaction.valor;
            cell.numFmt = "#,##0.00";
          } else {
            cell.value = transaction.valor;
          }
          break;
      }
    });

    row.commit();
  });

  // Marcar pivot tables para atualização
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.isMerged) {
          // Preservar merges
        }
      });
    });
  });

  return workbook;
}

export function getSheetConfig(sheetType: string): SheetConfig {
  const config = SHEET_CONFIGS[sheetType];
  if (!config) {
    throw new Error(`Tipo de aba inválido: ${sheetType}`);
  }
  return config;
}

export function extractRealExamples(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  maxExamples: number = 1200,
): Array<{ descricao: string; categoria: string; subcategoria: string }> {
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) return [];

  const examples: Array<{
    descricao: string;
    categoria: string;
    subcategoria: string;
  }> = [];

  let descCol = -1,
    catCol = -1,
    subCol = -1;

  // Encontrar colunas
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const val = cell.value?.toString().toUpperCase();
    if (val === "DESCRIÇÃO" || val === "DESCRICAO") descCol = colNumber;
    if (val === "CATEGORIA") catCol = colNumber;
    if (val === "SUBCATEGORIA") subCol = colNumber;
  });

  if (descCol === -1 || catCol === -1 || subCol === -1) return [];

  // Extrair exemplos reais sem repetir a mesma descrição mensalmente. Assim o
  // prompt recebe variedade real da planilha, e não centenas de cópias do
  // mesmo lançamento recorrente.
  const byDescription = new Map<string, (typeof examples)[number]>();
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const desc = row.getCell(descCol).value?.toString().trim();
      const cat = row.getCell(catCol).value?.toString().trim();
      const sub = row.getCell(subCol).value?.toString().trim();

      if (desc && cat && sub && desc.length > 3) {
        const key = desc
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
        if (!byDescription.has(key)) {
          byDescription.set(key, {
            descricao: desc,
            categoria: cat,
            subcategoria: sub,
          });
        }
      }
    }
  });

  return Array.from(byDescription.values()).slice(0, maxExamples);
}
