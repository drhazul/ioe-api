import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PvCtrOrdsDetController } from './pvctrordsdet.controller';
import { PvCtrOrdsDetService } from './pvctrordsdet.service';
import { PvCtrOrdsDetEntity } from './pvctrordsdet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PvCtrOrdsDetEntity])],
  controllers: [PvCtrOrdsDetController],
  providers: [PvCtrOrdsDetService],
})
export class PvCtrOrdsDetModule {}
