import express from 'express';



import db from './middleware/db.js';

import authRoutes from './routes/authRoutes.js';
import statusRoutes from './routes/statusRoutes.js';
import batchesRoutes from './routes/batchesRoutes.js';
import allowedBatchesRoutes from './routes/allowedBatchesRoutes.js';
import mealConfigRoutes from './routes/mealConfigRoutes.js';

import userApprovalRoutes from './routes/userApprovalRoutes.js';
import representativesRoutes from './routes/representativesRoutes.js';
import managersRoutes from './routes/managersRoutes.js';
import bulletinsRoutes from './routes/bulletinsRoutes.js';
import receiptsRoutes from './routes/receiptsRoutes.js';

import managerRoutes from './routes/managerRoutes.js';
import userRoutes from './routes/userRoutes.js';

import editProfileRoutes from './routes/editProfileRoutes.js';
import editAdministratorProfileRoutes from './routes/editAdministratorProfileRoutes.js';
import changePasswordRoutes from './routes/changePasswordRoutes.js';
import profilePictureRoutes from './routes/profilePictureRoutes.js';
import pendingPPRoutes from './routes/pendingPPRoutes.js';

import countUsersRoutes from './routes/countUsersRoutes.js';
import roleRoutes from './routes/rolesRoutes.js';

import forceToggleMealRoutes from './routes/forceToggleMealRoutes.js';

import fs from 'fs';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();


const app = express();
const port = process.env.PORT || 3000;


async function isAuthenticated(req, res, next) {

    try {
        const token = req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                message: 'Authentication required.',
                redirect: '/authentication.html'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (!decoded.id) {
            return res.status(401).json({
                message: 'Proper authentication required.',
                redirect: '/authentication.html'
            });
        }


        const { rows } = await db.query("SELECT id, status FROM users WHERE id = $1", [decoded.id]);

        if (!rows[0]) {
            return res.status(401).json({
                message: 'User not found.',
                redirect: '/authentication.html'
            });
        }

        if (rows[0].status === 'approved' || rows[0].status === 'archived') {
            return next();
        }

        if (rows[0].status === 'pending') {
            return res.status(403).json({
                message: 'Your account is pending approval.',
                redirect: '/pending.html'
            });
        }

        if (rows[0].status === 'banned') {
            return res.status(403).json({
                message: 'Your account has been banned.',
                redirect: '/banned.html'
            });
        }

    } catch (error) {
        return res.status(401).json({
            message: 'Something went wrong with authentication.',
            redirect: '/authentication.html'
        });
    }
}





// Middleware
app.use(express.json());
app.use(cookieParser());

app.use(express.static('./public'));

// Public Routes
app.use('/auth', authRoutes);
app.use('/allowed-batches', allowedBatchesRoutes);
app.use('/status', statusRoutes);
app.use('/pending/profile-picture', pendingPPRoutes);

// Root Route
app.get('/', (req, res) => {
    
    try {
        const token = req.cookies?.token;
        if (token && process.env.JWT_SECRET) {
            jwt.verify(token, process.env.JWT_SECRET);
            return res.redirect('/dashboard');
        }
    } catch (error) {
        // Invalid or expired token; redirect to authentication.
        return res.redirect('/authentication.html');
    }
    return res.redirect('/authentication.html');
});

// Authentication middleware
app.use(isAuthenticated); 

// Private Routes
app.use('/batches', batchesRoutes);
app.use('/meal-config', mealConfigRoutes);

app.use('/user-approval', userApprovalRoutes);
app.use('/representatives', representativesRoutes);
app.use('/managers', managersRoutes);
app.use('/bulletins', bulletinsRoutes);
app.use('/receipts', receiptsRoutes);

app.use('/manager', managerRoutes);
app.use('/user', userRoutes);

app.use('/edit-profile', editProfileRoutes);
app.use('/edit-administrator-profile', editAdministratorProfileRoutes);
app.use('/change-password', changePasswordRoutes);
app.use('/profile-picture', profilePictureRoutes);

app.use('/count-users', countUsersRoutes);
app.use('/roles', roleRoutes);

app.use('/force-toggle-meal', forceToggleMealRoutes);


// app.get('/month', (req, res) => {
//     const { period } = req.query;
    
//     if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
//         return res.status(400).json({ error: 'period must be in yyyy-mm format' });
//     }

//     return res.json({ period });
// });





// Test database connection & start server
async function startServer() {
    await db.query('SELECT NOW()', (err, result) => {
        if (err) {
            console.error('Database connection failed:', err.message);
            return;
        } else {
            console.log('Database connected successfully at:', result.rows[0].now);
            app.listen(port, () => {
                console.log(`Server has started on port: ${port}`);
            });
        }

        // Show database schema
        db.query(`SELECT current_database(), current_schema(), current_user`, (err, schema) => {
            if (err) {
                console.error('Error fetching database info:', err.message);
                return;
            }
            //console.log('Current database, schema, and user:', schema.rows[0]);
        });
    });
}

startServer();