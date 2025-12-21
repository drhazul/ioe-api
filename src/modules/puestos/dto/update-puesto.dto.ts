import { PartialType } from '@nestjs/swagger';
import { CreatePuestoDto } from './create-puesto.dto';

export class UpdatePuestoDto extends PartialType(CreatePuestoDto) {}
