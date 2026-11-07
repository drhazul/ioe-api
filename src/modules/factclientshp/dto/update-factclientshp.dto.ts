import { PartialType } from '@nestjs/swagger';
import { CreateFactClientShpDto } from './create-factclientshp.dto';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateFactClientShpDto extends PartialType(
  CreateFactClientShpDto,
) {
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0)
  L_CRED?: number | null;
}
