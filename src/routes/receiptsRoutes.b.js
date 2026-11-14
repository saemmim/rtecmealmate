import express from 'express';
import jwt from 'jsonwebtoken';
import { createUploadMiddleware, scanUploadedFile } from '../middleware/virusScanner.js';
import { processReceiptImage } from '../middleware/receiptImageProcessor.js';
import db from '../middleware/db.js';

const receiptsRoutes = express.Router();
const uploadReceiptImage = createUploadMiddleware({
	allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
	maxFileSizeBytes: 20 * 1024 * 1024,
}).single('image');

receiptsRoutes.get('/', async (req, res) => {
	const { period } = req.query;

	if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
		return res.status(400).json({ error: 'period must be in yyyy-mm format' });
	}

	const [year, month] = period.split('-').map(Number);
	const startDate = `${period}-01`;
	const endDate = `${year + (month === 12 ? 1 : 0)}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;

	try {
		const { rows } = await db.query(
			`SELECT
					r.id,
					r.receipt_date,
					r.image_url,
					r.user_id,
                    r.created_at,
                    r.updated_at,
					u.username,
					COALESCE(
							json_agg(
									json_build_object(
											'id', ri.id,
											'description', ri.description,
											'price', ri.price
									) ORDER BY ri.id
							) FILTER (WHERE ri.id IS NOT NULL),
							'[]'
					) AS items,
					COALESCE(SUM(ri.price), 0) AS total
			FROM receipts r
			JOIN users u ON u.id = r.user_id
			LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
			WHERE r.receipt_date >= $1
				AND r.receipt_date < $2
			GROUP BY r.id, r.receipt_date, r.image_url, r.user_id, u.username
			ORDER BY r.receipt_date, r.id`,
			[startDate, endDate]
		);

		return res.json(rows);
	} catch {
		return res.status(500).json({ error: 'Failed to retrieve receipts' });
	}
});

receiptsRoutes.post('/', uploadReceiptImage, scanUploadedFile, async (req, res) => {
	let client;
	try {
		const token = req.cookies?.token;
		if (!token) {
			return res.status(401).json({ redirect: '/authentication.html' });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		if (!decoded.id) {
			return res.status(401).json({ error: 'Token did not contain a valid user ID.' });
		}

		if (!req.file?.buffer) {
			return res.status(400).json({ error: 'Receipt image is required' });
		}

		const { receipt_date } = req.body;
		if (typeof receipt_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(receipt_date) ||
			new Date(`${receipt_date}T00:00:00Z`).toISOString().slice(0, 10) !== receipt_date) {
			console.log('Debug: invalid receipt_date:', receipt_date);
			return res.status(400).json({ error: 'receipt_date must be a valid yyyy-mm-dd date' });
		}

		let items;
		try {
			items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
		} catch {
			console.log('Debug: failed to parse items JSON');
			return res.status(400).json({ error: 'items must be valid JSON' });
		}
		if (!Array.isArray(items) && items && typeof items === 'object') {
			console.log('Debug: normalizing items object:', items);
			items = 'price' in items || 'description' in items ? [items] : Object.values(items);
		}
		if (!Array.isArray(items) || items.some((item) =>
			!item || typeof item !== 'object' ||
			(item.description != null && typeof item.description !== 'string') ||
			item.price == null || item.price === '' || !Number.isFinite(Number(item.price))
		)) {
			console.log('Debug: invalid items value:', items);
			return res.status(400).json({ error: 'items must contain valid descriptions and prices' });
		}

		const imageUrl = await processReceiptImage(req.file.buffer);
		client = await db.connect();
		await client.query('BEGIN');
		const { rows } = await client.query(
			'INSERT INTO receipts (user_id, receipt_date, image_url) VALUES ($1, $2, $3) RETURNING id',
			[decoded.id, receipt_date, imageUrl]
		);
		const receiptId = rows[0].id;
		for (const item of items) {
			await client.query(
				'INSERT INTO receipt_items (receipt_id, description, price) VALUES ($1, $2, $3)',
				[receiptId, item.description ?? null, item.price]
			);
		}
		await client.query('COMMIT');
		return res.status(201).json({ id: receiptId, image_url: imageUrl });
	} catch (err) {
		if (client) await client.query('ROLLBACK').catch(() => {});
		if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
			return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
		}
		return res.status(500).json({ error: 'Failed to create receipt' });
	} finally {
		client?.release();
	}
});






receiptsRoutes.post('/edit', uploadReceiptImage, scanUploadedFile, async (req, res) => {
	let client;
	try {
		const token = req.cookies?.token;
		if (!token) {
			return res.status(401).json({ redirect: '/authentication.html' });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		if (!decoded.id) {
			return res.status(401).json({ error: 'Token did not contain a valid user ID.' });
		}

		const receiptId = Number(req.body.id);
		if (!Number.isInteger(receiptId) || receiptId <= 0) {
			return res.status(400).json({ error: 'A valid receipt id is required' });
		}

		const { receipt_date } = req.body;
		if (typeof receipt_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(receipt_date) ||
			new Date(`${receipt_date}T00:00:00Z`).toISOString().slice(0, 10) !== receipt_date) {
			return res.status(400).json({ error: 'receipt_date must be a valid yyyy-mm-dd date' });
		}

		let items;
		try {
			items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
		} catch {
			return res.status(400).json({ error: 'items must be valid JSON' });
		}
		if (!Array.isArray(items) && items && typeof items === 'object') {
			items = 'price' in items || 'description' in items ? [items] : Object.values(items);
		}
		if (!Array.isArray(items) || items.some((item) =>
			!item || typeof item !== 'object' ||
			(item.description != null && typeof item.description !== 'string') ||
			item.price == null || item.price === '' || !Number.isFinite(Number(item.price))
		)) {
			return res.status(400).json({ error: 'items must contain valid descriptions and prices' });
		}

		
		const imageProvided = Boolean(req.file?.buffer);
		console.log('Image file provided:', imageProvided, '---');
		const imageUrl = imageProvided ? await processReceiptImage(req.file.buffer) : null;
		client = await db.connect();
		await client.query('BEGIN');
		const { rows } = imageProvided
			? await client.query(
				`UPDATE receipts
				 SET receipt_date = $1, image_url = $2, updated_at = NOW()
				 WHERE id = $3 AND user_id = $4
				 RETURNING id, image_url`,
				[receipt_date, imageUrl, receiptId, decoded.id]
			)
			: await client.query(
				`UPDATE receipts
				 SET receipt_date = $1, updated_at = NOW()
				 WHERE id = $2 AND user_id = $3
				 RETURNING id, image_url`,
				[receipt_date, receiptId, decoded.id]
			);
		if (!rows.length) {
			await client.query('ROLLBACK');
			return res.status(404).json({ error: 'Receipt not found' });
		}

		await client.query('DELETE FROM receipt_items WHERE receipt_id = $1', [receiptId]);
		for (const item of items) {
			await client.query(
				'INSERT INTO receipt_items (receipt_id, description, price) VALUES ($1, $2, $3)',
				[receiptId, item.description ?? null, item.price]
			);
		}
		await client.query('COMMIT');
		return res.json({ id: receiptId, image_url: rows[0].image_url });
	} catch (err) {
		if (client) await client.query('ROLLBACK').catch(() => {});
		if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
			return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
		}
		return res.status(500).json({ error: 'Failed to update receipt' });
	} finally {
		client?.release();
	}
});









receiptsRoutes.use((err, req, res, next) => {
	if (err) return res.status(400).json({ error: err.message });
	next();
});

export default receiptsRoutes;






/*
receiptsRoutes.post('/edit', uploadReceiptImage, scanUploadedFile, async (req, res) => {
	let client;
	try {
		const token = req.cookies?.token;
		if (!token) {
			return res.status(401).json({ redirect: '/authentication.html' });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		if (!decoded.id) {
			return res.status(401).json({ error: 'Token did not contain a valid user ID.' });
		}
		
		const receiptId = Number(req.body.id);
		if (!Number.isInteger(receiptId) || receiptId <= 0) {
			return res.status(400).json({ error: 'A valid receipt id is required' });
		}

		const { receipt_date } = req.body;
		if (typeof receipt_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(receipt_date) ||
			new Date(`${receipt_date}T00:00:00Z`).toISOString().slice(0, 10) !== receipt_date) {
			return res.status(400).json({ error: 'receipt_date must be a valid yyyy-mm-dd date' });
		}

		let items;
		try {
			items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
		} catch {
			return res.status(400).json({ error: 'items must be valid JSON' });
		}
		if (!Array.isArray(items) && items && typeof items === 'object') {
			items = 'price' in items || 'description' in items ? [items] : Object.values(items);
		}
		if (!Array.isArray(items) || items.some((item) =>
			!item || typeof item !== 'object' ||
			(item.description != null && typeof item.description !== 'string') ||
			item.price == null || item.price === '' || !Number.isFinite(Number(item.price))
		)) {
			return res.status(400).json({ error: 'items must contain valid descriptions and prices' });
		}
		
		client = await db.connect();
		if (Boolean(req.file?.buffer)){
			console.log ('Image file provided.');
			const imageUrl = await processReceiptImage(req.file.buffer);
			await client.query('BEGIN');
			const { rows } = await client.query(
					`UPDATE receipts
					SET receipt_date = $1, image_url = $2, updated_at = NOW()
					WHERE id = $3 AND user_id = $4
					RETURNING id, image_url`,
					[receipt_date, imageUrl, receiptId, decoded.id]
				)
			if (!rows.length) {
				await client.query('ROLLBACK');
				return res.status(404).json({ error: 'Receipt not found' });
			}
		}
		else {
			console.log ('Image file missing.');
			const { rows } = await client.query(
					`UPDATE receipts
					SET receipt_date = $1, updated_at = NOW()
					WHERE id = $2 AND user_id = $3
					RETURNING id, image_url`,
					[receipt_date, receiptId, decoded.id]
				);
			if (!rows.length) {
				await client.query('ROLLBACK');
				return res.status(404).json({ error: 'Receipt not found' });
			}
		}

		await client.query('DELETE FROM receipt_items WHERE receipt_id = $1', [receiptId]);
			for (const item of items) {
				await client.query(
					'INSERT INTO receipt_items (receipt_id, description, price) VALUES ($1, $2, $3)',
					[receiptId, item.description ?? null, item.price]
				);
			}
		await client.query('COMMIT');
		console.log('ok');
		return res.json({ id: receiptId, image_url: rows[0].image_url });


	} catch (err) {
		if (client) await client.query('ROLLBACK').catch(() => {});
		if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
			return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
		}
		console.log(err);
		return res.status(500).json({ error: 'Failed to update receipt' });
	} finally {
		client?.release();
	}
});
*/