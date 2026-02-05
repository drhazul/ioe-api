# IOE API

API backend del sistema IOE. Construida con NestJS y TypeORM sobre MSSQL.
Expone endpoints para autenticacion, control de acceso, datos maestros e
inventarios, y registra auditoria de cambios.

## Alcance funcional (segun el codigo)
- Auth JWT (login/refresh), roles y guardias.
- Datos maestros: usuarios, roles, departamentos, puestos, sucursales.
- Accesos: modulos/grupos backend y front, permisos por rol.
- Inventarios y conteos (ver `src/modules`).
- Endpoint de salud `/health`.
- Auditoria de operaciones de escritura.

## Tecnologias
- Node.js + TypeScript + NestJS
- TypeORM + MSSQL
- JWT (passport-jwt) y bcrypt
- class-validator / class-transformer
- Joi para validacion de variables de entorno
- Swagger (docs)
- Jest + Supertest
- ESLint + Prettier

## Estructura de carpetas
- `src/main.ts`: bootstrap, CORS, Swagger, pipes globales
- `src/app.module.ts`: registro de modulos
- `src/config/`: base de datos y validacion de entorno
- `src/common/`: guards, interceptors, decorators
- `src/modules/`: funcionalidades por modulo (controller, service, dto, entity)
- `test/`: pruebas e2e
- `access.http`: ejemplos de requests manuales
- `dist/`: salida de build (no editar)

## Arquitectura
- Arquitectura modular por feature (NestJS).
- Controllers delgados, servicios con logica y repositorios TypeORM.
- Validacion global con `ValidationPipe` (whitelist + transform + forbid).
- Guard global de roles + interceptor global de auditoria.
- Entidades TypeORM mapeadas a tablas MSSQL (nombres en mayusculas).

## Requisitos
- Node.js y npm
- Base de datos MSSQL accesible

## Configuracion (.env)
Variables requeridas (ver `src/config/env.validation.ts`):
- `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME`
- `JWT_SECRET`

Opcionales:
- `PORT` (default 3001)
- `DB_PORT` (default 1433)
- `DB_SCHEMA` (default dbo)
- `JWT_EXPIRES_IN` (default 15m)
- `REFRESH_EXPIRES_DAYS` (default 30)
- `CORS_ORIGINS` (lista separada por comas)

## Ejecucion
```bash
npm install
npm run start:dev
```

Produccion:
```bash
npm run build
npm run start:prod
```

## Documentacion Swagger
- `http://localhost:3001/docs` (si `PORT` no se cambia)

## Scripts utiles
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run test:cov`

## Testing
Las pruebas actuales incluyen suites basicas (unit y e2e). Puede ser necesario
ampliar cobertura por modulo.

## Pendientes / dudas
- `access.http` usa `http://localhost:3000` como `baseUrl`, pero el backend
  inicia en 3001 por defecto. Confirmar puerto real por entorno.
- Definir estrategia de migraciones/seed (TypeORM `synchronize` esta desactivado).
- Documentar permisos y roles esperados por entorno.
