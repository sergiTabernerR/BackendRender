const ExcelJS = require("exceljs");
exports.generarExcel = async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planificación");
  ws.addRow(["Día", "Fila 1", "Fila 2", "..."]);
  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
};
