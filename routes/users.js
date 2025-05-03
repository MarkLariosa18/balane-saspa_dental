const express = require('express');
const pool = require('../db');
const bcrypt = require('bcrypt');
const router = express.Router();

router.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(`
            INSERT INTO users (name, username, password)
            VALUES ($1, $2, $3)
            RETURNING id, name, username
        `, [username, hashedPassword]);

        res.status(201).json({ message: 'User registered successfully!', user: result.rows[0] });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ message: 'Failed to register user' });
    }
});

module.exports = router;
