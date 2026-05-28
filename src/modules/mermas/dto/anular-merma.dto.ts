import { IsString } from 'class-validator';

export class AnularMermaDto {
  @IsString()
  obs: string;
}
