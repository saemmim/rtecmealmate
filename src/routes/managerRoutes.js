import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const managerRoutes = express.Router();

async function isAuthorized(req, res, next) {

    try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);

        const { rows } = await db.query("SELECT status FROM managers WHERE user_id = $1", [decoded.id]);

        if (rows[0]) {
            return next();
        } else {
			return res.status(403).json({
				error: 'Forbidden',
				message: 'You do not have permission to access this resource.',
				redirect: '/dashboard'
			});
		}
    } catch (error) {
		console.error('Error in authentication middleware:', error);
        return res.status(401).json({
            message: 'Something went wrong with authentication.',
            redirect: '/authentication.html'
        });
    }
}

managerRoutes.get('/period', async (req, res) => {
	try {
		const userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id;

		const { rows } = await db.query(
			'SELECT period, status FROM managers WHERE user_id = $1 ORDER BY period',
			[userId]
		);

		if (rows.length === 0) {
			return res.status(200).json({ message: 'You are not manager', pleaseRedirect: '/dashboard' });
		}
		
		return res.json(rows);

	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve manager periods' });
	}
});







managerRoutes.use(isAuthorized);






managerRoutes.post('/period', async (req, res) => {
	try {
		const userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id;

		const { period, setStatus } = req.body;
		if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
			return res.status(400).json({ error: 'A valid period (YYYY-MM) is required' });
		}
		if (!['closed', 'reopen', 'close', 'reopened'].includes(setStatus)) {
			return res.status(400).json({ error: 'A valid status is required' });
		}

		const now = new Date();
		const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
		if (period === currentPeriod) {
			return res.status(400).json({ error: 'The current month status cannot be changed' });
		}

		if (setStatus == 'reopened') {
			const { rows } = await db.query(
			`UPDATE managers
			SET status = $3, updated_at = NOW()
			WHERE user_id = $1 AND period = $2 AND status = 'close'
			RETURNING period, status`,
			[userId, period, setStatus]
			);

			if (rows.length === 0) {
				return res.status(404).json({ error: 'No manager entry found for this period' });
			}

			return res.status(200).json(rows[0]);
		}

		const { rows } = await db.query(
			`UPDATE managers
			SET status = $1, updated_at = NOW()
			WHERE user_id = $2 AND period = $3
			RETURNING period, status`,
			[setStatus, userId, period]
		);

		if (rows.length === 0) {
			return res.status(404).json({ error: 'No manager entry found for this period' });
		}

		return res.status(200).json(rows[0]);
	} catch (error) {
		console.error('Error updating manager period status:', error);
		return res.status(500).json({ error: 'Failed to update manager period status' });
	}
});


managerRoutes.get('/day', async (req, res) => {
	try {
		const userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id;

		const { date } = req.query;
		if (!date) {
			return res.status(400).json({ error: 'Date query parameter is required' });
		}
		
		const { rows: managerRows } = await db.query(
			`SELECT 1
			FROM managers
			WHERE user_id = $1
				AND period = to_char($2::date, 'YYYY-MM')
			LIMIT 1`,
			[userId, date]
		);

		if (managerRows.length === 0) {
			return res.status(403).json({ error: 'You did not serve as a manager during this date' });
		}
		
		const { rows } = await db.query(
			`SELECT
			u.batch,
				COUNT(*) AS total_meals
				FROM meals m
				JOIN users u ON u.id = m.user_id
				WHERE m.meal_date = $1
				GROUP BY u.batch
				ORDER BY u.batch`,
				[date]
			);
			return res.status(200).json(rows);
		} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve daily meal totals' });
	}
});



managerRoutes.get('/month/batch', async (req, res) => {
	try {
		const { period } = req.query;
		if (!period || !/^\d{4}-\d{2}$/.test(period)) {
			return res.status(400).json({ error: 'A valid period query parameter (YYYY-MM) is required' });
		}

		const { rows } = await db.query(
			`
			WITH batch_list AS (
				-- Get all available batches
				SELECT DISTINCT batch
				FROM users
			),

			meal_totals AS (
				-- Calculate total meals per batch for the selected month
				SELECT
					u.batch,
					COUNT(*) AS total_meals
				FROM meals m
				JOIN users u
					ON u.id = m.user_id
				WHERE
					m.meal_date >= ($1 || '-01')::date
					AND m.meal_date < (
						($1 || '-01')::date + INTERVAL '1 month'
					)
				GROUP BY
					u.batch
			),

			deposit_totals AS (
				-- Calculate total deposits per batch for the selected period
				SELECT
					u.batch,
					SUM(d.amount) AS total_deposit
				FROM deposits d
				JOIN users u
					ON u.id = d.user_id
				WHERE
					d.period = $1
				GROUP BY
					u.batch
			)

			-- Combine batch, meal and deposit totals
			SELECT
				b.batch,

				COALESCE(m.total_meals, 0) AS total_meals,

				COALESCE(d.total_deposit, 0) AS total_deposit

			FROM batch_list b

			LEFT JOIN meal_totals m
				ON m.batch = b.batch

			LEFT JOIN deposit_totals d
				ON d.batch = b.batch

			-- Exclude batches with both zero meals and zero deposits
			WHERE
				COALESCE(m.total_meals, 0) > 0
				OR COALESCE(d.total_deposit, 0) > 0

			ORDER BY
				b.batch
			`,
			[period]
		);

		return res.status(200).json(rows.filter(row => row.batch !== null));
	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve monthly batch totals' });
	}
});




managerRoutes.get('/month/total-expense', async (req, res) => {
	try {
		const { period } = req.query;
		if (!period || !/^\d{4}-\d{2}$/.test(period)) {
			return res.status(400).json({ error: 'A valid period query parameter (YYYY-MM) is required' });
		}

		const { rows } = await db.query(
			`SELECT COALESCE(SUM(ri.price), 0) AS total_expense
			FROM receipts r
			JOIN receipt_items ri ON ri.receipt_id = r.id
			WHERE r.receipt_date >= ($1 || '-01')::date
				AND r.receipt_date < ($1 || '-01')::date + INTERVAL '1 month'`,
			[period]
		);

		return res.status(200).json(rows[0]);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve monthly total expense' });
	}
});




managerRoutes.post('/calendar', async (req, res) => {
	try {
		const userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id;

		const { period, currentBatchOnly } = req.body;
		if (!period || !/^\d{4}-\d{2}$/.test(period)) {
			return res.status(400).json({ error: 'A valid period query parameter (YYYY-MM) is required' });
		}

		let rows;
		if (currentBatchOnly) {
			const { rows: userRows } = await db.query(
				'SELECT batch FROM users WHERE id = $1',
				[userId]
			);
			if (userRows.length === 0) {
				return res.status(404).json({ error: 'User not found' });
			}

			({ rows } = await db.query(
				`SELECT m.meal_date, COUNT(*) AS total_meals
				FROM meals m
				JOIN users u ON u.id = m.user_id
				WHERE u.batch = $1
					AND m.meal_date >= ($2 || '-01')::date
					AND m.meal_date < ($2 || '-01')::date + INTERVAL '1 month'
				GROUP BY m.meal_date
				ORDER BY m.meal_date`,
				[userRows[0].batch, period]
			));
		} else {
			({ rows } = await db.query(
				`SELECT meal_date, COUNT(*) AS total_meals
				FROM meals
				WHERE meal_date >= ($1 || '-01')::date
					AND meal_date < ($1 || '-01')::date + INTERVAL '1 month'
				GROUP BY meal_date
				ORDER BY meal_date`,
				[period]
			));
		}

		return res.status(200).json(rows);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve calendar meal totals' });
	}
});




managerRoutes.post('/users', async (req, res) => {
	try {
		const userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id;

		const { period } = req.body;
		if (!period || !/^\d{4}-\d{2}$/.test(period)) {
			return res.status(400).json({ error: 'A valid period query parameter (YYYY-MM) is required' });
		}

		const { rows: managerRows } = await db.query(
			'SELECT user_id FROM managers WHERE period = $1',
			[period]
		);
		if (!managerRows.some((manager) => String(manager.user_id) === String(userId))) {
			return res.status(403).json({ error: `User is not a manager for ${period}` });
		}

		const { rows: currentUserRows } = await db.query(
			'SELECT batch FROM users WHERE id = $1',
			[userId]
		);
		if (currentUserRows.length === 0) {
			return res.status(404).json({ error: 'User not found' });
		}
		const currentBatch = currentUserRows[0].batch;
		const { rows: batchRows } = await db.query(`
			SELECT DISTINCT u.batch
			FROM users u
			JOIN meals m ON m.user_id = u.id
			WHERE m.meal_date >= ($1::text || '-01')::date
			AND m.meal_date <  (($1::text || '-01')::date + INTERVAL '1 month')
			ORDER BY u.batch
			`, [period]);
		const { rows: managerBatchRows } = await db.query(`
			SELECT DISTINCT u.batch
			FROM managers mg
			JOIN users u ON u.id = mg.user_id
			WHERE mg.period = $1
			ORDER BY u.batch;
			`, [period]);

		const batches = batchRows.map((row) => row.batch);
		const managerBatches = managerBatchRows.map((row) => row.batch);	
		
		const oldestBatchIndex = managerBatches.indexOf(currentBatch);
		const indexInBatches = batches.indexOf(currentBatch);
		
		const includedBatches = oldestBatchIndex === 0
			? batches.slice(0, indexInBatches + 1)
			: [currentBatch];

		const { rows } = await db.query(
			`SELECT
				u.id,
				u.name,
				u.username,
				u.department,
				u.batch,
				u.phone,
				u.profile_picture,
				u.status,
				COALESCE(m.normal_meals, 0) AS normal_meals,
				COALESCE(m.guest_meals, 0) AS guest_meals,
				COALESCE(d.total_deposit, 0) AS total_deposit
			FROM users u
			LEFT JOIN (
				SELECT
					user_id,
					COUNT(*) FILTER (WHERE guest = FALSE) AS normal_meals,
					COUNT(*) FILTER (WHERE guest = TRUE) AS guest_meals
				FROM meals
				WHERE meal_date >= ($1 || '-01')::date
					AND meal_date < ($1 || '-01')::date + INTERVAL '1 month'
				GROUP BY user_id
			) m ON m.user_id = u.id
			LEFT JOIN (
				SELECT user_id, SUM(amount) AS total_deposit
				FROM deposits
				WHERE period = $1
				GROUP BY user_id
			) d ON d.user_id = u.id
			WHERE u.batch = ANY($2::numeric[])
				AND COALESCE(m.normal_meals, 0) + COALESCE(m.guest_meals, 0) > 0
			ORDER BY u.batch ASC, u.name ASC;`,
			[period, includedBatches]
		);

		return res.status(200).json(rows);
	} catch (error) {
		console.error('Error retrieving users:', error);
		return res.status(500).json({ error: 'Failed to retrieve users' });
	}
});

managerRoutes.post('/users/calendar', async (req, res) => {
	try {
		const { period, user_id } = req.body;
		if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
			return res.status(400).json({ error: 'A valid period (YYYY-MM) is required' });
		}
		if (!user_id) {
			return res.status(400).json({ error: 'user_id is required' });
		}

		const { rows } = await db.query(
			`SELECT
				calendar.meal_date,
				COUNT(m.id) FILTER (WHERE m.guest = FALSE) AS normal_meal,
				COUNT(m.id) FILTER (WHERE m.guest = TRUE) AS guest_meal
			FROM generate_series(
				($1 || '-01')::date,
				(($1 || '-01')::date + INTERVAL '1 month' - INTERVAL '1 day')::date,
				INTERVAL '1 day'
			) AS calendar(meal_date)
			LEFT JOIN meals m
				ON m.meal_date = calendar.meal_date
				AND m.user_id = $2
			GROUP BY calendar.meal_date
			ORDER BY calendar.meal_date`,
			[period, user_id]
		);

		return res.status(200).json(rows);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve user meal calendar' });
	}
});

managerRoutes.post('/users/transactions/', async (req, res) => {
	try {
		const { user_id, period } = req.body;
		if (!user_id) {
			return res.status(400).json({ error: 'user_id is required' });
		}
		if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
			return res.status(400).json({ error: 'A valid period (YYYY-MM) is required' });
		}

		const { rows } = await db.query(
			`SELECT
				d.created_at,
				d.amount,
				collector.username as collected_by,
				d.note
			FROM deposits d
			JOIN users collector ON collector.id = d.collected_by
			WHERE d.user_id = $1 AND d.period = $2
			ORDER BY d.created_at`,
			[user_id, period]
		);
		
		return res.status(200).json(rows);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve user transactions' });
	}
});

managerRoutes.post('/users/deposit', async (req, res) => {
	try {
		const userId = jwt.verify(req.cookies.token, process.env.JWT_SECRET).id;

		const { period, user_id, note } = req.body;
		if (!user_id) {
			return res.status(400).json({ error: 'user_id is required' });
		}
		if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
			return res.status(400).json({ error: 'A valid period (YYYY-MM) is required' });
		}
		if (req.body.amount === undefined || req.body.amount === null || req.body.amount === '' || !Number.isFinite(Number(req.body.amount)) || Number(req.body.amount) === 0) {
			return res.status(400).json({ error: 'A valid non-zero amount is required' });
		}

		const { rows } = await db.query(
			`INSERT INTO deposits (user_id, amount, period, collected_by, note)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, user_id, amount, period, collected_by, note, created_at`,
			[user_id, req.body.amount, period, userId, note ?? null]
		);

		return res.status(201).json(rows[0]);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to save deposit' });
	}
});




export default managerRoutes;
