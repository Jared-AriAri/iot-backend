// backend/routes/vistas.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Obtener vista conductores-camiones
router.get('/conductores-camiones', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM vista_conductores_camiones');
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;