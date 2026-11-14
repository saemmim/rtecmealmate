import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const managersRoutes = express.Router();

async function requireHr(req, res, next) {
	try {
		const token = req.cookies?.token;

        if (!token) return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
            redirect: '/authentication.html'
        });

		const decoded = jwt.verify(token, process.env.JWT_SECRET);

		const id = decoded.id ?? decoded.user_id ?? decoded.userId;

		if (!id) return res.status(401).json({
            error: 'Invalid token',
            message: 'Unauthorized!',
            redirect: '/authentication.html'
        });

		const { rows } = await db.query('SELECT id, role, batch FROM users WHERE id = $1', [id]);

		if (!rows.length) return res.status(401).json({ error: 'User not found', message: 'Invalid token.' });

		if (rows[0].role !== 'hr') return res.json({
            error: 'Not permitted',
            message: 'Only representatives can do this action.',
            redirect: '/dashboard'
        });

		req.managerUser = rows[0];

		next();

	} catch (error) {
		if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
			return res.status(401).json({ error: 'Invalid token' });
		}
		next(error);
	}
}

function monthString(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const validMonth = (month) => typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

async function listManagers(current, req, res, next) {
	const { month } = req.query;
	if (!validMonth(month)) return res.status(400).json({ error: 'Invalid format', message: 'A valid month (YYYY-MM) is required' });
	try {
		const { rows } = await db.query(
			`SELECT u.id, u.name, u.username, u.department, u.batch, u.phone, u.profile_picture
			 FROM users u
			 LEFT JOIN managers m ON m.user_id = u.id AND m.period = $2
			 WHERE u.batch = $1
			   AND (($3::boolean AND m.user_id IS NOT NULL) OR (NOT $3::boolean AND m.user_id IS NULL))
			 ORDER BY u.name`,
			[req.managerUser.batch, month, current],
		);
		res.json(rows);
	} catch (error) { next(error); }
}

managersRoutes.get('/true', requireHr, (req, res, next) => listManagers(true, req, res, next));
managersRoutes.get('/false', requireHr, (req, res, next) => listManagers(false, req, res, next));

managersRoutes.post('/assign', requireHr, async (req, res, next) => {

	const { user_id, month } = req.body ?? {};

	if (!user_id || !validMonth(month)) return res.status(400).json({
        error: 'Invalid format',
        message: 'User id and a valid month (YYYY-MM) are required'
    });

	const now = new Date();

	const allowed = [monthString(now), monthString(new Date(now.getFullYear(), now.getMonth() + 1, 1))];

	if (!allowed.includes(month)) return res.status(400).json({
        error: 'Not permitted.',
        message: 'Assignments are limited to the current and next month'
    });

	try {
		const target = await db.query('SELECT id FROM users WHERE id = $1 AND batch = $2', [user_id, req.managerUser.batch]);

		if (!target.rows.length) return res.status(404).json({
            error: 'Not permitted.',
            message: 'Can not assign manager for other batch.'
        });

		const { rows } = await db.query(
			'INSERT INTO managers (user_id, period) VALUES ($1, $2) ON CONFLICT (user_id, period) DO NOTHING RETURNING user_id, period',
			[user_id, month],
		);

		res.status(rows.length ? 201 : 200).json(rows[0] ?? { user_id: user_id, period: month });
		
	} catch (error) { next(error); }
});

managersRoutes.post('/remove', requireHr, async (req, res, next) => {
	
	const { user_id, month } = req.body ?? {};
	
	if (!user_id || !validMonth(month)) return res.status(400).json({ error: 'user_id and a valid month (YYYY-MM) are required' });
	
	const now = new Date();
	
	const nextMonth = monthString(new Date(now.getFullYear(), now.getMonth() + 1, 1));
	
	if (month !== nextMonth) return res.status(400).json({ error: 'Managers can only be removed for the upcoming month' });
	
	try {
		const { rows } = await db.query(
			'DELETE FROM managers m USING users u WHERE m.user_id = $1 AND m.period = $2 AND u.id = m.user_id AND u.batch = $3 RETURNING m.user_id, m.period',
			[user_id, month, req.managerUser.batch],
		);

		if (!rows.length) return res.status(404).json({ error: 'Manager not found in your batch for this month.' });

		res.status(200).json(rows[0]);

	} catch (error) { next(error); }
});




managersRoutes.get('/month', async (req, res) => {
	try {

		const period = req.query.query;
		if (!period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
			return res.status(400).json({ error: 'A valid period query parameter (YYYY-MM) is required' });
		}

		const { rows } = await db.query(
			`SELECT
				u.id,
				u.name,
				u.username,
				u.department,
				u.phone,
				u.profile_picture,
				b.name AS batch,
				m.status
			FROM managers AS m
			JOIN users AS u ON u.id = m.user_id
			JOIN batches AS b ON b.batch = u.batch
			WHERE m.period = $1
			ORDER BY u.batch, u.name`,
			[period]
		);

		return res.status(200).json(rows);
	} catch (error) {
		return res.status(500).json({ error: 'Failed to retrieve monthly managers' });
	}
});

managersRoutes.post('/month', async (req, res) => {
	try {
		const { id, period, setStatus } = req.body ?? {};

		if (!validMonth(period) || !['closed', 'reopened'].includes(setStatus)) {
			return res.status(400).json({ error: 'Valid period (YYYY-MM), and status are required' });
		}

		if (id && setStatus == 'closed') {
			console.log(id, setStatus);
			const { rows } = await db.query(
				'UPDATE managers SET status = $1, updated_at = NOW() WHERE user_id = $2 AND period = $3 RETURNING user_id, period, status',
				[setStatus, id, period]
			);
			if (!rows.length) return res.status(404).json({ error: 'Manager not found for this period' });

			return res.status(200).json({
				message: 'Success',
				id: rows[0].user_id,
				period: rows[0].period,
				status: rows[0].status
			});
		}

		const { rows } = await db.query(
			'UPDATE managers SET status = $1, updated_at = NOW() WHERE period = $2 RETURNING period, status',
			[setStatus, period]
		);
		if (!rows.length) return res.status(404).json({ error: 'Managers not found for this period' });

		return res.status(200).json({
			message: 'Success',
			period: rows[0].period,
			status: rows[0].status
		});

	} catch (error) {
		console.log(error);
		return res.status(500).json({ error: 'Failed to update manager status' });
	}
});


export default managersRoutes;
