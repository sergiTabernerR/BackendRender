const express = require("express");
const router = express.Router();
const sql = require("mssql");
const config = require("../dbconfig");

router.post("/save", async (req, res) => {
  const { anio, semana, tipo, datos } = req.body;

  try {
    const pool = await sql.connect(config);

    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .input("Tipo", sql.VarChar, tipo)
      .query("DELETE FROM PlanningSemanal WHERE Anio = @Anio AND Semana = @Semana AND Tipo = @Tipo");

    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];

      await pool.request()
        .input("Tipo", sql.VarChar, tipo)
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .input("Orden", sql.Int, i + 1)
        .input("Remolc", sql.NVarChar, d.Remolc || null)
        .input("Tractor", sql.NVarChar, d.Tractor || null)
        .input("Xofer", sql.NVarChar, d.XoferSubida ?? null) // para PlanningSubida
        .input("DataCarrega ", sql.Date, d.Data || null)
        .input("Client", sql.NVarChar, d.Client || null)
        .input("LlocCarrega", sql.NVarChar, d.LlocCarrega || null)
        .input("Preu", sql.Decimal(10, 2), d.Preu || null)
        .input("DataDescarga", sql.Date, d.DataDesc || null)
        .input("LlocDescarga", sql.NVarChar, d.LlocDesc || null)
        .input("EUR", sql.Decimal(10, 2), d.EUR || null)
        .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null) // 👈 nuevo campo aquí
        .query(`
          INSERT INTO PlanningSemanal 
          (Tipo, Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR, CodigoCliente) 
          VALUES 
          (@Tipo, @Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR, @CodigoCliente)
        `);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
   res.status(500).json({ error: "Texto descriptivo", detalle: err.message });

  }
});
router.post("/saveCombinado", async (req, res) => {
  const { anio, semana, datos, filasOcultasBajada } = req.body;

  if (!datos || !Array.isArray(datos)) {
    return res.status(400).send("Datos inválidos");
  }

  try {
    const pool = await sql.connect(config);

    // Borrar planning existente
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query("DELETE FROM PlanningSemanal WHERE Anio = @Anio AND Semana = @Semana");

    // Borrar ocultos existentes
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query("DELETE FROM PlanningSemanalOcultos WHERE Anio = @Anio AND Semana = @Semana");

    const parseDate = (str) => {
      if (!str || typeof str !== "string") return null;
      const [dd, mm, yyyy] = str.split("/");
      return yyyy && mm && dd ? new Date(`${yyyy}-${mm}-${dd}`) : null;
    };

    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];

      // PUJADA
      await pool.request()
        .input("Tipo", sql.VarChar, "PUJADA")
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .input("Orden", sql.Int, i + 1)
        .input("Remolc", sql.NVarChar, d.Remolc || null)
        .input("Tractor", sql.NVarChar, d.Tractor || null)
.input("Xofer", sql.NVarChar, d.XoferSubida ?? null) // para PlanningSubida
        .input("DataCarrega", sql.Date, parseDate(d.Data))
        .input("Client", sql.NVarChar, d.Client || null)
        .input("LlocCarrega", sql.NVarChar, d.LlocCarrega || null)
        .input("Preu", sql.Decimal(10, 2), d.Preu || 0)
        .input("DataDescarga", sql.Date, parseDate(d.Data2))
        .input("LlocDescarga", sql.NVarChar, d.LlocDescarga || null)
        .input("EUR", sql.Decimal(10, 2), 0)
        .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null)
        .query(`
          INSERT INTO PlanningSemanal 
          (Tipo, Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR, CodigoCliente)
          VALUES 
          (@Tipo, @Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR, @CodigoCliente)
        `);

      // BAIXADA
      await pool.request()
        .input("Tipo", sql.VarChar, "BAIXADA")
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .input("Orden", sql.Int, i + 1)
        .input("Remolc", sql.NVarChar, d.Remolque || null)
        .input("Tractor", sql.NVarChar, null)
.input("Xofer", sql.NVarChar, d.XoferBajada ?? null)
        .input("DataCarrega", sql.Date, parseDate(d.Data3))
        .input("Client", sql.NVarChar, d.Cliente || null)
        .input("LlocCarrega", sql.NVarChar, d.LlocCarrega2 || null)
        .input("Preu", sql.Decimal(10, 2), d.Preu2 || 0)
        .input("DataDescarga", sql.Date, parseDate(d.Data4))
        .input("LlocDescarga", sql.NVarChar, d.LlocDescarga2 || null)
        .input("EUR", sql.Decimal(10, 2), d.EUR || 0)
        .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null)
        .query(`
          INSERT INTO PlanningSemanal 
          (Tipo, Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR, CodigoCliente)
          VALUES 
          (@Tipo, @Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR, @CodigoCliente)
        `);
    }

    // Guardar filas ocultas
    if (Array.isArray(filasOcultasBajada)) {
      for (const fila of filasOcultasBajada) {
        await pool.request()
          .input("Anio", sql.Int, anio)
          .input("Semana", sql.Int, semana)
          .input("Orden", sql.Int, fila + 1)
          .query(`
            INSERT INTO PlanningSemanalOcultos (Anio, Semana, Orden)
            VALUES (@Anio, @Semana, @Orden)
          `);
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
})
router.get("/getCombinado", async (req, res) => {
  const { anio, semana } = req.query;

  if (!anio || !semana) return res.status(400).send("Parámetros inválidos");

  try {
    const pool = await sql.connect(config);

    // Consulta subidas y bajadas
    const subidas = await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query(`SELECT * FROM PlanningSubida WHERE Anio = @Anio AND Semana = @Semana ORDER BY Orden`);

    const bajadas = await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query(`SELECT * FROM PlanningBajada WHERE Anio = @Anio AND Semana = @Semana ORDER BY Orden`);

    // Consulta filas ocultas
    const ocultosResult = await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query(`SELECT Orden FROM PlanningSemanalOcultos WHERE Anio = @Anio AND Semana = @Semana`);

    const filasOcultasBajada = ocultosResult.recordset.map(r => r.Orden - 1); // Restamos 1 si usas índice base 0 en frontend

    const datos = [];

    const max = Math.max(subidas.recordset.length, bajadas.recordset.length);
    for (let i = 0; i < max; i++) {
      const puj = subidas.recordset[i] || {};
      const baix = bajadas.recordset[i] || {};

datos.push({
  Remolc: puj.Remolc,
  Tractor: puj.Tractor,
  XoferSubida: puj.Xofer,
  DataCarregaSubida: puj.DataCarrega ? puj.DataCarrega.toISOString().substring(0, 10) : "",
  ClientSubida: puj.Client,
  LlocCarregaSubida: puj.LlocCarrega,
  PreuSubida: puj.Preu,
  DataDescargaSubida: puj.DataDescarga ? puj.DataDescarga.toISOString().substring(0, 10) : "",
  LlocDescargaSubida: puj.LlocDescarga,
  CodigoClienteSubida: puj.CodigoCliente,

  Remolque: baix.Remolc,
  XoferBajada: baix.Xofer,
  DataCarregaBajada: baix.DataCarrega ? baix.DataCarrega.toISOString().substring(0, 10) : "",
  ClienteBajada: baix.Client,
  LlocCarregaBajada: baix.LlocCarrega,
  PreuBajada: baix.Preu,
  DataDescargaBajada: baix.DataDescarga ? baix.DataDescarga.toISOString().substring(0, 10) : "",
  LlocDescargaBajada: baix.LlocDescarga,
  CodigoClienteBajada: baix.CodigoCliente,
  EUR: baix.EUR,
  Totals: ""
});

    }

    res.json({
      datos,
      filasOcultasBajada
    });

  } catch (err) {
    console.error("❌ Error en /getCombinado:", err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});

router.post("/saveCombinadoSubidasBajadas", async (req, res) => {
  const { anio, semana, datos, filasOcultasBajada } = req.body;

  if (!Array.isArray(datos)) return res.status(400).send("Datos inválidos");

  const parseDate = (str) => {
    if (!str) return null;
    // Formato ISO yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return new Date(str);
    // Formato dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      const [dd, mm, yyyy] = str.split("/");
      return new Date(`${yyyy}-${mm}-${dd}`);
    }
    return null;
  };

  try {
    const pool = await sql.connect(config);

    // Borrar subidas y bajadas anteriores
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query("DELETE FROM PlanningSubida WHERE Anio = @Anio AND Semana = @Semana");

    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query("DELETE FROM PlanningBajada WHERE Anio = @Anio AND Semana = @Semana");

    // Borrar filas ocultas anteriores
    if (Array.isArray(filasOcultasBajada)) {
      await pool.request()
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .query("DELETE FROM PlanningSemanalOcultos WHERE Anio = @Anio AND Semana = @Semana");
    }

    // Guardar filas ocultas NUEVAS (si hay)
    if (Array.isArray(filasOcultasBajada)) {
      for (const fila of filasOcultasBajada) {
        await pool.request()
          .input("Anio", sql.Int, anio)
          .input("Semana", sql.Int, semana)
          .input("Orden", sql.Int, fila + 1)
          .query("INSERT INTO PlanningSemanalOcultos (Anio, Semana, Orden) VALUES (@Anio, @Semana, @Orden)");
      }
    }

    // Insertar datos PUJADA y BAJADA
    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];

      try {
        // Guardar subida
        await pool.request()
          .input("Anio", sql.Int, anio)
          .input("Semana", sql.Int, semana)
          .input("Orden", sql.Int, i + 1)
          .input("Remolc", sql.NVarChar, d.Remolc || null)
          .input("Tractor", sql.NVarChar, d.Tractor || null)
          .input("Xofer", sql.NVarChar, d.XoferSubida ?? null)
          .input("DataCarrega", sql.Date, parseDate(d.DataSubida))
          .input("Client", sql.NVarChar, d.ClientSubida || null)
          .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null)
          .input("LlocCarrega", sql.NVarChar, d.LlocCarregaSubida || null)
          .input("Preu", sql.Decimal(10, 2), d.PreuSubida || 0)
          .input("DataDescarga", sql.Date, parseDate(d.DataDescargaSubida))
          .input("LlocDescarga", sql.NVarChar, d.LlocDescargaSubida || null)
          .input("EUR", sql.Decimal(10, 2), 0)
          .query(`
            INSERT INTO PlanningSubida 
            (Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
            VALUES 
            (@Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
          `);

      } catch (err) {
        console.error(`❌ Error al insertar subida en fila ${i + 1}:`, err);
      }

      try {
        // Guardar bajada
        await pool.request()
          .input("Anio", sql.Int, anio)
          .input("Semana", sql.Int, semana)
          .input("Orden", sql.Int, i + 1)
          .input("Remolc", sql.NVarChar, d.Remolque || null)
          .input("Tractor", sql.NVarChar, null)
          .input("Xofer", sql.NVarChar, d.XoferBajada ?? null)
          .input("DataCarrega", sql.Date, parseDate(d.DataBajada))
          .input("Client", sql.NVarChar, d.ClienteBajada || null)
          .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null)
          .input("LlocCarrega", sql.NVarChar, d.LlocCarregaBajada || null)
          .input("Preu", sql.Decimal(10, 2), d.PreuBajada || 0)
          .input("DataDescarga", sql.Date, parseDate(d.DataDescargaBajada))
          .input("LlocDescarga", sql.NVarChar, d.LlocDescargaBajada || null)
          .input("EUR", sql.Decimal(10, 2), d.EUR || 0)
          .query(`
            INSERT INTO PlanningBajada 
            (Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
            VALUES 
            (@Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
          `);

      } catch (err) {
        console.error(`❌ Error al insertar bajada en fila ${i + 1}:`, err);
      }
    }

    res.status(200).json({ ok: true });

  } catch (err) {
    console.error("❌ Error en /saveCombinadoSubidasBajadas:", err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});



router.post("/saveSubidas", async (req, res) => {
  const { anio, semana, datos } = req.body;

  try {
    const pool = await sql.connect(config);

    // Limpiar registros existentes de esa semana
    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query("DELETE FROM PlanningSubida WHERE Anio = @Anio AND Semana = @Semana");

    const parseDate = (str) => {
      if (!str || typeof str !== "string") return null;
      const [dd, mm, yyyy] = str.split("/");
      return yyyy && mm && dd ? new Date(`${yyyy}-${mm}-${dd}`) : null;
    };

    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];
      await pool.request()
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .input("Orden", sql.Int, i + 1)
        .input("Remolc", sql.NVarChar, d.Remolc || null)
        .input("Tractor", sql.NVarChar, d.Tractor || null)
.input("Xofer", sql.NVarChar, d.XoferBajada ?? null)
        .input("DataCarrega", sql.Date, parseDate(d.DataCarrega))
        .input("Client", sql.NVarChar, d.Client || null)
        .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null)
        .input("LlocCarrega", sql.NVarChar, d.LlocCarrega || null)
        .input("Preu", sql.Decimal(10, 2), d.Preu || 0)
        .input("DataDescarga", sql.Date, parseDate(d.Data2))
        .input("LlocDescarga", sql.NVarChar, d.LlocDescarga || null)
        .input("EUR", sql.Decimal(10, 2), d.EUR || 0)
        .query(`
          INSERT INTO PlanningSubida (Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
          VALUES (@Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
        `);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error en saveSubidas:", err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});

router.post("/saveBajadas", async (req, res) => {
  const { anio, semana, datos } = req.body;

  try {
    const pool = await sql.connect(config);

    await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query("DELETE FROM PlanningBajada WHERE Anio = @Anio AND Semana = @Semana");

    const parseDate = (str) => {
      if (!str || typeof str !== "string") return null;
      const [dd, mm, yyyy] = str.split("/");
      return yyyy && mm && dd ? new Date(`${yyyy}-${mm}-${dd}`) : null;
    };

    for (let i = 0; i < datos.length; i++) {
      const d = datos[i];
      await pool.request()
        .input("Anio", sql.Int, anio)
        .input("Semana", sql.Int, semana)
        .input("Orden", sql.Int, i + 1)
        .input("Remolc", sql.NVarChar, d.Remolque || null)
        .input("Tractor", sql.NVarChar, null) // opcional
.input("Xofer", sql.NVarChar, d.XoferBajada ?? null)
        .input("DataCarrega", sql.Date, parseDate(d.DataBajada))
        .input("Client", sql.NVarChar, d.Cliente || null)
        .input("CodigoCliente", sql.VarChar, d.CodigoCliente || null)
        .input("LlocCarrega", sql.NVarChar, d.LlocCarrega2 || null)
        .input("Preu", sql.Decimal(10, 2), d.Preu2 || 0)
        .input("DataDescarga", sql.Date, parseDate(d.Data4))
        .input("LlocDescarga", sql.NVarChar, d.LlocDescarga2 || null)
        .input("EUR", sql.Decimal(10, 2), d.EUR || 0)
        .query(`
          INSERT INTO PlanningBajada (Anio, Semana, Orden, Remolc, Tractor, Xofer, DataCarrega, Client, CodigoCliente, LlocCarrega, Preu, DataDescarga, LlocDescarga, EUR)
          VALUES (@Anio, @Semana, @Orden, @Remolc, @Tractor, @Xofer, @DataCarrega, @Client, @CodigoCliente, @LlocCarrega, @Preu, @DataDescarga, @LlocDescarga, @EUR)
        `);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ Error en saveBajadas:", err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});
router.get("/getSubidas", async (req, res) => {
  const { anio, semana } = req.query;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query(`SELECT * FROM PlanningSubida WHERE Anio = @Anio AND Semana = @Semana ORDER BY Orden`);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error en getSubidas:", err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});

router.get("/getBajadas", async (req, res) => {
  const { anio, semana } = req.query;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .query(`SELECT * FROM PlanningBajada WHERE Anio = @Anio AND Semana = @Semana ORDER BY Orden`);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error en getBajadas:", err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});






router.get("/get", async (req, res) => {
  const { anio, semana, tipo } = req.query;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input("Anio", sql.Int, anio)
      .input("Semana", sql.Int, semana)
      .input("Tipo", sql.VarChar, tipo)
      .query(`SELECT *
              FROM PlanningSemanal 
              WHERE Anio = @Anio AND Semana = @Semana AND Tipo = @Tipo 
              ORDER BY Orden ASC`);

    res.json({
      anio: parseInt(anio),
      semana: parseInt(semana),
      tipo,
      datos: result.recordset,
    });

  } catch (err) {
    console.error(err);
res.status(500).json({ error: "Texto descriptivo", detalle: err.message });
  }
});


module.exports = router;
