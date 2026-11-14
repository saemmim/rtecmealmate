import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const representatives = express.Router();

const requireHsRole = async (req, res, next) => {

	const token = req.cookies?.token;

	if (!token) {
        console.log ('no token');
		return res.status(401).json({ redirect: '/dashboard' });
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const id = decoded.id;
		const { rows: users } = await db.query(
			"SELECT role FROM users WHERE id = $1 AND status <> 'deleted' LIMIT 1",
			[id]
		);

		if (!users.length || users[0].role !== 'hs') {
            console.log('user not found');
			return res.status(401).json({ redirect: '/dashboard' });
		}

		next();
	} catch (error) {
        console.log(error);
		return res.status(401).json({ redirect: '/dashboard' });
	}
};

representatives.use(requireHsRole);

representatives.get('/false', async (req, res) => {
	try {
		const { rows: users } = await db.query(
			`SELECT id, name, username, department, batch, phone, profile_picture
			FROM users WHERE role = 'user' AND status = 'approved'
			ORDER BY batch ASC, name ASC`
		);
		res.json(users);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

representatives.get('/true', async (req, res) => {
	try {
		const { rows: users } = await db.query(
			`SELECT id, name, username, department, batch, phone, profile_picture
			FROM users WHERE role = 'hr' AND status = 'approved'
			ORDER BY batch ASC, name ASC`
		);
		res.json(users);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

const updateRole = (role) => async (req, res) => {
	const { user_id } = req.body;

	if (!user_id) {
		return res.status(400).json({ error: 'User id is required' });
	}

	try {
		await db.query(`UPDATE users SET role = $1 WHERE id = $2 AND status = 'approved'`, [role, user_id]);
		res.json({ message: `User role updated to ${role}` });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
};

representatives.post('/assign', updateRole('hr'));
representatives.post('/remove', updateRole('user'));

export default representatives;
