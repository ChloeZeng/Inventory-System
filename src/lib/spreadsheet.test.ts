import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { toCsv, toXlsx } from "./spreadsheet";

test("CSV: BOM, quoting, CRLF", () => {
  const csv = toCsv(["Code", "Name"], [["C-LID-010", 'Lid 38mm, "White"'], ["RM-001", 60]]);
  assert.equal(csv, '﻿Code,Name\r\nC-LID-010,"Lid 38mm, ""White"""\r\nRM-001,60\r\n');
});

// Read the stored ZIP back: entry names and contents.
function unzip(buf: Buffer) {
  const out = new Map<string, string>();
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const method = buf.readUInt16LE(i + 8);
    const size = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("utf8");
    const data = buf.subarray(i + 30 + nameLen, i + 30 + nameLen + size);
    out.set(name, (method ? inflateRawSync(data) : data).toString("utf8"));
    i += 30 + nameLen + size;
  }
  return out;
}

test("XLSX: a valid workbook with the rows; numbers stay numbers; text escaped", () => {
  const buf = toXlsx("Inventory: Lids", ["Code", "Available"], [["C-LID-010", 106080], ["<A&B>", "x"]]);
  const files = unzip(buf);
  assert.deepEqual([...files.keys()].sort(), ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"]);
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /<c r="B2"><v>106080<\/v><\/c>/);
  assert.match(sheet, /&lt;A&amp;B&gt;/);
  assert.match(files.get("xl/workbook.xml")!, /name="Inventory  Lids"/); // ":" not allowed in sheet names
  // end of central directory record
  assert.equal(buf.readUInt32LE(buf.length - 22), 0x06054b50);
});
