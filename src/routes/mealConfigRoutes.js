import express from "express";
import fs from 'fs';
import path from 'path';
import db from '../middleware/db.js';


import cron from 'node-cron';
import { TIMEOUT } from "dns";
import { type } from "os";



//--------------------------------------------------------------------------------


function getDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
    const [year, month, day] = dateString.split("-").map(Number);

    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);

    return getDateString(date);
}


// function getTimeDateInfo (offset) {
//     const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
//     if (!match) {
//         throw new Error('Invalid meal lock offset.');
//     }

//     const [, sign, hours, minutes] = match;
//     const offsetMinutes = Number(hours) * 60 + Number(minutes);
//     if (offsetMinutes > 12 * 60 || Number(minutes) > 59) {
//         throw new Error('Meal lock offset must be between -12:00 and +12:00.');
//     }

//     const timeMinutes = sign === '+' ? offsetMinutes : 24 * 60 - offsetMinutes;
//     const hour = Math.floor(timeMinutes / 60);
//     const minute = timeMinutes % 60;

//     const now = new Date();
//     const formattedDate = [
//         now.getFullYear(),
//         String(now.getMonth() + 1).padStart(2, '0'),
//         String(now.getDate()).padStart(2, '0')
//     ].join('-');

//     const date = new Date(now);
//     if (sign === '-') {
//         date.setDate(date.getDate() - 1);
//     }

//     const lockDate = new Date(date);
    
//     lockDate.setHours(hour, minute, 0, 0);

//     const delayForNextPulse = now >= lockDate
//         ?  24 * 60 * 60 * 1000 + lockDate.getTime() - now.getTime()
//         : lockDate.getTime() - now.getTime();

//     return { date: formattedDate, delay: delayForNextPulse, timePassed: now >= lockDate };
// }

async function getTimeDateInfo (offset) {

    // Validate offset
    const match = offset.match(/^([+-])(\d{2}):(\d{2})$/);

    if (!match) {
        throw new Error("Invalid offset format");
    }

    const sign = match[1] === "+" ? 1 : -1;
    const hours = Number(match[2]);
    const minutes = Number(match[3]);

    if (hours > 12 || minutes > 59 || (hours === 12 && minutes !== 0)) {
        throw new Error("Offset must be between -12:00 and +12:00");
    }

    const offsetMs = sign * (hours * 60 + minutes) * 60 * 1000;

    // Get current timestamp
    const now = Date.now();

    // Get Bangladesh date
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(new Date(now));

    const dateParts = Object.fromEntries(
        parts.map(p => [p.type, p.value])
    );

    const { year, month, day } = dateParts;

    // Bangladesh midnight in UTC
    const midnight = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day)
    ) - (6 * 60 * 60 * 1000);

    // Today's cutoff
    const cutoff = midnight + offsetMs;

    // Has today's cutoff passed?
    const timePassed = now >= cutoff;

    // Expected execution date
    const expectedDateTimestamp = timePassed
        ? midnight + 24 * 60 * 60 * 1000
        : midnight;

    // Next cutoff
    const nextCutoff = timePassed
        ? cutoff + 24 * 60 * 60 * 1000
        : cutoff;

    // Format expected execution date
    const expectedExecutedDate = new Date(
        expectedDateTimestamp + 6 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);

    // Delay until next cutoff
    const delay = Math.max(0, nextCutoff - now);

    return {
        expectedExecutedDate,
        delay,
        timePassed
    };
}



let dailyTask = null;

async function dailyTaskScheduler () {
    if (dailyTask) {
        clearTimeout(dailyTask);
        dailyTask = null
    }
    
    try {

        let {rows: [mealConfig]} = await db.query('SELECT * FROM meal_config WHERE id = 1;');

        const { expectedExecutedDate, delay, timePassed } = await getTimeDateInfo (mealConfig.meal_lock_offset);
        console.log(expectedExecutedDate, delay, timePassed);
        
        const expectedExecutionDate = new Date(expectedExecutedDate);
        const lastExecutionDate = new Date(mealConfig.last_execution_date);

        // if (lastExecutionDate < todayDate && !timePassed) {
        //     dailyTask = setTimeout (() => {
        //         autoAddNextDayMeals(today)
        //     }, delay);
        //     console.log('Daily task will be executed after', delay, 'ms');
        //     return
        // }
        // if (lastExecutionDate < todayDate && timePassed) {
        //     console.log('lastExecutionDate < todayDate && timePassed')
        //     console.log(addDays(today, -1));
        //     autoAddNextDayMeals(addDays(today, -1));
        //     return
        // }
        // if (timePassed && (lastExecutionDate == todayDate || lastExecutionDate > todayDate)) {
        //     dailyTask = setTimeout(() => {
        //         autoAddNextDayMeals(addDays(today, 1));
        //     }, delay);
        //     console.log('Daily task will be executed after', delay, 'ms. Tomorrow:', addDays(today, 1));
        //     return
        // }

        if (lastExecutionDate == expectedExecutionDate) {
            dailyTask = setTimeout(() => {
                autoAddNextDayMeals(addDays(expectedExecutionDate, 1));
            }, delay);
            console.log('Daily task will be executed after', delay, 'ms. Tomorrow:', addDays(expectedExecutionDate, 1));
            return
        }
        if (lastExecutionDate < expectedExecutionDate) {
            console.log('lastExecutionDate < expectedExecutionDate')
            autoAddNextDayMeals(expectedExecutedDate);
            return
        }
        if (lastExecutionDate > expectedExecutionDate) {
            console.log('lastExecutionDate > expectedExecutionDate')
            autoAddNextDayMeals(addDays(expectedExecutedDate, 1));
            return
        }

        
    } catch (error) {console.log(error)}
}


async function autoAddNextDayMeals(date) {
    try {
        await db.query (`
            INSERT INTO meals (user_id, meal_date, guest)
            SELECT
                user_id,
                meal_date + INTERVAL '1 day',
                guest
            FROM meals
            WHERE meal_date = $1 AND guest <> true;
        `, [date]);

        let {rows: [mealConfig]} = await db.query('SELECT * FROM meal_config WHERE id = 1;');
        
        try {

            if (mealConfig.temp_meal_lock_offset !== null) {
                await db.query(`
                    UPDATE meal_config SET
                    meal_lock_offset = $1,
                    temp_meal_lock_offset = null
                    WHERE id = 1;
                `, [mealConfig.temp_meal_lock_offset]);
            }

            await db.query(`
                UPDATE meal_config SET
                last_execution_date = $1
                WHERE id = 1;
            `, [addDays(date, 1)]);

        } catch (error) {
            console.error('Error occurred during write operation:', error);
        }
        
        dailyTaskScheduler();

    } catch(error) {
        console.log('Error occured ducting executing daily task.\n', error)
    }
}


dailyTaskScheduler();


//--------------------------------------------------------------------------------



const mealConfigRoutes = express.Router();


mealConfigRoutes.get('/', async (req, res) => {
    try {
        const {rows: [config]} = await db.query(`
            SELECT
            meal_lock_offset, temp_meal_lock_offset, expected_meal_rate
            FROM meal_config
            WHERE id = 1;`);

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
                    meal_lock_offset: config.meal_lock_offset,
                    temp_meal_lock_offset: config.temp_meal_lock_offset
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
            meal_lock_offset: config.meal_lock_offset,
            temp_meal_lock_offset: config.temp_meal_lock_offset

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

    // if (!(typeof meal_lock_offset !== 'string' ||
    //     (typeof expected_meal_rate === 'number' &&
    //     Number.isFinite(expected_meal_rate)))) {
    //     return res.status(400).json({
    //         error: 'Invalid meal config values.',
    //         message: 'Invalid meal config values!'
    //     });
    // }

    if (expected_meal_rate === undefined || expected_meal_rate === null) {
        // do nothing, allow null or undefined to be passed through
    }
    else if (expected_meal_rate == 0 ||
        !(
            typeof expected_meal_rate === 'number' &&
            Number.isFinite(expected_meal_rate)
        )) {
        return res.status(400).json({
            error: 'Invalid meal rate.',
            message: 'Invalid meal rate.'
        });
    }

    const mealLockOffsetMatch = typeof meal_lock_offset === 'string'
        ? /^([+-])?(\d{1,2}):([0-5]\d)$/.exec(meal_lock_offset)
        : null;
        
    const mealLockOffsetHours = mealLockOffsetMatch
        ? Number(mealLockOffsetMatch[2])
        : NaN;
    
    const mealLockOffsetMinutes = mealLockOffsetMatch
        ? Number(mealLockOffsetMatch[3])
        : NaN;


    if (!mealLockOffsetMatch || mealLockOffsetHours > 12 ||
        (mealLockOffsetHours === 12 && mealLockOffsetMinutes > 0)) {
        return res.status(400).json({
            error: 'Invalid meal lock time.',
            message: 'Invalid meal lock time.'
        });
    }

    try {
        const { rows : [config] } = await db.query(`
            UPDATE meal_config SET
            expected_meal_rate = $1,
            temp_meal_lock_offset = $2
            WHERE id = 1
            RETURNING expected_meal_rate,
            temp_meal_lock_offset;
            `, [expected_meal_rate, meal_lock_offset]);
        return res.json(config);
    } catch (error) {
        try {
            const { rows : [config] } = await db.query(`
                SELECT temp_meal_lock_offset
                FROM meal_config
                WHERE id = 1;
            `);
            if (config.temp_meal_lock_offset) {
                await db.query(`
                    UPDATE meal_config SET
                    temp_meal_lock_offset = NULL
                    WHERE id = 1
                `);
            }
        } catch (innnerError) {console.log(innerError);}

        console.error('Failed to save meal-config.json:', error.message);
        return res.status(500).json({
            error: error.message,
            message: 'Unable to save meal config.'
        });
    }
});





export default mealConfigRoutes;