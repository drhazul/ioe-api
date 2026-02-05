import { PartialType } from '@nestjs/swagger';
import { CreateDatRetDetSvrDto } from './create-datretdetsvr.dto';

export class UpdateDatRetDetSvrDto extends PartialType(CreateDatRetDetSvrDto) {}
