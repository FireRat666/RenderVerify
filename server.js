const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
// Set security-related HTTP response headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "https://firer.at", "https://www.googletagmanager.com"],
        "script-src": ["'self'", "https://cookiechimp.com", "https://cdn.jsdelivr.net", "https://static.cloudflareinsights.com/", "https://www.googletagmanager.com", `'sha256-oR7dj8BflG0yYUPA/prBFx0/AUu59uIAb/omlkt4Us0='`],
        "connect-src": ["'self'", "https://cookiechimp.com", "https://cloudflareinsights.com", "https://static.cloudflareinsights.com"],
        "frame-src": ["'self'", "https://cookiechimp.com"],
      },
    },
  })
);

// --- CORS Configuration ---
const allowedOrigins = [];

// In development, allow the default React dev server port
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:3000');
}

// In production, add your frontend's URL from environment variables
// e.g., in your Render.com environment, set: FRONTEND_URL=https://check.firer.at
if (process.env.FRONTEND_URL) { 
    allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman) and from whitelisted origins
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};
app.use(cors(corsOptions));
// Parse JSON request bodies
app.use(express.json());

// --- Database Connection ---
// Render provides the DATABASE_URL env var automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render to connect to Neon
  }
});


// --- API Routes ---

// GET /confirm/:eventID/:userID - Check if a user is registered and return JSON
app.get('/confirm/:eventID/:userID', async (req, res) => {
  const { userID, eventID } = req.params;
  if (!userID || !eventID) {
    return res.status(400).json({ error: 'User ID and Event ID are required.' });
  }

  try {
    const result = await pool.query(
      'SELECT 1 FROM registrations WHERE user_id = $1 AND event_id = $2',
      [userID, eventID]
    );
    res.json({ registered: result.rowCount > 0 });
  } catch (err) {
    console.error('DB Error on /confirm:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/register - Register a user with a code
app.post('/api/register', async (req, res) => {
  // Trim inputs to remove leading/trailing whitespace
  const userID = req.body.userID?.trim();
  const eventID = req.body.eventID?.trim();
  const code = req.body.code?.trim();
  let username = req.body.username?.trim();

  // --- Start of new validation block ---
  if (!userID || !eventID || !code || !username) {
    return res.status(400).json({ message: 'Missing user ID, event ID, username, or code.' });
  }

  // Add more specific validation checks
  // Silently truncate username if it's too long
  if (username.length > 50) {
    username = username.substring(0, 50);
  }
  if (eventID.length > 100 || code.length > 100) {
    return res.status(400).json({ message: 'Input is too long.' });
  }
  // --- End of new validation block ---
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if the code is valid and unused
    const codeCheck = await client.query(
      'SELECT id FROM codes WHERE event_id = $1 AND code = $2 AND used_by IS NULL',
      [eventID, code]
    );

    if (codeCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid or already used code.' });
    }
    const codeId = codeCheck.rows[0].id;
    
    // Insert user if they don't exist, or update their username if they do
    await client.query(
      'INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username',
      [userID, username]
    );

    // Create the registration
    await client.query('INSERT INTO registrations (user_id, event_id) VALUES ($1, $2)', [userID, eventID]);

    // Mark the code as used
    await client.query('UPDATE codes SET used_by = $1, used_at = NOW() WHERE id = $2', [userID, codeId]);

    await client.query('COMMIT');
    res.status(200).json({ message: 'Registration successful!' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { // Unique violation error code for Postgres
        return res.status(409).json({ message: 'You are already registered for this event.' });
    }
    console.error('DB Error on /register:', err);
    res.status(500).json({ message: 'An unexpected server error occurred.' });
  } finally {
      client.release();
  }
});

// --- JWT Authentication Middleware ---
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, username, role FROM admins WHERE id = $1', [decoded.id]);
    if (result.rowCount === 0) {
      return res.status(401).json({ message: 'Unauthorized: Admin not found' });
    }
    req.user = result.rows[0]; // Attach user info { id, username, role } to the request
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

// --- Admin Auth Routes (Public) ---
const authRouter = express.Router();

// Apply rate limiting to the login route to prevent brute-force attacks
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // Limit each IP to 10 login requests per windowMs
	standardHeaders: true,
	legacyHeaders: false,
});

// POST /api/auth/login
authRouter.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    try {
        const result = await pool.query('SELECT * FROM admins WHERE username = $1', [username]);
        if (result.rowCount === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
        const token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: admin.id, username: admin.username, role: admin.role } });
    } catch (err) {
        console.error('DB Error on /auth/login:', err);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

app.use('/api/auth', authRouter);


// --- Protected Admin Routes ---
const adminRouter = express.Router();
adminRouter.use(verifyToken); // Protect all subsequent routes in this router

// GET /api/admin/events - Get all events
adminRouter.get('/events', async (req, res) => {
  try {
    let query;
    const params = [];
    if (req.user.role === 'superadmin') {
        query = `SELECT e.*, a.username as owner_username
                 FROM events e
                 LEFT JOIN admins a ON e.owner_id = a.id
                 ORDER BY e.created_at DESC`;
    } else {
        query = 'SELECT * FROM events WHERE owner_id = $1 ORDER BY created_at DESC';
        params.push(req.user.id);
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('DB Error on /admin/events:', err);
    res.status(500).json({ message: 'Failed to fetch events.' });
  }
});

// POST /api/admin/events - Create a new event
adminRouter.post('/events', async (req, res) => {
  const { id, name, description } = req.body;
  const ownerId = req.user.id;
  if (!id || !name) {
    return res.status(400).json({ message: 'Event ID and Name are required.' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO events (id, name, description, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, name, description || null, ownerId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('DB Error on POST /admin/events:', err);
    if (err.code === '23505') { // unique_violation
        return res.status(409).json({ message: 'An event with this ID already exists.' });
    }
    res.status(500).json({ message: 'Failed to create event.' });
  }
});

// DELETE /api/admin/events/:eventID - Delete an event
adminRouter.delete('/events/:eventID', async (req, res) => {
    const { eventID } = req.params;
    try {
        const eventCheck = await pool.query('SELECT owner_id FROM events WHERE id = $1', [eventID]);
        if (eventCheck.rowCount === 0) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        const event = eventCheck.rows[0];
        if (req.user.role !== 'superadmin' && event.owner_id !== req.user.id) {
            return res.status(403).json({ message: 'Forbidden: You do not own this event.' });
        }
        await pool.query('DELETE FROM events WHERE id = $1', [eventID]);
        res.status(204).send(); // No Content

    } catch (err) {
        console.error(`DB Error on DELETE /admin/events/${eventID}:`, err);
        res.status(500).json({ message: 'Failed to delete event.' });
    }
});

// GET /api/admin/events/:eventID/codes - Get codes for an event with pagination and filtering
adminRouter.get('/events/:eventID/codes', async (req, res) => {
    const { eventID } = req.params;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const filter = req.query.filter || '';
    const sortBy = req.query.sortBy || 'id';
    const sortOrder = req.query.sortOrder || 'asc';
    const usedOnly = req.query.used === 'true';
    const offset = (page - 1) * limit;

    try {
        const baseSelect = `
            FROM codes c
            LEFT JOIN users u ON c.used_by = u.id
        `;
        const baseWhere = 'WHERE c.event_id = $1';

        const params = [eventID];
        let filterWhere = '';
        if (filter) {
            params.push(`%${filter.toLowerCase()}%`);
            const filterParamIndex = params.length;
            filterWhere = `AND (LOWER(c.code) LIKE $${filterParamIndex} OR LOWER(u.username) LIKE $${filterParamIndex} OR LOWER(c.used_by) LIKE $${filterParamIndex})`;
        }

        let usedWhere = '';
        if (usedOnly) {
            usedWhere = 'AND c.used_by IS NOT NULL';
        }

        // Get total count of filtered items
        const totalQuery = `SELECT count(c.id) ${baseSelect} ${baseWhere} ${filterWhere} ${usedWhere}`;
        const totalResult = await pool.query(totalQuery, params);
        const total = parseInt(totalResult.rows[0].count, 10);

        // Whitelist for sortBy to prevent SQL injection
        const allowedSortBy = {
            id: 'c.id',
            code: 'c.code',
            used_by: 'c.used_by',
            username: 'u.username',
            used_at: 'c.used_at'
        };
        const sortColumn = allowedSortBy[sortBy] || 'c.id'; // Fallback to default

        // Whitelist for sortOrder
        const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

        // Get paginated data
        params.push(limit, offset);
        const limitParamIndex = params.length - 1;
        const offsetParamIndex = params.length;
        const dataQuery = `
            SELECT c.id, c.code, c.used_by, c.used_at, u.username
            ${baseSelect}
            ${baseWhere}
            ${filterWhere}
            ${usedWhere}
            ORDER BY ${sortColumn} ${order} NULLS LAST
            LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
        `;
        const dataResult = await pool.query(dataQuery, params);

        res.json({ codes: dataResult.rows, total, page, limit });

    } catch (err) {
        console.error(`DB Error on GET /admin/events/${eventID}/codes:`, err);
        res.status(500).json({ message: 'Failed to fetch codes.' });
    }
});

// POST /api/admin/events/:eventID/codes - Batch add codes to an event
adminRouter.post('/events/:eventID/codes', async (req, res) => {
    const { eventID } = req.params;
    const { codes } = req.body; // Expect an array of code strings like ["code1", "code2"]
    if (!codes || !Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ message: 'An array of codes is required.' });
    }

    // Use parameterized queries to prevent SQL injection.
    // This builds a query like: INSERT ... VALUES ($1, $2), ($3, $4), ...
    // and a corresponding values array: ['event1', 'codeA', 'event1', 'codeB', ...]
    const values = [];
    const valueStrings = codes.map((code, index) => {
        const param1 = index * 2 + 1;
        const param2 = index * 2 + 2;
        values.push(eventID, code);
        return `($${param1}, $${param2})`;
    }).join(',');

    const queryText = `INSERT INTO codes (event_id, code) VALUES ${valueStrings}`;

    try {
        await pool.query(queryText, values);
        res.status(201).json({ message: `${codes.length} codes added successfully.` });
    } catch (err) {
        console.error(`DB Error on POST /admin/events/${eventID}/codes:`, err);
        if (err.code === '23505') {
            return res.status(409).json({ message: 'One or more codes already exist for this event. No codes were added.' });
        }
        res.status(500).json({ message: 'Failed to add codes.' });
    }
});

// DELETE /api/admin/events/:eventID/codes - Batch delete codes
adminRouter.delete('/events/:eventID/codes', async (req, res) => {
    const { eventID } = req.params;
    const { codeIds } = req.body; // Expect an array of code IDs

    if (!Array.isArray(codeIds) || codeIds.length === 0) {
        return res.status(400).json({ message: 'An array of code IDs is required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Find which of the selected codes have been used
        const usedCodesQuery = await client.query(
            'SELECT used_by FROM codes WHERE id = ANY($1::int[]) AND event_id = $2 AND used_by IS NOT NULL',
            [codeIds, eventID]
        );

        const userIdsToRemove = usedCodesQuery.rows.map(row => row.used_by);

        // If there are used codes, remove the corresponding registrations to revoke access
        if (userIdsToRemove.length > 0) {
            await client.query(
                'DELETE FROM registrations WHERE event_id = $1 AND user_id = ANY($2::text[])',
                [eventID, userIdsToRemove]
            );
        }

        // Delete the codes themselves
        const deleteResult = await client.query(
            'DELETE FROM codes WHERE id = ANY($1::int[]) AND event_id = $2',
            [codeIds, eventID]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: `${deleteResult.rowCount} code(s) and associated registrations deleted successfully.`, deletedCount: deleteResult.rowCount });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`DB Error on DELETE /admin/events/${eventID}/codes:`, err);
        res.status(500).json({ message: 'Failed to delete codes.' });
    } finally {
        client.release();
    }
});

// GET /api/admin/users - For superadmins to list all admin users
adminRouter.get('/users', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden: Only superadmins can view users.' });
    }
    try {
        // Exclude password hash from the result
        const result = await pool.query('SELECT id, username, role, created_at FROM admins ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('DB Error on GET /admin/users:', err);
        res.status(500).json({ message: 'Failed to fetch admin users.' });
    }
});

// POST /api/admin/users - For superadmins to create new admins
adminRouter.post('/users', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden: Only superadmins can create new users.' });
    }
    const { username, password, role = 'admin' } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO admins (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at', [username, hashedPassword, role]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('DB Error on POST /admin/users:', err);
        if (err.code === '23505') { // unique_violation
            return res.status(409).json({ message: 'An admin with this username already exists.' });
        }
        res.status(500).json({ message: 'Failed to create admin user.' });
    }
});

// PUT /api/admin/users/:id - For superadmins to update an admin's role
adminRouter.put('/users/:id', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden: Only superadmins can update users.' });
    }
    const { id } = req.params;
    const { role } = req.body;

    if (!role || (role !== 'admin' && role !== 'superadmin')) {
        return res.status(400).json({ message: 'A valid role (admin or superadmin) is required.' });
    }

    // Prevent a superadmin from demoting themselves if they are the only one
    if (String(req.user.id) === id && req.user.role === 'superadmin' && role === 'admin') {
        const superadminCount = await pool.query("SELECT COUNT(*) FROM admins WHERE role = 'superadmin'");
        if (parseInt(superadminCount.rows[0].count, 10) <= 1) {
            return res.status(400).json({ message: 'Cannot demote the last superadmin.' });
        }
    }

    try {
        const result = await pool.query('UPDATE admins SET role = $1 WHERE id = $2 RETURNING id, username, role, created_at', [role, id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Admin user not found.' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`DB Error on PUT /admin/users/${id}:`, err);
        res.status(500).json({ message: 'Failed to update admin user.' });
    }
});

// DELETE /api/admin/users/:id - For superadmins to delete an admin
adminRouter.delete('/users/:id', async (req, res) => {
    if (req.user.role !== 'superadmin') {
        return res.status(403).json({ message: 'Forbidden: Only superadmins can delete users.' });
    }
    const { id } = req.params;

    // Prevent a user from deleting themselves
    if (String(req.user.id) === id) {
        return res.status(400).json({ message: 'You cannot delete your own account.' });
    }

    try {
        const result = await pool.query('DELETE FROM admins WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Admin user not found.' });
        }
        res.status(204).send(); // No Content
    } catch (err) {
        console.error(`DB Error on DELETE /admin/users/${id}:`, err);
        res.status(500).json({ message: 'Failed to delete admin user.' });
    }
});

// PUT /api/admin/password - For an admin to change their own password
adminRouter.put('/password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user.id;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new passwords are required.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters long.' });
    }

    try {
        const result = await pool.query('SELECT password_hash FROM admins WHERE id = $1', [adminId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Admin not found.' });
        }

        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect current password.' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [hashedNewPassword, adminId]);

        res.status(200).json({ message: 'Password updated successfully.' });
    } catch (err) {
        console.error('DB Error on PUT /admin/password:', err);
        res.status(500).json({ message: 'Failed to update password.' });
    }
});

app.use('/api/admin', adminRouter);


// --- Serve React Frontend ---
// This serves the static files from the React build folder in production
app.use(express.static(path.resolve(__dirname, 'build'), {
  setHeaders: (res, filePath) => {
    // Allow all static assets to be loaded cross-origin.
    // This is needed for the Cross-Origin-Embedder-Policy (COEP) `require-corp`
    // to allow loading resources like favicons, images, and scripts.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// For any other request, send back the React index.html file.
// This is crucial for React Router to work.
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});
