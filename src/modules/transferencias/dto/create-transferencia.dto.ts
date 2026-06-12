import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTransferenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  sucEnt?: string;

  @IsString()
  @MaxLength(20)
  sucSal: string;

  @IsString()
  @MaxLength(20)
  mtv: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  prio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  txt?: string;
}
