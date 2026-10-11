#!/usr/bin/env node
/**
 * Extrae la especificacion de la CADENA ORIGINAL de CFDI 4.0 directamente del
 * XSLT oficial del SAT (`cadenaoriginal_4_0.xslt`).
 *
 * Por que existe este script
 * --------------------------
 * La cadena original es la entrada del sello. Si un solo atributo va fuera de
 * orden, el sello es invalido y el PAC solo responde "sello invalido", sin
 * decir por que. Transcribir 74 atributos a mano desde el XSLT es exactamente
 * el tipo de tarea donde un error es invisible hasta produccion.
 *
 * En vez de eso, el orden se DERIVA del archivo oficial. Si el SAT publica una
 * version nueva del XSLT, se vuelve a correr esto y se compara la salida.
 *
 * Uso:
 *   node scripts/extract-cadena-spec.mjs <ruta-al-xslt>            # legible
 *   node scripts/extract-cadena-spec.mjs <ruta-al-xslt> --json     # para diff
 *
 * Nota: el XSLT del SAT declara version="2.0". No se usa ningun motor XSLT;
 * este script solo lee la estructura para generar la especificacion.
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta) {
  console.error('uso: node scripts/extract-cadena-spec.mjs <ruta-al-xslt> [--json]');
  process.exit(2);
}

const src = readFileSync(ruta, 'utf8');

/** Recorta el cuerpo de cada <xsl:template match="..."> */
function leerTemplates(texto) {
  const out = [];
  const re = /<xsl:template\s+match="([^"]+)"\s*>([\s\S]*?)<\/xsl:template>/g;
  let m;
  while ((m = re.exec(texto))) out.push({ match: m[1], body: m[2] });
  return out;
}

/**
 * Recorre un cuerpo en orden documental, respetando el anidamiento de
 * <xsl:for-each>. Devuelve una lista de pasos:
 *   { tipo: 'attr', modo: 'R'|'o', attr }
 *   { tipo: 'nodo', nodo }                 -> apply-templates
 *   { tipo: 'lista', nodo, pasos: [...] }  -> for-each con su contenido
 */
function analizar(body) {
  const pasos = [];
  let i = 0;

  // Rutas que aparecen en el XSLT del SAT: un segmento (./cfdi:Emisor), varios
  // (./cfdi:Impuestos/cfdi:Traslados/cfdi:Traslado), eje descendiente (.//cfdi:Parte)
  // y comodin (./*) para los complementos.
  const RUTA = '\\.(\\/\\/?)([A-Za-z0-9]+:[A-Za-z0-9]+(?:\\/[A-Za-z0-9]+:[A-Za-z0-9]+)*|\\*)';

  // `\p{L}` es indispensable: el atributo `Año` de cfdi:InformacionGlobal tiene
  // una `n` con virgulilla, y un `[A-Za-z0-9]` lo salta en silencio — dejando
  // un atributo fuera de la cadena original y, por lo tanto, el sello invalido.
  const reAttr =
    /^<xsl:call-template\s+name="(Requerido|Opcional)"\s*>\s*<xsl:with-param\s+name="valor"\s+select="\.\/@([\p{L}\p{N}_]+)"[^>]*\/>\s*<\/xsl:call-template>/u;
  const reNodo = new RegExp(`^<xsl:apply-templates\\s+select="${RUTA}"[^>]*\\/>`);
  const reForOpen = new RegExp(`^<xsl:for-each\\s+select="${RUTA}"\\s*>`);

  while (i < body.length) {
    if (body[i] !== '<') {
      i++;
      continue;
    }
    const resto = body.slice(i);

    let m = resto.match(reAttr);
    if (m) {
      pasos.push({ tipo: 'attr', modo: m[1] === 'Requerido' ? 'R' : 'o', attr: m[2] });
      i += m[0].length;
      continue;
    }

    m = resto.match(reNodo);
    if (m) {
      pasos.push({ tipo: 'nodo', nodo: m[2], axis: m[1] });
      i += m[0].length;
      continue;
    }

    m = resto.match(reForOpen);
    if (m) {
      // Buscar el </xsl:for-each> que corresponde, contando anidados.
      const inicio = i + m[0].length;
      let j = inicio;
      let nivel = 1;
      while (j < body.length && nivel > 0) {
        const abre = body.indexOf('<xsl:for-each', j);
        const cierra = body.indexOf('</xsl:for-each>', j);
        if (cierra === -1) break;
        if (abre !== -1 && abre < cierra) {
          nivel++;
          j = abre + 13;
        } else {
          nivel--;
          j = cierra + 15;
        }
      }
      const interior = body.slice(inicio, j - 15);
      pasos.push({ tipo: 'lista', nodo: m[2], axis: m[1], pasos: analizar(interior) });
      i = j;
      continue;
    }

    i++;
  }
  return pasos;
}

const spec = {};
for (const t of leerTemplates(src)) spec[t.match] = analizar(t.body);

// --- Salida -----------------------------------------------------------------
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(spec, null, 2));
  process.exit(0);
}

let totalAttrs = 0;
function imprimir(pasos, sangria) {
  for (const p of pasos) {
    const pad = '  '.repeat(sangria);
    if (p.tipo === 'attr') {
      totalAttrs++;
      console.log(`${pad}  ${p.modo}  @${p.attr}`);
    } else if (p.tipo === 'nodo') {
      console.log(`${pad}  -> ${p.axis === '//' ? '(descendientes) ' : ''}${p.nodo}`);
    } else {
      console.log(`${pad}  for-each ${p.axis === '//' ? '(descendientes) ' : ''}${p.nodo}`);
      imprimir(p.pasos, sangria + 1);
    }
  }
}

console.log(`Cadena original CFDI 4.0 — derivado de: ${ruta}\n`);
console.log('Formato:  | + atributos separados por | + ||');
console.log('R = Requerido (siempre emite)   o = Opcional (solo si el atributo existe)');
console.log('Transformacion: normalize-space. SIN escapado de entidades XML.\n');

for (const [nombre, pasos] of Object.entries(spec)) {
  if (!pasos.length) continue;
  console.log(`\n${nombre}`);
  imprimir(pasos, 0);
}
console.log(`\n--- ${Object.keys(spec).length} templates, ${totalAttrs} atributos ---`);
