const ExcelJS = require('exceljs');

async function analyzeExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./Controle de despesas mensais.xlsx');

  console.log('=== ABAS DO EXCEL ===');
  workbook.eachSheet((worksheet, sheetId) => {
    console.log(`\nAba: ${worksheet.name}`);
    console.log(`Linhas: ${worksheet.rowCount}`);
  });

  // Analisar Base Ordinarios
  const ordinarios = workbook.getWorksheet('Base Ordinarios');
  if (ordinarios) {
    console.log('\n=== BASE ORDINARIOS ===');
    const categorias = new Set();
    const subcategorias = new Set();
    const responsaveis = new Set();
    const formasPgto = new Set();

    let catCol = -1, subCol = -1, respCol = -1, pgtoCol = -1;
    ordinarios.getRow(1).eachCell((cell, colNumber) => {
      const val = cell.value?.toString().toUpperCase();
      if (val === 'CATEGORIA') catCol = colNumber;
      if (val === 'SUBCATEGORIA') subCol = colNumber;
      if (val === 'RESPONSÁVEL') respCol = colNumber;
      if (val === 'FORMA DE PGTO') pgtoCol = colNumber;
    });

    console.log(`Colunas: CATEGORIA=${catCol}, SUBCATEGORIA=${subCol}, RESPONSÁVEL=${respCol}, FORMA PGTO=${pgtoCol}`);

    ordinarios.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        if (catCol > 0) {
          const val = row.getCell(catCol).value;
          if (val) categorias.add(val.toString().trim());
        }
        if (subCol > 0) {
          const val = row.getCell(subCol).value;
          if (val) subcategorias.add(val.toString().trim());
        }
        if (respCol > 0) {
          const val = row.getCell(respCol).value;
          if (val) responsaveis.add(val.toString().trim());
        }
        if (pgtoCol > 0) {
          const val = row.getCell(pgtoCol).value;
          if (val) formasPgto.add(val.toString().trim());
        }
      }
    });

    console.log('\nCATEGORIAS:', Array.from(categorias));
    console.log('\nSUBCATEGORIAS:', Array.from(subcategorias));
    console.log('\nRESPONSÁVEIS:', Array.from(responsaveis));
    console.log('\nFORMAS DE PGTO:', Array.from(formasPgto));
  }

  // Analisar Base Extraordinarios
  const extraordinarios = workbook.getWorksheet('Base Extraordinarios');
  if (extraordinarios) {
    console.log('\n=== BASE EXTRAORDINARIOS ===');
    const categorias = new Set();
    const subcategorias = new Set();
    const responsaveis = new Set();

    let catCol = -1, subCol = -1, respCol = -1;
    extraordinarios.getRow(1).eachCell((cell, colNumber) => {
      const val = cell.value?.toString().toUpperCase();
      if (val === 'CATEGORIA') catCol = colNumber;
      if (val === 'SUBCATEGORIA') subCol = colNumber;
      if (val === 'RESPONSÁVEL') respCol = colNumber;
    });

    extraordinarios.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        if (catCol > 0) {
          const val = row.getCell(catCol).value;
          if (val) categorias.add(val.toString().trim());
        }
        if (subCol > 0) {
          const val = row.getCell(subCol).value;
          if (val) subcategorias.add(val.toString().trim());
        }
        if (respCol > 0) {
          const val = row.getCell(respCol).value;
          if (val) responsaveis.add(val.toString().trim());
        }
      }
    });

    console.log('\nCATEGORIAS:', Array.from(categorias));
    console.log('\nSUBCATEGORIAS:', Array.from(subcategorias));
    console.log('\nRESPONSÁVEIS:', Array.from(responsaveis));
  }

  // Analisar Base Bioenergia
  const bioenergia = workbook.getWorksheet('Base Bioenergia');
  if (bioenergia) {
    console.log('\n=== BASE BIOENERGIA ===');
    const categorias = new Set();
    const subcategorias = new Set();

    let catCol = -1, subCol = -1;
    bioenergia.getRow(1).eachCell((cell, colNumber) => {
      const val = cell.value?.toString().toUpperCase();
      if (val === 'CATEGORIA') catCol = colNumber;
      if (val === 'SUBCATEGORIA') subCol = colNumber;
    });

    bioenergia.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        if (catCol > 0) {
          const val = row.getCell(catCol).value;
          if (val) categorias.add(val.toString().trim());
        }
        if (subCol > 0) {
          const val = row.getCell(subCol).value;
          if (val) subcategorias.add(val.toString().trim());
        }
      }
    });

    console.log('\nCATEGORIAS:', Array.from(categorias));
    console.log('\nSUBCATEGORIAS:', Array.from(subcategorias));
  }
}

analyzeExcel().catch(console.error);
