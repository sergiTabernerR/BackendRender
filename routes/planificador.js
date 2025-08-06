
const express = require("express");
const router = express.Router();
const sql = require("mssql");
const config = require("../dbconfig");

router.post("/save", async (req, res) => {
  const { anio, semana, datos, numFilas } = req.body;

  try {
    const pool = await sql.connect(config);

    // Generar los valores para el MERGE
    const valoresMerge = datos
      .map((celda) => {
        const texto = (celda.texto || "").replace(/'/g, "''");
        const color = (celda.color || "blanco").toLowerCase();
        const fecha = new Date(celda.fecha).toISOString().split("T")[0]; // YYYY-MM-DD

        return `(${anio}, ${semana}, ${celda.dia}, ${celda.fila}, ${celda.subcolumna}, N'${texto}', N'${color}', '${fecha}')`;
      })
      .join(",\n");

    const query = `
      MERGE PlanificadorSemanal AS target
      USING (
        VALUES
          ${valoresMerge}
      ) AS source (Anio, Semana, DiaSemana, Fila, Subcolumna, Texto, Color, Fecha)
      ON target.Anio = source.Anio
         AND target.Semana = source.Semana
         AND target.DiaSemana = source.DiaSemana
         AND target.Fila = source.Fila
         AND target.Subcolumna = source.Subcolumna
      WHEN MATCHED THEN
        UPDATE SET Texto = source.Texto, Color = source.Color, FechaModificacion = GETDATE()
      WHEN NOT MATCHED THEN
        INSERT (Anio, Semana, DiaSemana, Fila, Subcolumna, Texto, Color, Fecha)
        VALUES (source.Anio, source.Semana, source.DiaSemana, source.Fila, source.Subcolumna, source.Texto, source.Color, source.Fecha);
    `;

    await pool.request().query(query);

    // Guardar número de filas en tabla auxiliar PlanificadorMeta
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .input("NumFilas", sql.Int, numFilas || 10)
      .query(`
        MERGE PlanificadorMeta AS target
        USING (SELECT @Anio AS Anio, @Semana AS Semana) AS source
        ON target.Anio = source.Anio AND target.Semana = source.Semana
        WHEN MATCHED THEN
          UPDATE SET NumFilas = @NumFilas
        WHEN NOT MATCHED THEN
          INSERT (Anio, Semana, NumFilas)
          VALUES (@Anio, @Semana, @NumFilas);
      `);

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error en /save:", err);
    res.status(500).send("Error al guardar planificación");
  }
});


router.get("/load", async (req, res) => {
  const { anio, semana } = req.query;

  try {
    const pool = await sql.connect(config);

    const [planData, metaData] = await Promise.all([
      pool.request()
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .query(`
          SELECT DiaSemana AS dia, Fila AS fila, Subcolumna AS subcolumna, Texto AS texto, Color AS color, Fecha
          FROM PlanificadorSemanal
          WHERE Anio = @Anio AND Semana = @Semana
        `),
      pool.request()
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .query(`
          SELECT NumFilas FROM PlanificadorMeta WHERE Anio = @Anio AND Semana = @Semana
        `)
    ]);

    const numFilas = metaData.recordset[0]?.NumFilas || 10;

    res.status(200).json({
      datos: planData.recordset,
      numFilas
    });
  } catch (err) {
    console.error("❌ Error en /load:", err);
    res.status(500).send("Error al cargar planificación");
  }
});

router.post("/bajadas/save", async (req, res) => {
  try {
    const { bajadas } = req.body;

    if (!bajadas || !Array.isArray(bajadas)) {
      return res.status(400).send("Formato de bajadas inválido");
    }

    const pool = await sql.connect(config);

    // Eliminar registros existentes
    await pool.request().query("DELETE FROM PlanificadorBajadas");

    // Insertar nuevos registros
    for (let fila = 0; fila < bajadas.length; fila++) {
      for (let dia = 0; dia < bajadas[fila].length; dia++) {
        const texto = bajadas[fila][dia] || "";
        await pool.request()
          .input("Fila", sql.Int, fila + 1)
          .input("Dia", sql.Int, dia + 1)
          .input("Texto", sql.NVarChar(250), texto)
          .query(`
            INSERT INTO PlanificadorBajadas (Fila, Dia, Texto)
            VALUES (@Fila, @Dia, @Texto)
          `);
      }
    }

    res.send("Bajadas guardadas correctamente");
  } catch (err) {
    console.error("❌ Error al guardar bajadas:", err);
    res.status(500).send("Error al guardar bajadas");
  }
});

function getFechaDesdeSemanaDia(anio, semana, dia) {
  const primerJueves = new Date(anio, 0, 4);
  const primerLunes = new Date(primerJueves);
  primerLunes.setDate(primerJueves.getDate() - ((primerJueves.getDay() + 6) % 7));

  const fechaLunesSemana = new Date(primerLunes);
  fechaLunesSemana.setDate(fechaLunesSemana.getDate() + (semana - 1) * 7);

  const fechaFinal = new Date(fechaLunesSemana);
  fechaFinal.setDate(fechaFinal.getDate() + (dia - 1)); // lunes=1, martes=2, etc.

  return fechaFinal;
}


router.get("/bajadas/load", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .query(`
        SELECT Fila, Dia, Texto
        FROM PlanificadorBajadas
      `);

    res.status(200).json(result.recordset);
  } catch (err) {
    console.error("❌ Error al cargar bajadas:", err);
    res.status(500).send("Error al cargar bajadas");
  }
});
router.post("/imputarDesdeBajada", async (req, res) => {
  const {
    tipo,
    anio,
    semana,
    fila,
    dia,
    remolque,
    xoferViaje,
    cliente,
    codigoCliente,
    llocCarrega,
    preu,
    dataDesc,
    llocDesc,
    eur
  } = req.body;

  try {
    const pool = await sql.connect(config);

    const parseDate = (str) => {
      if (!str || typeof str !== "string") return null;
      const [dd, mm, yyyy] = str.split("/");
      return yyyy && mm && dd ? new Date(`${yyyy}-${mm}-${dd}`) : null;
    };

    await pool.request()
      .input("Tipo", sql.VarChar, tipo || "BAIXADA")
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .input("Orden", sql.Int, fila)
      .input("Remolc", sql.NVarChar, remolque || null)
      .input("Xofer", sql.NVarChar, xoferViaje || null)
      .input("Client", sql.NVarChar, cliente || null)
      .input("CodigoCliente", sql.VarChar, codigoCliente || null)
      .input("LlocCarrega", sql.NVarChar, llocCarrega || null)
      .input("Preu", sql.Decimal(10, 2), preu || 0)
      .input("DataDescarga", sql.Date, parseDate(dataDesc))
      .input("LlocDescarga", sql.NVarChar, llocDesc || null)
      .input("EUR", sql.Decimal(10, 2), eur || 0)
      .query(`
        INSERT INTO PlanningSemanal 
        (Tipo, Anio, Semana, Orden, Remolc, Xofer, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
        VALUES 
        (@Tipo, @Anio, @Semana, @Orden, @Remolc, @Xofer, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
      `);

    console.log(`✅ BAIXADA insertada para Orden ${fila}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error en INSERT BAIXADA:", err);
    res.status(500).send("Error al insertar planning bajada");
  }
});

router.post("/imputarDesdePantalla", async (req, res) => {
  const {
    anio,
    semana,
    fila,
    subida,
    bajada
  } = req.body;

  const parseDate = (str) => {
    if (!str || typeof str !== "string") return null;
    const [yyyy, mm, dd] = str.split("-");
    return yyyy && mm && dd ? new Date(`${yyyy}-${mm}-${dd}`) : null;
  };

  try {
    const pool = await sql.connect(config);

    // 🔼 Insertar SUBIDA
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .input("Orden", sql.Int, fila + 1)
      .input("Remolc", sql.NVarChar, subida.Remolc || null)
      .input("Tractor", sql.NVarChar, subida.Tractor || null)
      .input("Xofer", sql.NVarChar, bajada.Xofer2 || null)
      .input("DataCarrega", sql.Date, parseDate(subida.Data))
      .input("Client", sql.NVarChar, subida.Client || null)
      .input("CodigoCliente", sql.VarChar, subida.CodigoCliente || null)
    //  .input("LlocCarrega", sql.NVarChar, subida["Lloc Carrega"] || null)
        .input("LlocCarrega", "")
      .input("Preu", sql.Decimal(10, 2), parseFloat(subida.Preu) || 0)
      .input("DataDescarga", sql.Date, parseDate(subida.Data2))
    //  .input("LlocDescarga", sql.NVarChar, subida["Lloc Descarga"] || null)
      .input("LlocDescarga", "")
      .input("EUR", sql.Decimal(10, 2), 0)
      .query(`
        INSERT INTO PlanningSubida 
        (Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
        VALUES 
        (@Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
      `);

    // 🔽 Insertar BAJADA
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .input("Orden", sql.Int, fila + 1)
      .input("Remolc", sql.NVarChar, bajada.Remolque || null)
      .input("Tractor", sql.NVarChar, null)
      .input("Xofer", sql.NVarChar, bajada.Xofer2 || null)
      .input("DataCarrega", sql.Date, parseDate(bajada.Data3))
      .input("Client", sql.NVarChar, bajada.Cliente || null)
      .input("CodigoCliente", sql.VarChar, bajada.CodigoCliente || null)
  //    .input("LlocCarrega", sql.NVarChar, bajada["Lloc Carrega2"] || null)
            .input("LlocCarrega", "")

      .input("Preu", sql.Decimal(10, 2), parseFloat(bajada.Preu2) || 0)
      .input("DataDescarga", sql.Date, parseDate(bajada.Data4))
    //  .input("LlocDescarga", sql.NVarChar, bajada["Lloc Descarga2"] || null)
      .input("LlocDescarga", "")

      .input("EUR", sql.Decimal(10, 2), parseFloat(bajada.EUR) || 0)
      .query(`
        INSERT INTO PlanningBajada 
        (Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
        VALUES 
        (@Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
      `);

    console.log(`✅ Subida y Bajada imputadas correctamente en fila ${fila + 1}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error imputando subida/bajada:", err);
    res.status(500).send("Error al imputar subida y bajada");
  }
});


module.exports = router;
