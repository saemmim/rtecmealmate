import express from "express";
import jwt from "jsonwebtoken";
import db from "../middleware/db.js";

const editAdministratorProfileRoutes = express.Router();

const getAdministrator = (req) => {
	const token = req.cookies?.token;
	if (!token) return null;

	try {
		return jwt.verify(token, process.env.JWT_SECRET);
	} catch {
		return null;
	}
};

const authenticationError = (res) =>
	res.status(401).json({ redirect: "/authentication.html" });

editAdministratorProfileRoutes.get("/", async (req, res) => {
	const administrator = getAdministrator(req);
	if (!administrator) return authenticationError(res);

	try {
		const { rows } = await db.query(
			`SELECT name, username, department, email, phone, profile_picture, role
			FROM users WHERE id = $1 AND status = 'approved' AND role = 'hs'  LIMIT 1`,
			[administrator.id]
		);

		if (!rows.length) return res.status(404).json({ message: "Profile not found", redirect: "/dashboard/" });

		return res.json(rows[0]);
	}
    
    catch (error) {
		return res.status(500).json({ message: "Unable to load profile" });
	}
});

editAdministratorProfileRoutes.post("/", async (req, res) => {
	const administrator = getAdministrator(req);
	if (!administrator) return authenticationError(res);

	const { name, department, phone } = req.body;
	if (
		typeof name !== "string" || !/^[A-Za-z .]{3,}$/.test(name) ||
		typeof department !== "string" || !/^[A-Za-z .]{1,20}$/.test(department) ||
		typeof phone !== "string" || !/^01[0-9]{9}$/.test(phone)
	) {
		return res.status(400).json({ message: "Invalid profile information" });
	}

	const id = administrator.id;
	try {
		const { rows: used } = await db.query(
			"SELECT id FROM users WHERE phone = $1 AND id <> $2 AND status <> 'deleted' LIMIT 1",
			[phone, id]
		);
		if (used.length) return res.status(409).json({ message: "Phone is already used" });

		await db.query(
			"UPDATE users SET name = $1, department = $2, phone = $3, updated_at = NOW() WHERE id = $4",
			[name.trim(), department.trim(), phone.trim(), id]
		);
		return res.json({ message: "Profile updated successfully" });
	} catch (error) {
		console.log(error);
		return res.status(500).json({ message: "Unable to update profile" });
	}
});

export default editAdministratorProfileRoutes;
