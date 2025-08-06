const express = require("express");
const router = express.Router();
const { exportarExcel } = require("../controllers/excelController");
router.get("/exportar", exportarExcel);
module.exports = router;
