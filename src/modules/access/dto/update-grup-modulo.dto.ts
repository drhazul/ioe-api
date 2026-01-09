import { PartialType } from '@nestjs/swagger';
import { CreateGrupModuloDto } from './create-grup-modulo.dto';

export class UpdateGrupModuloDto extends PartialType(CreateGrupModuloDto) {}
