import express from 'express';
import db from "../middleware/db.js";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();


const authRoutes = express.Router();


const allowedDepartments = ['YE', 'FE', 'AE', 'WPE'];


// Login Route

authRoutes.post('/login', async (req, res) => {
    try {
        const { loginEmail, loginPassword } = req.body || {};
        
        if (!loginEmail || !loginPassword) {
            return res.status(400).json({ message: 'Email and password are required.' });
        }

        const normalizedEmail = loginEmail.trim().toLowerCase();
        
        const user = await db.query(
            'SELECT id, username, password_hash, role FROM users WHERE email = $1 AND status <> $2',
            [normalizedEmail, 'deleted']
        );

        if (user.rows.length === 0) {
            return res.status(401).json({ message: 'Email not registered.' });
        }

        const isMatch = await bcrypt.compare(loginPassword, user.rows[0].password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect password.' });
        }
        
        // Create a JWT token for the authenticated user
        const token = jwt.sign(
            {
                id: user.rows[0].id,
                username: user.rows[0].username
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '70d'
            }
        );

        
        // Send the cookie
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 70 * 24 * 60 * 60 * 1000
        });

        if (user.rows[0].role === 'hs') {
            return res.status(200).json({
                message: 'Login successful.',
                redirect: '/dashboard/administrator.html'
            }); 
        }
        
        
        return res.status(200).json({
            message: 'Login successful.',
            redirect: '/dashboard'
        });
    }
    
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Something went wrong while logging in.' });
    }
});


// Signup Route

authRoutes.post('/signup', async (req, res) => {
    try {

        let allowedBatches;
        try {
            const { rows } = await db.query(`
                SELECT batch FROM batches
                WHERE status = 'open' ORDER BY batch ASC;
                `);
            allowedBatches = rows.map(row => row.batch);
        } catch (error) {
            console.error('Error retrieving batches:', error);
            res.status(500).json({ error: 'Failed to retrieve batches' });
        }

        const { name, username, batch, department, email, phone, password } = req.body || {};

        const errors = [];

        if (!name || typeof name !== 'string' || name.trim().length < 3 || !/^[A-Za-z. ]{3,}$/.test(name.trim())) {
            errors.push('Name must be at least 3 characters and contain only letters, spaces or dots.');
        }

        if (!username || typeof username !== 'string' || username.trim().length < 3 || !/^[a-z0-9.]{3,}$/.test(username.trim())) {
            errors.push('Username must be at least 3 characters and contain only lowercase letters, numbers or dots.');
        }
        
        if (!batch || !allowedBatches.includes(batch)) {
            errors.push(`Batch must be one of: ${allowedBatches.join(', ')}`);
        }
        
        if (!department || !allowedDepartments.includes(department)) {
            errors.push(`Department must be one of: ${allowedDepartments.join(', ')}`);
        }
        
        if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            errors.push('Email is invalid.');
        }

        if (!phone || typeof phone !== 'string' || phone.trim().length !== 11  || !/^[0-9]+$/.test(phone.trim())) {
            errors.push('Phone number is invalid.');
        }

        if (!password || typeof password !== 'string' || password.length < 6) {
            errors.push('password must be at least 6 characters long.');
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: errors, errors });
        }

        const normalizedName = name.trim();
        const normalizedUsername = username.trim();
        const normalizedEmail = email.trim().toLowerCase();


        // Check if username, email, or phone already exists in the database

        const usernameExists = await db.query(
            'SELECT id FROM users WHERE username = $1 AND status <> $2',
            [normalizedUsername, 'deleted']
        );

        if (usernameExists.rows.length > 0) {
            return res.status(409).json({ message: 'Username already exists.' });
        }

        const emailExists = await db.query(
            'SELECT id FROM users WHERE email = $1 AND status <> $2',
            [normalizedEmail, 'deleted']
        );

        if (emailExists.rows.length > 0) {
            return res.status(409).json({ message: 'Email already exists.' });
        }

        const phoneExists = await db.query(
            'SELECT id FROM users WHERE phone = $1 AND status <> $2',
            [phone, 'deleted']
        );

        if (phoneExists.rows.length > 0) {
            return res.status(409).json({ message: 'Phone number already exists.' });
        }


        // Hash the password before storing it in the database
        const hashedPassword = await bcrypt.hash(password, 10);


        // Insert the new user into the database
        const result = await db.query(
            `INSERT INTO users (name, username, batch, department, email, phone, password_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, username, batch, department, email, phone`,
            [normalizedName, normalizedUsername, batch, department, normalizedEmail, phone, hashedPassword]
        );

        
        // Create a JWT token for the registered user
        const token = jwt.sign(
            {
                id: result.rows[0].id,
                username: result.rows[0].username
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '70d'
            }
        );
        

        // Send the cookie
        
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 70 * 24 * 60 * 60 * 1000
        });


        return res.status(201).json({
            message: 'Registration successful',
            redirect: '/pending.html'
        });
    }
    
    catch (error) {
        console.error('A user tried to signup but', error);
        return res.status(500).json({ message: 'Something went wrong while signing up.' });
    }
});


// Logout Route

authRoutes.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });
    
    return res.status(200).json({
        message: 'Logout successful.',
        redirect: '/authentication.html'
    });
});



// Current User Route

authRoutes.get('/me', async (req, res) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.redirect('/authentication.html');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const result = await db.query(
            `SELECT id, name, username, department, batch, email, phone, profile_picture, role
             FROM users WHERE id = $1`, [decoded.id]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: 'Not found!',
                redirect: '/authentication.html'
            });
        }

        return res.status(200).json(result.rows[0]);
    } catch (error) {
        return res.status(401).json({
            message: error.message,
            redirect: '/authentication.html'
        });
    }
});







export default authRoutes;