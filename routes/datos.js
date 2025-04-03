const express = require('express');
const router = express.Router();
const db = require('../db');
const { ObjectId } = require('mongodb');

// Obtener todos los datos con paginación y filtros
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10,
      deviceId,
      fromDate,
      toDate
    } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    // Filtros opcionales
    if (deviceId) query.deviceId = deviceId;
    if (fromDate || toDate) {
      query.fecha_registro = {};
      if (fromDate) query.fecha_registro.$gte = new Date(fromDate);
      if (toDate) query.fecha_registro.$lte = new Date(toDate);
    }

    const [datos, total] = await Promise.all([
      db.mongo.getDataCollection()
        .find(query)
        .sort({ fecha_registro: -1 }) // Ordenar por fecha descendente
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.mongo.getDataCollection().countDocuments(query)
    ]);

    res.json({
      success: true,
      count: datos.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: datos.map(doc => ({
        id: doc._id,
        deviceId: doc.deviceId,
        temperature: doc.temperature,
        humidity: doc.humidity,
        light: doc.light,
        fechaRegistro: doc.fecha_registro,
        fechaActualizacion: doc.fecha_actualizacion
      }))
    });

  } catch (error) {
    console.error('Error en GET /api/datos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener datos',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener datos específicos por deviceId
router.get('/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 10, fromDate, toDate } = req.query;

    const query = { deviceId };
    if (fromDate || toDate) {
      query.fecha_registro = {};
      if (fromDate) query.fecha_registro.$gte = new Date(fromDate);
      if (toDate) query.fecha_registro.$lte = new Date(toDate);
    }

    const datos = await db.mongo.getDataCollection()
      .find(query)
      .sort({ fecha_registro: -1 })
      .limit(parseInt(limit))
      .toArray();

    if (!datos || datos.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontraron datos para este dispositivo',
        deviceId
      });
    }

    res.json({
      success: true,
      count: datos.length,
      deviceId,
      data: datos.map(doc => ({
        id: doc._id,
        temperature: doc.temperature,
        humidity: doc.humidity,
        light: doc.light,
        fechaRegistro: doc.fecha_registro,
        fechaActualizacion: doc.fecha_actualizacion
      }))
    });

  } catch (error) {
    console.error(`Error en GET /api/datos/device/${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener datos del dispositivo',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Obtener un documento específico por ID
router.get('/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: 'ID no válido'
      });
    }

    const doc = await db.mongo.getDataCollection()
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Documento no encontrado'
      });
    }

    res.json({
      success: true,
      data: {
        id: doc._id,
        deviceId: doc.deviceId,
        temperature: doc.temperature,
        humidity: doc.humidity,
        light: doc.light,
        fechaRegistro: doc.fecha_registro,
        fechaActualizacion: doc.fecha_actualizacion
      }
    });

  } catch (error) {
    console.error('Error en GET /api/datos/:id:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener el documento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;