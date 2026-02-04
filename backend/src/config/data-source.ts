import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import path from 'path';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'logistics_reporting',
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
  entities: [path.join(__dirname, '..', 'models', '**', '*.{js,ts}')],
  migrations: [path.join(__dirname, '..', 'migrations', '**', '*.{js,ts}')],
  subscribers: [path.join(__dirname, '..', 'subscribers', '**', '*.{js,ts}')],
  migrationsTableName: 'typeorm_migrations',
});

export default AppDataSource;
