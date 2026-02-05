import { PartialType } from '@nestjs/swagger';
import { CreateJrqSclaDto } from './create-jrqscla.dto';

export class UpdateJrqSclaDto extends PartialType(CreateJrqSclaDto) {}
