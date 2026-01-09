import { PartialType } from '@nestjs/swagger';
import { CreateDatDetSvrDto } from './create-datdetsvr.dto';

export class UpdateDatDetSvrDto extends PartialType(CreateDatDetSvrDto) {}
