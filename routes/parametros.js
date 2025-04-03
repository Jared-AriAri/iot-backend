const express = require('express');
const router = express.Router();
const db = require('../db');
const { ObjectId } = require('mongodb');

// Validación de ObjectId
const isValidObjectId = (id) => {
  try {
    return new ObjectId(id).toString() === id;
  } catch {
    return false;
  }
};

// Obtener todos los parámetros con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const [parametros, total] = await Promise.all([
      db.mongo.getParametersCollection()
        .find({})
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.mongo.getParametersCollection().countDocuments()
    ]);
    
    res.json({
      data: parametros,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Error al obtener parámetros:', err);
    res.status(500).json({ 
      error: "Error al obtener parámetros",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Actualizar parámetros con validación
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "ID de parámetro inválido" });
    }

    const { value, description } = req.body;
    
    // Validar campos actualizables
    if (value === undefined && !description) {
      return res.status(400).json({ error: "Nada que actualizar" });
    }

    const updateFields = {};
    if (value !== undefined) updateFields.value = value;
    if (description) updateFields.description = description;

    const result = await db.mongo.getParametersCollection()
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { 
          ...updateFields,
          updatedAt: new Date() 
        }}
      );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Parámetro no encontrado" });
    }

    res.json({
      success: result.modifiedCount > 0,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });

  } catch (err) {
    console.error('Error al actualizar parámetro:', err);
    res.status(500).json({ 
      error: "Error al actualizar parámetro",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

module.exports = router;