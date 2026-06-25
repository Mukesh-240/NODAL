// ─── NODAL Gmail Dispatch Service ─────────────────────────────────────────────
// Sends the official civic dispatch email directly from the citizen's own Gmail account.
// Uses Google OAuth 2.0 access token with 'https://www.googleapis.com/auth/gmail.send' scope.
//
// Open Source Attribution:
//   Gmail API Reference — https://developers.google.com/gmail/api/reference/rest

interface SendGmailDispatchParams {
  accessToken: string;
  from: string;
  to: string;
  cc?: string[];
  subject: string;
  body: string;
}

export async function sendGmailDispatch(params: SendGmailDispatchParams): Promise<void> {
  const { accessToken, from, to, cc, subject, body } = params;

  // Construct RFC 822 formatted email message
  const emailLines = [
    `From: ${from}`,
    `To: ${to}`,
  ];

  if (cc && cc.length > 0) {
    emailLines.push(`Cc: ${cc.join(', ')}`);
  }

  emailLines.push(
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    body
  );

  const emailContent = emailLines.join('\r\n');

  // Base64URL encode the raw email content (replacing +, / and removing padding =)
  const encodedEmail = Buffer.from(emailContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const gmailEndpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

  const response = await fetch(gmailEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedEmail,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Gmail API send failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
}
