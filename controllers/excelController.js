const { generarExcel } = require("../utils/excelExporter");
exports.exportarExcel = async (req, res) => {
  try {
    const buffer = await generarExcel();
    res.setHeader("Content-Disposition", "attachment; filename=planificacion.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    res.status(500).send("Error generando Excel");
  }
};
