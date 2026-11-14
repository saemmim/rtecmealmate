import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const countUsersRouter = express.Router();

countUsersRouter.get('/', async (req, res) => {
	const token = req.cookies?.token;

	if (!token) {
		return res.status(401).json({ redirect: '/authentication.html' });
	}

	const payload = jwt.decode(token);
	const userId = payload?.id;

	if (!userId) {
		return res.status(401).json({ redirect: '/authentication.html' });
	}


	try {
		const currentPeriod = new Date().toISOString().slice(0, 7);
        const { rows: currentUser } = await db.query(
			`SELECT u.batch
			FROM users u
			INNER JOIN managers m ON u.id = m.user_id
			WHERE u.id = $1 AND m.period = $2 AND m.status = 'open'
			LIMIT 1`,
			[userId, currentPeriod]
        );

		if (!currentUser.length) {
			return res.status(401).json({ redirect: '/dashboard.html' });
		}

		const { rows: users } = await db.query(
			`SELECT name, username, department, phone, profile_picture
			 FROM users
			 WHERE batch = $1`,
			[currentUser[0].batch]
		);

		return res.json(users);
	} catch (error) {
        console.error('Error retrieving users:', error); // Debugging line
		return res.status(500).json({ error: 'Unable to retrieve users' });
	}
});

export default countUsersRouter;
