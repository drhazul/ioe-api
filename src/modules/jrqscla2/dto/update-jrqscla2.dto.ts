import { PartialType } from '@nestjs/swagger';
import { CreateJrqScla2Dto } from './create-jrqscla2.dto';

export class UpdateJrqScla2Dto extends PartialType(CreateJrqScla2Dto) {}
