const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose'); // Asegúrate de tenerlo instalado si usas Mongo
const db = require('./db');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// 🔐 Seguridad y configuración
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// 📦 Rutas
app.use('/api/conductores', require('./routes/conductores'));
app.use('/api/camiones', require('./routes/camiones'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/categoria', require('./routes/categoria'));
app.use('/api/vistas', require('./routes/vistas'));
app.use('/api/parametros', require('./routes/parametros'));
app.use('/api/datos', require('./routes/datos'));

// ✅ Ruta de prueba para saber que el backend está vivo
app.get('/api/status', async (req, res) => {
  try {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    const postgresStatus = (await db.query('SELECT NOW()')) ? 'connected' : 'disconnected';

    res.json({
      status: 'active',
      databases: {
        postgres: postgresStatus,
        mongo: mongoStatus
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🛠 Manejo global de errores
app.use((err, req, res, next) => {
  console.error('❌ Error global:', err.stack);
  res.status(500).json({ error: 'Algo salió mal en el servidor' });
});

// 🧹 Limpieza al cerrar el servidor
process.on('SIGINT', async () => {
  console.log('🧼 Cerrando conexiones...');
  if (db.closeConnections) await db.closeConnections();
  process.exit();
});

// 🚀 Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${port}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
});
