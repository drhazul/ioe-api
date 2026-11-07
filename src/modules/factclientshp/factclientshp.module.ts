import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FactClientShpController } from './factclientshp.controller';
import { FactClientShpService } from './factclientshp.service';
import { FactClientShpEntity } from './factclientshp.entity';
import { UsrModSucEntity } from '../usr-mod-suc/usr-mod-suc.entity';
import { MeModule } from '../me/me.module';

@Module({
  imports: [TypeOrmModule.forFeature([FactClientShpEntity, UsrModSucEntity]), MeModule],
  controllers: [FactClientShpController],
  providers: [FactClientShpService],
  exports: [FactClientShpService],
})
export class FactClientShpModule {}
