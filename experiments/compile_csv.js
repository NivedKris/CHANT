import fs from 'fs';
import path from 'path';

console.log("Compiling experimental database results into results.csv...");

const resultsFile = './results.json';
const csvFile = './results.csv';

if (!fs.existsSync(resultsFile)) {
  console.error(`Error: ${resultsFile} does not exist! Please run run_experiments.js first.`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

// Helper to escape text fields for CSV format
function escapeCSV(val) {
  if (val === undefined || val === null) {
    return '""';
  }
  let str = String(val);
  // Replace double quotes with double-double quotes
  str = str.replace(/"/g, '""');
  // Wrap in double quotes if there are commas, double quotes, or newlines
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str}"`;
  }
  return `"${str}"`;
}

// Define the header row
const headers = [
  "Verse ID",
  "Meter",
  "Sanskrit Text",
  "Condition Name",
  "File Name",
  "File Size (KB)",
  "Measured Duration (s)",
  "Generation Status",
  "Gemini Prompt Sent",
  "VERIFICATION: Meter Rhythm (1-5)",
  "VERIFICATION: Voice Naturalness (1-5)",
  "VERIFICATION: Visarga Echo Pronounced (Y/N)",
  "VERIFICATION: Pauses Inside Compounds (Y/N)",
  "VERIFICATION: Listener Notes"
];

const csvRows = [headers.join(',')];

for (const r of results) {
  const sizeKB = r.file_size_bytes ? (r.file_size_bytes / 1024).toFixed(2) : "N/A";
  const durationSec = r.measured_duration_seconds ? r.measured_duration_seconds.toFixed(2) : "N/A";
  
  const row = [
    escapeCSV(r.verse_id),
    escapeCSV(r.meter),
    escapeCSV(r.text),
    escapeCSV(r.condition),
    escapeCSV(r.file_name),
    escapeCSV(sizeKB),
    escapeCSV(durationSec),
    escapeCSV(r.status),
    escapeCSV(r.prompt_sent),
    "", // Empty columns left for verification scoring and listener evaluation
    "", 
    "", 
    "", 
    ""  
  ];
  
  csvRows.push(row.join(','));
}

fs.writeFileSync(csvFile, csvRows.join('\n'), 'utf8');

console.log(`\n🎉 Successfully connected all audio files and compiled database to: ${path.resolve(csvFile)}`);
console.log(`Total records written: ${results.length}`);
console.log(`Verification rows successfully injected for manual evaluation.`);
