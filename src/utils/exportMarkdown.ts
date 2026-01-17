import type { BragDoc } from '../types';

export function exportBragDocToMarkdown(doc: BragDoc): string {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const lines: string[] = [];

  // Header
  lines.push(`# ${doc.title}`);
  lines.push('');
  lines.push(`**Period:** ${formatDate(doc.start_date)} - ${formatDate(doc.end_date)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Sort entries by date ascending for the export
  const sortedEntries = [...doc.entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  if (sortedEntries.length === 0) {
    lines.push('*No accomplishments recorded yet.*');
  } else {
    lines.push('## Accomplishments');
    lines.push('');

    for (const entry of sortedEntries) {
      lines.push(`### ${entry.title}`);
      lines.push('');
      lines.push(`*${formatDate(entry.date)}*`);
      lines.push('');

      if (entry.description) {
        lines.push(entry.description);
        lines.push('');
      }

      if (entry.links.length > 0) {
        lines.push('**Links:**');
        for (const link of entry.links) {
          lines.push(`- ${link}`);
        }
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }
  }

  // Footer
  lines.push('');
  lines.push(`*Exported from Atulify on ${new Date().toLocaleDateString()}*`);

  return lines.join('\n');
}
