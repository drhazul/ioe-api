import { PartialType } from '@nestjs/swagger';
import { CreateJrqClasDto } from './create-jrqclas.dto';

export class UpdateJrqClasDto extends PartialType(CreateJrqClasDto) {}
