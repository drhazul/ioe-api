import {
  MotivoCancelacionInvalidoError,
  MOTIVOS_CANCELACION,
  validarMotivo,
} from './motivo-cancelacion';

const UUID = 'A1B2C3D4-1111-2222-3333-444455556666';

describe('validarMotivo', () => {
  it('acepta los cuatro motivos del catalogo del SAT', () => {
    expect(Object.keys(MOTIVOS_CANCELACION)).toEqual(['01', '02', '03', '04']);
    for (const motivo of ['02', '03', '04']) {
      expect(validarMotivo(motivo)).toEqual({ motivo });
    }
  });

  it('rechaza un motivo fuera del catalogo', () => {
    expect(() => validarMotivo('05')).toThrow(MotivoCancelacionInvalidoError);
    expect(() => validarMotivo('')).toThrow(/invalido/i);
  });

  it('el motivo 01 exige folioSustitucion', () => {
    expect(() => validarMotivo('01')).toThrow(/exige folioSustitucion/i);
    expect(validarMotivo('01', UUID)).toEqual({
      motivo: '01',
      folioSustitucion: UUID,
    });
  });

  it('el motivo 01 exige que el folio sea un UUID', () => {
    expect(() => validarMotivo('01', 'el-folio-123')).toThrow(/forma de UUID/i);
  });

  it('los demas motivos NO admiten folioSustitucion', () => {
    // Mandarlo con motivo 02 es rechazo del SAT, y es un error facil de cometer
    // cuando la pantalla deja el campo lleno de una cancelacion anterior.
    for (const motivo of ['02', '03', '04']) {
      expect(() => validarMotivo(motivo, UUID)).toThrow(
        /no lleva folioSustitucion/i,
      );
    }
  });

  it('normaliza espacios y mayusculas', () => {
    expect(validarMotivo(' 01 ', UUID.toLowerCase())).toEqual({
      motivo: '01',
      folioSustitucion: UUID,
    });
  });
});
