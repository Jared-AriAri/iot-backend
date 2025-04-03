const express = require('express');
const router = express.Router();
const db = require('../db');

// Obtener todos los camiones con información completa
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        cam.id,
        cam.placas,
        c.id AS conductor_id,
        c.nombre AS conductor_nombre,
        c.telefono AS conductor_telefono,
        cat.id AS categoria_id,
        cat.nombre AS categoria_nombre,
        cat.humedad,
        cat.temperatura,
        u.id AS usuario_id,
        u.nombre AS usuario_nombre,
        u.correo AS usuario_correo
      FROM camiones cam
      JOIN conductores c ON cam.conductor_id = c.id
      JOIN categoria cat ON cam.categoria_id = cat.id
      JOIN usuarios u ON c.usuario_id = u.id
      ORDER BY cam.placas
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Obtener un camión por su ID con toda la información relacionada
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(`
      SELECT 
        cam.id,
        cam.placas,
        c.id AS conductor_id,
        c.nombre AS conductor_nombre,
        c.telefono AS conductor_telefono,
        c.calle AS conductor_calle,
        c.colonia AS conductor_colonia,
        c.numero_ext AS conductor_numero_ext,
        c.numero_int AS conductor_numero_int,
        cat.id AS categoria_id,
        cat.nombre AS categoria_nombre,
        cat.humedad,
        cat.temperatura,
        u.id AS usuario_id,
        u.nombre AS usuario_nombre,
        u.correo AS usuario_correo,
        u.tipo AS usuario_tipo
      FROM camiones cam
      JOIN conductores c ON cam.conductor_id = c.id
      JOIN categoria cat ON cam.categoria_id = cat.id
      JOIN usuarios u ON c.usuario_id = u.id
      WHERE cam.id = $1
    `, [id]);

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'Camión no encontrado' });
    }
  } catch (error) {
    next(error);
  }
});

// Crear un nuevo camión (mantenemos los IDs para la creación)
router.post('/', async (req, res, next) => {
  const { placas, conductor_id, categoria_id } = req.body;
  
  try {
    // Verificación del conductor
    const { rows: conductor } = await db.query(
      `SELECT c.id, c.nombre, u.correo 
       FROM conductores c
       JOIN usuarios u ON c.usuario_id = u.id
       WHERE c.id = $1`, 
      [conductor_id]
    );
    
    if (conductor.length === 0) {
      return res.status(400).json({ error: 'El conductor especificado no existe' });
    }

    // Verificación de la categoría
    const { rows: categoria } = await db.query(
      'SELECT id, nombre FROM categoria WHERE id = $1',
      [categoria_id]
    );
    
    if (categoria.length === 0) {
      return res.status(400).json({ error: 'La categoría especificada no existe' });
    }

    // Resto de validaciones (placas únicas, etc.)
    const { rows: existing } = await db.query(
      'SELECT id FROM camiones WHERE conductor_id = $1',
      [conductor_id]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ 
        error: `El conductor ${conductor[0].nombre} ya tiene un camión asignado` 
      });
    }

    const { rows: platesCheck } = await db.query(
      'SELECT id FROM camiones WHERE placas = $1',
      [placas]
    );
    
    if (platesCheck.length > 0) {
      return res.status(400).json({ error: 'Las placas ya están registradas' });
    }

    // Insertar el camión
    const { rows } = await db.query(
      `INSERT INTO camiones (placas, conductor_id, categoria_id) 
       VALUES ($1, $2, $3) 
       RETURNING id`,
      [placas, conductor_id, categoria_id]
    );

    // Devolver la información completa del nuevo camión
    const { rows: newCamion } = await db.query(`
      SELECT 
        cam.id,
        cam.placas,
        c.id AS conductor_id,
        c.nombre AS conductor_nombre,
        cat.id AS categoria_id,
        cat.nombre AS categoria_nombre
      FROM camiones cam
      JOIN conductores c ON cam.conductor_id = c.id
      JOIN categoria cat ON cam.categoria_id = cat.id
      WHERE cam.id = $1
    `, [rows[0].id]);

    res.status(201).json(newCamion[0]);
  } catch (error) {
    next(error);
  }
});

// Actualizar un camión (versión mejorada)
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { placas, conductor_id, categoria_id } = req.body;

  try {
    // Verificar existencia del camión
    const { rows: existing } = await db.query(
      'SELECT id FROM camiones WHERE id = $1',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Camión no encontrado' });
    }

    // Validaciones adicionales
    if (placas) {
      const { rows: platesCheck } = await db.query(
        'SELECT id FROM camiones WHERE placas = $1 AND id != $2',
        [placas, id]
      );
      
      if (platesCheck.length > 0) {
        return res.status(400).json({ error: 'Las placas ya están registradas en otro camión' });
      }
    }

    if (conductor_id) {
      const { rows: conductorCheck } = await db.query(
        'SELECT id FROM conductores WHERE id = $1',
        [conductor_id]
      );
      
      if (conductorCheck.length === 0) {
        return res.status(400).json({ error: 'El conductor especificado no existe' });
      }
    }

    if (categoria_id) {
      const { rows: categoriaCheck } = await db.query(
        'SELECT id FROM categoria WHERE id = $1',
        [categoria_id]
      );
      
      if (categoriaCheck.length === 0) {
        return res.status(400).json({ error: 'La categoría especificada no existe' });
      }
    }

    // Actualización
    await db.query(
      `UPDATE camiones 
       SET 
         placas = COALESCE($1, placas),
         conductor_id = COALESCE($2, conductor_id),
         categoria_id = COALESCE($3, categoria_id)
       WHERE id = $4`,
      [placas, conductor_id, categoria_id, id]
    );

    // Devolver el camión actualizado con toda la información
    const { rows: updatedCamion } = await db.query(`
      SELECT 
        cam.id,
        cam.placas,
        c.id AS conductor_id,
        c.nombre AS conductor_nombre,
        cat.id AS categoria_id,
        cat.nombre AS categoria_nombre
      FROM camiones cam
      JOIN conductores c ON cam.conductor_id = c.id
      JOIN categoria cat ON cam.categoria_id = cat.id
      WHERE cam.id = $1
    `, [id]);

    res.json(updatedCamion[0]);
  } catch (error) {
    next(error);
  }
});

// Eliminar un camión (se mantiene igual)
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  
  try {
    const { rowCount } = await db.query(
      'DELETE FROM camiones WHERE id = $1',
      [id]
    );

    if (rowCount > 0) {
      res.json({ message: 'Camión eliminado correctamente' });
    } else {
      res.status(404).json({ error: 'Camión no encontrado' });
    }
  } catch (error) {
    next(error);
  }
});

router.put('/:id/estado-iot', async (req, res, next) => {
  const { id } = req.params;
  const { estado } = req.body;

  if (!['ON', 'OFF'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido, debe ser ON u OFF' });
  }

  try {
    const result = await db.query(
      'UPDATE camiones SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Camión no encontrado' });
    }

    res.json({ message: 'Estado IoT actualizado', camión: result.rows[0] });
  } catch (error) {
    console.error('Error en PUT /camiones/:id/estado-iot:', error);
    next(error);
  }
});

// GET /api/camiones/:id/estado-iot - Obtener solo el estado del IoT
router.get('/:id/estado-iot', async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows } = await db.query(
      'SELECT estado FROM camiones WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Camión no encontrado' });
    }

    res.json({ estado: rows[0].estado });
  } catch (error) {
    console.error('Error en GET /camiones/:id/estado-iot:', error);
    next(error);
  }
});

module.exports = router;