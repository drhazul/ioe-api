import { PartialType } from '@nestjs/swagger';
import { CreateDatRetCtrSvrDto } from './create-datretctrsvr.dto';

export class UpdateDatRetCtrSvrDto extends PartialType(CreateDatRetCtrSvrDto) {}
