import { PartialType } from '@nestjs/swagger';
import { CreateDatEstOrdDto } from './create-datestord.dto';

export class UpdateDatEstOrdDto extends PartialType(CreateDatEstOrdDto) {}
