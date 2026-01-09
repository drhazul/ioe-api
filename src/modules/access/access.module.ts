import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';
import { ModuloEntity } from '../admin/entities/modulo.entity';
import { GrupModuloEntity } from '../admin/entities/grup-modulo.entity';
import { GrupmodModuloEntity } from '../admin/entities/grupmod-modulo.entity';
import { RolGrupModuloPermEntity } from '../me/entities/rol-grup-modulo-perm.entity';
import { ModFrontEntity } from '../me/entities/mod-front.entity';
import { GrupmodFrontEntity } from '../me/entities/grupmod-front.entity';
import { GrupmodFrontModEntity } from '../me/entities/grupmod-front-mod.entity';
import { RolGrupmodFrontEntity } from '../me/entities/rol-grupmod-front.entity';
import { RolEntity } from '../roles/rol.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModuloEntity,
      GrupModuloEntity,
      GrupmodModuloEntity,
      RolGrupModuloPermEntity,
      ModFrontEntity,
      GrupmodFrontEntity,
      GrupmodFrontModEntity,
      RolGrupmodFrontEntity,
      RolEntity,
    ]),
  ],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}
