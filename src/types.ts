/**
 * Internal representation of an XSD element/field
 */
export interface XsdField {
  name: string;
  type: string;
  minOccurs: number;
  maxOccurs: number | 'unbounded';
  isAttribute: boolean;
  documentation?: string;
}

/**
 * Internal representation of an XSD complex type
 */
export interface XsdComplexType {
  name: string;
  fields: XsdField[];
  documentation?: string;
}

/**
 * Internal representation of an XSD simple type (enumeration)
 */
export interface XsdSimpleType {
  name: string;
  baseType: string;
  enumValues?: string[];
  documentation?: string;
}

/**
 * Result of parsing an XSD file
 */
export interface XsdParseResult {
  namespace?: string;
  complexTypes: XsdComplexType[];
  simpleTypes: XsdSimpleType[];
  rootElements: XsdField[];
}

// ---------------------------------------------------------------------------
// Avro schema types
// ---------------------------------------------------------------------------

export type AvroPrimitive =
  | 'null'
  | 'boolean'
  | 'int'
  | 'long'
  | 'float'
  | 'double'
  | 'bytes'
  | 'string';

export interface AvroRecord {
  type: 'record';
  name: string;
  namespace?: string;
  doc?: string;
  fields: AvroField[];
}

export interface AvroEnum {
  type: 'enum';
  name: string;
  namespace?: string;
  doc?: string;
  symbols: string[];
}

export interface AvroArray {
  type: 'array';
  items: AvroSchema;
  default?: unknown[];
}

export type AvroUnion = AvroSchema[];

export type AvroSchema =
  | AvroPrimitive
  | AvroRecord
  | AvroEnum
  | AvroArray
  | AvroUnion;

export interface AvroField {
  name: string;
  type: AvroSchema;
  doc?: string;
  default?: unknown;
}
