import express from "express";
import jwt from "jsonwebtoken";
import path from "path";
import db from '../middleware/db.js';
import fs from 'fs';

const userRoutes = express.Router();

async function getAuthenticatedUserId(req, res) {

    const token = req.cookies?.token;

	if (!token || !process.env.JWT_SECRET) return null;

	let payload;
	try {
		payload = jwt.verify(token, process.env.JWT_SECRET);
	} catch {
		return null;
	}

	const userId = payload?.id;
	if (!userId) return null;

	const { rows } = await db.query(
		"SELECT id FROM users WHERE id = $1",
		[userId]
	);

	if (!rows[0]) return null; else return rows[0].id;

}


function effectiveDate() {

	const configPath = path.resolve(process.cwd(), 'src', 'meal-config.json');
	const rawConfig = fs.readFileSync(configPath, 'utf8');
	const config = JSON.parse(rawConfig);

	const offset = config.meal_lock_offset;

	// 1. Parse the offset string
	const match = offset.match(/^([+-])(\d{1,2}):(\d{2})$/);
	if (!match) {
	throw new Error(`Invalid meal_lock_offset format: ${offset}`);
	}

	const sign = match[1] === '+' ? 1 : -1;
	const hours = parseInt(match[2], 10);
	const minutes = parseInt(match[3], 10);

	// 2. Create "today at midnight"
	const now = new Date();
	const lockTime = new Date(now);
	lockTime.setHours(0, 0, 0, 0); // midnight today

	// 3. Apply the offset
	lockTime.setHours(lockTime.getHours() + sign * hours);
	lockTime.setMinutes(lockTime.getMinutes() + sign * minutes);

	const date = new Date().toISOString().slice(0, 10);
	
	// 4. Compare current time with lock time
	if (now >= lockTime) {
		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		return {date: nextDay.toISOString().slice(0, 10), effective_from: 'tomorrow'};
	}
	else {
		return {date: date, effective_from: 'today'};
	}
}


userRoutes.get("/today", async (req, res) => {
	try {
		const userId = await getAuthenticatedUserId(req);
		if (!userId) {
			return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
		}

		const { rows } = await db.query(
			`SELECT
				COUNT(*) FILTER (WHERE guest = FALSE) AS normal_meal,
				COUNT(*) FILTER (WHERE guest = TRUE) AS guest_meal
			 FROM meals
			 WHERE user_id = $1 AND meal_date = CURRENT_DATE`,
			[userId]
		);

		const normalMeal = Number(rows[0].normal_meal);
		const guestMeal = Number(rows[0].guest_meal);

		if (normalMeal + guestMeal === 0) {
			return res.json({ meal_status: "off", guest_meals: 0 });
		}

		return res.json({ meal_status: "on", guest_meals: guestMeal });
	} catch (error) {
		return res.status(500).json({ message: "Failed to get today's meals" });
	}
});

userRoutes.get("/transactions", async (req, res) => {
	try {
		
		const userId = await getAuthenticatedUserId(req);
		if (!userId) {
			return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
		}

		if (req.query.query) {
			
			const { rows } = await db.query(
				`SELECT
					d.created_at,
					d.amount,
					collector.username AS collected_by,
					d.note
				FROM deposits d
				JOIN users collector ON collector.id = d.collected_by
				WHERE d.user_id = $1 AND d.period = $2
				ORDER BY d.created_at DESC`,
				[userId, req.query.query]
			);
			
			return res.status(200).json(rows);
			
		}

		const currentYearMonth = new Date().toISOString().slice(0, 7);

		const { rows } = await db.query(
			`SELECT
				d.created_at,
				d.amount,
				collector.username AS collected_by,
				d.note
			 FROM deposits d
			 JOIN users collector ON collector.id = d.collected_by
			 WHERE d.user_id = $1 AND d.period = $2
			 ORDER BY d.created_at DESC`,
			[userId, currentYearMonth]
		);
		console.log(rows);
		return res.status(200).json(rows);
	} catch (error) {
		return res.status(500).json({ message: "Failed to get transactions" });
	}
});


userRoutes.get("/calendar", async (req, res) => {
    try {
        const userId = await getAuthenticatedUserId(req);
        if (!userId) {
            return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
        }

        const period = req.query.query;
        if (typeof period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
            return res.status(400).json({ message: "A valid query period (yyyy-mm) is required" });
        }

        const { rows } = await db.query(
			    `SELECT
				    meal_date,
				    COUNT(*) FILTER (WHERE guest = FALSE) AS normal_meals,
				    COUNT(*) FILTER (WHERE guest = TRUE) AS guest_meals
                FROM meals
                WHERE user_id = $2
                AND meal_date >= ($1 || '-01')::date
                AND meal_date < ($1 || '-01')::date + INTERVAL '1 month'
                GROUP BY meal_date
                ORDER BY meal_date`,
            [period, userId]
        );

        return res.json(rows);
    } catch (error) {
        return res.status(500).json({ message: "Failed to get calendar meals" });
    }
});


userRoutes.get("/toggle-meal", async (req, res) => {
	try {
		const userId = await getAuthenticatedUserId(req);
		if (!userId) {
			return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
		}

		const date = effectiveDate().date;

		const { rows } = await db.query(
			`SELECT COUNT(*) AS total_meals
				FROM meals
				WHERE user_id = $1 AND meal_date = $2`,
			[userId, date]
		);

		if (Number(rows[0].total_meals) > 0) {
			return res.json({ meal_status: "on", effective_date: date });
		}
		else if (Number(rows[0].total_meals) === 0) {
			return res.json({ meal_status: "off", effective_date: date });
		}
		else{ throw new Error("Unexpected meal count"); }

	} catch (error) {
		console.log(error);
		return res.status(500).json({ message: "Failed to get toggle status" });
	}
});


userRoutes.post("/toggle-meal", async (req, res) => {
	try {

		const userId = await getAuthenticatedUserId(req);
		if (!userId) {
			return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
		}

		const date = effectiveDate().date;

		const payload = req.body;

		if (req.body?.effective_date !== date) {
			return res.status(400).json({ message: "Failed to toggle. Please reload and try again" });
		}

		if (payload?.meal_status === "on") {
			await db.query(
				"INSERT INTO meals (user_id, meal_date) VALUES ($1, $2)",
				[userId, date]
			);
			return res.status(201).json({ meal_status: "on", effective_date: date });
		}
		else if (payload?.meal_status === "off") {
			await db.query(
				"DELETE FROM meals WHERE user_id = $1 AND meal_date = $2",
				[userId, date]
			);
			return res.status(200).json({ meal_status: "off", effective_date: date });
		}
		else {
			return res.status(400).json({ message: "Invalid meal_status value. Must be 'on' or 'off'." });
		}
	}
	catch (error) {
		return res.status(500).json({ message: "Failed to toggle meal" });
	}
});


userRoutes.get("/guest-meals", async (req, res) => {
	try {
		const userId = await getAuthenticatedUserId(req);
		if (!userId) {
			return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
		}

		const date = effectiveDate().date;
		
		const { rows } = await db.query(
			`SELECT COUNT(*) AS guest_meals
				FROM meals
				WHERE user_id = $1 AND meal_date = $2 AND guest = TRUE`,
			[userId, date]
		);
		return res.json({ guest_meals: Number(rows[0].guest_meals), effective_date: date });

	} catch (error) {
		console.error('Error fetching guest meals:', error);
		return res.status(500).json({ message: "Failed to get guest meals" });
	}
});


userRoutes.post("/guest-meals", async (req, res) => {
	try {
		const userId = await getAuthenticatedUserId(req);
		if (!userId) {
			return res.status(401).json({ redirect: "/authentication.html", message: "Authentication required" });
		}

		const date = effectiveDate().date;
		if (req.body?.effective_date !== date) {
			return res.status(400).json({ message: "Failed to save. Please reload and try again" });
		}

		const guestMeals = req.body?.guest_meals;
		if (!Number.isInteger(guestMeals) || guestMeals < 0) {
			return res.status(400).json({ message: "Failed to save. Please enter a valid number of guest meals" });
		}

		const totalMeals = await db.query(
			`SELECT COUNT(*) AS total_meals
				FROM meals
				WHERE user_id = $1 AND meal_date = $2`,
			[userId, date]
		);

		if (Number(totalMeals.rows[0].total_meals) < 1) {
			return res.status(400).json({ message: "You must turn on meal to be able to add guest meals" });
		}

		await db.query(
			"DELETE FROM meals WHERE user_id = $1 AND meal_date = $2 AND guest = TRUE",
			[userId, date]
		);

		await db.query(
			`INSERT INTO meals (user_id, meal_date, guest)
				SELECT $1, $2, TRUE
				FROM generate_series(1, $3)`,
			[userId, date, guestMeals]
			
		);

		const { rows } = await db.query(
			`SELECT COUNT(*) AS guest_meals
				FROM meals
				WHERE user_id = $1 AND meal_date = $2 AND guest = TRUE`,
			[userId, date]
		);

		return res.status(201).json({ message: "Saved successfuly", guest_meals: Number(rows[0].guest_meals) });
	} catch (error) {
		return res.status(500).json({ message: "Failed to save guest meals" });
	}
});




export default userRoutes;
