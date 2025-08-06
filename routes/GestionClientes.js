const express = require("express");
const router = express.Router();
const multer = require("multer");
const xlsx = require("xlsx");
const sql = require("mssql");
const poolPromise = require("../dbpool");

const upload = multer({ storage: multer.memoryStorage() });
const truncar = (valor, max) => (valor ?? "").toString().trim().substring(0, max);


router.post("/importar", upload.single("archivo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("Archivo no recibido");
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const datos = xlsx.utils.sheet_to_json(sheet, { defval: null });
const datosMapeados = datos.map(fila => ({
CodigoCliente: fila["Cód. cliente"]?.toString().trim() ?? "",
RazonSocial: fila["Razón social"]?.toString().trim() ?? "",
CifDni: fila["CIF/DNI"]?.toString().trim() ?? "",
CodigoContable: fila["Cód. contable"]?.toString().trim() ?? "",
  CodigoEmpresa: 1 // <- Asigna aquí un valor fijo si todos son de la misma empresa
}));
    if (datos.length === 0) return res.status(400).send("El archivo está vacío");

    // Campos fijos que queremos importar
    const columnasDeseadas = [
      "CodigoEmpresa",
      "CifDni",
      "RazonSocial",
      "CodigoContable",
      "CodigoCliente"
    ];

    const pool = await poolPromise;

for (const fila of datosMapeados) {
      const request = pool.request();

      for (const campo of columnasDeseadas) {
        const valor = fila[campo] ?? null;
        request.input(campo, sql.VarChar, valor);
      }

    const upsertQuery = `
  MERGE INTO Clientes AS target
  USING (SELECT 
            @CodigoEmpresa AS CodigoEmpresa,
            @CodigoCliente AS CodigoCliente,
            @CifDni AS CifDni,
            @RazonSocial AS RazonSocial,
            @CodigoContable AS CodigoContable
        ) AS source
  ON target.CodigoEmpresa = source.CodigoEmpresa AND target.CodigoCliente = source.CodigoCliente
  WHEN MATCHED THEN
    UPDATE SET 
      CifDni = source.CifDni,
      RazonSocial = source.RazonSocial,
      CodigoContable = source.CodigoContable
  WHEN NOT MATCHED THEN
    INSERT (CodigoEmpresa, CifDni, RazonSocial, CodigoContable, CodigoCliente)
    VALUES (source.CodigoEmpresa, source.CifDni, source.RazonSocial, source.CodigoContable, source.CodigoCliente);
`;


await request.query(upsertQuery);
    }

res.status(200).json({ success: true, message: "Clientes importados correctamente" });
  } catch (error) {
    console.error("❌ Error al importar clientes:", error);
res.status(500).json({ success: false, message: "Error al importar clientes: " + error.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT CodigoCliente, RazonSocial FROM Clientes
      WHERE RazonSocial IS NOT NULL
    `);
    res.json(result.recordset);
  } catch (error) {
    res.status(500).send("Error al obtener clientes: " + error.message);
  }
});
// En routes/gestionArticulos.js (por ejemplo)
router.get("/articulos", async (req, res) => {
  try {
const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT CodigoArticulo, DescripcionArticulo
      FROM Articulos
    `);
    res.json(result.recordset);
  } catch (error) {
    console.error("Error al obtener artículos:", error);
    res.status(500).send("Error al obtener artículos");
  }
});



router.post("/importarExcelMultiples", upload.array("archivos"), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No se han recibido archivos");
    }
    const pool = await poolPromise;

    for (const file of req.files) {
      const workbook = xlsx.read(file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const datos = xlsx.utils.sheet_to_json(sheet, { defval: null });

      if (file.originalname.toLowerCase().includes("cliente")) {
        const datosMapeados = datos.map(fila => ({
CodigoCliente: fila["Cód. cliente"]?.toString().trim() ?? "",
          RazonSocial: fila["Razón social"],
          CifDni: fila["CIF/DNI"],
          CodigoContable: fila["Cód. contable"],
          CodigoEmpresa: 1 // cambia según necesidad
        }));

    const valuesSql = datosMapeados.map(f => {
  const codigoCliente = typeof f.CodigoCliente === 'string' ? f.CodigoCliente : (f.CodigoCliente?.toString?.() ?? '');
  const razonSocial = (f.RazonSocial ?? '').replace(/'/g, "''");
  const cifDni = (f.CifDni ?? '').replace(/'/g, "''");
  const codigoContable = (f.CodigoContable ?? '').replace(/'/g, "''");

  return `(${f.CodigoEmpresa}, N'${cifDni}', N'${razonSocial}', N'${codigoContable}', N'${codigoCliente}')`;
}).join(",\n");

const mergeSql = `
MERGE INTO Clientes AS target
USING (
  VALUES
    ${valuesSql}
) AS source (CodigoEmpresa, CifDni, RazonSocial, CodigoContable, CodigoCliente)
ON target.CodigoEmpresa = source.CodigoEmpresa AND target.CodigoCliente = source.CodigoCliente
WHEN MATCHED THEN UPDATE SET
  CifDni = source.CifDni,
  RazonSocial = source.RazonSocial,
  CodigoContable = source.CodigoContable
WHEN NOT MATCHED THEN INSERT (
  CodigoEmpresa, CifDni, RazonSocial, CodigoContable, CodigoCliente
) VALUES (
  source.CodigoEmpresa, source.CifDni, source.RazonSocial, source.CodigoContable, source.CodigoCliente
);
`;

await pool.request().query(mergeSql);

      }

      if (file.originalname.toLowerCase().includes("articulo")) {
    const datosMapeados = datos.map(fila => ({
  CodigoArticulo: fila["Artículo"],
  DescripcionArticulo: (fila["Descripción"] || "").toString().trim() || "",
  MarcaProducto: fila["Marca"],
  CodigoAlternativo: fila["Cód. alternativo"],
  CodigoProveedor: (fila["Proveedor habitual"] || "").toString().trim() || "",
CodigoFamilia: (fila["Familia"] || "").toString().trim(),
    CodigoSubfamilia: (fila["Subfamilia"] || "").toString().trim() || "",
        GrupoTalla_: (fila["GrupoTalla_"] || "").toString().trim() || "",
        Colores_: (fila["Colores_"] || "").toString().trim() || "",
  PrecioVenta: fila["Precio venta"] ?? 0,
  FechaAlta: fila["Fecha alta"] ? new Date(fila["Fecha alta"]) : null,
  ObsoletoLc: fila["Obsoleto"] === "Sí" ? 1 : 0,
  TipoArticulo: fila["Tipo artículo"],
    Descripcion2Articulo: (fila["Descripción (cont.)"] || "").toString().trim() || "",
  CodigoEmpresa: 1
}));

     for (const fila of datosMapeados) {
    const request = pool.request();
    request.input("CodigoEmpresa", sql.SmallInt, fila.CodigoEmpresa);
request.input("CodigoArticulo", sql.VarChar, truncar(fila.CodigoArticulo, 20));
request.input("DescripcionArticulo", sql.VarChar, truncar(fila.DescripcionArticulo, 50));
request.input("Descripcion2Articulo", sql.VarChar, truncar(fila.Descripcion2Articulo, 250));
request.input("MarcaProducto", sql.VarChar, truncar(fila.MarcaProducto, 20));
request.input("CodigoAlternativo", sql.VarChar, truncar(fila.CodigoAlternativo, 20));
request.input("CodigoProveedor", sql.VarChar, truncar(fila.CodigoProveedor, 15));
request.input("CodigoFamilia", sql.VarChar, truncar(fila.CodigoFamilia, 10));
request.input("CodigoSubfamilia", sql.VarChar, truncar(fila.CodigoSubfamilia, 10));
request.input("GrupoTalla_", sql.VarChar, truncar(fila.GrupoTalla_, 20));
request.input("Colores_", sql.VarChar, truncar(fila.Colores_, 20));
    request.input("PrecioVenta", sql.Decimal(28, 10), fila.PrecioVenta);
    request.input("FechaAlta", sql.DateTime, fila.FechaAlta);
    request.input("ObsoletoLc", sql.SmallInt, fila.ObsoletoLc);
request.input("TipoArticulo", sql.VarChar, truncar(fila.TipoArticulo, 1));

          const upsertQuery = `
          MERGE INTO Articulos AS target
USING (SELECT 
  @CodigoEmpresa AS CodigoEmpresa,
  @CodigoArticulo AS CodigoArticulo,
  @DescripcionArticulo AS DescripcionArticulo,
  @Descripcion2Articulo AS Descripcion2Articulo,
  @MarcaProducto AS MarcaProducto,
  @CodigoAlternativo AS CodigoAlternativo,
  @CodigoProveedor AS CodigoProveedor,
  @CodigoFamilia AS CodigoFamilia,
  @CodigoSubfamilia AS CodigoSubfamilia,
  @GrupoTalla_ AS GrupoTalla_,
  @Colores_ AS Colores_,
  @PrecioVenta AS PrecioVenta,
  @FechaAlta AS FechaAlta,
  @ObsoletoLc AS ObsoletoLc,
  @TipoArticulo AS TipoArticulo
) AS source
ON target.CodigoEmpresa = source.CodigoEmpresa AND target.CodigoArticulo = source.CodigoArticulo
WHEN MATCHED THEN UPDATE SET 
  DescripcionArticulo = source.DescripcionArticulo,
  Descripcion2Articulo = source.Descripcion2Articulo,
  MarcaProducto = source.MarcaProducto,
  CodigoAlternativo = source.CodigoAlternativo,
  CodigoProveedor = source.CodigoProveedor,
  CodigoFamilia = source.CodigoFamilia,
  CodigoSubfamilia = source.CodigoSubfamilia,
  GrupoTalla_ = source.GrupoTalla_,
  Colores_ = source.Colores_,
  PrecioVenta = source.PrecioVenta,
  FechaAlta = source.FechaAlta,
  ObsoletoLc = source.ObsoletoLc,
  TipoArticulo = source.TipoArticulo
WHEN NOT MATCHED THEN INSERT (
  CodigoEmpresa, CodigoArticulo, DescripcionArticulo, Descripcion2Articulo, MarcaProducto,
  CodigoAlternativo, CodigoProveedor, CodigoFamilia, CodigoSubfamilia, GrupoTalla_,
  Colores_, PrecioVenta, FechaAlta, ObsoletoLc, TipoArticulo
) VALUES (
  source.CodigoEmpresa, source.CodigoArticulo, source.DescripcionArticulo, source.Descripcion2Articulo,
  source.MarcaProducto, source.CodigoAlternativo, source.CodigoProveedor, source.CodigoFamilia,
  source.CodigoSubfamilia, source.GrupoTalla_, source.Colores_, source.PrecioVenta,
  source.FechaAlta, source.ObsoletoLc, source.TipoArticulo
);
          `;

          await request.query(upsertQuery);
        }
      }
    }

    res.status(200).json({ success: true, message: "Archivos importados correctamente" });
  } catch (error) {

    console.error("❌ Error al importar archivos:", error);
    console.error("🧠 Stack:", error.stack);

    res.status(500).json({ success: false, message: "Error al importar archivos: " + error.message });
  }
});




module.exports = router;
