import { IsBoolean, IsString, Length } from 'class-validator';

export class ActualizarCorreoConfigDto {
  @IsBoolean()
  automatico!: boolean;

  @IsString()
  @Length(1, 100)
  nombreRemitente!: string;
}
