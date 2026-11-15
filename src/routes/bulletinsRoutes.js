import express from "express";
import jwt from "jsonwebtoken";
import db from "../middleware/db.js";

const bulletinsRoutes = express.Router();

const authenticateUser = async (req) => {

    const token = req.cookies?.token;

	if (!token) {
        console.log ('no token');
		return res.status(401).json({ redirect: '/dashboard' });
	}

    try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const { rows } = await db.query(
			"SELECT id, role FROM users WHERE id = $1 AND status <> 'deleted' LIMIT 1",
			[decoded.id]
		);

		if (!rows.length) {
            console.log('user not found');
			return res.status(401).json({ redirect: '/authentication.html' });
		}

        return rows[0];
    }
    catch (error) {
        console.log(error);
		return res.status(401).json({ redirect: '/dashboard' });
	}
};

const bulletinSelect = `
	SELECT
		b.id,
		b.user_id,
		b.user_role,
		b.title,
		b.message,
		b.created_at,
		b.updated_at,
		u.name,
		u.username,
		u.phone,
		u.profile_picture
	FROM bulletins b
	JOIN users u ON u.id = b.user_id
`;

bulletinsRoutes.get("/", async (req, res) => {
	try {
		await authenticateUser(req);
		const { rows } = await db.query(`${bulletinSelect} ORDER BY b.created_at DESC`);
		res.json(rows);
	} catch (error) {
		if (error.status) return res.status(error.status).json({ error: error.message });
		res.status(500).json({ error: "Failed to fetch bulletins" });
	}
});

bulletinsRoutes.post("/", async (req, res) => {
	const { title = null, message } = req.body;

	if (!message) {
		return res.status(400).json({ error: "message is required" });
	}

	try {
		let user = await authenticateUser(req);
		if (user.role === "user") {
			const manager = await db.query(
				"SELECT 1 FROM managers WHERE user_id = $1 AND status = 'open' LIMIT 1",
				[user.id]
			);
			if (!manager.rows.length) return res.status(403).json({ error: "Open manager entry required", message: "Not permitted"});
			else user.role = 'mm'; // Treat as manager for bulletin posting
		}
		else if (user.role !== "hr" && user.role !== "hs") {
			return res.status(403).json({ message: "Not permitted" });
		}
		

		const { rows } = await db.query(
			`INSERT INTO bulletins (user_id, user_role, title, message)
			 VALUES ($1, $2, $3, $4)
			 RETURNING id`,
			[user.id, user.role, title, message]
		);
		const bulletin = await db.query(`${bulletinSelect} WHERE b.id = $1`, [rows[0].id]);
		res.status(201).json(bulletin.rows[0]);
	} catch (error) {
		console.error('Error creating bulletin:', error);
		if (error.status) return res.status(error.status).json({ error: error.message });
		res.status(500).json({ error: "Failed to create bulletin" });
	}
});

bulletinsRoutes.put("/:id", async (req, res) => {
	const { title = null, message } = req.body;

	if (!message) {
		return res.status(400).json({ error: "message is required" });
	}

	try {
		const user = await authenticateUser(req);
		const { rows } = await db.query(
			`UPDATE bulletins
			 SET title = $1, message = $2, updated_at = NOW()
			 WHERE id = $3 AND user_id = $4
			 RETURNING id`,
			[title, message, req.params.id, user.id]
		);

		if (!rows.length) return res.status(404).json({ error: "Bulletin not found" });
		const bulletin = await db.query(`${bulletinSelect} WHERE b.id = $1`, [rows[0].id]);
		res.json(bulletin.rows[0]);
	} catch (error) {
		if (error.status) return res.status(error.status).json({ error: error.message });
		res.status(500).json({ error: "Failed to update bulletin" });
	}
});

bulletinsRoutes.delete("/:id", async (req, res) => {
	try {
		const { rowCount } = await db.query("DELETE FROM bulletins WHERE id = $1", [req.params.id]);
		if (!rowCount) return res.status(404).json({ error: "Bulletin not found" });
		res.status(204).send();
	} catch (error) {
		res.status(500).json({ error: "Failed to delete bulletin" });
	}
});

export default bulletinsRoutes;
