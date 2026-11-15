import express from 'express';
import db from '../middleware/db.js';

const allowedBatchesRoutes = express.Router();

allowedBatchesRoutes.get('/', async (req, res) => {
	try {
		const { rows } = await db.query(`
			SELECT batch, name, status FROM batches
            WHERE status = 'open' ORDER BY batch ASC;
			`);
        res.json(rows);
	} catch (error) {
        console.error('Error retrieving batches:', error);
		res.status(500).json({ error: 'Failed to retrieve batches' });
	}
});

export default allowedBatchesRoutes;