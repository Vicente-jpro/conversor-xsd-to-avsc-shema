import * as fs from 'fs';
import * as path from 'path';
import { parseXsd } from './xsdParser';
import { generateAvscSchemas } from './avscGenerator';
import { AvroSchema } from './types';

/**
 * Converts a single XSD file to one or more AVSC schemas.
 *
 * @param inputPath  Absolute/relative path to the .xsd file
 * @param outputDir  Directory where the .avsc file(s) will be written
 * @returns          Array of output file paths created
 */
export async function convertXsdToAvsc(
  inputPath: string,
  outputDir: string
): Promise<string[]> {
  const baseName = path.basename(inputPath, '.xsd');

  console.log(`  Parsing: ${inputPath}`);
  const parseResult = await parseXsd(inputPath);

  const schemas: AvroSchema[] = generateAvscSchemas(parseResult, baseName);

  if (schemas.length === 0) {
    console.warn(`  Warning: No schemas generated for ${inputPath}`);
    return [];
  }

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const outputPaths: string[] = [];

  if (schemas.length === 1) {
    // Single schema → single file named after the XSD
    const outputPath = path.join(outputDir, `${baseName}.avsc`);
    fs.writeFileSync(outputPath, JSON.stringify(schemas[0], null, 2), 'utf-8');
    outputPaths.push(outputPath);
    console.log(`  Created: ${outputPath}`);
  } else {
    // Multiple schemas → one file per schema, plus a combined file
    for (const schema of schemas) {
      if (typeof schema === 'object' && !Array.isArray(schema)) {
        const schemaName = (schema as { name?: string }).name ?? baseName;
        const outputPath = path.join(outputDir, `${schemaName}.avsc`);
        fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2), 'utf-8');
        outputPaths.push(outputPath);
        console.log(`  Created: ${outputPath}`);
      }
    }

    // Also write a combined array file
    const combinedPath = path.join(outputDir, `${baseName}.avsc`);
    fs.writeFileSync(combinedPath, JSON.stringify(schemas, null, 2), 'utf-8');
    outputPaths.push(combinedPath);
    console.log(`  Created (combined): ${combinedPath}`);
  }

  return outputPaths;
}
