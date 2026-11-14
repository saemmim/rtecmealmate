// virusScanner.js
// Responsible for: (1) accepting the uploaded file via multer INTO MEMORY (no disk write),
// and (2) scanning that in-memory buffer with ClamAV before letting it move further down the chain.
//
// Nothing here ever touches the filesystem — the file lives only as a Buffer
// in RAM for the lifetime of the request, which is faster and leaves no temp
// files to clean up (or leak) if the process crashes mid-request.

import multer from 'multer'; // handles multipart/form-data (file uploads)
import NodeClam from 'clamscan'; // Node wrapper around the ClamAV daemon (clamd)
import { Readable } from 'stream'; // used to turn a Buffer into a stream clamscan can scan



// ---- FACTORY: build a multer instance customized per feature -------------
// Different upload features want different rules (profile pictures: images
// only, 5MB; attachments: maybe PDFs too, 20MB). Instead of hardcoding one
// multer config here, this factory lets each route file build its own,
// while still sharing the same memory storage + scan middleware.
//
// Usage in another route file:
//   const { createUploadMiddleware, scanUploadedFile } = require('./virusScanner');
//   const upload = createUploadMiddleware({
//     allowedMimeTypes: ['application/pdf'],
//     maxFileSizeBytes: 20 * 1024 * 1024,
//   });

//   router.post('/attachment', upload.single('attachment'), scanUploadedFile, handler);


function createUploadMiddleware({
    allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'], // sensible default, override per feature
    maxFileSizeBytes = 20 * 1024 * 1024, // default 20MB, override per feature
} = {}) {
    // Cheap first line of defense before the (slower) virus scan even runs —
    // rejects obviously-wrong file types based on the mimetype the client sent.
    const fileFilter = (req, file, cb) => {
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true); // accept the file
        } else {
            cb(new Error(`Only these file types are allowed: ${allowedMimeTypes.join(', ')}`), false); // reject
        }
    };

    // multer.memoryStorage() keeps the uploaded file entirely in RAM as a
    // Buffer, available at req.file.buffer. Nothing is written to disk.
    // Trade-off: large concurrent uploads eat server RAM, so maxFileSizeBytes
    // matters more here than it did with disk storage — keep limits sane.
    return multer({
        storage: multer.memoryStorage(), // in-memory instead of multer.diskStorage(...)
        fileFilter, // this feature's allowed mimetypes
        limits: {
            fileSize: maxFileSizeBytes, // this feature's size cap
        },
    });
}

// ---- CLAMAV SETUP -----------------------------------------------------

// We initialize the ClamAV scanner instance once and reuse it,
// instead of re-connecting to clamd on every request (expensive).
let clamscanInstance = null;

// Lazily initializes (or returns the cached) ClamAV scanner instance.
async function getClamScanner() {
    if (clamscanInstance) {
        return clamscanInstance; // reuse existing connection if already set up
    }

    // NodeClam().init(options) connects to the ClamAV daemon (clamd) and
    // returns a ready-to-use scanner object.
    clamscanInstance = await new NodeClam().init({
        removeInfected: true, // irrelevant for stream scanning (nothing on disk to remove) but harmless to leave on
        quarantineInfected: false,
        scanLog: 'profilePictureScanLogs.txt', // path to the ClamAV scan log file
        debugMode: process.env.NODE_ENV !== 'production', // enabled outside production for debugging
        clamdscan: {
            // Streaming scans (scanStream, used below) REQUIRE talking to a real
            // clamd daemon over TCP or a socket — there is no local-binary
            // equivalent for streaming, unlike file-path scanning. So this path
            // only works with clamd reachable, which is exactly our Docker setup.
            path: process.env.CLAMD_PATH || '/usr/bin/clamdscan', // path to the clamdscan binary (used for fallback, not streaming)
            socket: process.env.CLAMD_SOCKET || false, // e.g. '/var/run/clamav/clamd.ctl' if using a unix socket
            host: process.env.CLAMD_HOST || '127.0.0.1', // e.g. 'clamav' as the Docker service/container name
            port: process.env.CLAMD_PORT ? Number(process.env.CLAMD_PORT) : 3310, // default clamd TCP port
            timeout: 60000, // milliseconds to wait before giving up on a scan (60s)
            localFallback: false, // must be false: no local clamscan binary fallback exists for stream scanning
        },
    });

    return clamscanInstance;
}




// ---- SCAN MIDDLEWARE ---------------------------------------------------

// Express middleware that scans req.file.buffer (set by multer's memory
// storage) using ClamAV's streaming scan. Must run AFTER
// `upload.single('fieldName')` in the route chain.
async function scanUploadedFile(req, res, next) {
    // If multer didn't attach a file, there's nothing to scan — bail out early.
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No file was uploaded.' });
    }

    try {
        const clamscan = await getClamScanner(); // get (or create) the ClamAV connection

        // Turn the in-memory Buffer into a Readable stream — clamscan's
        // scanStream() sends this stream to clamd over the wire (the INSTREAM
        // protocol) rather than needing a file path on disk.
        const bufferStream = Readable.from(req.file.buffer);

        // scanStream() performs the scan and returns the verdict, same shape as
        // the file-path version: { isInfected, viruses }.
        const { isInfected, viruses } = await clamscan.scanStream(bufferStream);

        if (isInfected) {
            // Nothing to delete from disk — the buffer simply gets garbage
            // collected once this request ends. We just reject the response.
            return res.status(422).json({
                error: 'Uploaded file failed the virus scan.',
                viruses, // array of detected virus signature names, useful for logging
            });
        }

        // File is clean — req.file.buffer is still attached to req, so the next
        // handler (e.g. profilePictureProcessor) can read it directly, no path needed.
        next();
    } catch (err) {
        // Something went wrong with the scan itself (e.g. clamd not running).
        // We fail closed (reject the upload) rather than silently letting an
        // unscanned file through.
        console.error('Virus scan error:', err);
        return res.status(500).json({ error: 'Could not complete virus scan. Please try again.' });
    }
}

// Export the factory (so each feature builds its own multer config) and the
// scan middleware (shared as-is by every feature):
//   const upload = createUploadMiddleware({ ... });
//   router.post('/x', upload.single('field'), scanUploadedFile, handler);

export {
    createUploadMiddleware, // call this once per feature to get a customized multer instance
    scanUploadedFile, // async middleware, run right after upload — reusable unchanged everywhere
};