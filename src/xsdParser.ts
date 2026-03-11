import * as xml2js from 'xml2js';
import * as fs from 'fs';
import {
  XsdComplexType,
  XsdField,
  XsdParseResult,
  XsdSimpleType,
} from './types';

/**
 * Strips the XML namespace prefix from a tag or type name.
 * e.g. "xs:string" → "string", "tns:MyType" → "MyType"
 */
function stripNamespace(value: string): string {
  const colonIdx = value.indexOf(':');
  return colonIdx >= 0 ? value.slice(colonIdx + 1) : value;
}

/**
 * Safely retrieves a string attribute from an xml2js element's `$` property.
 */
function attr(element: Record<string, unknown>, key: string): string {
  const dollar = element['$'];
  if (dollar && typeof dollar === 'object') {
    const val = (dollar as Record<string, unknown>)[key];
    if (typeof val === 'string') {
      return val;
    }
  }
  return '';
}

/**
 * Extracts documentation text nested inside xs:annotation/xs:documentation.
 */
function extractDocumentation(element: Record<string, unknown>): string | undefined {
  const annotation = element['xs:annotation'] ?? element['annotation'];
  if (!Array.isArray(annotation) || annotation.length === 0) return undefined;
  const docs =
    annotation[0]['xs:documentation'] ?? annotation[0]['documentation'];
  if (Array.isArray(docs) && docs.length > 0) {
    const doc = docs[0];
    return typeof doc === 'string' ? doc.trim() : undefined;
  }
  return undefined;
}

/**
 * Parses a list of xs:element or xs:attribute nodes into XsdField objects.
 */
function parseElements(
  nodes: Record<string, unknown>[],
  isAttribute = false
): XsdField[] {
  return nodes.map((node) => {
    const name = attr(node, 'name');
    const rawType = attr(node, 'type');
    const type = rawType ? stripNamespace(rawType) : 'string';
    const minOccursRaw = attr(node, 'minOccurs');
    const maxOccursRaw = attr(node, 'maxOccurs');
    const minOccurs = minOccursRaw !== '' ? parseInt(minOccursRaw, 10) : isAttribute ? 0 : 1;
    const maxOccurs: number | 'unbounded' =
      maxOccursRaw === 'unbounded'
        ? 'unbounded'
        : maxOccursRaw !== ''
        ? parseInt(maxOccursRaw, 10)
        : 1;
    const documentation = extractDocumentation(node);
    return { name, type, minOccurs, maxOccurs, isAttribute, documentation };
  });
}

/**
 * Collects all xs:element / xs:attribute children from a complex-type body
 * (xs:sequence, xs:all, xs:choice, xs:complexContent/xs:extension, etc.).
 */
function collectFields(typeBody: Record<string, unknown>): XsdField[] {
  const fields: XsdField[] = [];
  const ns = ['xs:', ''];

  for (const prefix of ns) {
    // xs:sequence, xs:all
    for (const container of ['sequence', 'all', 'choice']) {
      const seqKey = `${prefix}${container}`;
      const sequences = typeBody[seqKey];
      if (Array.isArray(sequences)) {
        for (const seq of sequences as Record<string, unknown>[]) {
          for (const elPrefix of ns) {
            const elems = seq[`${elPrefix}element`];
            if (Array.isArray(elems)) {
              fields.push(...parseElements(elems as Record<string, unknown>[], false));
            }
          }
        }
      }
    }

    // xs:attribute
    const attrs = typeBody[`${prefix}attribute`];
    if (Array.isArray(attrs)) {
      fields.push(...parseElements(attrs as Record<string, unknown>[], true));
    }

    // xs:complexContent / xs:simpleContent with xs:extension
    for (const content of ['complexContent', 'simpleContent']) {
      const contentKey = `${prefix}${content}`;
      const contentNodes = typeBody[contentKey];
      if (Array.isArray(contentNodes)) {
        for (const c of contentNodes as Record<string, unknown>[]) {
          for (const extPrefix of ns) {
            const extensions = c[`${extPrefix}extension`];
            if (Array.isArray(extensions)) {
              for (const ext of extensions as Record<string, unknown>[]) {
                fields.push(...collectFields(ext));
              }
            }
          }
        }
      }
    }
  }

  return fields;
}

/**
 * Parses an XSD file and returns a structured representation.
 */
export async function parseXsd(filePath: string): Promise<XsdParseResult> {
  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  const parsed = await xml2js.parseStringPromise(xmlContent, {
    explicitArray: true,
    mergeAttrs: false,
  });

  // The root key is either "xs:schema" or "xsd:schema"
  const schemaKey =
    Object.keys(parsed).find((k) => k.endsWith(':schema') || k === 'schema') ??
    Object.keys(parsed)[0];
  const schema = parsed[schemaKey] as Record<string, unknown>;

  const namespace: string | undefined = (() => {
    const dollar = schema['$'];
    if (dollar && typeof dollar === 'object') {
      return (
        (dollar as Record<string, string>)['targetNamespace'] ?? undefined
      );
    }
    return undefined;
  })();



  const complexTypesRaw: Record<string, unknown>[] = [];
  const simpleTypesRaw: Record<string, unknown>[] = [];
  const rootElementsRaw: Record<string, unknown>[] = [];

  // Collect all types/elements from the schema body
  for (const key of Object.keys(schema)) {
    const lcKey = key.replace(/^[^:]+:/, ''); // strip prefix
    if (lcKey === 'complexType') {
      const items = schema[key];
      if (Array.isArray(items)) complexTypesRaw.push(...(items as Record<string, unknown>[]));
    } else if (lcKey === 'simpleType') {
      const items = schema[key];
      if (Array.isArray(items)) simpleTypesRaw.push(...(items as Record<string, unknown>[]));
    } else if (lcKey === 'element') {
      const items = schema[key];
      if (Array.isArray(items)) rootElementsRaw.push(...(items as Record<string, unknown>[]));
    }
  }

  // Parse complex types
  const complexTypes: XsdComplexType[] = complexTypesRaw.map((ct) => {
    const name = attr(ct, 'name');
    const documentation = extractDocumentation(ct);
    const fields = collectFields(ct);
    return { name, fields, documentation };
  });

  // Parse simple types (enumerations)
  const simpleTypes: XsdSimpleType[] = simpleTypesRaw.map((st) => {
    const name = attr(st, 'name');
    const documentation = extractDocumentation(st);

    let baseType = 'string';
    const enumValues: string[] = [];

    for (const prefix of ['xs:', '']) {
      const restrictionKey = `${prefix}restriction`;
      const restrictions = st[restrictionKey];
      if (Array.isArray(restrictions)) {
        for (const restriction of restrictions as Record<string, unknown>[]) {
          const base = attr(restriction, 'base');
          if (base) baseType = stripNamespace(base);

          for (const enumPrefix of ['xs:', '']) {
            const enumerations = restriction[`${enumPrefix}enumeration`];
            if (Array.isArray(enumerations)) {
              for (const e of enumerations as Record<string, unknown>[]) {
                const val = attr(e, 'value');
                if (val) enumValues.push(val);
              }
            }
          }
        }
      }
    }

    return {
      name,
      baseType,
      enumValues: enumValues.length > 0 ? enumValues : undefined,
      documentation,
    };
  });

  // Parse root elements (top-level xs:element nodes)
  const rootElements: XsdField[] = parseElements(rootElementsRaw, false);

  // Also handle inline complexType definitions on root elements
  for (const elem of rootElementsRaw) {
    const elemName = attr(elem, 'name');
    for (const ctPrefix of ['xs:', '']) {
      const inlineTypes = elem[`${ctPrefix}complexType`];
      if (Array.isArray(inlineTypes)) {
        for (const inlineCt of inlineTypes as Record<string, unknown>[]) {
          const fields = collectFields(inlineCt);
          if (fields.length > 0) {
            complexTypes.push({ name: elemName, fields, documentation: extractDocumentation(inlineCt) });
          }
        }
      }
    }
  }

  return { namespace, complexTypes, simpleTypes, rootElements };
}
