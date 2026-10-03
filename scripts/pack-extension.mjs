// Packs extension/ into dist/youple-extension-<version>.zip for the Chrome Web Store,
// without the localhost development matches and the README.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export function storeManifest(manifest) {
  const live = list => list.filter(match => !match.startsWith("http://localhost"));
  return {
    ...manifest,
    host_permissions: live(manifest.host_permissions),
    content_scripts: manifest.content_scripts.map(script => ({ ...script, matches: live(script.matches) })),
  };
}

// A plain stored (uncompressed) zip; images and fonts are already compressed.
export function zip(files) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = Buffer.from(name);
    const crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(head, nameBytes, data);
    central.push(entry, nameBytes);
    offset += head.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../extension");
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name), name = path.relative(root, full).split(path.sep).join("/");
      if (entry.isDirectory()) walk(full);
      else if (name !== "README.md" && name !== "manifest.json") files.push([name, fs.readFileSync(full)]);
    }
  };
  walk(root);
  const manifest = storeManifest(JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")));
  files.unshift(["manifest.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n")]);
  const out = path.resolve(root, "../dist/youple-extension-" + manifest.version + ".zip");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip(files));
  console.log("Wrote " + path.relative(process.cwd(), out) + " (" + files.length + " files)");
}
