const express = require('express');
const router = express.Router();
const db = require('../db');

// Obtener todos los conductores con información completa
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        c.id,
        c.nombre,
        c.telefono,
        c.calle,
        c.colonia,
        c.numero_int,
        c.numero_ext,
        u.id AS usuario_id,
        u.nombre AS usuario_nombre,
        u.correo AS usuario_correo,
        u.tipo AS usuario_tipo,
        COUNT(cam.id) AS total_camiones
      FROM conductores c
      JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN camiones cam ON cam.conductor_id = c.id
      GROUP BY c.id, u.id
      ORDER BY c.nombre
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Obtener un conductor por su ID con información completa
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(`
      SELECT 
        c.id,
        c.nombre,
        c.telefono,
        c.calle,
        c.colonia,
        c.numero_int,
        c.numero_ext,
        u.id AS usuario_id,
        u.nombre AS usuario_nombre,
        u.correo AS usuario_correo,
        u.tipo AS usuario_tipo,
        json_agg(
          json_build_object(
            'id', cam.id,
            'placas', cam.placas,
            'categoria_id', cam.categoria_id,
            'categoria_nombre', cat.nombre
          )
        ) AS camiones
      FROM conductores c
      JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN camiones cam ON cam.conductor_id = c.id
      LEFT JOIN categoria cat ON cam.categoria_id = cat.id
      WHERE c.id = $1
      GROUP BY c.id, u.id
    `, [id]);

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'Conductor no encontrado' });
    }
  } catch (error) {
    next(error);
  }
});

// Crear un nuevo conductor
router.post('/', async (req, res) => {
  const { nombre, telefono, calle, colonia, numero_int, numero_ext, correo, password } = req.body;

  try {
    // Llamar al procedimiento unificado
    const { rows: [result] } = await db.query(
      'CALL registrar_conductor_usuario($1, $2, $3, $4, $5, $6, $7, $8, NULL)',
      [nombre, telefono, calle, colonia, numero_int || null, numero_ext, correo, password]
    );

    if (result.p_resultado.success) {
      res.status(201).json(result.p_resultado);
    } else {
      res.status(400).json(result.p_resultado);
    }
  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).json({
      success: false,
      error: 'Error en el servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Actualizar un conductor
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { nombre, telefono, calle, colonia, numero_int, numero_ext, usuario_id } = req.body;

  try {
    // Verificar existencia del conductor
    const { rows: existing } = await db.query(
      'SELECT id FROM conductores WHERE id = $1',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Conductor no encontrado' });
    }

    // Si se intenta cambiar el usuario_id, verificar que no esté ya en uso
    if (usuario_id) {
      const { rows: userInUse } = await db.query(
        'SELECT id FROM conductores WHERE usuario_id = $1 AND id != $2',
        [usuario_id, id]
      );
      
      if (userInUse.length > 0) {
        return res.status(400).json({ 
          error: 'El usuario ya está asociado a otro conductor' 
        });
      }
    }

    const { rows } = await db.query(
      `UPDATE conductores 
       SET 
         nombre = COALESCE($1, nombre),
         telefono = COALESCE($2, telefono),
         calle = COALESCE($3, calle),
         colonia = COALESCE($4, colonia),
         numero_int = COALESCE($5, numero_int),
         numero_ext = COALESCE($6, numero_ext),
         usuario_id = COALESCE($7, usuario_id)
       WHERE id = $8
       RETURNING *`,
      [nombre, telefono, calle, colonia, numero_int, numero_ext, usuario_id, id]
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// Eliminar un conductor
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  
  try {
    // Verificar si el conductor tiene camiones asignados
    const { rows: hasTrucks } = await db.query(
      'SELECT id FROM camiones WHERE conductor_id = $1 LIMIT 1',
      [id]
    );
    
    if (hasTrucks.length > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar el conductor porque tiene camiones asignados' 
      });
    }

    const { rowCount } = await db.query(
      'DELETE FROM conductores WHERE id = $1',
      [id]
    );

    if (rowCount > 0) {
      res.json({ message: 'Conductor eliminado correctamente' });
    } else {
      res.status(404).json({ error: 'Conductor no encontrado' });
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;