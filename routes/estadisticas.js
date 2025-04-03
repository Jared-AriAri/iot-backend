const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/categorias', async (req, res) => {
  try {
    console.log('Ejecutando consulta de estadísticas de categorías'); // Log para depuración
    
    const result = await db.query(`
      SELECT 
        c.id,
        c.nombre,
        c.humedad,
        c.temperatura,
        COUNT(cam.id) AS total_camiones,
        COUNT(cam.id) * 100.0 / NULLIF((SELECT COUNT(*) FROM camiones), 0) AS porcentaje_total
      FROM 
        categoria c
      LEFT JOIN 
        camiones cam ON c.id = cam.categoria_id
      GROUP BY 
        c.id, c.nombre, c.humedad, c.temperatura
      ORDER BY 
        total_camiones DESC
    `);
    
    console.log('Consulta ejecutada con éxito. Resultados:', result.rows); // Log para depuración
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error detallado en estadísticas de categorías:', {
      message: err.message,
      stack: err.stack,
      query: err.query // Si tu driver de DB lo soporta
    });
    
    res.status(500).json({ 
      error: 'Error al obtener estadísticas',
      detalles: process.env.NODE_ENV === 'development' ? err.message : 'Oculto en producción'
    });
  }
});

module.exports = router;