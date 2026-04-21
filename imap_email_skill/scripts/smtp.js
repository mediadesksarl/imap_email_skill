#!/usr/bin/env node
// smtp.js — send email via SMTP

const nodemailer = require('nodemailer');
const fs = require('fs');
const { loadConfig } = require('./config');

const args = process.argv.slice(2);
const command = args[0];

function getArg(flag, defaultVal = null) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : defaultVal;
}

function hasFlag(flag) {
  return args.includes(flag);
}

async function getTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: parseInt(cfg.SMTP_PORT || '465'),
    secure: cfg.SMTP_SECURE !== 'false',
    auth: {
      user: cfg.SMTP_USER,
      pass: cfg.SMTP_PASS,
    },
    tls: {
      rejectUnauthorized: cfg.SMTP_REJECT_UNAUTHORIZED !== 'false',
    },
  });
}

async function cmdSend() {
  const cfg = loadConfig();
  const to = getArg('--to');
  const subject = getArg('--subject');

  if (!to || !subject) {
    console.error('Usage: smtp.js send --to <email> --subject <text> --body <text>');
    process.exit(1);
  }

  let body = getArg('--body', '');
  const bodyFile = getArg('--body-file');
  if (bodyFile) body = fs.readFileSync(bodyFile, 'utf8');

  const isHtml = hasFlag('--html');
  const cc = getArg('--cc');
  const bcc = getArg('--bcc');
  const from = getArg('--from', cfg.SMTP_FROM || cfg.SMTP_USER);
  const attachStr = getArg('--attach');

  const attachments = attachStr
    ? attachStr.split(',').map(f => ({ path: f.trim() }))
    : [];

  const mailOptions = {
    from,
    to,
    subject,
    ...(cc ? { cc } : {}),
    ...(bcc ? { bcc } : {}),
    ...(isHtml ? { html: body } : { text: body }),
    ...(attachments.length ? { attachments } : {}),
  };

  const transporter = await getTransporter(cfg);
  const info = await transporter.sendMail(mailOptions);
  console.log(`Email sent successfully.`);
  console.log(`Message ID: ${info.messageId}`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
}

async function cmdTest() {
  const cfg = loadConfig();
  const transporter = await getTransporter(cfg);
  await transporter.verify();
  console.log('SMTP connection successful.');
  console.log(`Host: ${cfg.SMTP_HOST}:${cfg.SMTP_PORT}`);
  console.log(`User: ${cfg.SMTP_USER}`);
}

(async () => {
  try {
    if (command === 'send') await cmdSend();
    else if (command === 'test') await cmdTest();
    else {
      console.log('Commands: send, test');
      console.log('  send --to <email> --subject <text> --body <text> [--html] [--cc <email>] [--bcc <email>] [--attach <file>]');
      console.log('  test');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
