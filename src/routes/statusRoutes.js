import { Router } from "express";
import db from "../middleware/db.js";
import jwt from "jsonwebtoken";

const statusRoutes = Router();

statusRoutes.get("/pending", async (req, res) => {
	try {
		const token = req.cookies?.token || null;

		if (!token) {
            console.warn("No token provided in cookies.");
			return res.status(401).json({ redirect: "/authentication.html" });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const id = decoded.id;

		console.log(id);

		if (!id) {
			return res.status(401).json({
                message: "Invalid authentication token",
                redirect: "/authentication.html"
             });
		}

		const {rows} = await db.query(
			`SELECT name, username, department, batch, phone, profile_picture, status
			 FROM users WHERE id = $1 LIMIT 1`,
			[id]
		);

		if (!rows.length) {
			return res.status(404).json({
                message: "User not found",
                redirect: "/authentication.html"
             });
		}

        if (rows[0].status === "approved") {
            return res.status(403).json({
                message: "User already approved",
                redirect: "/dashboard/"
             });
        }
        else if (rows[0].status === "banned") {
            return res.status(403).json({
                message: "Account banned",
                redirect: "/banned.html"
             });
        }
        else if (rows[0].status === "deleted") {
            return res.status(403).json({
                message: "Account deleted",
                redirect: "/authentication.html"
             });
        }


		return res.json(rows[0]);
	}
    
    catch (error) {
		if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
			return res.status(401).json({ message: "Invalid or expired authentication token" });
		}

		console.error("Failed to fetch pending user:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
});




statusRoutes.get("/banned", async (req, res) => {
	try {
		const token = req.cookies?.token || null;

		if (!token) {
			return res.status(401).json({ redirect: "/authentication.html" });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const id = decoded.id;

		if (!id) {
			return res.status(401).json({
				message: "Invalid authentication token",
				redirect: "/authentication.html"
			});
		}

		const { rows } = await db.query(
			"SELECT status FROM users WHERE id = $1 LIMIT 1",
			[id]
		);

		if (!rows.length) {
			return res.status(404).json({
				message: "User not found",
				redirect: "/authentication.html"
			});
		}

		if (rows[0].status === "approved" || rows[0].status === "active") {
			return res.status(403).json({
				message: "User is not banned",
				redirect: "/dashboard/"
			});
		}

		if (rows[0].status === "pending") {
			return res.status(403).json({
				message: "User approval is pending",
				redirect: "/pending.html"
			});
		}

		if (rows[0].status === "deleted") {
			return res.status(403).json({
				message: "Account deleted",
				redirect: "/authentication.html"
			});
		}

		const profile = await db.query(
			`SELECT name, username, department, batch, profile_picture, phone
			 FROM users
			 WHERE id = $1
			 LIMIT 1`,
			[id]
		);

		return res.json(profile.rows[0]);
	} catch (error) {
		if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
			return res.status(401).json({ redirect: "/authentication.html" });
		}

		console.error("Failed to fetch banned user:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
});


statusRoutes.post("/delete", async (req, res) => {
	try {
		const token = req.cookies?.token || null;

		if (!token) {
			return res.status(401).json({ redirect: "/authentication.html" });
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const id = decoded.id;

		if (!id) {
			return res.status(401).json({
				message: "Invalid authentication token",
				redirect: "/authentication.html"
			});
		}

		const { rowCount } = await db.query(
			"UPDATE users SET status = 'deleted', modified_at = NOW() WHERE id = $1",
			[id]
		);

		if (!rowCount) {
			return res.status(404).json({
				message: "User not found",
				redirect: "/authentication.html"
			});
		}

		res.clearCookie("token");
		return res.json({ message: "Account deleted",
			redirect: "/authentication.html"
		});
	}
	
	catch (error) {
		if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
			return res.status(401).json({
				message: "Invalid or expired authentication token",
				redirect: "/authentication.html"
			});
		}

		console.error("Failed to delete user:", error);
		return res.status(500).json({ message: "Internal server error" });
	}
});




export default statusRoutes;
