const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://gamedb_qwiu_user:fs8wqx8FgcSp7BFxqJeZUPZybaw3nfnr@dpg-d76vih2a214c73d6g450-a.oregon-postgres.render.com/gamedb_qwiu',
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;