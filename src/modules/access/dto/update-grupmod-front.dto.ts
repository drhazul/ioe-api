import { PartialType } from '@nestjs/swagger';
import { CreateGrupmodFrontDto } from './create-grupmod-front.dto';

export class UpdateGrupmodFrontDto extends PartialType(CreateGrupmodFrontDto) {}
