/// <reference types="vite/client" />

interface ClipboardItem {
  readonly types: ReadonlyArray<string>;
  readonly presentationStyle: "unspecified" | "inline" | "attachment";
  getType(type: string): Promise<Blob>;
}

declare var ClipboardItem: {
  prototype: ClipboardItem;
  new (items: Record<string, Blob | Promise<Blob>>): ClipboardItem;
};

interface Clipboard {
  write(data: ClipboardItem[]): Promise<void>;
}
