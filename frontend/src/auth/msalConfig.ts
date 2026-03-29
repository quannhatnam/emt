/**
 * MSAL (Microsoft Authentication Library) configuration for Entra ID SSO.
 *
 * SSO is configured in-app via Settings > SSO Configuration (Owner only).
 * The login page fetches the config from the backend API dynamically.
 */
import { Configuration, LogLevel, PublicClientApplication } from '@azure/msal-browser';

export function createMsalInstance(clientId: string, tenantId: string): PublicClientApplication {
  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
      postLogoutRedirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage',
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          if (containsPii) return;
          if (level === LogLevel.Error) console.error(message);
        },
        logLevel: LogLevel.Error,
      },
    },
  };

  return new PublicClientApplication(msalConfig);
}

export const loginRequest = {
  scopes: ['User.Read'],
};
