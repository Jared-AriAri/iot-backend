const express = require('express');
const router = express.Router();
const db = require('../db');
const { check, validationResult } = require('express-validator');

// Validaciones comunes
const categoriaValidations = [
  check('nombre').notEmpty().withMessage('El nombre es requerido'),
  check('humedad')
    .isFloat({ min: 0, max: 100 })
    .withMessage('La humedad debe ser un número entre 0 y 100'),
  check('temperatura')
    .isFloat({ min: -20, max: 60 })
    .withMessage('La temperatura debe ser un número entre -20 y 60')
];

/**
 * @api {get} /categorias Listar todas las categorías
 * @apiName GetCategorias
 * @apiGroup Categorias
 * 
 * @apiSuccess {Object[]} categorias Lista de categorías
 * @apiSuccess {Number} categorias.id ID de la categoría
 * @apiSuccess {String} categorias.nombre Nombre de la categoría
 * @apiSuccess {Number} categorias.humedad Humedad recomendada
 * @apiSuccess {Number} categorias.temperatura Temperatura recomendada
 * @apiSuccess {Number} categorias.total_camiones Total de camiones asociados
 * @apiSuccess {Object[]} categorias.camiones Lista de camiones asociados
 */
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        cat.id,
        cat.nombre,
        cat.humedad,
        cat.temperatura,
        COUNT(cam.id) AS total_camiones,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cam.id,
              'placas', cam.placas,
              'conductor_id', cam.conductor_id,
              'conductor_nombre', c.nombre,
              'device_id', cam.device_id
            ) 
            ORDER BY cam.placas
          ) FILTER (WHERE cam.id IS NOT NULL),
          '[]'
        ) AS camiones
      FROM categoria cat
      LEFT JOIN camiones cam ON cam.categoria_id = cat.id
      LEFT JOIN conductores c ON cam.conductor_id = c.id
      GROUP BY cat.id
      ORDER BY cat.nombre
    `);
    
    res.json(rows);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    next({
      status: 500,
      message: 'Error interno al obtener las categorías',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @api {get} /categorias/:id Obtener una categoría específica
 * @apiName GetCategoria
 * @apiGroup Categorias
 * 
 * @apiParam {Number} id ID de la categoría
 * 
 * @apiSuccess {Number} id ID de la categoría
 * @apiSuccess {String} nombre Nombre de la categoría
 * @apiSuccess {Number} humedad Humedad recomendada
 * @apiSuccess {Number} temperatura Temperatura recomendada
 * @apiSuccess {Number} total_camiones Total de camiones asociados
 * @apiSuccess {Object[]} camiones Lista detallada de camiones asociados
 */
router.get('/:id', [
  check('id').isInt().withMessage('ID debe ser un número entero')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  
  try {
    const { rows } = await db.query(`
      SELECT 
        cat.id,
        cat.nombre,
        cat.humedad,
        cat.temperatura,
        COUNT(cam.id) AS total_camiones,
        COALESCE(
          json_agg(
            json_build_object(
              'id', cam.id,
              'placas', cam.placas,
              'conductor_id', cam.conductor_id,
              'conductor_nombre', c.nombre,
              'conductor_telefono', c.telefono,
              'device_id', cam.device_id,
              'ultima_lectura', (
                SELECT MAX(fecha_registro) 
                FROM pingui_no_relacional.datos 
                WHERE deviceId = cam.device_id
              )
            )
            ORDER BY cam.placas
          ) FILTER (WHERE cam.id IS NOT NULL),
          '[]'
        ) AS camiones
      FROM categoria cat
      LEFT JOIN camiones cam ON cam.categoria_id = cat.id
      LEFT JOIN conductores c ON cam.conductor_id = c.id
      WHERE cat.id = $1
      GROUP BY cat.id
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'Categoría no encontrada' 
      });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(`Error al obtener categoría ID ${id}:`, error);
    next({
      status: 500,
      message: 'Error interno al obtener la categoría',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @api {post} /categorias Crear una nueva categoría
 * @apiName CreateCategoria
 * @apiGroup Categorias
 * 
 * @apiParam {String} nombre Nombre de la categoría
 * @apiParam {Number} humedad Humedad recomendada
 * @apiParam {Number} temperatura Temperatura recomendada
 * 
 * @apiSuccess {Object} categoria Categoría creada
 */
router.post('/', categoriaValidations, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nombre, humedad, temperatura } = req.body;
  const client = await db.pg.connect();
  
  try {
    await client.query('BEGIN');

    // Verificar si la categoría ya existe
    const { rows: existing } = await client.query(
      'SELECT id FROM categoria WHERE LOWER(nombre) = LOWER($1)',
      [nombre]
    );
    
    if (existing.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ 
        error: 'Ya existe una categoría con ese nombre' 
      });
    }

    // Crear la nueva categoría
    const { rows } = await client.query(
      `INSERT INTO categoria (nombre, humedad, temperatura) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [nombre, parseFloat(humedad), parseFloat(temperatura)]
    );

    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear categoría:', error);
    next({
      status: 500,
      message: 'Error interno al crear la categoría',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

/**
 * @api {put} /categorias/:id Actualizar una categoría
 * @apiName UpdateCategoria
 * @apiGroup Categorias
 * 
 * @apiParam {Number} id ID de la categoría a actualizar
 * @apiParam {String} [nombre] Nombre de la categoría
 * @apiParam {Number} [humedad] Humedad recomendada
 * @apiParam {Number} [temperatura] Temperatura recomendada
 * 
 * @apiSuccess {Object} categoria Categoría actualizada
 */
router.put('/:id', [
  check('id').isInt().withMessage('ID debe ser un número entero'),
  ...categoriaValidations
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { nombre, humedad, temperatura } = req.body;
  const client = await db.pg.connect();

  try {
    await client.query('BEGIN');

    // Verificar existencia de la categoría
    const { rows: existing } = await client.query(
      'SELECT id FROM categoria WHERE id = $1 FOR UPDATE',
      [id]
    );
    
    if (existing.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Categoría no encontrada' 
      });
    }

    // Verificar si el nuevo nombre ya existe en otra categoría
    if (nombre) {
      const { rows: nameConflict } = await client.query(
        'SELECT id FROM categoria WHERE LOWER(nombre) = LOWER($1) AND id != $2',
        [nombre, id]
      );
      
      if (nameConflict.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ 
          error: 'Ya existe otra categoría con ese nombre' 
        });
      }
    }

    // Actualizar la categoría
    const { rows } = await client.query(
      `UPDATE categoria 
       SET 
         nombre = COALESCE($1, nombre),
         humedad = COALESCE($2, humedad),
         temperatura = COALESCE($3, temperatura),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [nombre, humedad, temperatura, id]
    );

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error al actualizar categoría ID ${id}:`, error);
    next({
      status: 500,
      message: 'Error interno al actualizar la categoría',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

/**
 * @api {delete} /categorias/:id Eliminar una categoría
 * @apiName DeleteCategoria
 * @apiGroup Categorias
 * 
 * @apiParam {Number} id ID de la categoría a eliminar
 * 
 * @apiSuccess {String} message Mensaje de confirmación
 */
router.delete('/:id', [
  check('id').isInt().withMessage('ID debe ser un número entero')
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const client = await db.pg.connect();

  try {
    await client.query('BEGIN');

    // Verificar si la categoría está en uso
    const { rows: inUse } = await client.query(
      `SELECT c.id, c.placas 
       FROM camiones c 
       WHERE c.categoria_id = $1 
       LIMIT 1`,
      [id]
    );
    
    if (inUse.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'No se puede eliminar la categoría porque está asignada a camiones',
        camion_asignado: inUse[0]
      });
    }

    // Eliminar la categoría
    const { rowCount } = await client.query(
      'DELETE FROM categoria WHERE id = $1',
      [id]
    );

    if (rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        error: 'Categoría no encontrada' 
      });
    }

    await client.query('COMMIT');
    res.json({ 
      message: 'Categoría eliminada correctamente',
      id: parseInt(id)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error al eliminar categoría ID ${id}:`, error);
    next({
      status: 500,
      message: 'Error interno al eliminar la categoría',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
});

// Manejo centralizado de errores
router.use((err, req, res, next) => {
  const status = err.status || 500;
  const response = {
    error: err.message || 'Error interno del servidor'
  };
  
  if (err.details) {
    response.details = err.details;
  }
  
  res.status(status).json(response);
});

module.exports = router;