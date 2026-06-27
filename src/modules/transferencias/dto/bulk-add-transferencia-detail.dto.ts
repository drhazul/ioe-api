import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkAddTransferenciaDetailItemDto {
  @IsString()
  @MaxLength(50)
  art: string;

  @IsNumber()
  @Min(0.0001)
  ctd: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  des?: string;
}

export class BulkAddTransferenciaDetailDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkAddTransferenciaDetailItemDto)
  items: BulkAddTransferenciaDetailItemDto[];
}
