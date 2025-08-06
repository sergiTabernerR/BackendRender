const express = require("express");
const cors = require("cors");
const sql = require("mssql");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const planificadorRoutes = require("./routes/planificador");
const planningRoutes = require("./routes/planning");
const gestionClientesRoutes = require("./routes/gestionClientes"); 
const albaranesRoutes = require("./routes/albaranes");

app.use("/api/planificador", planificadorRoutes);
app.use("/api/planning", planningRoutes);
app.use("/api/clientes", gestionClientesRoutes); // esta línea ya está bien
app.use("/api/albaranes", albaranesRoutes);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
