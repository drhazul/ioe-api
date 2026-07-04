import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AddTransferenciaDetailDto {
  @IsString()
  @MaxLength(50)
  art: string;

  @IsNumber()
  @Min(0.0001)
  ctd: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  txt?: string;
}
