const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./db');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middlewares mejorados
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// Importar rutas
const conductoresRoutes = require('./routes/conductores');
const camionesRoutes = require('./routes/camiones');
const usuariosRoutes = require('./routes/usuarios');
const categoriaRoutes = require('./routes/categoria');
const vistasRoutes = require('./routes/vistas');
const parametrosRoutes = require('./routes/parametros');
const datosRoutes = require('./routes/datos'); // Nueva importación
const estadisticasRoutes = require('./routes/estadisticas'); // Nueva importación

// Asignar rutas
app.use('/api/conductores', conductoresRoutes);
app.use('/api/camiones', camionesRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/categoria', categoriaRoutes);
app.use('/api/vistas', vistasRoutes);
app.use('/api/parametros', parametrosRoutes);
app.use('/api/datos', datosRoutes); // Nueva ruta
app.use('/api/estadisticas', estadisticasRoutes); // Nueva ruta

// Endpoint de verificación de estado
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

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo salió mal en el servidor' });
});

// Cierre limpio al terminar el proceso
process.on('SIGINT', async () => {
  await db.closeConnections(); // Asegúrate de que este método exista en db.js
  process.exit();
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend corriendo en http://localhost:${port}`);
  console.log(`📊 Entorno: ${process.env.NODE_ENV || 'development'}`);
});