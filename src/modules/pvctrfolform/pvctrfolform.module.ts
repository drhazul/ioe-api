import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PvCtrFolFormController } from './pvctrfolform.controller';
import { PvCtrFolFormService } from './pvctrfolform.service';
import { PvCtrFolFormEntity } from './pvctrfolform.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PvCtrFolFormEntity])],
  controllers: [PvCtrFolFormController],
  providers: [PvCtrFolFormService],
})
export class PvCtrFolFormModule {}
