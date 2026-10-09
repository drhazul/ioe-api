/**
 * Arbol de nodos del CFDI.
 *
 * Por que existe esta capa
 * -----------------------
 * El XML que se envia al PAC y la cadena original que se firma tienen que
 * describir EXACTAMENTE los mismos valores. Cuando se generan por separado
 * —uno serializando el objeto de dominio, otro recorriendolo otra vez— pueden
 * divergir por redondeo o por formato, y el resultado es un sello invalido que
 * el PAC rechaza sin decir por que.
 *
 * Ese fue el bug #2 del modulo C# original: con `Cantidad = 7` y
 * `ValorUnitario = 862.068966`, el XML escribia `862.07` pero el importe se
 * calculaba con el unitario completo, y `7 x 862.07 = 6034.49 != 6034.48`.
 *
 * Aqui se resuelve por construccion: los atributos se guardan **ya
 * serializados como cadena**, tal cual van a quedar en el XML, y tanto
 * `serializarXml()` como `cadenaOriginal()` recorren este mismo arbol.
 * No hay forma de que difieran.
 */

/** Un nodo del CFDI con sus atributos ya convertidos a la cadena final. */
export interface CfdiNode {
  /** Nombre calificado, p. ej. `cfdi:Comprobante`. */
  readonly name: string;
  /**
   * Atributos en el orden en que se escriben al XML. El valor es la cadena
   * EXACTA que aparecera en el documento: ya redondeada, ya formateada.
   * Un atributo ausente se representa omitiendolo, nunca con cadena vacia.
   */
  readonly attrs: ReadonlyMap<string, string>;
  readonly children: readonly CfdiNode[];
}

/** Declaraciones de espacio de nombres que van en el nodo raiz. */
export type Namespaces = Readonly<Record<string, string>>;

export interface CrearNodoInput {
  name: string;
  /** Los `undefined` y `null` se omiten; asi se distingue "opcional ausente". */
  attrs?: Readonly<Record<string, string | undefined | null>>;
  children?: readonly CfdiNode[];
}

/**
 * Crea un nodo descartando los atributos ausentes.
 *
 * Ojo con la diferencia entre ausente y vacio: un atributo opcional que no
 * aplica debe OMITIRSE (no emite nada en la cadena original), mientras que
 * uno presente con cadena vacia si emite un separador. No son lo mismo.
 */
export function nodo({ name, attrs, children }: CrearNodoInput): CfdiNode {
  const mapa = new Map<string, string>();
  for (const [clave, valor] of Object.entries(attrs ?? {})) {
    if (valor === undefined || valor === null) continue;
    mapa.set(clave, valor);
  }
  return { name, attrs: mapa, children: children ?? [] };
}

/** Busca los hijos directos con un nombre dado, en orden documental. */
export function hijos(padre: CfdiNode, name: string): CfdiNode[] {
  return padre.children.filter((c) => c.name === name);
}

/** Busca el primer hijo directo con un nombre dado, o `undefined`. */
export function hijo(padre: CfdiNode, name: string): CfdiNode | undefined {
  return padre.children.find((c) => c.name === name);
}

/**
 * Resuelve una ruta de varios segmentos como `cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado`
 * y devuelve todos los nodos que la satisfacen.
 */
export function porRuta(desde: CfdiNode, ruta: readonly string[]): CfdiNode[] {
  let actuales: CfdiNode[] = [desde];
  for (const segmento of ruta) {
    const siguiente: CfdiNode[] = [];
    for (const n of actuales) siguiente.push(...hijos(n, segmento));
    actuales = siguiente;
  }
  return actuales;
}

/** Equivalente del eje `.//nombre`: todos los descendientes, en orden documental. */
export function descendientes(desde: CfdiNode, name: string): CfdiNode[] {
  const out: CfdiNode[] = [];
  for (const c of desde.children) {
    if (c.name === name) out.push(c);
    out.push(...descendientes(c, name));
  }
  return out;
}

/**
 * Escapa un valor para que viva dentro de un atributo XML entre comillas dobles.
 *
 * ESTO NO APLICA A LA CADENA ORIGINAL. La cadena se firma con los caracteres
 * literales: si una razon social es `GRUPO A & B SA DE CV`, el XML lleva
 * `&amp;` pero la cadena lleva `&`. Firmar sobre el texto escapado produce un
 * sello que el SAT no puede validar — y es indiagnosticable, porque la cadena
 * que imprimes ya viene escapada. Ese fue el bug #1 del modulo C#.
 */
function escaparAtributoXml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface SerializarOpciones {
  /** Namespaces a declarar en la raiz. */
  namespaces?: Namespaces;
  /** `xsi:schemaLocation` de la raiz. */
  schemaLocation?: string;
}

/**
 * Serializa el arbol a XML. Sin declaracion de encoding con BOM y sin
 * indentacion: lo que se envia al PAC debe ser byte a byte lo que se sello.
 */
export function serializarXml(
  raiz: CfdiNode,
  opciones: SerializarOpciones = {},
): string {
  const declaracion = '<?xml version="1.0" encoding="UTF-8"?>';
  return declaracion + serializarNodo(raiz, opciones, true);
}

function serializarNodo(
  n: CfdiNode,
  opciones: SerializarOpciones,
  esRaiz: boolean,
): string {
  const partes: string[] = [];

  if (esRaiz) {
    for (const [prefijo, uri] of Object.entries(opciones.namespaces ?? {})) {
      partes.push(`xmlns:${prefijo}="${escaparAtributoXml(uri)}"`);
    }
    if (opciones.schemaLocation) {
      partes.push(
        `xsi:schemaLocation="${escaparAtributoXml(opciones.schemaLocation)}"`,
      );
    }
  }

  for (const [clave, valor] of n.attrs) {
    partes.push(`${clave}="${escaparAtributoXml(valor)}"`);
  }

  const atributos = partes.length ? ' ' + partes.join(' ') : '';
  if (!n.children.length) return `<${n.name}${atributos}/>`;

  const interior = n.children
    .map((c) => serializarNodo(c, opciones, false))
    .join('');
  return `<${n.name}${atributos}>${interior}</${n.name}>`;
}

/**
 * Devuelve el XML como `Buffer` en UTF-8 **sin BOM**.
 *
 * Con BOM el PAC rechaza el sello. Node no agrega BOM por su cuenta, pero
 * esta funcion existe para que el punto quede explicito en el codigo y nadie
 * lo reintroduzca despues con un `fs.writeFileSync(..., 'utf8')` descuidado.
 */
export function aUtf8SinBom(texto: string): Buffer {
  const buf = Buffer.from(texto, 'utf8');
  if (
    buf.length >= 3 &&
    buf[0] === 0xef &&
    buf[1] === 0xbb &&
    buf[2] === 0xbf
  ) {
    return buf.subarray(3);
  }
  return buf;
}
