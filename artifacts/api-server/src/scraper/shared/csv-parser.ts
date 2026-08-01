/**
 * Lightweight CSV parser that handles quoted fields, escaped quotes, and
 * configurable delimiter. Replaces the three duplicated parsers in the old
 * GEM, AidData, and DFC adapters.
 */

export interface CsvOptions {
  delimiter?: string;
  /** If true, header row is preserved as-is. Default lowercases + snake-cases. */
  rawHeaders?: boolean;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function parseRow(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseCSV(text: string, options: CsvOptions = {}): Record<string, string>[] {
  const delimiter = options.delimiter ?? ",";
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = parseRow(lines[0], delimiter);
  const headers = options.rawHeaders ? rawHeaders : rawHeaders.map(normalizeHeader);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i], delimiter);
    if (values.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      if (j < values.length) row[h] = values[j];
    });
    rows.push(row);
  }
  return rows;
}
