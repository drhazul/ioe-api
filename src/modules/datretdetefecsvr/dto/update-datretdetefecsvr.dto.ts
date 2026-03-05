import { PartialType } from '@nestjs/swagger';
import { CreateDatRetDetEfecSvrDto } from './create-datretdetefecsvr.dto';

export class UpdateDatRetDetEfecSvrDto extends PartialType(
  CreateDatRetDetEfecSvrDto,
) {}
