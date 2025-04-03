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
  const { nombre, telefono, calle, colonia, numero_int, numero_ext, correo, tipo = 2, password } = req.body;

  try {
    // Validación básica
    const requiredFields = ['nombre', 'telefono', 'calle', 'colonia', 'numero_ext', 'correo', 'password'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        error: 'Faltan campos obligatorios',
        missingFields 
      });
    }

    // Iniciar transacción
    await db.query('BEGIN');

    // 1. Registrar usuario
    const { rows: usuarioResult } = await db.query(
      'CALL registrar_usuario($1, $2, $3, $4, NULL)',
      [nombre, correo, tipo, password]
    );
    
    // Obtener ID del usuario creado
    const { rows: [usuario] } = await db.query(
      'SELECT id FROM usuarios WHERE correo = $1', 
      [correo]
    );

    // 2. Registrar conductor
    await db.query(
      'CALL registrar_conductor($1, $2, $3, $4, $5, $6, $7)',
      [nombre, telefono, calle, colonia, numero_int || null, numero_ext, usuario.id]
    );

    // Confirmar transacción
    await db.query('COMMIT');

    res.status(201).json({ 
      success: true,
      message: 'Registro completado exitosamente',
      usuario_id: usuario.id
    });

  } catch (error) {
    // Revertir transacción en caso de error
    await db.query('ROLLBACK');
    
    console.error('Error en el registro:', error);
    
    // Manejo de errores específicos
    let errorMessage = 'Error en el servidor';
    if (error.code === '23505') { // Violación de unique constraint
      if (error.constraint === 'usuarios_correo_key') {
        errorMessage = 'El correo electrónico ya está registrado';
      } else if (error.constraint === 'conductores_usuario_id_key') {
        errorMessage = 'El usuario ya tiene un conductor asociado';
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage,
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