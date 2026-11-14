import express from "express";
import fs from 'fs';
import path from 'path';
import db from '../middleware/db.js';


import cron from 'node-cron';

let dailyTask = null;

function startDailyTask(hour, minute, date) {
  // Stop & clean up the previous task (if any)
  if (dailyTask) {
    dailyTask.destroy();
  }

  const cronExpression = `${minute} ${hour} * * *`;

  console.log(`Daily task set at ${hour}:${minute}`);
  dailyTask = cron.schedule(cronExpression, async () => {
      console.log(`Running daily task at ${hour}:${minute}`);
    try {
        await db.query (`
            INSERT INTO meals (user_id, meal_date, guest)
            SELECT
                user_id,
                meal_date + INTERVAL '1 day',
                guest
            FROM meals
            WHERE meal_date = $1 AND guest <> true;
            `, [date])
    } catch(error) {
        console.log('Error occured ducting executing daily task.\n', error)
    }
  }, {
    timezone: 'Asia/Dhaka'
  });

  console.log(`Daily task scheduled for ${hour}:${String(minute).padStart(2, '0')} ('Asia/Dhaka')`);
}

function getTimeDateInfo (offset) {
    const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
    if (!match) {
        throw new Error('Invalid meal lock offset.');
    }

    const [, sign, hours, minutes] = match;
    const offsetMinutes = Number(hours) * 60 + Number(minutes);
    if (offsetMinutes > 12 * 60 || Number(minutes) > 59) {
        throw new Error('Meal lock offset must be between -12:00 and +12:00.');
    }

    const timeMinutes = sign === '+' ? offsetMinutes : 24 * 60 - offsetMinutes;
    const hour = Math.floor(timeMinutes / 60);
    const minute = timeMinutes % 60;

    const now = new Date();
    const date = new Date(now);
    if (sign === '-') {
        date.setDate(date.getDate() - 1);
    }
    const formattedDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    const lockDate = new Date(date);
    lockDate.setHours(hour, minute, 0, 0);

    return { hour, minute, date: formattedDate, timePassed: now >= lockDate };
}

const offset = JSON.parse(
    fs.readFileSync(
        path.resolve(process.cwd(), 'src', 'meal-config.json'), 'utf8'
    )
).meal_lock_offset;

const { hour: h, minute: m, date: d, timePassed: tp } = getTimeDateInfo(offset);

startDailyTask(h, m, d);











const mealConfigRoutes = express.Router();


mealConfigRoutes.get('/', async (req, res) => {
    try {
        const configPath = path.resolve(process.cwd(), 'src', 'meal-config.json');
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(rawConfig);


        const { query } = req.query;
        let actualMealRate = null;
        const currentMonth = new Date().toISOString().slice(0, 7);

        if (query && typeof query === 'string'
            && /^\d{4}-(0[1-9]|1[0-2])$/.test(query)
            && query !== currentMonth) {
            try {
                const result = await db.query(
                    `SELECT
                COALESCE((
                SELECT SUM(ri.price)
                FROM receipts r
                JOIN receipt_items ri ON ri.receipt_id = r.id
                WHERE r.receipt_date >= $1::date
                    AND r.receipt_date < ($1::date + INTERVAL '1 month')
                ), 0) AS "Total Expense",
                (
                SELECT COUNT(*)
                FROM meals
                WHERE meal_date >= $1::date
                    AND meal_date < ($1::date + INTERVAL '1 month')
                ) AS total_meals`,
                    [`${query}-01`]
                );

                const totalExpense = Number(result.rows[0]['Total Expense']);
                const totalMeals = Number(result.rows[0].total_meals);

                actualMealRate = totalMeals > 0 ? totalExpense / totalMeals : null;

                return res.json({
                    total_meals: totalMeals,
                    total_expense: totalExpense,
                    actual_meal_rate: actualMealRate,
                });
            } catch (error) {
                console.error('Failed to calculate actual meal rate:', error.message);
                return res.status(500).json({
                    error: error.message,
                    message: 'Unable to calculate actual meal rate.'
                });
            }
        }

        if (config.expected_meal_rate == null) {
            try {
                const result = await db.query(
                    `SELECT
                    COALESCE((
                    SELECT SUM(ri.price)
                    FROM receipts r
                    JOIN receipt_items ri ON ri.receipt_id = r.id
                    WHERE r.receipt_date >= $1::date
                        AND r.receipt_date < ($1::date + INTERVAL '1 month')
                    ), 0) AS "Total Expense",
                    (
                    SELECT COUNT(*)
                    FROM meals
                    WHERE meal_date >= $1::date
                        AND meal_date < ($1::date + INTERVAL '1 month')
                    ) AS total_meals`,
                [`${currentMonth}-01`]);

                const totalExpense = Number(result.rows[0]['Total Expense']);
                const totalMeals = Number(result.rows[0].total_meals);

                actualMealRate = totalMeals > 0 ? totalExpense / totalMeals : null;

                return res.json({
                    total_meals: totalMeals,
                    total_expense: totalExpense,
                    actual_meal_rate: actualMealRate,
                    meal_lock_offset: config.meal_lock_offset
                });
            } catch (error) {
                console.error('Failed to calculate actual meal rate:', error.message);
                return res.status(500).json({
                    error: error.message,
                    message: 'Unable to calculate actual meal rate.'
                });
            }
        }

        return res.json({
            actual_meal_rate: actualMealRate,
            expected_meal_rate: config.expected_meal_rate,
            meal_lock_offset: config.meal_lock_offset
        });
    } catch (error) {
        console.error('Failed to read meal-config.json:', error.message);
        return res.status(500).json({
            error: error.message,
            message: 'Unable to read meal config file.'
        });
    }
});

mealConfigRoutes.post('/', async (req, res) => {
    let { expected_meal_rate, meal_lock_offset } = req.body ?? {};

    if (!(typeof meal_lock_offset !== 'string' ||
        (typeof expected_meal_rate === 'number' &&
        Number.isFinite(expected_meal_rate)))) {
        return res.status(400).json({
            error: 'Invalid meal config values.',
            message: 'Invalid meal config values.'
        });
    }

    const configPath = path.resolve(process.cwd(), 'src', 'meal-config.json');
    const tempConfigPath = path.resolve(process.cwd(), 'src', 'meal-config-temp.json');


    try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        const { hour, minute, date, timePassed } = getTimeDateInfo(meal_lock_offset);
        const { timePassed: wasTimePassed } = getTimeDateInfo(config.meal_lock_offset);
        
        config.expected_meal_rate = expected_meal_rate;
        if (meal_lock_offset[0] !== '-') meal_lock_offset = '+' + meal_lock_offset;
        config.meal_lock_offset = meal_lock_offset;
        fs.writeFileSync(tempConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

        startDailyTask(hour, minute, date);

        fs.renameSync(tempConfigPath, configPath);
        
        return res.json({
            expected_meal_rate: config.expected_meal_rate,
            meal_lock_offset: config.meal_lock_offset
        });
    } catch (error) {
        if (JSON.parse(fs.readFileSync(tempConfigPath, 'utf8'))) {
            fs.rmSync(tempConfigPath, { force: true });
        }
        console.error('Failed to save meal-config.json:', error.message);
        return res.status(500).json({
            error: error.message,
            message: 'Unable to save meal config.'
        });
    }
});





export default mealConfigRoutes;