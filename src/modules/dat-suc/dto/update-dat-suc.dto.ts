import { PartialType } from '@nestjs/swagger';
import { CreateDatSucDto } from './create-dat-suc.dto';

export class UpdateDatSucDto extends PartialType(CreateDatSucDto) {}
