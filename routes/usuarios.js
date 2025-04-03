const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken'); // Añade esta línea al inicio

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        u.id,
        u.nombre,
        u.correo,
        u.tipo,
        CASE 
          WHEN u.tipo = 1 THEN 'Administrador' 
          ELSE 'Conductor' 
        END AS tipo_descripcion,
        COUNT(c.id) AS total_conductores,
        COUNT(cam.id) AS total_camiones
      FROM usuarios u
      LEFT JOIN conductores c ON c.usuario_id = u.id
      LEFT JOIN camiones cam ON cam.conductor_id = c.id
      GROUP BY u.id
      ORDER BY u.nombre
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Obtener un usuario por su ID con información completa
router.get('/:id', async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query(`
      SELECT 
        u.id,
        u.nombre,
        u.correo,
        u.tipo,
        CASE 
          WHEN u.tipo = 1 THEN 'Administrador' 
          ELSE 'Conductor' 
        END AS tipo_descripcion,
        json_agg(
          json_build_object(
            'id', c.id,
            'nombre', c.nombre,
            'telefono', c.telefono,
            'total_camiones', COUNT(cam.id)
          )
        ) FILTER (WHERE c.id IS NOT NULL) AS conductores
      FROM usuarios u
      LEFT JOIN conductores c ON c.usuario_id = u.id
      LEFT JOIN camiones cam ON cam.conductor_id = c.id
      WHERE u.id = $1
      GROUP BY u.id
    `, [id]);

    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ error: 'Usuario no encontrado' });
    }
  } catch (error) {
    next(error);
  }
});


// Crear un nuevo usuario
router.post('/', async (req, res, next) => {
  const { nombre, correo, tipo, password } = req.body;
  
  try {
    // Verificar si el correo ya está registrado
    const { rows: emailExists } = await db.query(
      'SELECT id FROM usuarios WHERE correo = $1',
      [correo]
    );
    
    if (emailExists.length > 0) {
      return res.status(400).json({ error: 'El correo ya está registrado' });
    }

    const { rows } = await db.query(
      `INSERT INTO usuarios 
       (nombre, correo, tipo, password) 
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, correo, tipo`,
      [nombre, correo, tipo, password]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// Actualizar un usuario
router.put('/:id', async (req, res, next) => {
  const { id } = req.params;
  const { nombre, correo, tipo, password } = req.body;

  try {
    // Verificar existencia del usuario
    const { rows: existing } = await db.query(
      'SELECT id FROM usuarios WHERE id = $1',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si se cambia el correo, verificar que no esté en uso
    if (correo) {
      const { rows: emailInUse } = await db.query(
        'SELECT id FROM usuarios WHERE correo = $1 AND id != $2',
        [correo, id]
      );
      
      if (emailInUse.length > 0) {
        return res.status(400).json({ error: 'El correo ya está en uso por otro usuario' });
      }
    }

    const { rows } = await db.query(
      `UPDATE usuarios 
       SET 
         nombre = COALESCE($1, nombre),
         correo = COALESCE($2, correo),
         tipo = COALESCE($3, tipo),
         password = COALESCE($4, password)
       WHERE id = $5
       RETURNING id, nombre, correo, tipo`,
      [nombre, correo, tipo, password, id]
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

// Eliminar un usuario
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  
  try {
    // Verificar si el usuario tiene conductores asociados
    const { rows: hasDrivers } = await db.query(
      'SELECT id FROM conductores WHERE usuario_id = $1 LIMIT 1',
      [id]
    );
    
    if (hasDrivers.length > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar el usuario porque tiene conductores asociados' 
      });
    }

    const { rowCount } = await db.query(
      'DELETE FROM usuarios WHERE id = $1',
      [id]
    );

    if (rowCount > 0) {
      res.json({ message: 'Usuario eliminado correctamente' });
    } else {
      res.status(404).json({ error: 'Usuario no encontrado' });
    }
  } catch (error) {
    next(error);
  }
});

// Obtener usuarios por tipo
router.get('/tipo/:tipo', async (req, res, next) => {
  const { tipo } = req.params;
  try {
    const { rows } = await db.query(
      'SELECT id, nombre, correo, tipo FROM usuarios WHERE tipo = $1',
      [tipo]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

// Ruta para login
router.post('/login', async (req, res, next) => {
  const { correo, password } = req.body;
  
  try {
    const { rows } = await db.query(
      'SELECT id, nombre, correo, tipo FROM usuarios WHERE correo = $1 AND password = $2',
      [correo, password]
    );

    if (rows.length > 0) {
      // Generar token JWT
      const token = jwt.sign(
        { 
          userId: rows[0].id,
          tipo: rows[0].tipo 
        },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      
      res.json({ 
        usuario: rows[0],
        token 
      });
    } else {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  } catch (error) {
    console.error('Error en login:', error);
    next(error);
  }
});

module.exports = router;