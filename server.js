// server.js
const express = require("express");
const cors = require("cors");

const app = express();

/** CORS: permite llamadas desde Vite (5173) */
app.use(cors({
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** Healthcheck para probar conexión rápida */
app.get("/api/health", (req, res) => res.json({ ok: true }));

/** Logger simple de peticiones */
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`➡️  ${req.method} ${req.originalUrl}  CT:${req.headers['content-type']}  CL:${req.headers['content-length'] || 0}`);
  res.on("finish", () => {
    console.log(`⬅️  ${req.method} ${req.originalUrl} → ${res.statusCode}  ${Date.now() - start}ms`);
  });
  next();
});

/** Rutas */
const planificadorRoutes   = require("./routes/planificador");
const planningRoutes       = require("./routes/planning");
const gestionClientesRoutes = require("./routes/GestionClientes");
const albaranesRoutes      = require("./routes/albaranes");
const transportRoutes      = require("./routes/transport");

app.use("/api/transport", transportRoutes);
app.use("/api/planificador", planificadorRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/clientes", gestionClientesRoutes);
app.use("/api/albaranes", albaranesRoutes);

/** Handler de errores (cualquier throw cae aquí) */
app.use((err, req, res, next) => {
  console.error("💥 Error no manejado:", err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: err.message });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en http://localhost:${PORT}`);
});
