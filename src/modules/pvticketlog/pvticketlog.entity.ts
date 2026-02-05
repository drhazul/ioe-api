import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'PV_TICKET_LOG', schema: 'dbo' })
export class PvTicketLogEntity {
  @PrimaryColumn({ name: 'ID', type: 'nvarchar', length: 255 })
  ID: string;

  @Column({ name: 'IDFOL', type: 'nvarchar', length: 255, nullable: true })
  IDFOL: string | null;

  @Column({ name: 'UPC', type: 'nvarchar', length: 255, nullable: true })
  UPC: string | null;

  @Column({ name: 'ART', type: 'nvarchar', length: 255, nullable: true })
  ART: string | null;

  @Column({ name: 'DES', type: 'nvarchar', length: 255, nullable: true })
  DES: string | null;

  @Column({ name: 'CTD', type: 'float', nullable: true })
  CTD: number | null;

  @Column({ name: 'PVTA', type: 'money', nullable: true })
  PVTA: number | null;

  @Column({ name: 'PVTAT', type: 'money', nullable: true })
  PVTAT: number | null;

  @Column({ name: 'ORD', type: 'nvarchar', length: 255, nullable: true })
  ORD: string | null;

  @Column({ name: 'IDDEV', type: 'varchar', length: 255, nullable: true })
  IDDEV: string | null;

  @Column({ name: 'CTDD', type: 'float', nullable: true })
  CTDD: number | null;

  @Column({ name: 'CTDDF', type: 'float', nullable: true })
  CTDDF: number | null;

  @Column({ name: 'updated_at', type: 'datetime', nullable: true })
  UPDATED_AT: Date | null;
}
