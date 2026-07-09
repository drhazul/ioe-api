import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(1433),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SCHEMA: Joi.string().default('dbo'),

  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_EXPIRES_DAYS: Joi.number().default(30),

  // Admin guard overrides (comma-separated lists)
  ADMIN_ROLE_IDS: Joi.string().optional(),
  ADMIN_ROLE_ID: Joi.string().optional(),
  ADMIN_NIVELES: Joi.string().optional(),
  ADMIN_NIVEL: Joi.string().optional(),

  // PV devoluciones
  PV_DEV_ORD_BLOCK_THRESHOLD: Joi.number().integer().min(1).default(5),
});
