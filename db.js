require('dotenv').config();
const { Pool } = require('pg');
const mongoose = require('mongoose');

// Estados de conexión mejorados
const connectionStates = {
  postgres: {
    connected: false,
    pool: null,
    closing: false
  },
  mongo: {
    connected: false,
    closing: false
  }
};

// Configuración de PostgreSQL
const createPostgresPool = () => {
  if (!connectionStates.postgres.pool && !connectionStates.postgres.closing) {
    connectionStates.postgres.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000
    });
  }
  return connectionStates.postgres.pool;
};

// Obtener instancia del pool
const postgresPool = createPostgresPool();

// Conexión a MongoDB
const connectMongoDB = async () => {
  if (connectionStates.mongo.connected || connectionStates.mongo.closing) {
    return;
  }

  try {
    await mongoose.connect(process.env.MONGODB_ATLAS_URI, {
      dbName: process.env.MONGO_DB_NAME,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    connectionStates.mongo.connected = true;
    console.log('✅ MongoDB connected successfully');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw err;
  }
};

// Cierre seguro de conexiones
const closeConnections = async () => {
  // PostgreSQL
  if (connectionStates.postgres.pool && !connectionStates.postgres.closing) {
    try {
      connectionStates.postgres.closing = true;
      await connectionStates.postgres.pool.end();
      connectionStates.postgres.pool = null;
      connectionStates.postgres.connected = false;
      connectionStates.postgres.closing = false;
      console.log('PostgreSQL connection pool closed');
    } catch (err) {
      console.error('Error closing PostgreSQL pool:', err);
      connectionStates.postgres.closing = false;
      throw err;
    }
  }

  // MongoDB
  if (connectionStates.mongo.connected && !connectionStates.mongo.closing) {
    try {
      connectionStates.mongo.closing = true;
      await mongoose.disconnect();
      connectionStates.mongo.connected = false;
      connectionStates.mongo.closing = false;
      console.log('MongoDB connection closed');
    } catch (err) {
      console.error('Error closing MongoDB connection:', err);
      connectionStates.mongo.closing = false;
      throw err;
    }
  }
};

// Módulo de base de datos
const db = {
  query: async (text, params) => {
    const pool = createPostgresPool();
    try {
      const result = await pool.query(text, params);
      connectionStates.postgres.connected = true;
      return result;
    } catch (err) {
      connectionStates.postgres.connected = false;
      console.error('PostgreSQL query error:', err);
      throw err;
    }
  },

  mongo: {
    getDataCollection: () => {
      if (!connectionStates.mongo.connected) {
        throw new Error('MongoDB connection is not established');
      }
      return mongoose.connection.db.collection('datos');
    },
    getParametersCollection: () => {
      if (!connectionStates.mongo.connected) {
        throw new Error('MongoDB connection is not established');
      }
      return mongoose.connection.db.collection('parametros');
    }
  },

  closeConnections: closeConnections,

  getConnectionStatus: () => ({
    postgres: connectionStates.postgres.connected,
    mongo: connectionStates.mongo.connected
  })
};

// Manejadores de eventos
mongoose.connection.on('connected', () => {
  connectionStates.mongo.connected = true;
  console.log('MongoDB connection established');
});

mongoose.connection.on('disconnected', () => {
  connectionStates.mongo.connected = false;
  console.log('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await closeConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeConnections();
  process.exit(0);
});

// Inicialización
const initializeDB = async () => {
  try {
    // Test PostgreSQL connection
    await db.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected successfully');
    
    // Connect MongoDB
    await connectMongoDB();
  } catch (err) {
    console.error('Database initialization failed:', err);
    await closeConnections();
    process.exit(1);
  }
};

initializeDB();

module.exports = db;