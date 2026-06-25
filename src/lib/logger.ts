export function sanitizeForLogging(obj: Record<string, unknown> | unknown) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const SENSITIVE_KEYS = [
    'gmailAccessToken',
    'accessToken', 
    'token',
    'password',
    'secret',
    'apiKey',
    'serviceRoleKey',
    'imageBase64' // Added to prevent flooding logs with base64
  ];
  
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).map(([key, value]) => {
      // Check if value is object and sanitize recursively
      let sanitizedValue = value;
      if (typeof value === 'object' && value !== null) {
        sanitizedValue = sanitizeForLogging(value as Record<string, unknown>);
      }

      return [
        key,
        SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k.toLowerCase()))
          ? '[REDACTED]'
          : sanitizedValue
      ];
    })
  );
}
