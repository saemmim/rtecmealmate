import express from "express";
import jwt from "jsonwebtoken";
import db from "../middleware/db.js";

const router = express.Router();
const departments = new Set(["YE", "FE", "AE", "WPE"]);


const getUserId = (req) => {
	const token = req.cookies?.token;
	if (!token) return null;

	try {
		const payload = jwt.verify(token, process.env.JWT_SECRET);
		return payload.id;
	} catch {
		return null;
	}
};

router.get("/", async (req, res) => {
	const userId = getUserId(req);
	if (!userId) return res.json({ redirect: "authentication.html" });

	try {
		const { rows } = await db.query(
			`SELECT name, username, department, batch, phone, email, profile_picture, role
			 FROM users WHERE id = $1 AND status IN ('approved', 'archived') LIMIT 1`,
			[userId]
		);

		if (!rows[0]) return res.status(401).json({ redirect: "authentication.html" });

		if (rows[0].role === 'hs') {
			return res.status(403).json({ redirect: "edit-administrator-profile.html" });
		}

		const { name, username, department, batch, phone, email, profile_picture } = rows[0];
		return res.json({ name, username, department, batch, phone, email, profile_picture });
	}
	
	catch (error) {
		return res.status(500).json({ error: "Unable to load profile" });
	}
});

router.post("/", async (req, res) => {
	const userId = getUserId(req);
	if (!userId) return res.status(401).json({ redirect: "authentication.html" });

	const { name, department, phone } = req.body;
	if (
		typeof name !== "string" || !/^[A-Za-z .]{3,}$/.test(name) ||
		!departments.has(department) ||
		typeof phone !== "string" || !/^01[0-9]{9}$/.test(phone)
	) {
		return res.status(400).json({ error: "Invalid profile information" });
	}

	try {
		const { rowCount } = await db.query(
			"SELECT 1 FROM users WHERE phone = $1 AND id <> $2 AND status <> 'deleted' LIMIT 1",
			[phone, userId]
		);
		if (rowCount > 0) {
			return res.status(409).json({ message: "Phone is already used" });
		}

		await db.query(
			`UPDATE users SET name = $1, department = $2, phone = $3, updated_at = NOW()
			 WHERE id = $4`,
			[name, department, phone, userId]
		);
		return res.status(200).json({ message: "Profile updated." });
	} catch (error) {
		return res.status(500).json({ message: "Unable to update profile" });
	}
});

export default router;
