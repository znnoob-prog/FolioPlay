import type { DocumentSection, GoogleDocSummary, LoadedDocument } from '../types/game';

declare global {
  interface Window {
    gapi?: {
      load: (api: string, callback: () => void) => void;
    };
    google?: {
      picker?: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown;
          setOAuthToken: (token: string) => unknown;
          setCallback: (cb: (data: GooglePickerResult) => void) => unknown;
          setOrigin: (origin: string) => unknown;
          build: () => { setVisible: (visible: boolean) => void };
        };
        DocsView: new (viewId?: unknown) => {
          setMimeTypes: (mimeTypes: string) => unknown;
        };
        ViewId: {
          DOCS: unknown;
        };
        Action: {
          PICKED: string;
        };
      };
    };
  }
}

interface GooglePickerResult {
  action: string;
  docs?: Array<{ id: string; name: string }>;
}

export function extractDocIdFromInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch?.[1]) return urlMatch[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export async function listGoogleDocs(
  accessToken: string,
  searchQuery = ''
): Promise<GoogleDocSummary[]> {
  const cleanSearch = searchQuery.replace(/['\\]/g, '').trim();
  const baseQuery = "mimeType='application/vnd.google-apps.document' and trashed=false";
  const q = cleanSearch ? `${baseQuery} and name contains '${cleanSearch}'` : baseQuery;

  const params = new URLSearchParams({
    q,
    pageSize: '24',
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,modifiedTime,webViewLink)',
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Drive API error (${res.status})`;
    throw new Error(msg);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

interface DocsParagraphElement {
  textRun?: { content?: string };
}

interface DocsStructuralElement {
  paragraph?: {
    paragraphStyle?: { namedStyleType?: string };
    elements?: DocsParagraphElement[];
  };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{
        content?: DocsStructuralElement[];
      }>;
    }>;
  };
}

function extractTextFromStructuralElements(
  elements: DocsStructuralElement[],
  sections: DocumentSection[]
): string {
  const lines: string[] = [];
  let currentHeading = 'Introduction';
  let currentBuffer: string[] = [];

  const flushSection = () => {
    const joined = currentBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (joined) {
      sections.push({
        heading: currentHeading,
        excerpt: joined.slice(0, 220),
      });
    }
    currentBuffer = [];
  };

  for (const el of elements) {
    if (el.paragraph?.elements) {
      const style = el.paragraph.paragraphStyle?.namedStyleType || '';
      const text = el.paragraph.elements
        .map((pe) => pe.textRun?.content || '')
        .join('')
        .replace(/\n+$/g, '')
        .trim();

      if (text) {
        if (style.startsWith('HEADING_')) {
          flushSection();
          currentHeading = text.slice(0, 80);
        } else {
          currentBuffer.push(text);
        }
        lines.push(text);
      }
    } else if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        const rowCells: string[] = [];
        for (const cell of row.tableCells || []) {
          const cellText = extractTextFromStructuralElements(cell.content || [], []);
          if (cellText) rowCells.push(cellText.replace(/\n+/g, ' '));
        }
        if (rowCells.length > 0) {
          const rowLine = rowCells.join(' | ');
          lines.push(rowLine);
          currentBuffer.push(rowLine);
        }
      }
    }
  }

  flushSection();
  return lines.join('\n\n');
}

export async function fetchGoogleDocContent(
  accessToken: string,
  documentId: string
): Promise<LoadedDocument> {
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = errBody?.error?.message || `Google Docs API error (${res.status})`;
    throw new Error(msg);
  }

  const doc = await res.json();
  const sections: DocumentSection[] = [];
  const bodyElements: DocsStructuralElement[] = doc?.body?.content || [];
  const content = extractTextFromStructuralElements(bodyElements, sections);
  const words = content.split(/\s+/).filter(Boolean).length;

  return {
    id: doc.documentId || documentId,
    title: doc.title || 'Untitled Google Doc',
    content,
    source: 'google-docs',
    wordCount: words,
    sections: sections.slice(0, 8),
  };
}

export async function uploadTextAsGoogleDoc(
  accessToken: string,
  title: string,
  content: string
): Promise<GoogleDocSummary> {
  const boundary = 'folioplay_multipart_boundary_' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({
    name: title,
    mimeType: 'application/vnd.google-apps.document',
  });

  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Failed to create Google Doc (${res.status})`);
  }

  return res.json();
}

export function parseLocalDocument(title: string, rawContent: string): LoadedDocument {
  const cleanContent = rawContent.trim();
  const lines = cleanContent.split(/\r?\n/);
  const sections: DocumentSection[] = [];
  let currentHeading = 'Document Overview';
  let buffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const mdMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (mdMatch?.[1]) {
      if (buffer.length > 0) {
        sections.push({
          heading: currentHeading,
          excerpt: buffer.join(' ').slice(0, 220),
        });
        buffer = [];
      }
      currentHeading = mdMatch[1].slice(0, 80);
    } else {
      buffer.push(trimmed);
    }
  }

  if (buffer.length > 0) {
    sections.push({
      heading: currentHeading,
      excerpt: buffer.join(' ').slice(0, 220),
    });
  }

  return {
    id: 'local-' + Date.now(),
    title: title.replace(/\.(txt|md|markdown)$/i, '') || 'Uploaded Document',
    content: cleanContent,
    source: 'uploaded-file',
    wordCount: cleanContent.split(/\s+/).filter(Boolean).length,
    sections: sections.slice(0, 8),
  };
}

export function openGoogleDocPicker(
  accessToken: string,
  onPicked: (doc: { id: string; name: string }) => void,
  onError: (message: string) => void
): void {
  if (!window.gapi) {
    onError('Google Picker script is still loading. Try again in a moment.');
    return;
  }

  window.gapi.load('picker', () => {
    const pickerApi = window.google?.picker;
    if (!pickerApi) {
      onError('Google Picker could not initialize in this browser session.');
      return;
    }

    const pickerOrigin =
      window.location.ancestorOrigins && window.location.ancestorOrigins.length > 0
        ? window.location.ancestorOrigins[window.location.ancestorOrigins.length - 1]
        : window.location.origin;

    const docsView = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
    docsView.setMimeTypes('application/vnd.google-apps.document');

    const builder = new pickerApi.PickerBuilder();
    builder.addView(docsView);
    builder.setOAuthToken(accessToken);
    builder.setOrigin(pickerOrigin);
    builder.setCallback((data: GooglePickerResult) => {
      if (data.action === pickerApi.Action.PICKED && data.docs?.[0]) {
        onPicked({ id: data.docs[0].id, name: data.docs[0].name });
      }
    });

    const picker = builder.build();
    picker.setVisible(true);
  });
}
