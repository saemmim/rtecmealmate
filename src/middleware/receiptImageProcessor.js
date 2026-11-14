import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';

// Resolve this module's location so the output directory is built relative to
// this file, rather than depending on the process's current working directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Final destination for processed receipt images, separate from any temporary
// upload location used earlier in the upload and scanning flow.
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'public', 'receipts');

// Ensure the destination exists before Sharp attempts to write an image there.
// Recursive creation also makes any missing parent directories.
if (!fs.existsSync(OUTPUT_DIR)) {
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

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
	let filename;
	let outputFilePath;

	// Generate a cryptographically random name and check that it is not already
	// present in the output folder before writing the processed image.
	do {
		filename = `${randomBytes(16).toString('hex')}.webp`;
		outputFilePath = path.join(OUTPUT_DIR, filename);
	} while (fs.existsSync(outputFilePath));

	// Sharp reads the scanned image directly from its buffer, resizes it without
	// forcing a new height, converts it to WebP, and writes it to disk.
	await sharp(imageBuffer)
		.resize({ width: 2000 })
		.webp({ quality: 80 })
		.toFile(outputFilePath);

	// Return the public URL path for use by the route or other calling code.
	return `/receipts/${filename}`;
}

export { processReceiptImage };
