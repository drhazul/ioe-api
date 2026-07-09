import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { EmpresaEntity } from './empresa.entity';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';

@Injectable()
export class EmpresasService {
  constructor(
    @InjectRepository(EmpresaEntity)
    private readonly repo: Repository<EmpresaEntity>,
  ) {}

  findAll() {
    return this.repo.find({ order: { idempresa: 'ASC' } });
  }

  async findOne(id: number) {
    const row = await this.repo.findOne({ where: { idempresa: id } });
    if (!row) throw new NotFoundException(`EMPRESA ${id} no existe`);
    return row;
  }

  async create(dto: CreateEmpresaDto) {
    const correo = this.normalizeCorreo(dto.correo);
    await this.assertCorreoUnique(correo);

    try {
      return await this.repo.save(
        this.repo.create({
          razonSocial: this.normalizeText(dto.razon_social),
          direccion: this.normalizeNullable(dto.direccion),
          correo,
          cp: this.normalizeNullable(dto.cp),
          rfc: this.normalizeNullable(dto.rfc)?.toUpperCase() ?? null,
          telefono: this.normalizeNullable(dto.telefono),
        }),
      );
    } catch (err) {
      this.handleWriteError(err, correo);
    }
  }

  async update(id: number, dto: UpdateEmpresaDto) {
    const row = await this.findOne(id);

    if (dto.correo !== undefined) {
      const correo = this.normalizeCorreo(dto.correo);
      if (correo !== row.correo) await this.assertCorreoUnique(correo, id);
      row.correo = correo;
    }
    if (dto.razon_social !== undefined) {
      row.razonSocial = this.normalizeText(dto.razon_social);
    }
    if (dto.direccion !== undefined) {
      row.direccion = this.normalizeNullable(dto.direccion);
    }
    if (dto.cp !== undefined) row.cp = this.normalizeNullable(dto.cp);
    if (dto.rfc !== undefined) {
      row.rfc = this.normalizeNullable(dto.rfc)?.toUpperCase() ?? null;
    }
    if (dto.telefono !== undefined) {
      row.telefono = this.normalizeNullable(dto.telefono);
    }

    try {
      return await this.repo.save(row);
    } catch (err) {
      this.handleWriteError(err);
    }
  }

  async remove(id: number) {
    const row = await this.findOne(id);
    await this.repo.remove(row);
    return { deleted: true, idempresa: id };
  }

  private async assertCorreoUnique(correo: string, excludeId?: number) {
    const exists = await this.repo
      .createQueryBuilder('empresa')
      .where('LOWER(empresa.correo) = LOWER(:correo)', { correo })
      .andWhere(
        excludeId == null ? '1 = 1' : 'empresa.idempresa <> :excludeId',
        { excludeId },
      )
      .getExists();

    if (exists) throw new ConflictException(`correo ${correo} ya existe`);
  }

  private normalizeCorreo(value: string) {
    const correo = String(value ?? '')
      .trim()
      .toLowerCase();
    if (!/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(correo)) {
      throw new BadRequestException(
        'correo debe ser un prefijo de dominio valido, ejemplo @ioebusiness.com.mx',
      );
    }
    return correo;
  }

  private normalizeText(value: string) {
    const text = String(value ?? '').trim();
    if (!text) throw new BadRequestException('razon_social es requerido');
    return text;
  }

  private normalizeNullable(value?: string | null) {
    const text = String(value ?? '').trim();
    return text.length ? text : null;
  }

  private handleWriteError(err: unknown, correo?: string): never {
    if (err instanceof QueryFailedError) {
      const message = String((err as { message?: unknown }).message ?? '')
        .trim()
        .toUpperCase();
      if (message.includes('UQ_') || message.includes('UNIQUE')) {
        throw new ConflictException(`correo ${correo ?? ''} ya existe`.trim());
      }
    }
    throw err;
  }
}
