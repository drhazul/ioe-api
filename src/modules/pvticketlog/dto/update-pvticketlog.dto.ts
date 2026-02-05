import { PartialType } from '@nestjs/swagger';
import { CreatePvTicketLogDto } from './create-pvticketlog.dto';

export class UpdatePvTicketLogDto extends PartialType(CreatePvTicketLogDto) {}
