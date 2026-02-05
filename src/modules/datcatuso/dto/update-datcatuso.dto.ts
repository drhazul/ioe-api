import { PartialType } from '@nestjs/swagger';
import { CreateDatCatUsoDto } from './create-datcatuso.dto';

export class UpdateDatCatUsoDto extends PartialType(CreateDatCatUsoDto) {}
