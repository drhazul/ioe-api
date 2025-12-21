import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

import { RolGrupmodFrontEntity } from '../me/entities/rol-grupmod-front.entity';
import { RolGrupModuloPermEntity } from '../me/entities/rol-grup-modulo-perm.entity';
import { GrupModuloEntity } from './entities/grup-modulo.entity';
import { ModuloEntity } from './entities/modulo.entity';
import { GrupmodModuloEntity } from './entities/grupmod-modulo.entity';

import { GrupmodFrontEntity } from '../me/entities/grupmod-front.entity';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { GrupmodFrontModEntity } from '../me/entities/grupmod-front-mod.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      // permisos
      RolGrupmodFrontEntity,
      RolGrupModuloPermEntity,

      // backend catalog
      GrupModuloEntity,
      ModuloEntity,
      GrupmodModuloEntity,

      // front catalog
      GrupmodFrontEntity,
      ModFrontEntity,
      GrupmodFrontModEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
