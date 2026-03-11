# XSD to AVSC Schema Converter

A TypeScript command-line tool that converts XML Schema Definition (`.xsd`) files to Apache Avro Schema (`.avsc`) files.

## Features

- Converts XSD complex types to Avro **record** schemas
- Converts XSD enumeration simple types to Avro **enum** schemas
- Maps XSD built-in types (string, int, long, double, boolean, date, etc.) to the appropriate Avro primitive types
- Optional fields (`minOccurs="0"`) become nullable unions (`["null", <type>]`) with `default: null`
- Repeated elements (`maxOccurs="unbounded"` or `> 1`) become Avro **array** types
- Preserves `xs:documentation` as Avro `doc` fields
- Propagates `targetNamespace` to all generated schemas
- Generates one `.avsc` file per type **plus** a combined schema array file

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- npm v9+

## Installation

```bash
npm install
```

## Usage

1. Place your `.xsd` files in the **`input/`** directory.
2. Run the converter:

```bash
# Using ts-node directly (development)
npm run convert

# Or build first, then run
npm run build
npm start
```

3. The generated `.avsc` files will be written to the **`output/`** directory.

### Example

Given `input/sample.xsd` containing a `Customer` complex type and a `StatusType` enum, the converter produces:

- `output/StatusType.avsc` – Avro enum schema
- `output/Address.avsc` – Avro record schema
- `output/Customer.avsc` – Avro record schema
- `output/Order.avsc` – Avro record schema
- `output/sample.avsc` – Combined array of all schemas (suitable for schema registries)

## XSD → Avro Type Mapping

| XSD type | Avro type |
|---|---|
| `xs:string`, `xs:token`, `xs:anyURI` | `"string"` |
| `xs:int`, `xs:short`, `xs:byte` | `"int"` |
| `xs:long`, `xs:integer`, `xs:unsignedInt` | `"long"` |
| `xs:float` | `"float"` |
| `xs:double` | `"double"` |
| `xs:boolean` | `"boolean"` |
| `xs:base64Binary`, `xs:hexBinary` | `"bytes"` |
| `xs:date`, `xs:dateTime`, `xs:time` | `"string"` (ISO-8601) |
| `xs:decimal` | `"string"` (to preserve precision) |
| Complex type reference | Avro `record` (inline or by name) |
| Enumeration simple type | Avro `enum` |
| `minOccurs="0"` | `["null", <type>]` union with `default: null` |
| `maxOccurs="unbounded"` | `{ "type": "array", "items": <type> }` |

## Project Structure

```
.
├── src/
│   ├── index.ts          # Entry point – reads input/, writes output/
│   ├── converter.ts      # Orchestrates parse + generate for a single file
│   ├── xsdParser.ts      # Parses XSD XML into an intermediate representation
│   ├── avscGenerator.ts  # Converts intermediate representation to Avro schemas
│   └── types.ts          # Shared TypeScript interfaces
├── input/                # Drop your .xsd files here
├── output/               # Generated .avsc files appear here
├── tsconfig.json
└── package.json
```

## Scripts

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled converter |
| `npm run convert` | Run converter directly via ts-node (no build step) |
| `npm run dev` | Same as convert (alias) |