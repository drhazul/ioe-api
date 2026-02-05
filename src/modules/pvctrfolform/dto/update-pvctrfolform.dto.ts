import { PartialType } from '@nestjs/swagger';
import { CreatePvCtrFolFormDto } from './create-pvctrfolform.dto';

export class UpdatePvCtrFolFormDto extends PartialType(CreatePvCtrFolFormDto) {}
