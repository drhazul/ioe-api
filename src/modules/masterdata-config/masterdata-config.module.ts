import { Module } from '@nestjs/common';
import { MasterdataConfigController } from './masterdata-config.controller';
import { MasterdataConfigService } from './masterdata-config.service';

@Module({
  controllers: [MasterdataConfigController],
  providers: [MasterdataConfigService],
})
export class MasterdataConfigModule {}
