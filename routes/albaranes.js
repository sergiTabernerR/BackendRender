const express = require("express");
const router = express.Router();
const sql = require("mssql");
const ExcelJS = require("exceljs");
const path = require("path");
const poolPromise = require("../dbpool");

router.get("/exportar", async (req, res) => {
  try {


    const pool = await poolPromise;

    // ✅ 1. Obtener datos de ambas tablas
const resultado = await pool.request().query(`
WITH UltimosArticulos AS (
  SELECT *
  FROM (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY Anio, Semana, Fila, Subcolumna
        ORDER BY FechaModificacion DESC
      ) AS rn
    FROM planificadorsemanal
    WHERE Subcolumna = 2
  ) AS t
  WHERE rn = 1
)

SELECT 'Subida' AS Tipo, p.*, p.Id AS IdOriginal, ua.Texto AS Articulo, a.CodigoArticulo
FROM PlanningSubida p
LEFT JOIN UltimosArticulos ua
  ON ua.Anio = p.Anio
  AND ua.Semana = p.Semana
  AND ua.Fila = p.Orden
LEFT JOIN Articulos a
  ON a.DescripcionArticulo = ua.Texto
WHERE ISNULL(p.AlbaranExportado, 0) = 0

UNION ALL

SELECT 'Bajada' AS Tipo, p.*, p.Id AS IdOriginal, ua.Texto AS Articulo, a.CodigoArticulo
FROM PlanningBajada p
LEFT JOIN UltimosArticulos ua
  ON ua.Anio = p.Anio
  AND ua.Semana = p.Semana
  AND ua.Fila = p.Orden
LEFT JOIN Articulos a
  ON a.DescripcionArticulo = ua.Texto
WHERE ISNULL(p.AlbaranExportado, 0) = 0

ORDER BY Orden ASC

`);


    const datos = resultado.recordset;

    if (!datos.length) {
      return res.status(404).json({ success: false, message: "No hay datos nuevos para exportar." });
    }

    const workbook = new ExcelJS.Workbook();

    const sheetCabecera = workbook.addWorksheet("Cabecera");
    sheetCabecera.columns = [ { header: "CodigoEmpresa", key: "CodigoEmpresa" },
      { header: "Serie", key: "Serie" },
      { header: "Numero", key: "Numero" },
      { header: "EjercicioAlbaran", key: "EjercicioAlbaran" },
      { header: "FechaAlbaran", key: "FechaAlbaran" },
      { header: "CodigoCliente", key: "CodigoCliente" },
      { header: "RazonSocial", key: "RazonSocial" },
      { header: "RazonSocial2", key: "RazonSocial2" },
      { header: "Nombre", key: "Nombre" },
      { header: "CifDni", key: "CifDni" },
      { header: "CifEuropeo", key: "CifEuropeo" },
      { header: "GrupoIva", key: "GrupoIva" },
      { header: "IvaIncluido", key: "IvaIncluido" },
      { header: "CodigoRetencion", key: "CodigoRetencion" },
      { header: "CodigoTransaccion", key: "CodigoTransaccion" },
      { header: "ObservacionesAlbaran", key: "ObservacionesAlbaran" },
      { header: "ImportePortes", key: "ImportePortes" },
      { header: "%Descuento", key: "Descuento" },
      { header: "%ProntoPago", key: "ProntoPago" },
      { header: "%Rappel", key: "Rappel" },
      { header: "Domicilio", key: "Domicilio" },
      { header: "Domicilio2", key: "Domicilio2" },
      { header: "CodigoPostal", key: "CodigoPostal" },
      { header: "CodigoMunicipio", key: "CodigoMunicipio" },
      { header: "Municipio", key: "Municipio" },
      { header: "ColaMunicipio", key: "ColaMunicipio" },
      { header: "CodigoProvincia", key: "CodigoProvincia" },
      { header: "Provincia", key: "Provincia" },
      { header: "CodigoNacion", key: "CodigoNacion" },
      { header: "Nacion", key: "Nacion" },
      { header: "CodigoTerritorio", key: "CodigoTerritorio" },
      { header: "DomicilioEnvio", key: "DomicilioEnvio" },
      { header: "DomicilioFactura", key: "DomicilioFactura" },
      { header: "DomicilioRecibo", key: "DomicilioRecibo" },
      { header: "IdDelegacion", key: "IdDelegacion" },
      { header: "CodigoCanal", key: "CodigoCanal" },
      { header: "CodigoProyecto", key: "CodigoProyecto" },
      { header: "CodigoSeccion", key: "CodigoSeccion" },
      { header: "CodigoDepartamento", key: "CodigoDepartamento" },
      { header: "SuPedido", key: "SuPedido" }
    ];

    // Hoja Lineas extendida
    const sheetLineas = workbook.addWorksheet("Lineas");
    sheetLineas.columns = [
      { header: "CodigoEmpresa", key: "CodigoEmpresa" },
      { header: "Serie", key: "Serie" },
      { header: "Numero", key: "Numero" },
      { header: "EjercicioAlbaran", key: "EjercicioAlbaran" },
      { header: "Orden", key: "Orden" },
      { header: "CodigoArticulo", key: "CodigoArticulo" },
      { header: "DescripcionArticulo", key: "DescripcionArticulo" },
      { header: "Unidades", key: "Unidades" },
      { header: "Precio", key: "Precio" },
      { header: "GrupoIva", key: "GrupoIva" },
      { header: "CodigoTransaccion", key: "CodigoTransaccion" },
      { header: "Descuento", key: "Descuento" },
      { header: "Descuento2", key: "Descuento2" },
      { header: "Descuento3", key: "Descuento3" },
      { header: "Descripcion2Articulo", key: "Descripcion2Articulo" },
      { header: "CodigoComisionista", key: "CodigoComisionista" },
      { header: "CodigoAlmacen", key: "CodigoAlmacen" },
      { header: "CodigoFamilia", key: "CodigoFamilia" },
      { header: "CodigoSubfamilia", key: "CodigoSubfamilia" },
      { header: "CodigoProyecto", key: "CodigoProyecto" },
      { header: "CodigoSeccion", key: "CodigoSeccion" },
      { header: "CodigoDepartamento", key: "CodigoDepartamento" },
      { header: "Ubicacion", key: "Ubicacion" }];

 

    let contadorNumero = 1;
    const idsSubida = [];
    const idsBajada = [];

    for (const fila of datos) {
      const precio = parseFloat(fila.Preu || fila.EUR || 0) || 0;
      const razonSocial = fila.Client || "Sin cliente";
const articulo = fila.Articulo || "Artículo desconocido";
const codigoArticulo = fila.CodigoArticulo || "SIN-CODIGO";

      // Cabecera
      sheetCabecera.addRow({
        CodigoEmpresa: 9999,
        Serie: "",
        Numero: contadorNumero,
        EjercicioAlbaran: fila.Anio || anioActual,
        FechaAlbaran: new Date(),
        CodigoCliente: fila.CodigoCliente || "",
        RazonSocial: razonSocial,
        RazonSocial2: "",
        Nombre: "",
        CifDni: "",
        CifEuropeo: "",
        GrupoIva: 1,
        IvaIncluido: 0,
        CodigoRetencion: 0,
        CodigoTransaccion: 0,
        ObservacionesAlbaran: "",
        ImportePortes: 0,
        Descuento: 0,
        ProntoPago: 0,
        Rappel: 0,
        Domicilio: "",
        Domicilio2: "",
        CodigoPostal: "",
        CodigoMunicipio: "",
        Municipio: "",
        ColaMunicipio: "",
        CodigoProvincia: "",
        Provincia: "",
        CodigoNacion: "",
        Nacion: "",
        CodigoTerritorio: "",
        DomicilioEnvio: "",
        DomicilioFactura: "",
        DomicilioRecibo: "",
        IdDelegacion: "",
        CodigoCanal: "",
        CodigoProyecto: "",
        CodigoSeccion: "",
        CodigoDepartamento: "",
        SuPedido: ""
      });

      // Línea
      sheetLineas.addRow({
        CodigoEmpresa: 9999,
        Serie: "",
        Numero: contadorNumero,
        EjercicioAlbaran: fila.Anio || anioActual,
        Orden: 1,
        CodigoArticulo: codigoArticulo,
        DescripcionArticulo: articulo,
        Unidades: 1,
        Precio: precio,
        GrupoIva: 1,
        CodigoTransaccion: 0,
        Descuento: 0,
        Descuento2: 0,
        Descuento3: 0,
        Descripcion2Articulo: "",
        CodigoComisionista: "",
        CodigoAlmacen: "",
        CodigoFamilia: "",
        CodigoSubfamilia: "",
        CodigoProyecto: "",
        CodigoSeccion: "",
        CodigoDepartamento: "",
        Ubicacion: ""
      });

      if (fila.Tipo === "Subida") {
        idsSubida.push(fila.IdOriginal);
      } else {
        idsBajada.push(fila.IdOriginal);
      }

      contadorNumero++;
    }

    const filePath = path.join(__dirname, "../exports/albaranes.xlsx");
    await workbook.xlsx.writeFile(filePath);

    // ✅ 2. Marcar como exportados
    if (idsSubida.length > 0) {
      await pool.request().query(`UPDATE PlanningSubida SET AlbaranExportado = -1 WHERE Id IN (${idsSubida.join(",")})`);
    }

    if (idsBajada.length > 0) {
      await pool.request().query(`UPDATE PlanningBajada SET AlbaranExportado = -1 WHERE Id IN (${idsBajada.join(",")})`);
    }

    res.download(filePath, "albaranes.xlsx", (err) => {
      if (err) console.error("❌ Error al enviar el archivo:", err);
    });

  } catch (error) {
    console.error("❌ Error al exportar albaranes:", error);
    res.status(500).json({ success: false, message: "Error al exportar: " + error.message });
  }
});



module.exports = router;
