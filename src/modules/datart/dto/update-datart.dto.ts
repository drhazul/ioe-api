import { PartialType } from '@nestjs/swagger';
import { CreateDatArtDto } from './create-datart.dto';

export class UpdateDatArtDto extends PartialType(CreateDatArtDto) {}
