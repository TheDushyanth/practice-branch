// server.js
// Backend API for the Pet Management System assignment.
// Exposes REST endpoints to Create, Read, Update, and Delete pet records,
// where each pet has a name, breed, age, owner name, and an uploaded photo.

// ---------- IMPORTS ----------
const express = require('express');   // Web framework for building the API
const multer = require('multer');     // Middleware for handling multipart/form-data (file uploads)
const cors = require('cors');         // Allows the React frontend (different port) to call this API
const path = require('path');         // Node's built-in utility for working with file paths
const fs = require('fs');             // Node's built-in file system module (read/write db.json, delete images)

const app = express();
const PORT = 5000;

// ---------- MIDDLEWARE ----------

// Enable CORS so the React dev server (usually http://localhost:3000) can call this API
app.use(cors());

// Parse incoming JSON request bodies (used for any non-multipart requests)
app.use(express.json());

// Serve the "uploads" folder as static files so photos are reachable via a URL like:
// http://localhost:5000/uploads/image-12345.jpg
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- SIMPLE FILE-BASED "DATABASE" ----------
// A JSON file (db.json) acts as persistent storage instead of a real database,
// keeping the assignment focused on upload/CRUD logic.

const DB_FILE = path.join(__dirname, 'db.json');

// Reads all pets currently stored in db.json
function readDB() {
    if (!fs.existsSync(DB_FILE)) return [];
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data || '[]');
}

// Writes the given array of pets back into db.json
function writeDB(pets) {
    fs.writeFileSync(DB_FILE, JSON.stringify(pets, null, 2));
}

// ---------- MULTER CONFIGURATION (handles photo uploads) ----------

// Configure WHERE and HOW uploaded files get saved to disk
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        // Unique filename so two uploads never collide
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname); // Keep original extension (.jpg, .png, etc.)
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Only accept files whose MIME type starts with "image/"
function fileFilter(req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
}

// Multer instance: our configured storage + filter + a 5MB size limit
const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ---------- VALIDATION HELPER ----------
// Shared validation logic for both create and update, so the rules stay consistent
function validatePetFields({ petName, breed, age, ownerName }) {
    const errors = [];

    if (!petName || !petName.trim()) errors.push('Pet name is required');
    if (!breed || !breed.trim()) errors.push('Breed is required');
    if (!ownerName || !ownerName.trim()) errors.push('Owner name is required');

    // Age must be present and a valid non-negative number
    if (age === undefined || age === null || age === '') {
        errors.push('Age is required');
    } else if (isNaN(Number(age)) || Number(age) < 0) {
        errors.push('Age must be a valid non-negative number');
    }

    return errors;
}

// ---------- ROUTES ----------

// CREATE — POST /api/pets
// upload.single('image') expects ONE file, sent under the form field name "image"
app.post('/api/pets', upload.single('image'), (req, res) => {
    const { petName, breed, age, ownerName } = req.body;

    // Validate the image separately, since it's not a text field
    if (!req.file) {
        return res.status(400).json({ error: 'Pet photo is required' });
    }

    const errors = validatePetFields({ petName, breed, age, ownerName });
    if (errors.length > 0) {
        return res.status(400).json({ error: errors.join(', ') });
    }

    const pets = readDB();

    const newPet = {
        id: Date.now(),                              // Simple unique ID using current timestamp
        petName: petName.trim(),
        breed: breed.trim(),
        age: Number(age),
        ownerName: ownerName.trim(),
        imageUrl: `/uploads/${req.file.filename}`     // Relative path — frontend prepends the server URL
    };

    pets.push(newPet);
    writeDB(pets);

    res.status(201).json(newPet); // 201 = Created
});

// READ (list) — GET /api/pets
// Supports an optional ?breed=xxx query param for server-side filtering (bonus feature)
app.get('/api/pets', (req, res) => {
    let pets = readDB();

    const { breed } = req.query;
    if (breed && breed !== 'all') {
        // Case-insensitive exact match on breed
        pets = pets.filter((p) => p.breed.toLowerCase() === breed.toLowerCase());
    }

    res.json(pets);
});

// READ (single) — GET /api/pets/:id
app.get('/api/pets/:id', (req, res) => {
    const pets = readDB();
    const pet = pets.find((p) => p.id === Number(req.params.id));

    if (!pet) {
        return res.status(404).json({ error: 'Pet not found' });
    }
    res.json(pet);
});

// UPDATE — PUT /api/pets/:id
// Photo is optional on update — if omitted, the existing photo is kept
app.put('/api/pets/:id', upload.single('image'), (req, res) => {
    const pets = readDB();
    const id = Number(req.params.id);

    const index = pets.findIndex((p) => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Pet not found' });
    }

    const existingPet = pets[index];
    const { petName, breed, age, ownerName } = req.body;

    const errors = validatePetFields({ petName, breed, age, ownerName });
    if (errors.length > 0) {
        return res.status(400).json({ error: errors.join(', ') });
    }

    // Default to the existing photo; only change it if a new file was uploaded
    let imageUrl = existingPet.imageUrl;
    if (req.file) {
        // Delete the OLD photo from disk to avoid orphaned files piling up
        const oldImagePath = path.join(__dirname, existingPet.imageUrl);
        fs.unlink(oldImagePath, () => {}); // Ignore errors (e.g. file already missing)
        imageUrl = `/uploads/${req.file.filename}`;
    }

    const updatedPet = {
        ...existingPet,
        petName: petName.trim(),
        breed: breed.trim(),
        age: Number(age),
        ownerName: ownerName.trim(),
        imageUrl
    };

    pets[index] = updatedPet;
    writeDB(pets);

    res.json(updatedPet);
});

// DELETE — DELETE /api/pets/:id
app.delete('/api/pets/:id', (req, res) => {
    const pets = readDB();
    const id = Number(req.params.id);

    const pet = pets.find((p) => p.id === id);
    if (!pet) {
        return res.status(404).json({ error: 'Pet not found' });
    }

    // Remove the associated photo file from disk so we don't leave orphaned uploads
    const imagePath = path.join(__dirname, pet.imageUrl);
    fs.unlink(imagePath, () => {});

    const updatedPets = pets.filter((p) => p.id !== id);
    writeDB(updatedPets);

    res.json({ message: 'Pet deleted successfully' });
});

// ---------- ERROR HANDLING ----------
// Catches errors thrown by multer (wrong file type, file too large) and returns clean JSON
app.use((err, req, res, next) => {
    if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
    console.log(`Pet Management API running on http://localhost:${PORT}`);
});
