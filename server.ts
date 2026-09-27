import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const VAULT_DIR = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.resolve('/tmp', '.vault_storage')
    : path.resolve(process.cwd(), '.vault_storage');
  if (!fs.existsSync(VAULT_DIR)) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
  }

  // Health check endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'DigiNote Sync Engine', timestamp: Date.now() });
  });

  // Cloud Sync: Push encrypted vault
  app.post('/api/sync/:vaultId', (req, res) => {
    try {
      const { vaultId } = req.params;
      const { payload, checksum, updatedAt } = req.body;
      if (!payload) {
        return res.status(400).json({ error: 'Payload tidak ditemukan' });
      }
      const safeId = vaultId.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeId || safeId.length < 3) {
        return res.status(400).json({ error: 'Vault ID tidak valid' });
      }
      const filePath = path.join(VAULT_DIR, `${safeId}.json`);
      fs.writeFileSync(filePath, JSON.stringify({
        vaultId: safeId,
        payload,
        checksum: checksum || '',
        updatedAt: updatedAt || Date.now()
      }, null, 2), 'utf-8');

      res.json({ success: true, vaultId: safeId, updatedAt: Date.now() });
    } catch (err: unknown) {
      console.error('Error saving sync data:', err);
      res.status(500).json({ error: 'Gagal menyimpan sinkronisasi ke cloud' });
    }
  });

  // Cloud Sync: Pull encrypted vault
  app.get('/api/sync/:vaultId', (req, res) => {
    try {
      const { vaultId } = req.params;
      const safeId = vaultId.replace(/[^a-zA-Z0-9_-]/g, '');
      const filePath = path.join(VAULT_DIR, `${safeId}.json`);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Data vault tidak ditemukan di cloud' });
      }
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      res.json(data);
    } catch (err: unknown) {
      console.error('Error fetching sync data:', err);
      res.status(500).json({ error: 'Gagal mengambil data dari cloud' });
    }
  });

  // Serve Vite in dev or static in prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const port = process.env.PORT || 3000;
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`DigiNote Server running on http://0.0.0.0:${port}`);
  });
}

startServer();
