import { PartialType } from '@nestjs/swagger';
import { CreateJrqDepaDto } from './create-jrqdepa.dto';

export class UpdateJrqDepaDto extends PartialType(CreateJrqDepaDto) {}
