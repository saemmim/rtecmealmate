import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const forceToggleMealRoutes = express.Router();

async function getBatchNStatus(id, period) {
    try {
        const { rows } = await db.query(
            `SELECT u.batch,
                m.status,
                EXISTS (
                    SELECT 1
                    FROM managers AS m
                    JOIN users AS u ON u.id = m.user_id
                    WHERE m.user_id = $1 AND m.period = $2
                    AND u.batch IS NOT NULL
                    AND u.batch = (
                        SELECT MIN(manager_user.batch)
                        FROM managers AS manager
                        JOIN users AS manager_user ON manager_user.id = manager.user_id
                        WHERE manager_user.batch IS NOT NULL
                    )
                ) AS is_eldest
            FROM managers AS m
            JOIN users AS u ON u.id = m.user_id
            WHERE m.user_id = $1 AND m.period = $2`,
            [id, period]
        );
        
        return rows[0];

    } 
    catch (error) {

        console.error('Error checking eldest batch:', error);
        return { is_eldest: false, batch: null, status: null };

    } 
}

async function getHrBatch(id) {
    try {
        const { rows } = await db.query(
            `SELECT u.batch,
                COALESCE(
                    u.batch = (
                        SELECT MIN(batch)
                        FROM users
                        WHERE role = 'hr' AND batch IS NOT NULL
                    ),
                    false
                ) AS is_eldest
            FROM users AS u
            WHERE u.id = $1 AND u.role = 'hr'`,
            [id]
        );
        
        return rows[0];

    } 
    catch (error) {

        console.error('Error checking eldest batch for HR:\n', error);
        return { is_eldest: false, batch: null, status: null };

    }  
}

forceToggleMealRoutes.post('/', async (req, res) => {
    try {

        const manager = jwt.verify(req.cookies?.token, process.env.JWT_SECRET);
        const payload = req.body;

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (payload.meal_date >= today) {
            return res.status(401).json({ message: 'Only permitted for past dates.' });
        }

        const period = payload.meal_date.slice(0, 7);
        const { batch, status, is_eldest } = await getBatchNStatus(manager.id, period);


        if (status != 'open' && status != 'reopened') {
            return res.status(401).json({ message: 'Unauthorized.' })
        }
        const payloadBatch = await db.query(
            'SELECT batch FROM users WHERE id = $1',
            [payload.user_id]
        );

        if (Number(payloadBatch.rows[0].batch) > Number(batch)){
            return res.status(401).json({ message: 'Unauthorized.' })
        }
        if (Number(payloadBatch.rows[0].batch) < Number(batch) & !is_eldest) {
            return res.status(401).json({ message: 'Unauthorized.' })
        }
        
        if (payload.guest) {

            await db.query(
                'DELETE FROM pending_meals WHERE user_id = $1 AND meal_date = $2 AND guest = true',
                [payload.user_id, payload.meal_date]
            );

            const { rows } = await db.query(
                'SELECT COUNT(*) AS total_guests FROM meals WHERE user_id = $1 AND meal_date = $2 AND guest = true',
                [payload.user_id, payload.meal_date]
            );

            const totalGuests = Number(rows[0].total_guests);

            await db.query(
                `INSERT INTO pending_meals
                (user_id, meal_date, guest, guests_status, requested_by)
                VALUES
                ($1, $2, true, $3, $4)`,
                [payload.user_id, payload.meal_date, `from ${totalGuests} to ${payload.total_guests}`, manager.id]
            );

            return res.status(200).json({message: `Requested to change guest meal from ${totalGuests} to ${payload.total_guests}. 
                Waiting for hall representative confirmation.`})

        } else {

            await db.query(
                'DELETE FROM pending_meals WHERE user_id = $1 AND meal_date = $2 AND guest = false',
                [payload.user_id, payload.meal_date]
            );

            const { rows } = await db.query(
                'SELECT COUNT(*) AS total_guests FROM meals WHERE user_id = $1 AND meal_date = $2 AND guest = true',
                [payload.user_id, payload.meal_date]
            );

            const totalGuests = Number(rows[0].total_guests);

            await db.query(
                `INSERT INTO pending_meals
                (user_id, meal_date, toggle_to, requested_by, guests_status)
                VALUES
                ($1, $2, $3, $4, $5)`,
                [payload.user_id, payload.meal_date, payload.toggle_to, manager.id, totalGuests]
            );

            return res.status(200).json({message: `Requested to turn ${payload.toggle_to} meal. 
                Waiting for hall representative confirmation.`})
        }
    }
    catch (error) {
        console.error('Error in force toggling meal:\n', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

forceToggleMealRoutes.get('/', async (req, res) => {
    try {

        const hr = jwt.verify(req.cookies?.token, process.env.JWT_SECRET);
        const hrBatch = await getHrBatch(hr.id)

        if (!hrBatch?.batch){
            return res.status(401).json({ message: 'Unauthorized.' })
        }
        
        const batch = Number(hrBatch.batch);
        let batches = [];

        if (hrBatch?.is_eldest){
            batches = [batch, batch - 1, batch -2, batch -3];
        } else batches = [batch, null, null, null]

        const { rows } = await db.query(`
            SELECT
                u.name,
                u.username,
                u.batch,
                u.department,
                u.profile_picture,
                pm.*,
                req.username AS requested_by
            FROM pending_meals pm
            JOIN users u   ON u.id   = pm.user_id
            JOIN users req ON req.id = pm.requested_by
            WHERE u.batch IN ($1, $2, $3, $4)
            `, batches);
        return res.status(200).json(rows);
    }
    catch (error) {
        console.error('Error getting pending meals:\n', error);
        res.status(500).json({ message: 'Internal server error.' })
    }
});

forceToggleMealRoutes.get('/proceed/total', async (req, res) => {
    try {

        const hr = jwt.verify(req.cookies?.token, process.env.JWT_SECRET);
        const hrBatch = await getHrBatch(hr.id)

        if (!hrBatch?.batch){
            return res.status(401).json({ message: 'Unauthorized.' })
        }
        
        const batch = Number(hrBatch.batch);
        let batches = [];

        if (hrBatch?.is_eldest){
            batches = [batch, batch - 1, batch -2, batch -3];
        } else batches = [batch, null, null, null]

        const { rows } = await db.query(`
            SELECT COUNT(*) AS total
            FROM pending_meals AS pm
            JOIN users AS u ON u.id = pm.user_id
            WHERE u.batch IN ($1, $2, $3, $4)
            `, batches
        );

        return res.status(200).json({ pending_meals: Number(rows[0].total) });
    }
    catch (error) {
        console.error('Error in geting total pending meals:\n', error);
        res.status(500).json({ message: 'Internal server error.' })
    }
});



async function deleteRequest(id) {
    try {
        await db.query(
            'DELETE FROM pending_meals WHERE id = $1',
            [id]
        );
    }
    catch (error) {
        throw error;
    }
}

forceToggleMealRoutes.post('/proceed', async (req, res) => {
    try {

        const payload = req.body;

        const hr = jwt.verify(req.cookies?.token, process.env.JWT_SECRET);
        const hrBatch = await getHrBatch(hr.id)

        if (!hrBatch?.batch){
            return res.status(401).json({ message: 'Unauthorized.' })
        }
        
        const batch = Number(hrBatch.batch);
        let batches = [];

        if (hrBatch?.is_eldest){
            batches = [batch, batch - 1, batch -2, batch -3];
        } else batches = [batch, null, null, null]

        const { rows } = await db.query(`
            SELECT
                u.batch,
                pm.user_id,
                pm.guest,
                pm.guests_status,
                pm.toggle_to,
                pm.meal_date
            FROM pending_meals AS pm
            JOIN users AS u ON u.id = pm.user_id
            WHERE pm.id = $1
            `, [payload.id]
        );

        const request = rows[0];

        if (hrBatch.is_eldest){
            if (batch > request.batch) return res.status(400).json({ message: "Not permitted" })
        }
        else if (batch == request.batch){ /*continue*/ }
        else return res.status(400).json({ message: "Not permitted" })

        if (!payload.approve){
            await deleteRequest(payload.id);
            return res.status(200).json({ message: "Success." });
        }

        if (request.guest){

            const guestCounts = request.guests_status.match(/from\s+(\d+)\s+to\s+(\d+)/i);
            if (!guestCounts) {
                return res.status(500).json({ message: "Request error!" });
            }

            const difference = Number(guestCounts[2]) - Number(guestCounts[1]);

            if (difference < 0){

                await db.query(`
                    DELETE FROM meals
                    WHERE id IN (
                        SELECT id
                        FROM meals
                        WHERE user_id = $1
                          AND meal_date = $2
                          AND guest = TRUE
                        ORDER BY id DESC
                        LIMIT $3
                    )
                    `, [request.user_id, request.meal_date, Math.abs(difference)]
                );

                await deleteRequest(payload.id);
                return res.status(200).json({ message: "Success." });

            }
            else if (difference > 0){

                await db.query(`
                    INSERT INTO meals (user_id, meal_date, guest)
                    SELECT $1, $2, TRUE
                    FROM generate_series(1, $3)
                    `, [request.user_id, request.meal_date, difference]
                );

                await deleteRequest(payload.id);
                return res.status(200).json({ message: "Success." });

            }
            else return res.status(500).json({ message: "Request error!" });

        }
        else if (request.guest == false){
            if (request.toggle_to == 'on'){
                await db.query(
                    'INSERT INTO meals (user_id, meal_date) VALUES ($1, $2)',
                    [request.user_id, request.meal_date]
                );
                await deleteRequest(payload.id);
                return res.status(200).json({ message: "Success." });
                
            }
            else if (request.toggle_to == 'off'){

                await db.query(
                    'DELETE FROM meals WHERE user_id = $1 AND meal_date = $2',
                    [request.user_id, request.meal_date]
                );

                await deleteRequest(payload.id);
                return res.status(200).json({ message: "Success." });

            }

            else return res.status(500).json({ message: "Data corrupted!" })

        }
        else return res.status(500).json({ message: "Request error!"})

    }
    catch (error) {

        console.error('Error in proceeding with force toggling meal:', error);
        res.status(500).json({ message: 'Internal server error.' })


    }
});


export default forceToggleMealRoutes;