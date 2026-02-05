import { PartialType } from '@nestjs/swagger';
import { CreatePvCtrOrdsDto } from './create-pvctrords.dto';

export class UpdatePvCtrOrdsDto extends PartialType(CreatePvCtrOrdsDto) {}
