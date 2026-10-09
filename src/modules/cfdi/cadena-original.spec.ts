import {
  cadenaOriginal,
  ComplementoNoSoportadoError,
  normalizarEspacios,
  ORDEN_CADENA_ORIGINAL,
  type Paso,
} from './cadena-original';
import { aUtf8SinBom, nodo, serializarXml } from './cfdi-node';

/** Comprobante minimo valido, para que cada prueba solo cambie lo suyo. */
function comprobanteBase(
  extra: Partial<Record<string, string>> = {},
  hijosExtra: ReturnType<typeof nodo>[] = [],
) {
  return nodo({
    name: 'cfdi:Comprobante',
    attrs: {
      Version: '4.0',
      Fecha: '2026-09-07T12:00:00',
      NoCertificado: '30001000000500003364',
      SubTotal: '100.00',
      Moneda: 'MXN',
      Total: '116.00',
      TipoDeComprobante: 'I',
      Exportacion: '01',
      LugarExpedicion: '39000',
      ...extra,
    },
    children: [
      nodo({
        name: 'cfdi:Emisor',
        attrs: {
          Rfc: 'XIQB891116QE4',
          Nombre: 'BERENICE XIMO QUEZADA',
          RegimenFiscal: '612',
        },
      }),
      nodo({
        name: 'cfdi:Receptor',
        attrs: {
          Rfc: 'XAXX010101000',
          Nombre: 'PUBLICO EN GENERAL',
          DomicilioFiscalReceptor: '39000',
          RegimenFiscalReceptor: '616',
          UsoCFDI: 'S01',
        },
      }),
      nodo({
        name: 'cfdi:Conceptos',
        children: [
          nodo({
            name: 'cfdi:Concepto',
            attrs: {
              ClaveProdServ: '01010101',
              Cantidad: '1',
              ClaveUnidad: 'H87',
              Descripcion: 'ARTICULO',
              ValorUnitario: '100.00',
              Importe: '100.00',
              ObjetoImp: '02',
            },
          }),
        ],
      }),
      ...hijosExtra,
    ],
  });
}

describe('normalizarEspacios', () => {
  it('recorta extremos y colapsa corridas internas', () => {
    expect(normalizarEspacios('  GRUPO   A    B  ')).toBe('GRUPO A B');
    expect(normalizarEspacios('LINEA\nOTRA\tTAB\r\nFIN')).toBe(
      'LINEA OTRA TAB FIN',
    );
  });

  it('NO colapsa espacios que XPath conserva (U+00A0, U+2003, BOM)', () => {
    // El \s de JavaScript si los colapsaria. XPath normalize-space no.
    // Si esto se rompe, la cadena diferiria de la del SAT en razones sociales
    // que traigan un espacio duro pegado desde el capturista.
    expect(normalizarEspacios('A B')).toBe('A B');
    expect(normalizarEspacios('A B')).toBe('A B');
    expect(normalizarEspacios('A﻿B')).toBe('A﻿B');
  });
});

describe('cadenaOriginal — estructura', () => {
  it('arranca con || y termina con ||, como el XSLT del SAT', () => {
    // Template raiz `|...||` + cada atributo `|valor`. Con un solo `|`
    // inicial Quadrum rechazo con CFDI40102 (2026-09-14).
    const c = cadenaOriginal(comprobanteBase());
    expect(c.startsWith('||4.0|')).toBe(true);
    expect(c.startsWith('|||')).toBe(false);
    expect(c.endsWith('|02||')).toBe(true);
  });

  it('produce exactamente la cadena del XSLT oficial', () => {
    // Obtenida aplicando cadenaoriginal_4_0.xslt (.NET XslCompiledTransform)
    // a este mismo comprobante.
    expect(cadenaOriginal(comprobanteBase())).toBe(
      '||4.0|2026-09-07T12:00:00|30001000000500003364|100.00|MXN|116.00|I|01|39000' +
        '|XIQB891116QE4|BERENICE XIMO QUEZADA|612' +
        '|XAXX010101000|PUBLICO EN GENERAL|39000|616|S01' +
        '|01010101|1|H87|ARTICULO|100.00|100.00|02||',
    );
  });

  it('emite los atributos del comprobante en el orden del SAT', () => {
    const c = cadenaOriginal(comprobanteBase({ Serie: 'A', Folio: '123' }));
    expect(c).toContain('|4.0|A|123|2026-09-07T12:00:00|30001000000500003364|');
  });

  it('omite por completo un opcional ausente, sin dejar separador vacio', () => {
    const conSerie = cadenaOriginal(comprobanteBase({ Serie: 'A' }));
    const sinSerie = cadenaOriginal(comprobanteBase());
    expect(conSerie).toContain('|4.0|A|2026-09-07T12:00:00|');
    expect(sinSerie).toContain('|4.0|2026-09-07T12:00:00|');
    expect(sinSerie).not.toContain('||2026-09-07');
  });

  it('un opcional presente pero vacio SI emite separador', () => {
    // Ausente y vacio no son lo mismo. Distinguirlo importa en los PATCH y al
    // mapear columnas nulas de la base.
    const c = cadenaOriginal(comprobanteBase({ Serie: '' }));
    expect(c).toContain('|4.0||2026-09-07T12:00:00|');
  });

  it('truena si falta un atributo requerido', () => {
    const roto = nodo({
      name: 'cfdi:Comprobante',
      attrs: { Version: '4.0', NoCertificado: '3000' },
    });
    expect(() => cadenaOriginal(roto)).toThrow(/Fecha/);
  });
});

describe('cadenaOriginal — reglas del sellado que no se negocian', () => {
  it('rechaza un comprobante que ya trae Sello', () => {
    const c = comprobanteBase({ Sello: 'abc==' });
    expect(() => cadenaOriginal(c)).toThrow(/NUNCA forma parte/);
  });

  it('exige NoCertificado antes de generar la cadena', () => {
    const sinCert = nodo({
      name: 'cfdi:Comprobante',
      attrs: { Version: '4.0', Fecha: '2026-09-07T12:00:00' },
    });
    expect(() => cadenaOriginal(sinCert)).toThrow(/NoCertificado/);
  });
});

describe('bug #1 del modulo C#: escapado de entidades', () => {
  const RAZON = 'GRUPO A & B SA DE CV';

  it('con razon social que trae &, la cadena conserva el caracter crudo', () => {
    const comp = nodo({
      name: 'cfdi:Comprobante',
      attrs: {
        Version: '4.0',
        Fecha: '2026-09-07T12:00:00',
        NoCertificado: '30001000000500003364',
        SubTotal: '100.00',
        Moneda: 'MXN',
        Total: '116.00',
        TipoDeComprobante: 'I',
        Exportacion: '01',
        LugarExpedicion: '39000',
      },
      children: [
        nodo({
          name: 'cfdi:Emisor',
          attrs: { Rfc: 'AAA010101AAA', Nombre: RAZON, RegimenFiscal: '601' },
        }),
      ],
    });

    const cadena = cadenaOriginal(comp);
    expect(cadena).toContain(RAZON);
    expect(cadena).not.toContain('&amp;');

    // ...pero el XML SI debe escaparlo. Ese contraste es justo el bug.
    const xml = serializarXml(comp);
    expect(xml).toContain('GRUPO A &amp; B SA DE CV');
    expect(xml).not.toContain('A & B');
  });
});

describe('bug #2 del modulo C#: Importe vs Cantidad x ValorUnitario', () => {
  it('la cadena usa los valores serializados, no los calculados', () => {
    // Cantidad=7, ValorUnitario=862.068966 -> el XML escribe 862.07 y el PAC
    // valida 7 x 862.07 = 6034.49. Si el Importe dijera 6034.48 (calculado con
    // el unitario completo) el PAC rechaza. La cadena debe reflejar el XML.
    const cantidad = '7';
    const valorUnitario = '862.07';
    const importe = (7 * 862.07).toFixed(2);
    expect(importe).toBe('6034.49');

    const comp = comprobanteBase({ SubTotal: importe, Total: importe });
    const conceptos = comp.children.find((c) => c.name === 'cfdi:Conceptos')!;
    const concepto = nodo({
      name: 'cfdi:Concepto',
      attrs: {
        ClaveProdServ: '01010101',
        Cantidad: cantidad,
        ClaveUnidad: 'H87',
        Descripcion: 'ARTICULO',
        ValorUnitario: valorUnitario,
        Importe: importe,
        ObjetoImp: '02',
      },
    });
    const compConConcepto = nodo({
      name: 'cfdi:Comprobante',
      attrs: Object.fromEntries(comp.attrs),
      children: comp.children.map((c) =>
        c === conceptos
          ? nodo({ name: 'cfdi:Conceptos', children: [concepto] })
          : c,
      ),
    });

    const cadena = cadenaOriginal(compConConcepto);
    expect(cadena).toContain('|7|H87|ARTICULO|862.07|6034.49|');
    expect(cadena).not.toContain('6034.48');
  });
});

describe('orden derivado del XSLT', () => {
  it('Impuestos global: Retenciones antes de TotalImpuestosRetenidos', () => {
    const impuestos = nodo({
      name: 'cfdi:Impuestos',
      attrs: {
        TotalImpuestosRetenidos: '10.00',
        TotalImpuestosTrasladados: '16.00',
      },
      children: [
        nodo({
          name: 'cfdi:Retenciones',
          children: [
            nodo({
              name: 'cfdi:Retencion',
              attrs: { Impuesto: '001', Importe: '10.00' },
            }),
          ],
        }),
        nodo({
          name: 'cfdi:Traslados',
          children: [
            nodo({
              name: 'cfdi:Traslado',
              attrs: {
                Base: '100.00',
                Impuesto: '002',
                TipoFactor: 'Tasa',
                TasaOCuota: '0.160000',
                Importe: '16.00',
              },
            }),
          ],
        }),
      ],
    });

    const comp = nodo({
      name: 'cfdi:Comprobante',
      attrs: Object.fromEntries(comprobanteBase().attrs),
      children: [...comprobanteBase().children, impuestos],
    });

    const cadena = cadenaOriginal(comp);
    // Retencion(001|10.00) -> Total retenidos(10.00) -> Traslado -> Total trasladados
    expect(cadena).toContain(
      '|001|10.00|10.00|100.00|002|Tasa|0.160000|16.00|16.00|',
    );
  });

  it('InformacionGlobal incluye el atributo Año', () => {
    expect(
      ORDEN_CADENA_ORIGINAL['cfdi:InformacionGlobal'].some(
        (p) => p.tipo === 'attr' && p.attr === 'Año',
      ),
    ).toBe(true);
  });

  it('la tabla cubre 75 atributos, como el XSLT del SAT', () => {
    const contar = (pasos: readonly Paso[]): number =>
      pasos.reduce<number>(
        (acc, p) =>
          acc +
          (p.tipo === 'attr' ? 1 : 0) +
          (p.tipo === 'lista' && p.pasos ? contar(p.pasos) : 0),
        0,
      );
    const total = Object.values(ORDEN_CADENA_ORIGINAL).reduce(
      (acc, pasos) => acc + contar(pasos),
      0,
    );
    expect(total).toBe(75);
  });
});

describe('complementos', () => {
  it('truena en vez de emitir una cadena incompleta en silencio', () => {
    // Omitir un complemento produce un sello que el PAC rechaza sin explicar.
    // Fallar ruidosamente aqui es mucho mas barato.
    const comp = nodo({
      name: 'cfdi:Comprobante',
      attrs: Object.fromEntries(comprobanteBase().attrs),
      children: [
        ...comprobanteBase().children,
        nodo({
          name: 'cfdi:Complemento',
          // Nomina no se usa en el negocio; pago20 ya tiene tabla propia.
          children: [nodo({ name: 'nomina12:Nomina' })],
        }),
      ],
    });
    expect(() => cadenaOriginal(comp)).toThrow(ComplementoNoSoportadoError);
    expect(() => cadenaOriginal(comp)).toThrow(/nomina12:Nomina/);
  });
});

describe('serializacion', () => {
  it('el XML sale sin BOM', () => {
    const buf = aUtf8SinBom(serializarXml(comprobanteBase()));
    expect(buf[0]).not.toBe(0xef);
    expect(buf.subarray(0, 5).toString('utf8')).toBe('<?xml');
  });
});
