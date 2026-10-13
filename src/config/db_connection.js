const sql = require('mssql');

const config = {
    server: process.env.DB_SERVER,
    database:process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000   // close idle connections before the network drops them
    },
    requestTimeout: 30000,
    options: {
        port: parseInt(process.env.DB_PORT),
        encrypt: true,
        trustServerCertificate: true
    }
}

const poolPromise = new sql.ConnectionPool(config) 
    .connect()
    .then(pool => {
        console.log('Connected to SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Database connection failed:', err);
        process.exit(1);
    });

module.exports = {
    sql,
    poolPromise
};