import express from 'express';
import db from '../middleware/db.js';

const batchesRoutes = express.Router();

batchesRoutes.get('/', async (req, res) => {
	try {
		const { rows } = await db.query(`
			SELECT b.batch, b.name, COUNT(u.id) AS total_students, b.status
			FROM batches b LEFT JOIN users u ON u.batch = b.batch 
			AND u.status IN ('approved', 'archived')
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
				WHERE batch = $1 AND status IN ('approved', 'archived');
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
		res.json(rows[0]);
	} catch (error) {
		console.error('Error changing batch status:', error);
		res.status(500).json({ error: 'Failed to change batch status' });
	}
});






export default batchesRoutes;
