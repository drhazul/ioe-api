import { PartialType } from '@nestjs/swagger';
import { CreateDatContCtrlDto } from './create-datcontctrl.dto';

export class UpdateDatContCtrlDto extends PartialType(CreateDatContCtrlDto) {}
