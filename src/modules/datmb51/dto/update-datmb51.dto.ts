import { PartialType } from '@nestjs/swagger';
import { CreateDatmb51Dto } from './create-datmb51.dto';

export class UpdateDatmb51Dto extends PartialType(CreateDatmb51Dto) {}
