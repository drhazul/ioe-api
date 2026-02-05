import { PartialType } from '@nestjs/swagger';
import { CreateDatCatRegDto } from './create-datcatreg.dto';

export class UpdateDatCatRegDto extends PartialType(CreateDatCatRegDto) {}
