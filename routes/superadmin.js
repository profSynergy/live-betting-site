const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// =========================
// Middleware
// =========================
function isSuperAdmin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.session.user.role !== '-1') {
        return res.status(403).json({ error: "Forbidden" });
    }

    next();
}

// =========================
// Helper: map status counts
// =========================
function mapStatus(rows) {
    const map = {
        online: 0,
        offline: 0,
        pending: 0
    };

    rows.forEach(r => {
        if (map.hasOwnProperty(r.status)) {
            map[r.status] = Number(r.count);
        }
    });

    return map;
}

// =========================
// Route: Superadmin Dashboard
// =========================
router.get('/dashboard', isSuperAdmin, async (req, res) => {
    console.log("🔥 SUPERADMIN DASHBOARD HIT");

    try {
        // =========================
        // TOTAL COUNTS
        // =========================
        const agents = await pool.query(`
            SELECT COUNT(*) AS total
            FROM users
            WHERE role IN ('agent','sub_agent','master_agent')
        `);

        const players = await pool.query(`
            SELECT COUNT(*) AS total
            FROM users
            WHERE role = 'player'
        `);

        // =========================
        // STATUS COUNTS
        // =========================
        const agentStatus = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM users
            WHERE role IN ('agent','sub_agent','master_agent')
            GROUP BY status
        `);

        const playerStatus = await pool.query(`
            SELECT status, COUNT(*) AS count
            FROM users
            WHERE role = 'player'
            GROUP BY status
        `);

        // =========================
        // GAME FLOW (BETS & WINS)
        // =========================
        const gameFlow = await pool.query(`
            SELECT
                COALESCE(SUM(CASE 
                    WHEN type = 'debit' AND description ILIKE 'Bet on%' 
                    THEN amount ELSE 0 END), 0) AS total_bet,

                COALESCE(SUM(CASE 
                    WHEN type = 'credit' AND description ILIKE 'Win -%' 
                    THEN amount ELSE 0 END), 0) AS total_won
            FROM wallet_transactions
        `);

        // =========================
        // CASH FLOW (FIXED - BASED ON DESCRIPTION)
        // =========================
        const cash = await pool.query(`
            SELECT
                COALESCE(SUM(CASE 
                    WHEN description ILIKE 'Received%' 
                    THEN amount ELSE 0 END), 0) AS cash_in,

                COALESCE(SUM(CASE 
                    WHEN description ILIKE 'Withdrawal approved' 
                    THEN amount ELSE 0 END), 0) AS withdraw
            FROM wallet_transactions
        `);

        // =========================
        // MAP STATUS
        // =========================
        const agentMap = mapStatus(agentStatus.rows);
        const playerMap = mapStatus(playerStatus.rows);

        // =========================
        // GAME FLOW VALUES
        // =========================
        const totalBet = Number(gameFlow.rows[0]?.total_bet || 0);
        const totalWon = Number(gameFlow.rows[0]?.total_won || 0);
        const netGameFlow = totalBet - totalWon;
        
        const totalCashIn = Number(cash.rows[0]?.cash_in || 0);
        const totalWithdraw = Number(cash.rows[0]?.withdraw || 0);
        const netCashFlow = totalCashIn - totalWithdraw;
        // =========================
        // RESPONSE
        // =========================
        return res.json({
            totalAgents: Number(agents.rows[0]?.total || 0),
            totalPlayers: Number(players.rows[0]?.total || 0),

            // ✅ Game Flow
            totalBet: totalBet,           // raw bet
            totalWon: totalWon,           // wins
            netGameFlow: netGameFlow,     // BET - WON

            // ✅ Cash Flow (FIXED)
            totalCashIn: totalCashIn,
            totalWithdraw: totalWithdraw,
            netCashFlow: netCashFlow,

            // ✅ Agent status
            onlineAgents: agentMap.online,
            offlineAgents: agentMap.offline,
            pendingAgents: agentMap.pending,

            // ✅ Player status
            onlinePlayers: playerMap.online,
            offlinePlayers: playerMap.offline,
            pendingPlayers: playerMap.pending
        });

    } catch (err) {
        console.error("❌ SUPERADMIN ERROR:", err);
        return res.status(500).json({
            error: err.message,
            stack: err.stack
        });
    }
});
// =========================
// NETWORK API
// SHOW FULL DOWNLINE TREE
// =========================
router.get('/network/:id', isSuperAdmin, async (req, res) => {

    const { id } = req.params;

    try {

        const result = await pool.query(`
            WITH RECURSIVE network AS (

                -- DIRECT DOWNLINES
                SELECT
                    u.id,
                    u.username,
                    u.role,
                    u.points,
                    u.status,
                    u.parent_id,
                    1 AS level
                FROM users u
                WHERE u.parent_id = $1

                UNION ALL

                -- CHILD DOWNLINES
                SELECT
                    child.id,
                    child.username,
                    child.role,
                    child.points,
                    child.status,
                    child.parent_id,
                    network.level + 1
                FROM users child
                INNER JOIN network
                    ON child.parent_id = network.id
            )

            SELECT
                network.id,
                network.username,
                network.role,
                network.points,
                network.status,
                network.level,
                parent.username AS parent_username
            FROM network
            LEFT JOIN users parent
                ON network.parent_id = parent.id

            ORDER BY
                network.level ASC,
                network.username ASC
        `, [id]);

        res.json(result.rows);

    } catch (err) {

        console.error("❌ NETWORK ERROR:", err);

        res.status(500).json({
            error: 'Failed to load network'
        });
    }
});
module.exports = router;