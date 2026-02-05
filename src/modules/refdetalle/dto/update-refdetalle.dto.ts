import { PartialType } from '@nestjs/swagger';
import { CreateRefDetalleDto } from './create-refdetalle.dto';

export class UpdateRefDetalleDto extends PartialType(CreateRefDetalleDto) {}
