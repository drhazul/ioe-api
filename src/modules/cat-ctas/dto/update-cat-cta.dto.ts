import { PartialType } from '@nestjs/swagger';
import { CreateCatCtaDto } from './create-cat-cta.dto';

export class UpdateCatCtaDto extends PartialType(CreateCatCtaDto) {}
