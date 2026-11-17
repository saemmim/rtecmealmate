import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../middleware/db.js';

const userApprovalRoutes = express.Router();


const requireHsRole = async (req, res, next) => {

	const token = req.cookies?.token;

	if (!token) {
        console.log ('no token');
		return res.status(401).json({ redirect: '/dashboard' });
	}

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET);
		const id = decoded.id;
		const { rows: users } = await db.query(
			"SELECT role FROM users WHERE id = $1 AND status <> 'deleted' LIMIT 1",
			[id]
		);

		if (!users.length || users[0].role !== 'hs') {
            console.log('user not found');
			return res.status(401).json({ redirect: '/dashboard' });
		}

		next();
	} catch (error) {
        console.log(error);
		return res.status(401).json({ redirect: '/dashboard' });
	}
};

userApprovalRoutes.use(requireHsRole);



const getCurrentDateTime = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};



// ====================== Firstly Load Users ======================


// Function to fetch users by status

const getUsersByStatus = async (status, res) => {
  try {
    const query = `
      SELECT
        id,
        name,
        username,
        batch,
        department,
        phone,
        profile_picture,
        status
      FROM users
      WHERE status = $1
      AND role <> 'hs'
      ORDER BY name ASC
    `;
    
    const { rows } = await db.query(query, [status]);

    return res.status(200).json(rows);
  }
  
  catch (error) {
    return res.status(500).json({
      message: `Failed to fetch ${status} users.`,
      error: error.message,
    });
  }
};

userApprovalRoutes.get('/approved', async (req, res) => {
  await getUsersByStatus('approved', res);
});

userApprovalRoutes.get('/pending', async (req, res) => {
  await getUsersByStatus('pending', res);
});

userApprovalRoutes.get('/banned', async (req, res) => {
  await getUsersByStatus('banned', res);
});





// ====================== Update User Status ======================

const updateUserStatus = async (req, res, status) => {
  const token = req.cookies?.token;
  
  let issuerId, issuer;

  try {
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      issuerId = decoded.id;
      issuer = decoded.username;
    }
  }
  
  catch (error) {
    console.warn('Invalid JWT while attempting to update user status.\nError:', error.message);
  }


  if (!issuerId) {
    console.warn('Attempt to update user status. But no valid JWT found. Request denied.');
    return res.status(403).json({ message: 'Unauthorized.' });
  }


  try {
    const { rows: userRows } = await db.query(
      'SELECT role FROM users WHERE id = $1',
      [issuerId]
    );


    if (userRows.length === 0 || userRows[0].role !== 'hs') {
      return res.status(403).json({ message: 'Unauthorized.' });
    }

    const { rows } = await db.query(
      `UPDATE users SET status = $1, updated_at = NOW()
      WHERE id = $2 AND role <> 'hs' RETURNING username, status`,
      [status, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Failed to change status.' });
    }

    console.log(`[${getCurrentDateTime()}] @${rows[0].username} is now -${status}- by @${issuer}.`);

    return res.status(200).json(rows[0]);
  }

  catch (error) {
    console.error(`Error updating user status to ${status}:`, error);
    return res.status(500).json({
      message: `Failed to set user status to ${status}.`,
      error: error.message,
    });
  }
};

userApprovalRoutes.post('/:id/approve', async (req, res) => {
  await updateUserStatus(req, res, 'approved');
});

userApprovalRoutes.post('/:id/ban', async (req, res) => {
  await updateUserStatus(req, res, 'banned');
});

userApprovalRoutes.post('/:id/unban', async (req, res) => {
  await updateUserStatus(req, res, 'approved');
});











export default userApprovalRoutes;
