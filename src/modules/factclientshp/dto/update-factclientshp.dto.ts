import { PartialType } from '@nestjs/swagger';
import { CreateFactClientShpDto } from './create-factclientshp.dto';

export class UpdateFactClientShpDto extends PartialType(CreateFactClientShpDto) {}
