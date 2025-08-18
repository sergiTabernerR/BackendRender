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

// fuera de la ruta, reutilizable
const parseFechaExcel = (raw) => {
  if (raw == null || raw === "" || raw === "-") return null;

  // 1) Serial de Excel (número)
  if (typeof raw === "number") {
    try {
      const d = xlsx.SSF.parse_date_code(raw);
      if (!d || !d.y) return null;
      // cuidado: meses base 0
      const dt = new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1, d.H || 0, d.M || 0, Math.floor(d.S || 0)));
      return isNaN(dt.getTime()) ? null : dt;
    } catch { return null; }
  }

  // 2) Texto — normaliza separadores y orden
  const s = String(raw).trim();

  // yyyy-mm-dd o ISO
  const tISO = Date.parse(s);
  if (!isNaN(tISO)) return new Date(tISO);

  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const y = parseInt(m[3].length === 2 ? "20" + m[3] : m[3], 10);
    const dt = new Date(Date.UTC(y, mo, d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  return null; // no reconocida
};

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

      // === CLIENTES ===
      if (file.originalname.toLowerCase().includes("cliente")) {
        const datosMapeados = datos.map(fila => ({
          CodigoCliente: fila["Cód. cliente"]?.toString().trim() ?? "",
          RazonSocial: fila["Razón social"],
          CifDni: fila["CIF/DNI"],
          CodigoContable: fila["Cód. contable"],
          CodigoEmpresa: 1
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

      // === ARTÍCULOS ===
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
  PrecioVenta: (() => {
    const v = fila["Precio venta"];
    if (v == null || v === "") return 0;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  })(),
  FechaAlta: parseFechaExcel(fila["Fecha alta"] ?? fila["Fecha Alta"]),
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
request.input("FechaAlta", sql.DateTime, fila.FechaAlta || null);
          request.input("ObsoletoLc", sql.SmallInt, fila.ObsoletoLc);
          request.input("TipoArticulo", sql.VarChar, truncar(fila.TipoArticulo, 1));
if (fila["Fecha alta"] && !fila.FechaAlta) {
  console.warn(`FechaAlta inválida en Artículos -> "${fila["Fecha alta"]}" (fila Excel ${i+2})`);
}

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

      // === CONDUCTORES / XOFERS ===
      if (
        file.originalname.toLowerCase().includes("xofer") ||
        file.originalname.toLowerCase().includes("conductor")
      ) {
        const clean = (v, max) => (v ?? "").toString().trim().substring(0, max ?? 9999);
        const parseFecha = (raw) => {
          if (raw == null || raw === "") return null;
          if (typeof raw === "number") {
            try {
              const d = xlsx.SSF.parse_date_code(raw);
              if (!d) return null;
              return new Date(Date.UTC(d.y, (d.m || 1) - 1, d.d || 1));
            } catch { return null; }
          }
          const t = Date.parse(raw);
          return isNaN(t) ? null : new Date(t);
        };

        const datosMapeados = datos.map(r => ({
          CodigoEmpresa: 1,
          IdConductor: clean(r["IdConductor"], 20),

          NombreCliPro: clean(r["Nombre cli/pro."], 100),
          IdentificacionInterna: clean(r["Identificacion Interna"], 50),
          Etiquetas: clean(r["Etiquetas"], 200),
          Telefono1: clean(r["Teléfono"], 20),
          Telefono2: clean(r["Teléfono 2"], 20),
          Domicilio: clean(r["Domicilio"], 150),
          CodigoPostal: clean(r["Cód. postal"], 10),
          Municipio: clean(r["Municipio"], 80),
          SiglaNacion: clean(r["Sigla nación"], 2),

          NumeroLicenciaConducir: clean(r["NumeroLicencia Conducir"], 50),
          FechaVencimientoLicencia: parseFecha(r["FechaVencimientoLicenciaConducir"]),
          NumeroCertificadoADR: clean(r["Numero Certificado ADR"], 50),
          TipoCertificadoADR: clean(r["Tipo Certificado ADR"], 50),
          FechaVencimientoCertADR: parseFecha(r["Fecha de Vencimiento del Certivicad"]),
          FechaLimiteLicenciaOper: parseFecha(r["Fecha limite de la licencia de oper"]),

          NumeroTarjetaConductor: clean(r["NumeroTarjetaConductor"], 50),
          FechaVencimientoTarjeta: parseFecha(r["Fecha de vencimiento de la tarjeta "]),
          NumeroTarjetaCalificacion: clean(r["Numero de tarjeta de calificación"], 50),
          FechaCaducidadTarjetaCalif: parseFecha(r["Fecha de Caducidad de la tarjeta de"]),

          FechaObtencionCodigo95: parseFecha(r["Fecha Obtencion Codigo 95"]),
          FechaVencimientoChequeoMed: parseFecha(r["Fecha de Vencimiento del chequeo mé"]),

          Tipo: clean(r["Tipo"], 40),
          PreferenciaComunicacion: clean(r["Preferencia de Comunicación"], 40),
        })).filter(x => x.IdConductor);

        for (const f of datosMapeados) {
          const req = pool.request();
          req.input("CodigoEmpresa", sql.SmallInt, f.CodigoEmpresa);
          req.input("IdConductor", sql.VarChar(20), f.IdConductor);

          req.input("NombreCliPro", sql.NVarChar(100), f.NombreCliPro);
          req.input("IdentificacionInterna", sql.NVarChar(50), f.IdentificacionInterna);
          req.input("Etiquetas", sql.NVarChar(200), f.Etiquetas);
          req.input("Telefono1", sql.NVarChar(20), f.Telefono1);
          req.input("Telefono2", sql.NVarChar(20), f.Telefono2);
          req.input("Domicilio", sql.NVarChar(150), f.Domicilio);
          req.input("CodigoPostal", sql.NVarChar(10), f.CodigoPostal);
          req.input("Municipio", sql.NVarChar(80), f.Municipio);
          req.input("SiglaNacion", sql.NVarChar(2), f.SiglaNacion);

          req.input("NumeroLicenciaConducir", sql.NVarChar(50), f.NumeroLicenciaConducir);
          req.input("FechaVencimientoLicencia", sql.Date, f.FechaVencimientoLicencia);
          req.input("NumeroCertificadoADR", sql.NVarChar(50), f.NumeroCertificadoADR);
          req.input("TipoCertificadoADR", sql.NVarChar(50), f.TipoCertificadoADR);
          req.input("FechaVencimientoCertADR", sql.Date, f.FechaVencimientoCertADR);
          req.input("FechaLimiteLicenciaOper", sql.Date, f.FechaLimiteLicenciaOper);

          req.input("NumeroTarjetaConductor", sql.NVarChar(50), f.NumeroTarjetaConductor);
          req.input("FechaVencimientoTarjeta", sql.Date, f.FechaVencimientoTarjeta);
          req.input("NumeroTarjetaCalificacion", sql.NVarChar(50), f.NumeroTarjetaCalificacion);
          req.input("FechaCaducidadTarjetaCalif", sql.Date, f.FechaCaducidadTarjetaCalif);

          req.input("FechaObtencionCodigo95", sql.Date, f.FechaObtencionCodigo95);
          req.input("FechaVencimientoChequeoMed", sql.Date, f.FechaVencimientoChequeoMed);

          req.input("Tipo", sql.NVarChar(40), f.Tipo);
          req.input("PreferenciaComunicacion", sql.NVarChar(40), f.PreferenciaComunicacion);

          const upsertConductores = `
MERGE dbo.ConductoresXofers AS target
USING (SELECT
  @CodigoEmpresa AS CodigoEmpresa,
  @IdConductor AS IdConductor,
  @NombreCliPro AS NombreCliPro,
  @IdentificacionInterna AS IdentificacionInterna,
  @Etiquetas AS Etiquetas,
  @Telefono1 AS Telefono1,
  @Telefono2 AS Telefono2,
  @Domicilio AS Domicilio,
  @CodigoPostal AS CodigoPostal,
  @Municipio AS Municipio,
  @SiglaNacion AS SiglaNacion,
  @NumeroLicenciaConducir AS NumeroLicenciaConducir,
  @FechaVencimientoLicencia AS FechaVencimientoLicencia,
  @NumeroCertificadoADR AS NumeroCertificadoADR,
  @TipoCertificadoADR AS TipoCertificadoADR,
  @FechaVencimientoCertADR AS FechaVencimientoCertADR,
  @FechaLimiteLicenciaOper AS FechaLimiteLicenciaOper,
  @NumeroTarjetaConductor AS NumeroTarjetaConductor,
  @FechaVencimientoTarjeta AS FechaVencimientoTarjeta,
  @NumeroTarjetaCalificacion AS NumeroTarjetaCalificacion,
  @FechaCaducidadTarjetaCalif AS FechaCaducidadTarjetaCalif,
  @FechaObtencionCodigo95 AS FechaObtencionCodigo95,
  @FechaVencimientoChequeoMed AS FechaVencimientoChequeoMed,
  @Tipo AS Tipo,
  @PreferenciaComunicacion AS PreferenciaComunicacion
) AS source
ON target.CodigoEmpresa = source.CodigoEmpresa
AND target.IdConductor = source.IdConductor
WHEN MATCHED THEN UPDATE SET
  NombreCliPro = source.NombreCliPro,
  IdentificacionInterna = source.IdentificacionInterna,
  Etiquetas = source.Etiquetas,
  Telefono1 = source.Telefono1,
  Telefono2 = source.Telefono2,
  Domicilio = source.Domicilio,
  CodigoPostal = source.CodigoPostal,
  Municipio = source.Municipio,
  SiglaNacion = source.SiglaNacion,
  NumeroLicenciaConducir = source.NumeroLicenciaConducir,
  FechaVencimientoLicencia = source.FechaVencimientoLicencia,
  NumeroCertificadoADR = source.NumeroCertificadoADR,
  TipoCertificadoADR = source.TipoCertificadoADR,
  FechaVencimientoCertADR = source.FechaVencimientoCertADR,
  FechaLimiteLicenciaOper = source.FechaLimiteLicenciaOper,
  NumeroTarjetaConductor = source.NumeroTarjetaConductor,
  FechaVencimientoTarjeta = source.FechaVencimientoTarjeta,
  NumeroTarjetaCalificacion = source.NumeroTarjetaCalificacion,
  FechaCaducidadTarjetaCalif = source.FechaCaducidadTarjetaCalif,
  FechaObtencionCodigo95 = source.FechaObtencionCodigo95,
  FechaVencimientoChequeoMed = source.FechaVencimientoChequeoMed,
  Tipo = source.Tipo,
  PreferenciaComunicacion = source.PreferenciaComunicacion
WHEN NOT MATCHED THEN INSERT (
  CodigoEmpresa, IdConductor,
  NombreCliPro, IdentificacionInterna, Etiquetas, Telefono1, Telefono2,
  Domicilio, CodigoPostal, Municipio, SiglaNacion,
  NumeroLicenciaConducir, FechaVencimientoLicencia, NumeroCertificadoADR, TipoCertificadoADR,
  FechaVencimientoCertADR, FechaLimiteLicenciaOper,
  NumeroTarjetaConductor, FechaVencimientoTarjeta, NumeroTarjetaCalificacion, FechaCaducidadTarjetaCalif,
  FechaObtencionCodigo95, FechaVencimientoChequeoMed,
  Tipo, PreferenciaComunicacion
) VALUES (
  source.CodigoEmpresa, source.IdConductor,
  source.NombreCliPro, source.IdentificacionInterna, source.Etiquetas, source.Telefono1, source.Telefono2,
  source.Domicilio, source.CodigoPostal, source.Municipio, source.SiglaNacion,
  source.NumeroLicenciaConducir, source.FechaVencimientoLicencia, source.NumeroCertificadoADR, source.TipoCertificadoADR,
  source.FechaVencimientoCertADR, source.FechaLimiteLicenciaOper,
  source.NumeroTarjetaConductor, source.FechaVencimientoTarjeta, source.NumeroTarjetaCalificacion, source.FechaCaducidadTarjetaCalif,
  source.FechaObtencionCodigo95, source.FechaVencimientoChequeoMed,
  source.Tipo, source.PreferenciaComunicacion
);
`;
          await req.query(upsertConductores);
        }
      }
// === REMOLQUES ===
if (
  file.originalname.toLowerCase().includes("remolque") ||
  file.originalname.toLowerCase().includes("trailer")
) {
  const clean = (v, max) =>
    (v ?? "").toString().trim().substring(0, max ?? 9999);

  const toBit = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (["verdadero","true","sí","si","1","x","y","yes"].includes(s)) return 1;
    if (["falso","false","no","0",""].includes(s)) return 0;
    if (raw === true) return 1;
    if (raw === false) return 0;
    return null;
  };

  const toInt = (raw) => {
    if (raw == null || raw === "") return null;
    const n = Number(String(raw).replace(",", "."));
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  // Función para normalizar cabeceras
  const normalize = (s) =>
    (s || "")
      .toString()
      .normalize("NFD")                // elimina tildes
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "i")           // arregla comillas raras
      .trim()
      .toLowerCase();

  // Normalizar todas las filas antes de mapear
  const rows = datos.map((row) => {
    const normalizado = {};
    for (const [k, v] of Object.entries(row)) {
      normalizado[normalize(k)] = v;
    }
    return normalizado;
  });

  const mapeados = rows
    .map((r) => ({
      CodigoEmpresa: 1,
      Matricula:    clean(r["matricula"], 20),
      Marca:        clean(r["marca"], 50),
      Modelo:       clean(r["model"] ?? r["modelo"], 50),
      RemolqActual: toBit(r["remolq actual"]),
      RemolqSimon:  toBit(r["remolq simon"]),
      CREM:         toInt(r["crem"]),
      Portabobines: toBit(r["portabobines"]),
      Elevable:     toBit(r["elevable"]),
    }))
    .filter((x) => x.Matricula); // exige matrícula

  for (const f of mapeados) {
    const req = pool.request();
    req.input("CodigoEmpresa", sql.SmallInt, f.CodigoEmpresa);
    req.input("Matricula", sql.VarChar(20), f.Matricula);
    req.input("Marca", sql.NVarChar(50), f.Marca);
    req.input("Modelo", sql.NVarChar(50), f.Modelo);
    req.input("RemolqActual", sql.Bit, f.RemolqActual);
    req.input("RemolqSimon", sql.Bit, f.RemolqSimon);
    req.input("CREM", sql.Int, f.CREM);
    req.input("Portabobines", sql.Bit, f.Portabobines);
    req.input("Elevable", sql.Bit, f.Elevable);

    const upsertRemolque = `
MERGE dbo.Remolques AS target
USING (SELECT
  @CodigoEmpresa AS CodigoEmpresa,
  @Matricula AS Matricula,
  @Marca AS Marca,
  @Modelo AS Modelo,
  @RemolqActual AS RemolqActual,
  @RemolqSimon AS RemolqSimon,
  @CREM AS CREM,
  @Portabobines AS Portabobines,
  @Elevable AS Elevable
) AS source
ON target.CodigoEmpresa = source.CodigoEmpresa
AND target.Matricula = source.Matricula
WHEN MATCHED THEN UPDATE SET
  Marca = source.Marca,
  Modelo = source.Modelo,
  RemolqActual = source.RemolqActual,
  RemolqSimon = source.RemolqSimon,
  CREM = source.CREM,
  Portabobines = source.Portabobines,
  Elevable = source.Elevable
WHEN NOT MATCHED THEN INSERT (
  CodigoEmpresa, Matricula, Marca, Modelo, RemolqActual, RemolqSimon, CREM, Portabobines, Elevable
) VALUES (
  source.CodigoEmpresa, source.Matricula, source.Marca, source.Modelo,
  source.RemolqActual, source.RemolqSimon, source.CREM, source.Portabobines, source.Elevable
);
`;
    await req.query(upsertRemolque);
  }
}

// === TRACTORAS ===
if (
  file.originalname.toLowerCase().includes("tractora") ||
  file.originalname.toLowerCase().includes("tractor")
) {
  const clean = (v, max) => (v ?? "").toString().trim().substring(0, max ?? 9999);
  const toBit = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (["verdadero","true","sí","si","1","x","y","yes"].includes(s)) return 1;
    if (["falso","false","no","0",""].includes(s)) return 0;
    if (raw === true) return 1;
    if (raw === false) return 0;
    return null;
  };
  const toInt = (raw) => {
    if (raw == null || String(raw).trim() === "") return null;
    const n = Number(String(raw).replace(",", "."));
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  // Encabezados esperados:
  // Matrícula;Marca;Model;Tract Actual;Tract Simon;CVTRA;Romano
  const rows = datos; // ya parseado arriba
  const mapeados = rows.map(r => ({
    CodigoEmpresa: 1,
    Matricula:   clean(r["Matrícula"] ?? r["Matricula"], 20),
    Marca:       clean(r["Marca"], 50),
    Modelo:      clean(r["Model"] ?? r["Modelo"], 50),
    TractActual: toBit(r["Tract Actual"]),
    TractSimon:  toBit(r["Tract Simon"]),
    CVTRA:       toInt(r["CVTRA"]),
    Romano:      toBit(r["Romano"]),
  })).filter(x => x.Matricula);

  for (const f of mapeados) {
    const req = pool.request();
    req.input("CodigoEmpresa", sql.SmallInt, f.CodigoEmpresa);
    req.input("Matricula", sql.VarChar(20), f.Matricula);
    req.input("Marca", sql.NVarChar(50), f.Marca);
    req.input("Modelo", sql.NVarChar(50), f.Modelo);
    req.input("TractActual", sql.Bit, f.TractActual);
    req.input("TractSimon", sql.Bit, f.TractSimon);
    req.input("CVTRA", sql.Int, f.CVTRA);
    req.input("Romano", sql.Bit, f.Romano);

    const upsertTractoras = `
MERGE dbo.Tractoras AS target
USING (SELECT
  @CodigoEmpresa AS CodigoEmpresa,
  @Matricula AS Matricula,
  @Marca AS Marca,
  @Modelo AS Modelo,
  @TractActual AS TractActual,
  @TractSimon AS TractSimon,
  @CVTRA AS CVTRA,
  @Romano AS Romano
) AS source
ON target.CodigoEmpresa = source.CodigoEmpresa
AND target.Matricula = source.Matricula
WHEN MATCHED THEN UPDATE SET
  Marca = source.Marca,
  Modelo = source.Modelo,
  TractActual = source.TractActual,
  TractSimon = source.TractSimon,
  CVTRA = source.CVTRA,
  Romano = source.Romano
WHEN NOT MATCHED THEN INSERT (
  CodigoEmpresa, Matricula, Marca, Modelo, TractActual, TractSimon, CVTRA, Romano
) VALUES (
  source.CodigoEmpresa, source.Matricula, source.Marca, source.Modelo,
  source.TractActual, source.TractSimon, source.CVTRA, source.Romano
);
`;
    await req.query(upsertTractoras);
  }
}

      
    } // <-- fin del for de archivos

    res.status(200).json({ success: true, message: "Archivos importados correctamente" });
  } catch (error) {
    console.error("❌ Error al importar archivos:", error);
    console.error("🧠 Stack:", error.stack);
    res.status(500).json({ success: false, message: "Error al importar archivos: " + error.message });
  }
});


module.exports = router;
