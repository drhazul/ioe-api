import { PartialType } from '@nestjs/swagger';
import { CreateModFrontDto } from './create-mod-front.dto';

export class UpdateModFrontDto extends PartialType(CreateModFrontDto) {}
