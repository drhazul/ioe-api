import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export enum SucursalCommandAction {
  REBOOT = 'REBOOT',
  UNLOCK = 'UNLOCK',
  CLEAR_ADMIN = 'CLEAR_ADMIN',
  SYNC_USERS = 'SYNC_USERS',
}

export class SucursalCommandDto {
  @ApiProperty({ example: 'CDM-01' })
  @IsString()
  @Length(1, 30)
  suc: string;

  @ApiProperty({
    enum: SucursalCommandAction,
    example: SucursalCommandAction.REBOOT,
  })
  @IsEnum(SucursalCommandAction)
  command: SucursalCommandAction;

  @ApiPropertyOptional({ example: 'ADMS-CDM-001' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  device_id?: string;
}
