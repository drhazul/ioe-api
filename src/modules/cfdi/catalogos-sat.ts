/**
 * Descripciones de los catalogos del SAT, solo para la representacion impresa.
 *
 * No se validan claves contra estas tablas: el comprobante ya se valido al
 * armarlo, y una clave que falte aqui se imprime sola, sin su descripcion.
 * Por eso basta con lo que de verdad se usa en el negocio.
 */

/** c_RegimenFiscal */
export const REGIMENES: Readonly<Record<string, string>> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Regimen de Enajenacion o Adquisicion de Bienes',
  '608': 'Demas ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en Mexico',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Fisicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Regimen de los ingresos por obtencion de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Produccion',
  '621': 'Incorporacion Fiscal',
  '622': 'Actividades Agricolas, Ganaderas, Silvicolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625':
    'Actividades Empresariales con ingresos a traves de Plataformas Tecnologicas',
  '626': 'Regimen Simplificado de Confianza',
};

/** c_UsoCFDI */
export const USOS_CFDI: Readonly<Record<string, string>> = {
  G01: 'Adquisicion de mercancias',
  G02: 'Devoluciones, descuentos o bonificaciones',
  G03: 'Gastos en general',
  I01: 'Construcciones',
  I02: 'Mobiliario y equipo de oficina por inversiones',
  I03: 'Equipo de transporte',
  I04: 'Equipo de computo y accesorios',
  I05: 'Dados, troqueles, moldes, matrices y herramental',
  I06: 'Comunicaciones telefonicas',
  I07: 'Comunicaciones satelitales',
  I08: 'Otra maquinaria y equipo',
  D01: 'Honorarios medicos, dentales y gastos hospitalarios',
  D02: 'Gastos medicos por incapacidad o discapacidad',
  D03: 'Gastos funerales',
  D04: 'Donativos',
  D05: 'Intereses reales por creditos hipotecarios',
  D06: 'Aportaciones voluntarias al SAR',
  D07: 'Primas por seguros de gastos medicos',
  D08: 'Gastos de transportacion escolar obligatoria',
  D09: 'Depositos en cuentas para el ahorro, primas de pensiones',
  D10: 'Pagos por servicios educativos (colegiaturas)',
  S01: 'Sin efectos fiscales',
  CP01: 'Pagos',
  CN01: 'Nomina',
};

/** c_FormaPago */
export const FORMAS_PAGO: Readonly<Record<string, string>> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electronica de fondos',
  '04': 'Tarjeta de credito',
  '05': 'Monedero electronico',
  '06': 'Dinero electronico',
  '08': 'Vales de despensa',
  '12': 'Dacion en pago',
  '13': 'Pago por subrogacion',
  '14': 'Pago por consignacion',
  '15': 'Condonacion',
  '17': 'Compensacion',
  '23': 'Novacion',
  '24': 'Confusion',
  '25': 'Remision de deuda',
  '26': 'Prescripcion o caducidad',
  '27': 'A satisfaccion del acreedor',
  '28': 'Tarjeta de debito',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicacion de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
};
