// profilePictureProcessor.js
// Responsible for taking a virus-scanned image file already on disk and turning it
// into a final 500x500 center-cropped .webp profile picture, saved under the
// username, inside the 'profile-pictures/' directory.

import sharp from 'sharp'; // image processing library (resize, format conversion, etc.)
import fs from 'fs'; // used to check/create folders and delete the temp file afterward
import path from 'path'; // used to safely build file paths
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The final destination folder for processed profile pictures.
// Kept separate from the multer temp-uploads folder used in virusScanner.js.
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'profile-pictures');

// Make sure the output folder exists before we ever try to save into it.
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true }); // recursive: true also creates any missing parent folders
}

/**
 * Resizes, converts, and saves an uploaded image as a profile picture.
 *
 * @param {Buffer} imageBuffer - the raw uploaded image, still in memory (already virus-scanned).
 * @param {string} username - used as the output filename (without extension).
 * @returns {Promise<string>} - the full path to the saved .webp file.
 */


async function processProfilePicture(imageBuffer, username) {
    // Build the final output path: profile-pictures/<username>.webp
    // Using the username (not the original filename) means each user has exactly
    // one profile picture file that gets overwritten on re-upload.
    const outputFilePath = path.join(OUTPUT_DIR, `${username}.webp`);

    // sharp(buffer) reads directly from memory — no temp file to read from or
    // clean up afterward, unlike the old sharp(sourceFilePath) version.
    await sharp(imageBuffer)
        .resize(500, 500, {
            // 'cover' scales the image up/down so it completely fills the 500x500
            // box, cropping any excess — this is what you want for square avatars.
            fit: 'cover',
            // 'centre' (British spelling, what sharp's API uses) keeps the crop
            // centered on the image rather than favoring top/bottom/left/right.
            position: 'centre',
        })
        .webp({
            quality: 80, // 0-100, good balance of visual quality vs file size; tweak to taste
        })
        .toFile(outputFilePath); // writes the processed image directly to disk at outputFilePath

    return `/profile-pictures/${username}.webp`; // hand the file name back to the caller (the route)
}

export {
    processProfilePicture,
};