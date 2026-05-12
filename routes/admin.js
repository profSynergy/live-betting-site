const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// ==========================
// AUTH MIDDLEWARE
// ==========================
function isAuthenticated(req, res, next) {

    if (!req.session.user) {
        return res.status(401).json({
            error: 'Unauthorized'
        });
    }

    next();
}

// ==========================
// CONVERT COMMISSION
// ==========================
router.post('/convert-commission', isAuthenticated, async (req, res) => {

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const userId = req.session.user.id;
        const amount = Number(req.body.amount || 0);

        if (!amount || amount <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const userRes = await client.query(`
            SELECT points, commission_earnings
            FROM users
            WHERE id = $1
            FOR UPDATE
        `, [userId]);

        if (!userRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userRes.rows[0];

        const currentPoints = Number(user.points || 0);
        const commission = Number(user.commission_earnings || 0);

        if (commission <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No commission available' });
        }

        if (amount > commission) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Insufficient commission' });
        }

        const newBalance = currentPoints + amount;
        const remainingCommission = commission - amount;

        // update user
        await client.query(`
            UPDATE users
            SET points = $1,
                commission_earnings = $2,
                updated_at = NOW()
            WHERE id = $3
        `, [newBalance, remainingCommission, userId]);

        // log wallet
        await client.query(`
            INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, description, reference_id)
            VALUES ($1, 'credit', $2, $3, $4, NULL)
        `, [
            userId,
            amount,
            newBalance,
            'Partial commission conversion'
        ]);

        // mark commissions as used (optional partial-safe version)
        await client.query(`
            UPDATE commission_transactions
            SET status = 0
            WHERE user_id = $1 AND status = 1
        `, [userId]);

        await client.query('COMMIT');

        res.json({
            success: true,
            converted: amount,
            remainingCommission,
            newBalance,
            message: 'Commission converted successfully'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    } finally {
        client.release();
    }
});

module.exports = router;