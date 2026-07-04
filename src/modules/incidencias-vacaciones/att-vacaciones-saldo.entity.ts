import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'ATT_VACACIONES_SALDOS', schema: 'dbo' })
export class AttVacacionesSaldoEntity {
  @PrimaryColumn({ type: 'int', name: 'colaborador_id' })
  colaboradorId: number | undefined;

  @PrimaryColumn({ type: 'int', name: 'anio' })
  anio: number | undefined;

  @Column({ type: 'int', name: 'dias_totales', default: () => '0' })
  diasTotales: number | undefined;

  @Column({ type: 'int', name: 'dias_usados', default: () => '0' })
  diasUsados: number | undefined;
}
