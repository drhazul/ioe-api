import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], // usa ConfigModule global
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const host = config.get<string>('DB_HOST');
        if (!host) {
          throw new Error('DB_HOST no está definido en .env');
        }

        return {
          type: 'mssql',
          host,
          port: Number(config.get('DB_PORT') ?? 1433),
          username: config.get<string>('DB_USER'),
          password: config.get<string>('DB_PASS'),
          database: config.get<string>('DB_NAME'),
          schema: config.get<string>('DB_SCHEMA') ?? 'dbo',

          synchronize: false,
          logging: false,
          autoLoadEntities: true,

          options: {
            encrypt: false,
            trustServerCertificate: true,
          },

          extra: {
            options: {
              server: host, // tedioous/mssql
              trustServerCertificate: true,
              encrypt: false,
            },
            pool: {
              max: 10,
              min: 0,
              idleTimeoutMillis: 30000,
            },
            connectionTimeout: 30000,
            requestTimeout: 30000,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
