// Test fixtures: structurally valid images built in code (no binary files in
// the repo). Used by media.test.js.
import zlib from "node:zlib";
import crypto from "node:crypto";

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// A valid RGB PNG. `extraChunks`: [[type, Buffer]] inserted after IHDR.
// `totalBytes`: pad with a private ancillary chunk to reach an exact size.
export function makePng({ width = 8, height = 8, extraChunks = [], totalBytes } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x7f)]);
  const idat = zlib.deflateSync(Buffer.concat(Array(height).fill(row)));
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extraChunks.map(([t, d]) => chunk(t, d)),
    chunk("IDAT", idat),
  ];
  const iend = chunk("IEND", Buffer.alloc(0));
  let png = Buffer.concat([...parts, iend]);
  if (totalBytes && totalBytes > png.length + 12) {
    const pad = chunk("prVt", crypto.randomBytes(totalBytes - png.length - 12));
    png = Buffer.concat([...parts, pad, iend]);
  }
  return png;
}

// Minimal JPEG structure with an EXIF (APP1) segment carrying a GPS marker
// string. Not decodable pixels, but structurally what the sanitiser parses:
// SOI, APP0, APP1(EXIF), SOF0, SOS + data, EOI.
export function makeJpegWithExif(secret = "GPS:30.0444N,31.2357E") {
  const seg = (marker, payload) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
  };
  const app0 = seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
  const app1 = seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from(secret, "latin1")]));
  const sof = Buffer.alloc(15);
  sof[0] = 8; // precision
  sof.writeUInt16BE(480, 1); // height
  sof.writeUInt16BE(640, 3); // width
  sof[5] = 3;
  const sof0 = seg(0xc0, sof);
  const sos = seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app0,
    app1,
    sof0,
    sos,
    crypto.randomBytes(64),
    Buffer.from([0xff, 0xd9]),
  ]);
}

export const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;
