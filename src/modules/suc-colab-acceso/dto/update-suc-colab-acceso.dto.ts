import { PartialType } from '@nestjs/swagger';
import { CreateSucColabAccesoDto } from './create-suc-colab-acceso.dto';

export class UpdateSucColabAccesoDto extends PartialType(
  CreateSucColabAccesoDto,
) {}
