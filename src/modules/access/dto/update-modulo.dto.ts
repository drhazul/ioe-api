import { PartialType } from '@nestjs/swagger';
import { CreateModuloDto } from './create-modulo.dto';

export class UpdateModuloDto extends PartialType(CreateModuloDto) {}
