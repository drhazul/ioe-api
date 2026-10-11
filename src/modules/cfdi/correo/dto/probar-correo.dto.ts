import { IsEmail, MaxLength } from 'class-validator';

export class ProbarCorreoDto {
  @IsEmail()
  @MaxLength(254)
  destinatario!: string;
}
