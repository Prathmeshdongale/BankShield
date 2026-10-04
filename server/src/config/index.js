import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  databaseUrl: process.env.DATABASE_URL,
  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change_me_too',
    expiresIn: '15m',
    refreshExpiresIn: '7d',
  },
  mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8000',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};

export default config;
