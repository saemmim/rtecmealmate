// profilePictureRoutes.js
// Defines the POST /profile-picture route: upload -> virus scan -> resize/convert -> save.
// Requires cookie-parser to already be set up on the main app (so req.cookies exists).

import express from 'express'; // web framework
import jwt from 'jsonwebtoken'; // used to decode/verify the JWT stored in the auth cookie
import { createUploadMiddleware, scanUploadedFile } from '../middleware/virusScanner.js'; // multer factory + ClamAV middleware
import { processProfilePicture } from '../middleware/profilePictureProcessor.js'; // sharp resize/convert/save logic
import db from '../middleware/db.js'; // database connection

const profilePictureRouters = express.Router(); // creates a mini Express app just for this route



// Build a multer instance specifically for profile pictures: images only, 20MB max.
// A different feature (e.g. attachments) would call createUploadMiddleware()
// again in its own route file with its own mimetypes/size limit.
const upload = createUploadMiddleware({
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
});



// POST /profile-picture
// Middleware chain runs left to right:
//   1. upload.single('profilePicture')  -> multer saves the raw file to disk, sets req.file
//   2. scanUploadedFile                 -> ClamAV scans req.file.path, rejects if infected
//   3. (inline handler below)           -> decode JWT, resize/convert/save, respond

profilePictureRouters.post(
    '/',
    upload.single('profilePicture'), // 'profilePicture' must match the field name your frontend form uses
    // scanUploadedFile, // only calls next() if the file passed the virus scan
    async (req, res) => {
        try {
            const token = req.cookies?.token || null;
  
            if (!token) {
                console.warn("No token provided in cookies.");
                return res.status(401).json({ redirect: "/authentication.html" });
            }
  
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const id = decoded.id;

            const username = decoded.username;

            if (!username) {
                return res.status(401).json({ error: 'Token did not contain a valid username.' });
            }

            // ---- 3. Resize, convert to webp, and save the file ----
            // req.file.buffer is the raw image bytes still in memory (already
            // confirmed virus-free by scanUploadedFile before we got here).
            const fileUrl = await processProfilePicture(req.file.buffer, username);

            // ---- 4. Update the user's profile_picture field in the database ----
            await db.query(
                'UPDATE users SET profile_picture = $1 WHERE username = $2',
                [fileUrl, username]
            );


            // ---- 5. Tell the frontend everything succeeded ----
            // Frontend is expected to check `redirect` and reload/navigate accordingly.
            return res.status(200).json({ redirect: true });
        }
        
        catch (err) {
            console.error('Profile picture upload error:', err);

            // Distinguish a bad/expired token from a generic server error so the
            // frontend could, for example, redirect to login on 401 specifically.
            if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
            }

            return res.status(500).json({ error: 'Something went wrong while processing the image.' });
        }
    }
);

// Express error-handling middleware specifically for multer errors
// (e.g. file too large, wrong file type from fileFilter). Express recognizes
// this as an error handler because it takes 4 arguments (err, req, res, next).
profilePictureRouters.use((err, req, res, next) => {
    if (err) {
        // Covers both multer's own errors (like file-size-too-large) and the
        // custom Error thrown from fileFilter in virusScanner.js.
        console.log(err.message);
        return res.status(400).json({ message: err.message });
    }
    next();
});

export default profilePictureRouters;