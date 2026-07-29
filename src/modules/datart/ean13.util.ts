export type Ean13Info = {
  ean13: string;
  sourceDigits: string;
  sourceHasCheckDigit: boolean;
  sourceCheckDigitValid: boolean | null;
};

export function buildEan13FromUpc(upc: string): Ean13Info | null {
  const digits = upc.replace(/[^0-9]/g, '');
  if (!digits) return null;

  const base12 =
    digits.length >= 12 ? digits.slice(0, 12) : digits.padStart(12, '0');
  const checkDigit = ean13CheckDigit(base12);
  const sourceHasCheckDigit = digits.length >= 13;

  return {
    ean13: `${base12}${checkDigit}`,
    sourceDigits: digits,
    sourceHasCheckDigit,
    sourceCheckDigitValid: sourceHasCheckDigit
      ? Number(digits[12]) === checkDigit
      : null,
  };
}

export function ean13CheckDigit(base12: string): number {
  if (!/^\d{12}$/.test(base12)) {
    throw new TypeError('base12 debe contener exactamente 12 dígitos');
  }

  const sum = [...base12].reduce((total, value, index) => {
    const digit = Number(value);
    return total + (index % 2 === 0 ? digit : digit * 3);
  }, 0);

  return (10 - (sum % 10)) % 10;
}
