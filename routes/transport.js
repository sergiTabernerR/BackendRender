// routes/transport.js
const express = require("express");
const router = express.Router();
const sql = require("mssql");
const poolPromise = require("../dbpool");

// Helpers
const toInt = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const norm = (v) => (v ?? "").toString().trim();

//
// GET /api/transport/xofers?empresa=1&q=pe&limit=50
//
router.get("/xofers", async (req, res) => {
  const empresa = toInt(req.query.empresa, 1);
  const q = norm(req.query.q);
  const limit = Math.min(toInt(req.query.limit, 200), 1000); // hard cap

  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.input("empresa", sql.SmallInt, empresa);
    request.input("q", sql.NVarChar(100), q);
    request.input("limit", sql.Int, limit);

    const result = await request.query(`
      SELECT DISTINCT TOP (@limit)
        NombreCliPro
      FROM dbo.ConductoresXofers WITH (NOLOCK)
      WHERE CodigoEmpresa = @empresa
        AND NombreCliPro IS NOT NULL
        AND LTRIM(RTRIM(NombreCliPro)) <> ''
        AND (@q = '' OR NombreCliPro LIKE @q + '%')
      ORDER BY NombreCliPro ASC;
    `);

    res.json(result.recordset); // [{ NombreCliPro: "..." }, ...]
  } catch (err) {
    console.error("❌ Error GET /xofers:", err);
    res.status(500).json({ error: "Error obteniendo xofers" });
  }
});

//
// GET /api/transport/tractoras?empresa=1&q=99&limit=50
//
router.get("/tractoras", async (req, res) => {
  const empresa = toInt(req.query.empresa, 1);
  const q = norm(req.query.q);
  const limit = Math.min(toInt(req.query.limit, 200), 1000);

  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.input("empresa", sql.SmallInt, empresa);
    request.input("q", sql.VarChar(20), q);
    request.input("limit", sql.Int, limit);

    const result = await request.query(`
      SELECT DISTINCT TOP (@limit)
        Matricula
      FROM dbo.Tractoras WITH (NOLOCK)
      WHERE CodigoEmpresa = @empresa
        AND Matricula IS NOT NULL
        AND LTRIM(RTRIM(Matricula)) <> ''
        AND (@q = '' OR Matricula LIKE @q + '%')
      ORDER BY Matricula ASC;
    `);

    res.json(result.recordset); // [{ Matricula: "9961-GWY" }, ...]
  } catch (err) {
    console.error("❌ Error GET /tractoras:", err);
    res.status(500).json({ error: "Error obteniendo tractoras" });
  }
});

//
// GET /api/transport/remolques?empresa=1&q=R-&limit=50
//
router.get("/remolques", async (req, res) => {
  const empresa = toInt(req.query.empresa, 1);
  const q = norm(req.query.q);
  const limit = Math.min(toInt(req.query.limit, 200), 1000);

  try {
    const pool = await poolPromise;
    const request = pool.request();
    request.input("empresa", sql.SmallInt, empresa);
    request.input("q", sql.VarChar(20), q);
    request.input("limit", sql.Int, limit);

    const result = await request.query(`
      SELECT DISTINCT TOP (@limit)
        Matricula
      FROM dbo.Remolques WITH (NOLOCK)
      WHERE CodigoEmpresa = @empresa
        AND Matricula IS NOT NULL
        AND LTRIM(RTRIM(Matricula)) <> ''
        AND (@q = '' OR Matricula LIKE @q + '%')
      ORDER BY Matricula ASC;
    `);

    res.json(result.recordset); // [{ Matricula: "R-3201-BCJ" }, ...]
  } catch (err) {
    console.error("❌ Error GET /remolques:", err);
    res.status(500).json({ error: "Error obteniendo remolques" });
  }
});

module.exports = router;
