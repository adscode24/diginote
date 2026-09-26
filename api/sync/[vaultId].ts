import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

interface ExtendedRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
  body?: any;
}

interface ExtendedResponse extends ServerResponse {
  status: (statusCode: number) => ExtendedResponse;
  json: (body: any) => void;
  send: (body: any) => void;
}

// Ensure tmp directory for serverless environments (Vercel, AWS Lambda)
const VAULT_DIR = path.resolve('/tmp', '.vault_storage');
try {
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }
} catch {
  // Ignore permission error if already exists
}

export default async function handler(req: ExtendedRequest, res: ExtendedResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Extract vaultId from query or URL pathname
  let rawVaultId = '';
  if (req.query && req.query.vaultId) {
    rawVaultId = Array.isArray(req.query.vaultId) ? req.query.vaultId[0] : req.query.vaultId;
  }
  if (!rawVaultId && req.url) {
    const urlParts = req.url.split('?')[0].split('/');
    rawVaultId = urlParts[urlParts.length - 1] || '';
  }

  const safeId = (rawVaultId || '').replace(/[^a-zA-Z0-9_-]/g, '');

  if (!safeId || safeId.length < 3) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Vault ID tidak valid atau terlalu pendek' }));
    return;
  }

  const filePath = path.join(VAULT_DIR, `${safeId}.json`);

  // PUSH / UPLOAD TO CLOUD
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      let bodyData = req.body;
      if (!bodyData) {
        // Read buffer if body not pre-parsed by framework
        bodyData = await new Promise((resolve, reject) => {
          let str = '';
          req.on('data', chunk => {
            str += chunk;
          });
          req.on('end', () => {
            try {
              resolve(str ? JSON.parse(str) : {});
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });
      } else if (typeof bodyData === 'string') {
        try {
          bodyData = JSON.parse(bodyData);
        } catch {
          // keep as is
        }
      }

      const { payload, checksum, updatedAt } = bodyData || {};
      if (!payload) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Payload data enkripsi tidak ditemukan' }));
        return;
      }

      const fileData = {
        vaultId: safeId,
        payload,
        checksum: checksum || '',
        updatedAt: updatedAt || Date.now(),
      };

      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, vaultId: safeId, updatedAt: Date.now() }));
      return;
    } catch (err: unknown) {
      console.error('Error saving sync data in serverless:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Gagal menyimpan sinkronisasi ke cloud' }));
      return;
    }
  }

  // PULL / DOWNLOAD FROM CLOUD
  if (req.method === 'GET') {
    try {
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Data vault tidak ditemukan di cloud' }));
        return;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
      return;
    } catch (err: unknown) {
      console.error('Error fetching sync data in serverless:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Gagal mengambil data dari cloud' }));
      return;
    }
  }

  res.statusCode = 405;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}
