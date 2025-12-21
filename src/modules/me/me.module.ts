import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { GrupmodFrontEntity } from './entities/grupmod-front.entity';
import { ModFrontEntity } from './entities/mod-front.entity';
import { GrupmodFrontModEntity } from './entities/grupmod-front-mod.entity';
import { RolGrupmodFrontEntity } from './entities/rol-grupmod-front.entity';
import { RolGrupModuloPermEntity } from './entities/rol-grup-modulo-perm.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GrupmodFrontEntity,
      ModFrontEntity,
      GrupmodFrontModEntity,
      RolGrupmodFrontEntity,
      RolGrupModuloPermEntity,
    ]),
  ],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
