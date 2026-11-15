// profilePictureProcessor.js
// Responsible for taking a virus-scanned image file already on disk and turning it
// into a final 200x200 center-cropped .webp profile picture, saved under the
// username, inside the 'profile-pictures/' directory.

import sharp from 'sharp'; // image processing library (resize, format conversion, etc.)
import supabase from './supabase.js'; // Supabase client for storage operations

/**
 * Resizes, converts, and saves an uploaded image as a profile picture.
 *
 * @param {Buffer} imageBuffer - the raw uploaded image, still in memory (already virus-scanned).
 * @param {string} username - used as the output filename (without extension).
 * @returns {Promise<string>} - the public URL of the saved .webp file.
 */


async function processProfilePicture(imageBuffer, username) {
    // Build the final output path: profile-pictures/<username>.webp
    // Using the username (not the original filename) means each user has exactly
    // one profile picture file that gets overwritten on re-upload.
    
    // sharp(buffer) reads directly from memory — no temp file to read from or
    // clean up afterward, unlike the old sharp(sourceFilePath) version.
    const resizedImage = await sharp(imageBuffer)
        .resize(200, 200, {
            // 'cover' scales the image up/down so it completely fills the 200x200
            // box, cropping any excess — this is what you want for square avatars.
            fit: 'cover',
            // 'centre' (British spelling, what sharp's API uses) keeps the crop
            // centered on the image rather than favoring top/bottom/left/right.
            position: 'centre',
        })
        .webp({
            quality: 80, // 0-100, good balance of visual quality vs file size; tweak to taste
        })
        .toBuffer(); // writes the processed image directly to disk at outputFilePath
        
    const outputFilePath = `/profile-pictures/${username}.webp`;

    const { data, error } = await supabase.storage
      .from('mealmate_bucket')          // ← your bucket name
      .upload(outputFilePath, resizedImage, {
        contentType: 'image/webp',
        upsert: true,                   // set true if you want to overwrite
        cacheControl: '3600',
      });

      if (error) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }


    // Now Get the public URL
    const { data: publicUrlData } = supabase.storage
      .from('mealmate_bucket')
      .getPublicUrl(outputFilePath);

    const publicUrl = publicUrlData.publicUrl;

    // Return the public URL of the saved profile picture to save on db

    return publicUrl
}

export {
    processProfilePicture,
};