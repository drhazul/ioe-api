import { PartialType } from '@nestjs/swagger';
import { CreatePromocionCriterioDto } from './create-promocion-criterio.dto';

export class UpdatePromocionCriterioDto extends PartialType(
  CreatePromocionCriterioDto,
) {}
