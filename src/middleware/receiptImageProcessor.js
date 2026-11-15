import sharp from 'sharp';
import { randomBytes } from 'crypto';
import supabase from './supabase.js'; // Supabase client for storage operations


/**
 * Resize a virus-scanned receipt image supplied in memory and save it as WebP.
 * The width is limited to 2000px and the aspect ratio is preserved, so Sharp
 * calculates the corresponding height automatically. A random filename keeps
 * separate receipts from overwriting one another.
 *
 * @param {Buffer} imageBuffer - Raw image data for the scanned receipt.
 * @returns {Promise<string>} URL path to the saved receipt image.
 */
async function processReceiptImage(imageBuffer) {

	// Sharp reads the scanned image directly from its buffer, resizes it without
	// forcing a new height, converts it to WebP, and writes it to disk.
	const resizedImage = await sharp(imageBuffer)
		.resize({ width: 2000 })
		.webp({ quality: 80 })
		.toBuffer();

	const outputFilePath = `/receipts/${randomBytes(16).toString('hex')}.webp`;

	const { data, error } = await supabase.storage
      .from('mealmate_bucket')          // ← your bucket name
      .upload(outputFilePath, resizedImage, {
        contentType: 'image/webp',
        upsert: false,                   // set true if you want to overwrite
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

	// Return the public URL path for use by the route or other calling code.
    return publicUrl
}

export { processReceiptImage };
