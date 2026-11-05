import { StreamableFile } from '@nestjs/common';
import {
  businessDateTime,
  businessDayBound,
  businessFromInstant,
  businessSqlDate,
  utcInstant,
  utcSqlInstant,
} from './fecha-negocio';
import {
  businessResponse,
  BUSINESS_RESPONSE_CONTRACTS,
} from './business-time.interceptor';

describe('contrato de fechas comerciales CDMX', () => {
  it('conserva exportaciones binarias y su streaming', () => {
    const exportFile = new StreamableFile(Buffer.from('MB51'));
    expect(businessResponse(exportFile, ['FCNC'])).toBe(exportFile);
  });
  it('recupera instante real de columna SQL UTC hidratada con useUTC=false', () => {
    expect(utcSqlInstant(new Date(2026, 10, 4, 18, 39, 38, 623))).toBe(
      '2026-11-04T18:39:38.623Z',
    );
    expect(utcSqlInstant('2026-11-04T18:39:38.623')).toBe(
      '2026-11-04T18:39:38.623Z',
    );
  });
  it.each(Object.entries(BUSINESS_RESPONSE_CONTRACTS))(
    'contrato compartido %s conserva día comercial sin tocar auditoría',
    (_route, fields) => {
      const field = fields[0];
      const audit = new Date('2026-11-05T05:59:59.997Z');
      const row = {
        [field.toLowerCase()]: new Date(2026, 10, 4, 23, 59, 59, 997),
        FCNR: audit,
        CTOT: 1355,
      };
      const result: any = businessResponse({ items: [row] }, fields);
      expect(result.items[0][field.toLowerCase()]).toBe(
        '2026-11-04T23:59:59.997',
      );
      expect(result.items[0].FCNR).toBe(audit);
      expect(result.items[0].CTOT).toBe(1355);
    },
  );
  it.each([
    ['2026-11-05T00:39:38.623Z', '2026-11-04T18:39:38.623'],
    ['2026-11-04T18:39:38.623Z', '2026-11-04T12:39:38.623'],
    ['2027-01-01T05:59:59.999Z', '2026-12-31T23:59:59.999'],
    ['2027-01-01T06:00:00.000Z', '2027-01-01T00:00:00.000'],
    ['2026-11-01T05:59:59.000Z', '2026-10-31T23:59:59.000'],
  ])('convierte instante %s por zona IANA', (instant, expected) => {
    expect(businessFromInstant(new Date(instant))).toBe(expected);
    expect(utcInstant(new Date(instant))).toBe(instant);
  });
  it('hidrata SQL legacy y proyección varchar sin agregar Z', () => {
    const driverValue = new Date(2026, 10, 4, 12, 39, 38, 623);
    expect(businessDateTime(driverValue)).toBe('2026-11-04T12:39:38.623');
    expect(businessDateTime('2026-11-04 12:39:38.623')).toBe(
      '2026-11-04T12:39:38.623',
    );
  });
  it('separa contratos y rechaza calendario inválido', () => {
    expect(() => businessDateTime('2026-11-05T00:39:38.623Z')).toThrow();
    expect(() => businessDateTime('2026-02-30')).toThrow();
    expect(() => businessDateTime('2026-11-04T24:00:00')).toThrow();
  });
  it('usa límites de día comercial y último tick de SQL datetime', () => {
    expect(businessDateTime(businessDayBound('2026-11-04'))).toBe(
      '2026-11-04T00:00:00.000',
    );
    expect(businessDateTime(businessDayBound('2026-11-04', true))).toBe(
      '2026-11-04T23:59:59.997',
    );
    expect(businessDateTime(businessSqlDate('2026-11-04'))).toBe(
      '2026-11-04T00:00:00.000',
    );
  });
  it('solo transforma campos registrados; auditoría conserva instante', () => {
    const audit = new Date('2026-11-04T18:39:38.623Z');
    const out: any = businessResponse(
      { items: [{ FCNC: '2026-11-04T12:39:38.623', FCNR: audit }] },
      ['FCNC'],
    );
    expect(JSON.parse(JSON.stringify(out)).items[0]).toEqual({
      FCNC: '2026-11-04T12:39:38.623',
      FCNR: '2026-11-04T18:39:38.623Z',
    });
  });
});
