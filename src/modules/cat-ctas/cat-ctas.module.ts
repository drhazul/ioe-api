import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatCtasEntity } from './cat-ctas.entity';
import { CatCtasController } from './cat-ctas.controller';
import { CatCtasService } from './cat-ctas.service';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CatCtasEntity, UsrModSucEntity])],
  controllers: [CatCtasController],
  providers: [CatCtasService],
})
export class CatCtasModule {}
