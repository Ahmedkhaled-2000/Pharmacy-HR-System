const MONEY_FMT = '#,##0.00';

const XLSX_COLORS = {
  headerBand: 'FF0B3532',
  jobTag: 'FF134E4A',
  tableHead: 'FF3A6E69',
  subtotal: 'FFE4EEEC',
  bonus: 'FFE4F4EB',
  deduction: 'FFFAEAE8',
  grand: 'FF134E4A',
  border: 'FFCFC9B8',
  white: 'FFFFFFFF',
  text: 'FF1D2624'
};
const THIN_BORDER = { style: 'thin', color: { argb: XLSX_COLORS.border } };
const CELL_BORDER = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };

export const loadExcelJS = async (showToast) => {
  if (window.ExcelJS) return window.ExcelJS;
  if (showToast) showToast('جاري تحميل مكتبة تصدير الإكسل...');
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    s.onload = () => resolve(window.ExcelJS);
    s.onerror = () => reject(new Error('فشل تحميل مكتبة ExcelJS'));
    document.head.appendChild(s);
  });
};

export const mergedTitle = (ws, rowIdx, text, cols, fillArgb, fontSize, height) => {
  ws.mergeCells(rowIdx, 1, rowIdx, cols);
  const cell = ws.getCell(rowIdx, 1);
  cell.value = text;
  cell.font = { name: 'Arial', bold: true, size: fontSize, color: { argb: XLSX_COLORS.white } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rowIdx).height = height;
};

export const tableHeaderRow = (ws, rowIdx, headers, colOffset = 1) => {
  headers.forEach((h, i) => {
    const cell = ws.getCell(rowIdx, colOffset + i);
    cell.value = h;
    cell.font = { name: 'Arial', bold: true, size: 11, color: { argb: XLSX_COLORS.white } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_COLORS.tableHead } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = CELL_BORDER;
  });
  ws.getRow(rowIdx).height = 20;
};

export const dataRow = (ws, rowIdx, values, colOffset = 1, moneyCols = []) => {
  values.forEach((v, i) => {
    const cell = ws.getCell(rowIdx, colOffset + i);
    cell.value = v;
    cell.font = { name: 'Arial', size: 10.5, color: { argb: XLSX_COLORS.text } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = CELL_BORDER;
    if (moneyCols.includes(i)) cell.numFmt = MONEY_FMT;
  });
};
