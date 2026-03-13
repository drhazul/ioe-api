import { IsOptional, IsString, MaxLength } from 'class-validator';

export class EmitirFacturaDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  observaciones?: string;
}
