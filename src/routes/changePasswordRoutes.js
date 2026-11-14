import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import db from "../middleware/db.js";

const passwordChangeRouters = express.Router();

passwordChangeRouters.get("/", async (req, res) => {
	try {
		const token = req.cookies?.token;

		if (!token) {
			return res.status(401).json({ redirect: "authentication.html" });
		}

		let payload;
		try {
			payload = jwt.verify(token, process.env.JWT_SECRET);
		} catch {
			return res.status(401).json({ redirect: "authentication.html" });
		}

		const { rows: users } = await db.query(
			"SELECT name, username, profile_picture FROM users WHERE id = $1 LIMIT 1",
			[payload.id]
		);

		if (!users.length) {
			return res.status(401).json({ redirect: "authentication.html" });
		}

		return res.json(users[0]);
	}
	
	catch (error) {
		return res.status(500).json({ message: "Unable to load profile" });
	}
});

passwordChangeRouters.post("/", async (req, res) => {
	try {
		const token = req.cookies?.token;
		const { oldPassword, newPassword } = req.body;

		if (!token) {
			return res.status(401).json({ redirect: "authentication.html" });
		}

		let payload;
		try {
			payload = jwt.verify(token, process.env.JWT_SECRET);
		} catch {
			return res.json({ redirect: "authentication.html" });
		}

		if (!oldPassword || !newPassword) {
			return res.status(400).json({ error: "Both passwords are required" });
		}
        
		const { rows: users } = await db.query(
            "SELECT password_hash FROM users WHERE id = $1 LIMIT 1",
			[payload.id]
		);
        
		if (!users.length || !(await bcrypt.compare(oldPassword, users[0].password_hash))) {
            return res.status(401).json({ error: "Old password is incorrect" });
		}
        
        if (oldPassword === newPassword) {
            return res.status(400).json({ message: "New password must be different from the old password" });
        }

        const password = await bcrypt.hash(newPassword, 10);
		
        await db.query(
			"UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
            [password, payload.id]
        );

		return res.json({ message: "Password changed successfully" });
	}
    
    catch (error) {
		return res.status(500).json({ message: "Unable to change password" });
	}
});

export default passwordChangeRouters;
