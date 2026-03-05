import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsNumber, Min, ValidateIf } from 'class-validator';

const toNullableNumber = ({ value }: { value: unknown }) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text.length) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : value;
  }
  if (typeof value === 'number') return value;
  return value;
};

export class UpdateCtddDto {
  @ApiProperty({
    description: 'Cantidad a devolver; null = no devolver',
    nullable: true,
    type: Number,
    example: 1,
  })
  @Transform(toNullableNumber)
  @Type(() => Number)
  @ValidateIf((_obj, value) => value !== null)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(0.0001)
  ctdd: number | null;
}
