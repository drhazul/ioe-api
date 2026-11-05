import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresaEntity } from './empresa.entity';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { CreditosConfigController } from './creditos-config.controller';
import { CreditosConfigService } from './creditos-config.service';
import { EntidadesFiscalesController } from './entidades-fiscales.controller';
import { EntidadesFiscalesService } from './entidades-fiscales.service';
import { AdminOnlyGuard } from '../../common/guards/admin-only.guard';
import { DevelopmentBusinessGuard } from '../../common/guards/development-business.guard';

@Module({
  imports: [TypeOrmModule.forFeature([EmpresaEntity])],
  controllers: [
    EmpresasController,
    CreditosConfigController,
    EntidadesFiscalesController,
  ],
  providers: [
    EmpresasService,
    CreditosConfigService,
    EntidadesFiscalesService,
    AdminOnlyGuard,
    DevelopmentBusinessGuard,
  ],
  exports: [TypeOrmModule, EmpresasService],
})
export class EmpresasModule {}
