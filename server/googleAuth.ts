import { OAuth2Client } from 'google-auth-library';

const clientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();

export const isGoogleAuthConfigured = () => Boolean(clientId());

export const getGoogleClientId = () => clientId() || null;

let client: OAuth2Client | null = null;

const getClient = () => {
  const id = clientId();
  if (!id) return null;
  if (!client) client = new OAuth2Client(id);
  return client;
};

export type GoogleProfile = {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
};

export const verifyGoogleIdToken = async (idToken: string): Promise<GoogleProfile> => {
  const oauth = getClient();
  const audience = clientId();
  if (!oauth || !audience) {
    throw new Error('Google sign-in is not configured');
  }

  const ticket = await oauth.verifyIdToken({
    idToken,
    audience
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google token');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture,
    emailVerified: payload.email_verified === true
  };
};
