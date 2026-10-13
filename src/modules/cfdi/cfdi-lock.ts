import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Exclusión entre procesos durante todo el ciclo PAC, sin DDL ni bloqueo de filas. */
export async function conBloqueoCfdi<T>(
  db: DataSource,
  idFol: string,
  accion: () => Promise<T>,
): Promise<T> {
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    const recurso =
      'QUADRUM_DOC:' + createHash('sha256').update(idFol).digest('hex');
    const rows = await runner.query(
      `DECLARE @r INT;
      EXEC @r = sys.sp_getapplock @Resource=@0, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=0;
      SELECT @r AS resultado`,
      [recurso],
    );
    if (Number(rows?.[0]?.resultado ?? -999) < 0)
      throw new ConflictException(
        'Documento Quadrum en procesamiento; no reenviar.',
      );
    const resultado = await accion();
    await runner.commitTransaction();
    return resultado;
  } catch (e) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw e;
  } finally {
    await runner.release();
  }
}
