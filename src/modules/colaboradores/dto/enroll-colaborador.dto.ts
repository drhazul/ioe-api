import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class EnrollColaboradorDto {
  @ApiPropertyOptional({
    example: 'FP',
    description: 'FP para huella, FACE para rostro',
    enum: ['FP', 'FACE'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['FP', 'FACE', 'fp', 'face'])
  tipo?: string;
}
