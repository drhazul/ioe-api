import { PartialType } from '@nestjs/swagger';
import { CreatePromocionBeneficioDto } from './create-promocion-beneficio.dto';

export class UpdatePromocionBeneficioDto extends PartialType(
  CreatePromocionBeneficioDto,
) {}
