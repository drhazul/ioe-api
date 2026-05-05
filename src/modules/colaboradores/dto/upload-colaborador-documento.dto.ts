import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

export class UploadColaboradorDocumentoDto {
  @ApiProperty({ enum: ['RFC', 'CURP', 'NSS'], example: 'RFC' })
  @IsString()
  @IsIn(['RFC', 'CURP', 'NSS'])
  tipo_doc: 'RFC' | 'CURP' | 'NSS';
}
