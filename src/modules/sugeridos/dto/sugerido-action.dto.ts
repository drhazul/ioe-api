import { IsOptional, IsString } from 'class-validator';

export class SugeridoActionDto {
  @IsOptional()
  @IsString()
  obs?: string;
}
