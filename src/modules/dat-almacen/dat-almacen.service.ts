import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatAlmacenEntity } from './dat-almacen.entity';

@Injectable()
export class DatAlmacenService {
  constructor(
    @InjectRepository(DatAlmacenEntity)
    private readonly repo: Repository<DatAlmacenEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { ALMACEN: 'ASC' } });
  }
}
