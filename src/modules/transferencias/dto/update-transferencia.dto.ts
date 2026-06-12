import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTransferenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sucEnt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sucSal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mtv?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  prio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  txt?: string;
}
