/**
 * Lectura minima de respuestas SOAP, sin dependencias externas.
 *
 * Por que no se usa un parser XML completo
 * ---------------------------------------
 * De la respuesta del PAC solo se necesitan valores de texto de nodos hoja,
 * localizados POR NOMBRE LOCAL. El cliente C# original hace exactamente eso y
 * documenta el motivo: Quadrum ha cambiado los namespaces entre versiones, y
 * buscar por nombre local evita que un despliegue suyo rompa el cliente.
 *
 * Lo que este modulo NO hace, a proposito: validar el documento, resolver
 * namespaces, o reconstruir el arbol. Si algun dia hace falta eso, se cambia
 * por un parser de verdad.
 */

/** Quita comentarios e instrucciones de proceso para que no confundan la busqueda. */
function limpiar(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
}

/** Decodifica las entidades XML que el PAC puede devolver dentro de un nodo texto. */
export function decodificarEntidades(texto: string): string {
  return (
    texto
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) =>
        String.fromCodePoint(parseInt(h, 16)),
      )
      // El &amp; va al final: si fuera primero, un `&amp;lt;` se convertiria
      // en `<` en dos pasos, cambiando el contenido.
      .replace(/&amp;/g, '&')
  );
}

/** Extrae el contenido de un CDATA, o devuelve el texto decodificado. */
function contenidoTexto(bruto: string): string {
  const cdata = bruto.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) return cdata[1];
  return decodificarEntidades(bruto);
}

/**
 * Construye el regex que encuentra un elemento por nombre local, con o sin
 * prefijo de namespace. Acepta tanto `<uuid>` como `<tim:uuid>`.
 */
function regexElemento(nombreLocal: string): RegExp {
  const n = nombreLocal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `<(?:[\\w.-]+:)?${n}(?:\\s[^>]*?)?(?:\\/>|>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${n}\\s*>)`,
    'i',
  );
}

/** Primer valor de texto de un elemento con ese nombre local, o `undefined`. */
export function valor(xml: string, nombreLocal: string): string | undefined {
  const m = limpiar(xml).match(regexElemento(nombreLocal));
  if (!m) return undefined;
  if (m[1] === undefined) return ''; // Elemento vacio <x/>
  return contenidoTexto(m[1]).trim();
}

/** Todos los fragmentos XML crudos de los elementos con ese nombre local. */
export function elementos(xml: string, nombreLocal: string): string[] {
  const n = nombreLocal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `<(?:[\\w.-]+:)?${n}(?:\\s[^>]*?)?(?:\\/>|>[\\s\\S]*?<\\/(?:[\\w.-]+:)?${n}\\s*>)`,
    'gi',
  );
  return limpiar(xml).match(re) ?? [];
}

/** `true` si el documento contiene un elemento con ese nombre local. */
export function existe(xml: string, nombreLocal: string): boolean {
  return regexElemento(nombreLocal).test(limpiar(xml));
}

/**
 * El XML timbrado que devuelve el PAC puede venir como texto (escapado o en
 * CDATA, ya resuelto por `valor()`) o codificado en base64. Devuelve el XML.
 */
export function decodificarXmlEmbebido(contenido: string): string {
  const t = contenido.trim();
  if (t.startsWith('<')) return t;
  const decodificado = Buffer.from(t, 'base64').toString('utf8');
  return decodificado
    .replace(/^\uFEFF/, '')
    .trimStart()
    .startsWith('<')
    ? decodificado.replace(/^\uFEFF/, '')
    : t;
}

/** Escapa un valor para insertarlo como texto dentro de un elemento XML. */
export function escaparTexto(valorTexto: string): string {
  return valorTexto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
