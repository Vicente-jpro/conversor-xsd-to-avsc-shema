import * as fs from 'fs';
import * as path from 'path';
import { convertXsdToAvsc } from './converter';

const INPUT_DIR = path.resolve(__dirname, '..', 'input');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

async function main(): Promise<void> {
  console.log('=== XSD to AVSC Converter ===\n');
  console.log(`Input directory:  ${INPUT_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}\n`);

  // Ensure the input directory exists
  if (!fs.existsSync(INPUT_DIR)) {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
  }

  // Find all .xsd files in the input directory
  const xsdFiles = fs
    .readdirSync(INPUT_DIR)
    .filter((file) => file.toLowerCase().endsWith('.xsd'))
    .map((file) => path.join(INPUT_DIR, file));

  if (xsdFiles.length === 0) {
    console.log('No .xsd files found in the input directory.');
    console.log(`Please place your .xsd files in: ${INPUT_DIR}`);
    return;
  }

  console.log(`Found ${xsdFiles.length} XSD file(s):\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const xsdFile of xsdFiles) {
    console.log(`Processing: ${path.basename(xsdFile)}`);
    try {
      await convertXsdToAvsc(xsdFile, OUTPUT_DIR);
      successCount++;
    } catch (error) {
      console.error(
        `  Error converting ${path.basename(xsdFile)}:`,
        error instanceof Error ? error.message : String(error)
      );
      errorCount++;
    }
    console.log();
  }

  console.log('=== Conversion Summary ===');
  console.log(`  Successful: ${successCount}`);
  if (errorCount > 0) {
    console.log(`  Failed:     ${errorCount}`);
  }
  console.log(`\nOutput files written to: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
