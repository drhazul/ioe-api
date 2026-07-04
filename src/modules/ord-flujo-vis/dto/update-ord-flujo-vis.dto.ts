import { PartialType } from '@nestjs/swagger';
import { CreateOrdFlujoVisDto } from './create-ord-flujo-vis.dto';

export class UpdateOrdFlujoVisDto extends PartialType(CreateOrdFlujoVisDto) {}
