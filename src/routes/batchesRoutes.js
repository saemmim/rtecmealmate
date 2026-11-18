import express from 'express';
import db from '../middleware/db.js';
import jwt from 'jsonwebtoken';


const batchesRoutes = express.Router();


async function isAuthorized(req, res, next) {

    try {
        const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);

        const { rows } = await db.query("SELECT role FROM users WHERE id = $1", [decoded.id]);

        if (rows[0].role === 'hs') {
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

batchesRoutes.use(isAuthorized);

batchesRoutes.get('/', async (req, res) => {
	try {
		const { rows } = await db.query(`
			SELECT b.batch, b.name, COUNT(u.id) AS total_students, b.status
			FROM batches b LEFT JOIN users u ON u.batch = b.batch 
			AND u.status IN ('pending', 'approved', 'banned', 'archived')
			GROUP BY b.batch, b.name, b.status ORDER BY b.batch ASC;
			`);
        res.json(rows);
	} catch (error) {
        console.error('Error retrieving batches:', error);
		res.status(500).json({ error: 'Failed to retrieve batches' });
	}
});

batchesRoutes.post('/', async (req, res) => {
	const batches = req.body;
	if (!Array.isArray(batches)) {
		return res.status(400).json({ error:'Invalid format', message: 'Request body must be an array of batches' });
	}

	if (batches.length === 0) {
		return res.status(201).json([]);
	}

	try {
		const rows = [];
		for (const batch of batches) {
			const result = await db.query(
				'UPDATE batches SET name = $1 WHERE batch = $2 RETURNING batch, name, status;',
				[batch.name, batch.batch]
			);
			rows.push(...result.rows);
		}
		res.status(201).json(rows);
	} catch (error) {
		console.error('Error saving batches:', error);
		res.status(500).json({ error: 'Failed to save batches' });
	}
});

batchesRoutes.post('/new', async (req, res) => {
	const { batch, name } = req.body ?? {};
	if (batch == null || typeof name !== 'string' || name.length > 20) {
		return res.status(400).json({ error: 'Invalid format', message: 'Provide a batch and a name of at most 20 characters' });
	}

	try {
		const { rows } = await db.query(
			'INSERT INTO batches (batch, name, status) VALUES ($1, $2, $3) RETURNING batch, name, status;',
			[batch, name, 'open']
		);
		res.status(201).json(rows[0]);
	} catch (error) {
		console.error('Error creating batch:', error);
		res.status(500).json({ error: 'Failed to create batch' });
	}
});


batchesRoutes.post('/change-status', async (req, res) => {
	const { batch, setStatus } = req.body ?? {};
	if (batch == null || !['open', 'archived', 'deleted'].includes(setStatus)) {
		return res.status(400).json({ error: 'Invalid format', message: 'Provide a batch and a valid setStatus' });
	}

	try {

		if (setStatus === 'deleted') {
			const { rows } = await db.query(`
				SELECT COUNT(*) AS students FROM users
				WHERE batch = $1 AND status IN ('pending', 'approved', 'banned', 'archived');
				`, [batch]);

			if (rows[0].students == 0) {
				const { rows } = await db.query(
				'DELETE FROM batches WHERE batch = $1;',
				[batch]);
				
				return res.status(200).json({message: 'Deleted'});
			}
			return res.status(403).json({error: 'Forbidden', message: 'Can not delete batch with students'});
			
		}

		const { rows } = await db.query(
			'UPDATE batches SET status = $1 WHERE batch = $2 RETURNING batch, status;',
			[setStatus, batch]
		);
		if (rows.length === 0) {
			return res.status(404).json({ error: 'Batch not found' });
		}

		if (setStatus === 'archived') {
			await db.query(
				`UPDATE users
				SET status = 'archived'
				WHERE batch = $1
				AND status IN ('approved', 'pending');`,
				[batch]
			);
		}
		else if (setStatus === 'open') {
			await db.query(
				`UPDATE users
				SET status = 'approved'
				WHERE batch = $1
				AND status = 'archived';`,
				[batch]
			);
		}

		res.json(rows[0]);
	} catch (error) {
		console.error('Error changing batch status:', error);
		res.status(500).json({ error: 'Failed to change batch status' });
	}
});

export default batchesRoutes;
