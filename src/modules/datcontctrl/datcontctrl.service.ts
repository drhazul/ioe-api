import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DatContCtrlEntity } from './datcontctrl.entity';
import { DatDetSvrEntity } from '../datdetsvr/datdetsvr.entity';
import { CreateDatContCtrlDto } from './dto/create-datcontctrl.dto';
import { UpdateDatContCtrlDto } from './dto/update-datcontctrl.dto';

@Injectable()
export class DatContCtrlService {
  constructor(
    @InjectRepository(DatContCtrlEntity)
    private readonly repo: Repository<DatContCtrlEntity>,
    @InjectRepository(DatDetSvrEntity)
    private readonly detRepo: Repository<DatDetSvrEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { TOKENREG: 'ASC' } });
  }

  async findOne(tokenreg: string) {
    const row = await this.repo.findOne({ where: { TOKENREG: tokenreg } });
    if (!row) throw new NotFoundException(`DAT_CONT_CTRL ${tokenreg} no existe`);
    return row;
  }

  async create(dto: CreateDatContCtrlDto) {
    const exists = await this.repo.exist({ where: { TOKENREG: dto.TOKENREG } });
    if (exists) throw new ConflictException(`DAT_CONT_CTRL ${dto.TOKENREG} ya existe`);

    const entity = this.repo.create({
      TOKENREG: dto.TOKENREG,
      CONT: dto.CONT ?? null,
      FCNC: dto.FCNC ? new Date(dto.FCNC) : null,
      ESTA: dto.ESTA ?? null,
      SUC: dto.SUC ?? null,
      FCNAJ: dto.FCNAJ ? new Date(dto.FCNAJ) : null,
      ARTAJ: dto.ARTAJ ?? null,
      ARTCONT: dto.ARTCONT ?? null,
      TIPOCONT: dto.TIPOCONT ?? null,
      CREADO: dto.CREADO ? new Date(dto.CREADO) : null,
      CREADO_POR: dto.CREADO_POR ?? null,
      MODIFICADO_POR: dto.MODIFICADO_POR ?? null,
    });

    return this.repo.save(entity);
  }

  async update(tokenreg: string, dto: UpdateDatContCtrlDto) {
    const row = await this.findOne(tokenreg);

    const partial: Partial<DatContCtrlEntity> = {};

    if (dto.CONT !== undefined) {
      partial.CONT = dto.CONT ?? null;
    }

    if (dto.FCNC !== undefined) {
      partial.FCNC = dto.FCNC ? new Date(dto.FCNC) : null;
    }

    if (dto.ESTA !== undefined) {
      partial.ESTA = dto.ESTA ?? null;
    }

    if (dto.SUC !== undefined) {
      partial.SUC = dto.SUC ?? null;
    }

    if (dto.FCNAJ !== undefined) {
      partial.FCNAJ = dto.FCNAJ ? new Date(dto.FCNAJ) : null;
    }

    if (dto.ARTAJ !== undefined) {
      partial.ARTAJ = dto.ARTAJ ?? null;
    }

    if (dto.ARTCONT !== undefined) {
      partial.ARTCONT = dto.ARTCONT ?? null;
    }

    if (dto.TIPOCONT !== undefined) {
      partial.TIPOCONT = dto.TIPOCONT ?? null;
    }

    if (dto.CREADO !== undefined) {
      partial.CREADO = dto.CREADO ? new Date(dto.CREADO) : null;
    }

    if (dto.CREADO_POR !== undefined) {
      partial.CREADO_POR = dto.CREADO_POR ?? null;
    }

    if (dto.MODIFICADO_POR !== undefined) {
      partial.MODIFICADO_POR = dto.MODIFICADO_POR ?? null;
    }

    const updated = this.repo.merge(row, partial);
    return this.repo.save(updated);
  }

  async remove(tokenreg: string) {
    const row = await this.findOne(tokenreg);
    const cont = (row.CONT ?? '').trim();
    const suc = (row.SUC ?? '').trim();
    try {
      if (cont.length > 0) {
        if (suc.length > 0) {
          await this.detRepo.delete({ CONT: cont, SUC: suc });
        } else {
          await this.detRepo.delete({ CONT: cont });
        }
      }
      await this.repo.remove(row);
    } catch (err) {
      if (err instanceof QueryFailedError) {
        throw new ConflictException(
          `No se puede eliminar el registro ${tokenreg} porque está referenciado por otros registros.`,
        );
      }
      throw err;
    }
    return { deleted: true, TOKENREG: tokenreg };
  }
}
