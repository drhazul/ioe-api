import { PartialType } from '@nestjs/swagger';
import { CreateJrqSubdDto } from './create-jrqsubd.dto';

export class UpdateJrqSubdDto extends PartialType(CreateJrqSubdDto) {}
