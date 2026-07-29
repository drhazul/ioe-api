import { buildEan13FromUpc, ean13CheckDigit } from './ean13.util';

describe('buildEan13FromUpc', () => {
  it('usa primeros 12 dígitos y reemplaza verificador inválido', () => {
    expect(buildEan13FromUpc('7000060111696')).toEqual({
      ean13: '7000060111695',
      sourceDigits: '7000060111696',
      sourceHasCheckDigit: true,
      sourceCheckDigitValid: false,
    });
  });

  it('reconoce un verificador recibido válido', () => {
    expect(buildEan13FromUpc('7000060111695')).toEqual({
      ean13: '7000060111695',
      sourceDigits: '7000060111695',
      sourceHasCheckDigit: true,
      sourceCheckDigitValid: true,
    });
  });

  it('sanitiza separadores y rellena UPC cortos a la izquierda', () => {
    expect(buildEan13FromUpc('7000-0601 1169-6')?.ean13).toBe('7000060111695');
    expect(buildEan13FromUpc('60111696')?.ean13).toBe('0000601116964');
  });

  it('retorna null sin dígitos', () => {
    expect(buildEan13FromUpc('ABC-')).toBeNull();
  });
});

describe('ean13CheckDigit', () => {
  it('rechaza bases distintas de 12 dígitos', () => {
    expect(() => ean13CheckDigit('123')).toThrow(
      'base12 debe contener exactamente 12 dígitos',
    );
  });
});
