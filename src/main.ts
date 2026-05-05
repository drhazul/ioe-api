import { ValidationPipe } from '@nestjs/common';
import type { Server } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Configura la hora de México para que las fechas en la base de datos sean correctas
process.env.TZ = process.env.TZ || 'America/Mexico_City';

async function bootstrap() {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const asistenciaUploadsDir = path.join(uploadsRoot, 'asistencia');

  if (!existsSync(asistenciaUploadsDir)) {
    mkdirSync(asistenciaUploadsDir, { recursive: true });
  }

  // Se crea la instancia de la aplicación
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads',
  });

  // Configuración de validaciones automáticas
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
    }),
  );

  // --- CONFIGURACIÓN DE CORS PARA PROYECTO IOE ---
  app.enableCors({
    origin: true, 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Device-Id', 
      'X-Cajon-Estado-Token'
    ],
  });

  // Configuración de la documentación Swagger
  const config = new DocumentBuilder()
    .setTitle('IOE API')
    .setDescription('API NestJS + MSSQL')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        in: 'header',
      },
      'jwt-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  // Puertos de red
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const admsPort = process.env.ADMS_PORT ? Number(process.env.ADMS_PORT) : 8081;

  // Escuchar en todas las interfaces para permitir acceso desde tablets y red local
  await app.listen(port, '0.0.0.0');

  console.log(`\n🚀 API IOE lista y corriendo`);
  console.log(`🔗 Local: http://localhost:${port}/docs`);
  console.log(`🌐 Red: http://10.99.0.3:${port}/docs\n`);

  // Configuración para puerto ADMS Push
  if (admsPort !== port) {
    try {
      const expressApp = app.getHttpAdapter().getInstance();
      const admsServer: Server = expressApp.listen(admsPort, '0.0.0.0', () => {
        console.log(`📡 Puerto ADMS Push activo en puerto ${admsPort}`);
      });

      admsServer.on('error', (err) => {
        console.warn('⚠️  Aviso: Puerto ADMS ya está en uso o no disponible.');
      });
    } catch (e) {
      console.error('❌ Error al iniciar servidor ADMS.');
    }
  }
}
bootstrap();