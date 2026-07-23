function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    const match = part.match(/^\*\*(.+)\*\*$/);
    return match
      ? <strong key={`${keyPrefix}-${i}`} className="font-semibold text-gray-900">{match[1]}</strong>
      : <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export default function LegalMarkdown({ content }: { content: string }) {
  const blocks = content.trim().split(/\n\s*\n/);

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={i} className="text-base font-bold text-gray-900 pt-4 first:pt-0">
              {trimmed.slice(3)}
            </h2>
          );
        }
        return (
          <p key={i} className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {renderInline(trimmed, String(i))}
          </p>
        );
      })}
    </div>
  );
}
