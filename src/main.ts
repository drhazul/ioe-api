import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS configuration: allow configurable origins via CORS_ORIGINS env var
  // Example: CORS_ORIGINS="http://localhost:57591,http://127.0.0.1:57591"
  const defaultOrigins = ['http://localhost:57591', 'http://127.0.0.1:57591'];
  const envOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like curl, mobile apps)
      if (!origin) return callback(null, true);

      // Exact matches from env or defaults
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }

      // Development convenience: allow any localhost or 127.0.0.1 origin on any port
      try {
        const u = new URL(origin);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          return callback(null, true);
        }
      } catch (e) {
        // ignore parse errors
      }

      callback(new Error('CORS policy: Origin not allowed'), false);
    },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('IOE API')
    .setDescription('API NestJS + MSSQL')
    .setVersion('1.0')
    // 👇👇 ESTO ES LO ÚNICO QUE FALTABA 👇👇
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Ingrese el token JWT como: Bearer {token}',
        in: 'header',
      },
      'jwt-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`API corriendo en http://localhost:${port}/docs`);
}
bootstrap();
