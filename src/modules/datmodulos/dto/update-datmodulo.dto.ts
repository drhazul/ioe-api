import { PartialType } from '@nestjs/swagger';
import { CreateDatmoduloDto } from './create-datmodulo.dto';

export class UpdateDatmoduloDto extends PartialType(CreateDatmoduloDto) {}
