import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const gmailUser = process.env.GMAIL_USER?.trim();
const gmailAppPassword = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');

console.log('Testing SMTP configuration...');
console.log('GMAIL_USER:', gmailUser ? '✓ Set' : '✗ Missing');
console.log('GMAIL_APP_PASSWORD:', gmailAppPassword ? `✓ Set (${gmailAppPassword.length} chars)` : '✗ Missing');
console.log('Password preview:', gmailAppPassword ? `${gmailAppPassword.substring(0, 4)}...` : 'N/A');

if (!gmailUser || !gmailAppPassword) {
  console.error('ERROR: Missing SMTP credentials');
  process.exit(1);
}

const smtpPort = Number(process.env.LIMS_SMTP_PORT || 587);
console.log('SMTP Port:', smtpPort);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: gmailUser,
    pass: gmailAppPassword
  }
});

console.log('\nVerifying SMTP connection...');
try {
  await transporter.verify();
  console.log('✓ SMTP connection successful');
  
  // Test sending an email
  console.log('\nTesting email send...');
  const testEmail = {
    from: `"Test" <${gmailUser}>`,
    to: process.env.MAIL_DEFAULT_TO || gmailUser,
    subject: 'SMTP Test - Swap Protocol',
    text: 'This is a test email from the Swap Protocol SMTP configuration.',
    html: '<p>This is a test email from the <b>Swap Protocol</b> SMTP configuration.</p>'
  };
  
  const info = await transporter.sendMail(testEmail);
  console.log('✓ Test email sent successfully');
  console.log('Message ID:', info.messageId);
  console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
  
} catch (error) {
  console.error('✗ SMTP Error:', error.message);
  console.error('Full error:', error);
  
  // Common Gmail issues
  if (error.code === 'EAUTH') {
    console.log('\nCommon Gmail authentication issues:');
    console.log('1. Make sure 2FA is enabled on the Google account');
    console.log('2. Generate an "App Password" at: https://myaccount.google.com/apppasswords');
    console.log('3. Use the 16-character app password (no spaces)');
    console.log('4. Make sure "Less secure app access" is NOT enabled (app passwords replace this)');
  } else if (error.code === 'ECONNECTION') {
    console.log('\nConnection issues:');
    console.log('1. Check firewall/antivirus blocking port 465');
    console.log('2. Try port 587 with secure: false');
  }
}

process.exit(0);