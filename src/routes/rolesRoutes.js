import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const roleRoutes = express.Router();

const getUsersByRole = (role) => async (req, res) => {
	try {
		const token = req.cookies?.token;

		if (!token) {
			return res.json({ redirect: "/authentication.html" });
		}

		try {
			jwt.verify(token, process.env.JWT_SECRET);
		} catch {
			return res.json({ redirect: "/authentication.html" });
		}

        if (role === 'mm'){
			const currentPeriod = new Date().toISOString().slice(0, 7);
			const { rows: users } = await db.query(`
				SELECT u.name, u.username, u.department, b.name AS batch, u.phone, u.profile_picture
				FROM users u
				INNER JOIN managers m ON m.user_id = u.id
				INNER JOIN batches b ON b.batch = u.batch
				WHERE m.period = $1 AND m.status = 'open'
				ORDER BY u.batch ASC, u.name ASC;
				`, [currentPeriod])

			res.json(users);

			return
		}

		if (role === 'hs') {
			const { rows: administrators } = await db.query(`
				SELECT name, username, department, batch, phone, profile_picture
				FROM users WHERE role = 'hs' ORDER BY batch ASC, name ASC;
			`);

			res.json(administrators);
			
			return
		}

		const { rows: users } = await db.query(`
			SELECT u.name, u.username, u.department, b.name AS batch, u.phone, u.profile_picture
			FROM users u INNER JOIN batches b ON b.batch = u.batch
			WHERE role = $1 ORDER BY u.batch ASC, u.name ASC;
			`,
			[role]
		);
		res.json(users);

	} catch (error) {
		res.status(500).json({ message: 'Failed to retrieve users' });
	}
};

roleRoutes.get('/managers', getUsersByRole('mm'));
roleRoutes.get('/representatives', getUsersByRole('hr'));
roleRoutes.get('/administrators', getUsersByRole('hs'));

export default roleRoutes;
