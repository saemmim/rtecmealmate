import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const countUsersRouter = express.Router();

countUsersRouter.get('/', async (req, res) => {
	try {
		const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
		const { rows } = await db.query("SELECT status FROM managers WHERE user_id = $1", [decoded.id]);

		if (rows[0].status !== 'open') {
			return res.status(403).json({
				error: 'Forbidden',
				message: 'You do not have permission to access this resource.',
				redirect: '/dashboard/manager.html'
			});
		}
	
		const currentPeriod = new Date().toISOString().slice(0, 7);
        const { rows: currentUser } = await db.query(
			`SELECT u.batch
			FROM users u
			INNER JOIN managers m ON u.id = m.user_id
			WHERE u.id = $1 AND m.period = $2 AND m.status = 'open'
			LIMIT 1`,
			[decoded.id, currentPeriod]
        );

		if (!currentUser.length) {
			return res.status(401).json({ redirect: '/dashboard.html' });
		}

		const { rows: users } = await db.query(
			`SELECT
				u.name,
				u.username,
				u.department,
				u.phone,
				u.profile_picture
			FROM users u
			INNER JOIN meals m
				ON u.id = m.user_id
			WHERE u.batch = $1
			AND m.meal_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dhaka')::date;`,
			[currentUser[0].batch]
		);

		return res.json(users);
	} catch (error) {
        console.error('Error retrieving users:', error); // Debugging line
		return res.status(500).json({ error: 'Unable to retrieve users' });
	}
});

export default countUsersRouter;
