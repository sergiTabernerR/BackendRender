const sql = require("mssql");
const config = require("./dbconfig");

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log("✔️ Conexión establecida con SQL Server");
    return pool;
  })
  .catch(err => {
    console.error("❌ Error al conectar con SQL Server:", err);
    throw err;
  });

module.exports = poolPromise;
