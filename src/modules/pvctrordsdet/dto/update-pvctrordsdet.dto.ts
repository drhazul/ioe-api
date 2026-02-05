import { PartialType } from '@nestjs/swagger';
import { CreatePvCtrOrdsDetDto } from './create-pvctrordsdet.dto';

export class UpdatePvCtrOrdsDetDto extends PartialType(CreatePvCtrOrdsDetDto) {}
