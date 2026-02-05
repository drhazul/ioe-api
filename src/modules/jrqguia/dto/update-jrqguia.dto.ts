import { PartialType } from '@nestjs/swagger';
import { CreateJrqGuiaDto } from './create-jrqguia.dto';

export class UpdateJrqGuiaDto extends PartialType(CreateJrqGuiaDto) {}
