import { IsString } from 'class-validator';

export class RevisarMermaDto {
  @IsString()
  obs: string;
}
