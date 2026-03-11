import {
  AvroPrimitive,
  AvroRecord,
  AvroSchema,
  AvroField,
  AvroEnum,
  XsdParseResult,
  XsdField,
  XsdComplexType,
  XsdSimpleType,
} from './types';

/**
 * Maps an XSD built-in type name to an Avro primitive type.
 */
function mapXsdTypeToAvro(xsdType: string): AvroPrimitive {
  const typeMap: Record<string, AvroPrimitive> = {
    // String-like
    string: 'string',
    normalizedString: 'string',
    token: 'string',
    language: 'string',
    Name: 'string',
    NCName: 'string',
    NMTOKEN: 'string',
    ID: 'string',
    IDREF: 'string',
    anyURI: 'string',
    QName: 'string',
    NOTATION: 'string',
    duration: 'string',
    // Date/time → string (ISO-8601)
    date: 'string',
    time: 'string',
    dateTime: 'string',
    gYear: 'string',
    gYearMonth: 'string',
    gMonth: 'string',
    gMonthDay: 'string',
    gDay: 'string',
    // Numeric
    decimal: 'string', // arbitrary precision; use string to avoid precision loss
    integer: 'long',
    nonNegativeInteger: 'long',
    nonPositiveInteger: 'long',
    positiveInteger: 'long',
    negativeInteger: 'long',
    long: 'long',
    unsignedLong: 'long',
    int: 'int',
    unsignedInt: 'long',
    short: 'int',
    unsignedShort: 'int',
    byte: 'int',
    unsignedByte: 'int',
    float: 'float',
    double: 'double',
    // Boolean
    boolean: 'boolean',
    // Binary
    base64Binary: 'bytes',
    hexBinary: 'bytes',
    // Fallback
    anyType: 'string',
    anySimpleType: 'string',
  };

  return typeMap[xsdType] ?? 'string';
}

/**
 * Generates an Avro schema from a parsed XSD result.
 *
 * The function returns an array of top-level Avro schemas (one per
 * complexType / simpleType / root element found in the XSD).
 */
export function generateAvscSchemas(
  parseResult: XsdParseResult,
  schemaName: string
): AvroSchema[] {
  const { namespace, complexTypes, simpleTypes, rootElements } = parseResult;

  // Registry of known type names → Avro schemas (to avoid duplicate definitions)
  const knownTypes = new Set<string>();

  const schemas: AvroSchema[] = [];

  // Helper: build an AvroField for a single XsdField
  const buildAvroField = (field: XsdField): AvroField => {
    const isArray = field.maxOccurs === 'unbounded' || field.maxOccurs > 1;
    const isOptional = field.minOccurs === 0;

    let baseType: AvroSchema;

    // Check if the field type refers to a known complex/simple type
    const referencedComplex = complexTypes.find((ct) => ct.name === field.type);
    const referencedSimple = simpleTypes.find((st) => st.name === field.type);

    if (referencedComplex) {
      if (knownTypes.has(field.type)) {
        // Reference by name to avoid re-defining
        baseType = field.type as AvroPrimitive;
      } else {
        baseType = buildRecord(referencedComplex);
      }
    } else if (referencedSimple) {
      if (knownTypes.has(field.type)) {
        baseType = field.type as AvroPrimitive;
      } else {
        baseType = buildSimpleTypeSchema(referencedSimple);
      }
    } else {
      baseType = mapXsdTypeToAvro(field.type);
    }

    let avroType: AvroSchema = isArray
      ? { type: 'array', items: baseType, default: [] }
      : baseType;

    if (isOptional) {
      // Make nullable: ["null", <type>]
      avroType = ['null', avroType];
    }

    const avroField: AvroField = { name: sanitizeName(field.name), type: avroType };
    if (field.documentation) {
      avroField.doc = field.documentation;
    }
    if (isOptional) {
      avroField.default = null;
    }

    return avroField;
  };

  // Helper: build an AvroRecord from a complexType
  const buildRecord = (ct: XsdComplexType): AvroRecord => {
    knownTypes.add(ct.name);
    const record: AvroRecord = {
      type: 'record',
      name: sanitizeName(ct.name),
      fields: ct.fields.map(buildAvroField),
    };
    if (namespace) record.namespace = namespace;
    if (ct.documentation) record.doc = ct.documentation;
    return record;
  };

  // Helper: build an AvroEnum or primitive for a simpleType
  const buildSimpleTypeSchema = (
    st: XsdSimpleType
  ): AvroEnum | AvroPrimitive => {
    if (st.enumValues && st.enumValues.length > 0) {
      knownTypes.add(st.name);
      const avroEnum: AvroEnum = {
        type: 'enum',
        name: sanitizeName(st.name),
        symbols: st.enumValues.map(sanitizeName),
      };
      if (namespace) avroEnum.namespace = namespace;
      if (st.documentation) avroEnum.doc = st.documentation;
      return avroEnum;
    }
    return mapXsdTypeToAvro(st.baseType);
  };

  // 1. Emit all simple types
  for (const st of simpleTypes) {
    if (!knownTypes.has(st.name)) {
      const schema = buildSimpleTypeSchema(st);
      if (typeof schema === 'object') {
        schemas.push(schema);
      }
    }
  }

  // 2. Emit all complex types
  for (const ct of complexTypes) {
    if (!knownTypes.has(ct.name)) {
      schemas.push(buildRecord(ct));
    }
  }

  // 3. If there are root elements that reference known types, they are already
  //    emitted. If a root element has no corresponding complex type, create a
  //    simple wrapper record.
  if (schemas.length === 0 && rootElements.length > 0) {
    // Fallback: wrap root elements in a single record named after the schema file
    const record: AvroRecord = {
      type: 'record',
      name: sanitizeName(schemaName),
      fields: rootElements.map(buildAvroField),
    };
    if (namespace) record.namespace = namespace;
    schemas.push(record);
  }

  return schemas;
}

/**
 * Sanitizes a name so it is a valid Avro identifier.
 * Avro names must match: [A-Za-z_][A-Za-z0-9_]*
 */
function sanitizeName(name: string): string {
  // Replace any character that is not alphanumeric or underscore with '_'
  let sanitized = name.replace(/[^A-Za-z0-9_]/g, '_');
  // Ensure it doesn't start with a digit
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  return sanitized;
}
