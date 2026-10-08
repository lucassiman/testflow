/**
 * A pasta de trabalho no Node com a mesma "cara" da File System Access API do navegador
 * (FileSystemDirectoryHandle / FileSystemFileHandle). Assim o servidor MCP reaproveita as mesmas
 * funções do app (src/io/fsOps.js, src/io/versions.js…) — as mesmas regras de gravação e de histórico.
 *
 * Só o que o app usa: getDirectoryHandle, getFileHandle, entries/keys, removeEntry, resolve, isSameEntry,
 * getFile e createWritable (gravação num arquivo temporário e troca no fim: nunca deixa arquivo pela metade).
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

const err = (name: string, message: string): Error => Object.assign(new Error(message), { name });

async function statOrNull(p: string) {
  try { return await fs.stat(p); } catch { return null; }
}

/** Nome válido de um item (sem separador nem "..": não sai da pasta). */
function checkName(name: string): void {
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name) || name.includes('\0')) throw err('TypeError', `nome inválido: "${name}"`);
}

/** Troca o temporário pelo arquivo; no Windows, antivírus/indexador/OneDrive às vezes seguram o arquivo por um instante. */
async function replaceFile(tmp: string, target: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { await fs.rename(tmp, target); return; } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= 6 || !['EPERM', 'EACCES', 'EBUSY'].includes(code || '')) throw e;
      await new Promise((r) => setTimeout(r, 60 * (i + 1)));
    }
  }
}

export class NodeFileHandle {
  readonly kind = 'file' as const;
  /** pending: pedido com { create: true } e ainda sem conteúdo — o arquivo só aparece no disco quando a gravação termina */
  constructor(readonly fullPath: string, private pending = false) {}
  get name(): string { return path.basename(this.fullPath); }

  async getFile(): Promise<File> {
    if (this.pending && !(await statOrNull(this.fullPath))) return new File([], this.name, { lastModified: Date.now(), type: mimeOf(this.name) });
    const [data, st] = await Promise.all([fs.readFile(this.fullPath), fs.stat(this.fullPath)]);
    return new File([data], this.name, { lastModified: Math.round(st.mtimeMs), type: mimeOf(this.name) });
  }

  async createWritable() {
    const target = this.fullPath;
    const parts: Uint8Array[] = [];
    return {
      async write(data: unknown): Promise<void> {
        if (typeof data === 'string') parts.push(new TextEncoder().encode(data));
        else if (data instanceof Uint8Array) parts.push(data);
        else if (data instanceof ArrayBuffer) parts.push(new Uint8Array(data));
        else if (data && typeof (data as Blob).arrayBuffer === 'function') parts.push(new Uint8Array(await (data as Blob).arrayBuffer()));
        else throw err('TypeError', 'tipo de dado não suportado');
      },
      async close(): Promise<void> {
        const tmp = `${target}.qa-tmp-${process.pid}-${Date.now()}`;
        try {
          await fs.writeFile(tmp, Buffer.concat(parts));
          await replaceFile(tmp, target);
        } finally {
          await fs.unlink(tmp).catch(() => {}); // não deixa o temporário para trás
        }
      },
      async abort(): Promise<void> { parts.length = 0; },
    };
  }

  async isSameEntry(other: { fullPath?: string }): Promise<boolean> { return path.resolve(other.fullPath || '') === path.resolve(this.fullPath); }
  async queryPermission(): Promise<'granted'> { return 'granted'; }
  async requestPermission(): Promise<'granted'> { return 'granted'; }
}

export class NodeDirHandle {
  readonly kind = 'directory' as const;
  constructor(readonly fullPath: string) {}
  get name(): string { return path.basename(this.fullPath); }

  async getDirectoryHandle(name: string, opts: { create?: boolean } = {}): Promise<NodeDirHandle> {
    checkName(name);
    const p = path.join(this.fullPath, name);
    const st = await statOrNull(p);
    if (st && !st.isDirectory()) throw err('TypeMismatchError', `"${name}" não é uma pasta`);
    if (!st) {
      if (!opts.create) throw err('NotFoundError', `"${name}" não existe`);
      await fs.mkdir(p, { recursive: true });
    }
    return new NodeDirHandle(p);
  }

  async getFileHandle(name: string, opts: { create?: boolean } = {}): Promise<NodeFileHandle> {
    checkName(name);
    const p = path.join(this.fullPath, name);
    const st = await statOrNull(p);
    if (st && !st.isFile()) throw err('TypeMismatchError', `"${name}" não é um arquivo`);
    if (!st && !opts.create) throw err('NotFoundError', `"${name}" não existe`);
    // não cria o arquivo vazio agora: se a gravação falhar, não sobra um documento em branco
    return new NodeFileHandle(p, !st);
  }

  async *entries(): AsyncGenerator<[string, NodeDirHandle | NodeFileHandle]> {
    let list;
    try { list = await fs.readdir(this.fullPath, { withFileTypes: true }); } catch { return; }
    for (const d of list) {
      if (d.isDirectory()) yield [d.name, new NodeDirHandle(path.join(this.fullPath, d.name))];
      else if (d.isFile()) yield [d.name, new NodeFileHandle(path.join(this.fullPath, d.name))];
    }
  }

  async *keys(): AsyncGenerator<string> { for await (const [name] of this.entries()) yield name; }
  async *values(): AsyncGenerator<NodeDirHandle | NodeFileHandle> { for await (const [, h] of this.entries()) yield h; }

  async removeEntry(name: string, opts: { recursive?: boolean } = {}): Promise<void> {
    checkName(name);
    const p = path.join(this.fullPath, name);
    const st = await statOrNull(p);
    if (!st) throw err('NotFoundError', `"${name}" não existe`);
    if (st.isDirectory()) await fs.rm(p, { recursive: !!opts.recursive });
    else await fs.unlink(p);
  }

  /** Caminho de `other` dentro desta pasta (partes), ou null se estiver fora. */
  async resolve(other: { fullPath: string }): Promise<string[] | null> {
    const rel = path.relative(this.fullPath, other.fullPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return rel ? rel.split(path.sep) : [];
  }

  async isSameEntry(other: { fullPath?: string }): Promise<boolean> { return path.resolve(other.fullPath || '') === path.resolve(this.fullPath); }
  async queryPermission(): Promise<'granted'> { return 'granted'; }
  async requestPermission(): Promise<'granted'> { return 'granted'; }
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  webm: 'video/webm', mp4: 'video/mp4', pdf: 'application/pdf', md: 'text/markdown', txt: 'text/plain', json: 'application/json',
  xml: 'application/xml', csv: 'text/csv', log: 'text/plain', har: 'application/json',
};
export const mimeOf = (name: string): string => MIME[(/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase()] || 'application/octet-stream';

/** A pasta de trabalho (tem de existir). */
export async function openRoot(dir: string): Promise<NodeDirHandle> {
  const full = path.resolve(dir);
  const st = await statOrNull(full);
  if (!st?.isDirectory()) throw new Error(`a pasta de trabalho "${full}" não existe`);
  return new NodeDirHandle(full);
}

/** Como o app vê a pasta (FileSystemDirectoryHandle). */
export const asHandle = (d: NodeDirHandle): FileSystemDirectoryHandle => d as unknown as FileSystemDirectoryHandle;
