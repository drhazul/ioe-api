import { PartialType } from '@nestjs/swagger';
import { CreateDatFormDto } from './create-dat-form.dto';

export class UpdateDatFormDto extends PartialType(CreateDatFormDto) {}
