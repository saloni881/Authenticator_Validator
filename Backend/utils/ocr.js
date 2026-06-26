import fs                from 'fs';
import path              from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);

// ── Extract text from PDF using pdfjs-dist v4 ────────────
const extractPDFText = async (filePath) => {
  try {
    const { getDocument, GlobalWorkerOptions } =
      await import('pdfjs-dist/legacy/build/pdf.mjs');

    // Convert Windows absolute path → file:// URL (required by ESM loader)
    GlobalWorkerOptions.workerSrc = pathToFileURL(
      require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ).href;

    const data   = new Uint8Array(fs.readFileSync(filePath));
    const pdfDoc = await getDocument({ data, verbosity: 0 }).promise;

    let fullText = '';
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page        = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      fullText         += textContent.items.map(item => item.str).join(' ') + '\n';
    }

    console.log(`PDF text extracted — ${pdfDoc.numPages} page(s)`);
    return fullText;
  } catch (err) {
    console.error('PDF extract error (full):', err);
    throw new Error('Failed to extract text from PDF');
  }
};

// ── Extract text from image using Tesseract.js ────────
const extractImageText = async (filePath) => {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    console.log('Image OCR complete');
    return text;
  } catch (err) {
    console.error('Image OCR error:', err.message);
    throw new Error('Failed to extract text from image');
  }
};

// ── Main OCR — auto detects PDF vs image ─────────────
// ✅ New — checks extension AND reads file magic bytes as fallback
export const runOCR = async (filePath, mimeType = '') => {
  const ext = path.extname(filePath).toLowerCase();

  // Check mimetype first (passed from multer req.file.mimetype)
  if (mimeType === 'application/pdf') {
    console.log('PDF detected (by mimetype) — extracting text directly');
    return await extractPDFText(filePath);
  }

  // Check extension
  if (ext === '.pdf') {
    console.log('PDF detected (by extension) — extracting text directly');
    return await extractPDFText(filePath);
  }

  // Check magic bytes — PDF starts with %PDF (hex: 25 50 44 46)
  const buf = Buffer.alloc(4);
  const fd  = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);
  if (buf.toString('ascii') === '%PDF') {
    console.log('PDF detected (by magic bytes) — extracting text directly');
    return await extractPDFText(filePath);
  }

  console.log('Image detected — running Tesseract OCR');
  return await extractImageText(filePath);
};

// ── Parse key fields from extracted text ─────────────
export const parseFields = (rawText) => {
  const lines  = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const fields = { name:'', rollNumber:'', marks:'', certId:'', university:'', year:'', degree:'' };

  for (const line of lines) {
    const low = line.toLowerCase();

    // Name
    if (!fields.name && (low.includes('name') || low.includes('certify that'))) {
      const m = line.match(/(?:name|certify\s+that)[:\s]+([A-Za-z][a-zA-Z\s]{2,40})/i);
      if (m) fields.name = m[1].trim();
    }

    // Roll / Enrollment
    if (!fields.rollNumber && (low.includes('roll') || low.includes('enrollment') || low.includes('reg') || low.includes('student id'))) {
      const m = line.match(/[:\s#]([A-Z0-9][A-Z0-9\/-]{3,19})(?:\s|$)/);
      if (m) fields.rollNumber = m[1].trim();
    }

    // Marks / CGPA / Grade
    if (!fields.marks) {
      const m1 = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      const m2 = line.match(/(?:marks|percentage|cgpa|score)[:\s]+(\d+(?:\.\d+)?)/i);
      const m3 = line.match(/grade[:\s]+([A-F][+-]?)/i);
      if      (m1) fields.marks = m1[1] + '%';
      else if (m2) fields.marks = m2[1];
      else if (m3) fields.marks = m3[1];
    }

    // Certificate ID
    if (!fields.certId && (low.includes('cert') || low.includes('diploma no') || low.includes('reg no') || low.match(/\bno\b|\bno\.\b/))) {
      const m = line.match(/[:\s#]([A-Z0-9][A-Z0-9\/-]{3,25})(?:\s|$)/);
      if (m && m[1] !== fields.rollNumber) fields.certId = m[1].trim();
    }

    // University
    if (!fields.university && (low.includes('university') || low.includes('college') || low.includes('institute'))) {
      fields.university = line.trim();
    }

    // Year
    if (!fields.year) {
      const m = line.match(/\b(19|20)\d{2}\b/);
      if (m) fields.year = m[0];
    }

    // Degree
    if (!fields.degree && (
      low.includes('bachelor') || low.includes('master') || low.includes('doctor') ||
      low.match(/\bb\.(tech|sc|ca|com|ed)\b/i) ||
      low.match(/\bm\.(tech|sc|ca|com|ed)\b/i) ||
      low.includes('diploma') || low.includes('degree')
    )) {
      fields.degree = line.trim();
    }
  }

  const filled = ['name','rollNumber','university','year'].filter(f => fields[f]).length;
  console.log(`Fields extracted: ${filled}/4 required — ${JSON.stringify(fields)}`);
  return fields;
};