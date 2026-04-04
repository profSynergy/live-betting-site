// controllers/wallet.js
const pool = require('../db/connection');

async function addTransaction(userId, type, amount, description) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const res = await client.query('SELECT points FROM users WHERE id=$1 FOR UPDATE', [userId]);
        if (res.rows.length === 0) throw new Error("User not found");

        const newBalance = res.rows[0].points + amount;

        await client.query('UPDATE users SET points=$1 WHERE id=$2', [newBalance, userId]);

        await client.query(`
            INSERT INTO wallet_transactions (user_id, type, amount, balance_after, description)
            VALUES ($1, $2, $3, $4, $5)
        `, [userId, type, amount, newBalance, description]);

        await client.query('COMMIT');
        return newBalance;

    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function getBalance(userId) {
    const res = await pool.query('SELECT points FROM users WHERE id=$1', [userId]);
    return res.rows.length ? res.rows[0].points : null;
}

async function getTransactions(userId) {
    const res = await pool.query(
        'SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC',
        [userId]
    );
    return res.rows;
}

module.exports = { 
    addTransaction, 
    getBalance, 
    getTransactions,
    getDashboardWallets
 };

// Get wallet balances for dashboard
async function getDashboardWallets(userId) {
    const client = await pool.connect();
    try {
        // 1. Current user balance
        const userRes = await client.query('SELECT points FROM users WHERE id=$1', [userId]);
        const userBalance = userRes.rows.length ? Number(userRes.rows[0].points) : 0;

        // 2. Agents under this account
        const agentsRes = await client.query(`
            SELECT points FROM users 
            WHERE parent_id=$1 AND role IN ('agent','sub_agent','master_agent')
        `, [userId]);

        const agentsCount = agentsRes.rows.length;
        const agentsPoints = agentsRes.rows.reduce((sum, r) => sum + Number(r.points), 0);

        // 3. Players under this account
        const playersRes = await client.query(`
            SELECT points FROM users 
            WHERE parent_id=$1 AND role='player'
        `, [userId]);

        const playersCount = playersRes.rows.length;
        const playersPoints = playersRes.rows.reduce((sum, r) => sum + Number(r.points), 0);

        return {
            userBalance,
            agentsPoints,
            agentsCount,
            playersPoints,
            playersCount
        };

    } finally {
        client.release();
    }
}

