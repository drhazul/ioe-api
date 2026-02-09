import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsrModSucController } from './usr-mod-suc.controller';
import { UsrModSucService } from './usr-mod-suc.service';
import { UsrModSucEntity } from './usr-mod-suc.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UsrModSucEntity])],
  controllers: [UsrModSucController],
  providers: [UsrModSucService],
})
export class UsrModSucModule {}
