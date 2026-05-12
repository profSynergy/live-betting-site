const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
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

        // ==========================
        // Lock user row
        // ==========================
        const userRes = await client.query(`
            SELECT points, commission_earnings
            FROM users
            WHERE id = $1
            FOR UPDATE
        `, [userId]);

        if (!userRes.rows.length) {

            await client.query('ROLLBACK');

            return res.status(404).json({
                error: 'User not found'
            });
        }

        const user = userRes.rows[0];

        const currentPoints = Number(user.points || 0);

        const commission = Number(user.commission_earnings || 0);

        // ==========================
        // No commission available
        // ==========================
        if (commission <= 0) {

            await client.query('ROLLBACK');

            return res.status(400).json({
                error: 'No commission available'
            });
        }

        const newBalance = currentPoints + commission;

        // ==========================
        // Update user balances
        // ==========================
        await client.query(`
            UPDATE users
            SET
                points = $1,
                commission_earnings = 0,
                updated_at = NOW()
            WHERE id = $2
        `, [newBalance, userId]);

        // ==========================
        // Wallet transaction log
        // ==========================
        await client.query(`
            INSERT INTO wallet_transactions
            (
                user_id,
                type,
                amount,
                balance_after,
                description,
                reference_id
            )
            VALUES
            (
                $1,
                'credit',
                $2,
                $3,
                $4,
                $5
            )
        `, [
            userId,
            commission,
            newBalance,
            'Commission converted to wallet points',
            uuidv4()
        ]);

        // ==========================
        // Mark commission records converted
        // ==========================
        await client.query(`
            UPDATE commission_transactions
            SET status = 0
            WHERE user_id = $1
            AND status = 1
        `, [userId]);

        await client.query('COMMIT');

        res.json({
            success: true,
            converted: commission,
            newBalance,
            message: 'Commission converted successfully'
        });

    } catch (err) {

        await client.query('ROLLBACK');

        console.error(err);

        res.status(500).json({
            error: 'Server error'
        });

    } finally {

        client.release();

    }
});

module.exports = router;