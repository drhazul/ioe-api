import { PartialType } from '@nestjs/swagger';
import { CreatePvCtrFolAsvrDto } from './create-pvctrfolasvr.dto';

export class UpdatePvCtrFolAsvrDto extends PartialType(CreatePvCtrFolAsvrDto) {}
