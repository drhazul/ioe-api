import { PartialType } from '@nestjs/swagger';
import { CreateDatContCapDto } from './create-datcontcap.dto';

export class UpdateDatContCapDto extends PartialType(CreateDatContCapDto) {}
