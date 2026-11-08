/**
 * Amazon Cognito Authentication Service
 * Uses the AWS Cognito Identity Provider REST protocol with USER_PASSWORD_AUTH.
 * Direct HTTPS calls eliminate heavy browser crypto shims and ensure flawless
 * Vite SPA execution without client-secret leakage.
 */

const getCognitoEndpoint = (region) => {
  return `https://cognito-idp.${region || 'ap-south-1'}.amazonaws.com/`;
};

const cognitoRequest = async (target, payload, region) => {
  const endpoint = getCognitoEndpoint(region);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorType = data.__type || data.name || 'CognitoError';
    const message = data.message || data.Message || 'An error occurred with Cognito authentication.';
    const error = new Error(message);
    error.code = errorType;
    throw error;
  }
  return data;
};

/**
 * Register a new user in Cognito User Pool
 */
export const cognitoSignUp = async ({ email, password, clientId, region }) => {
  if (!clientId) {
    throw new Error('Cognito Client ID is not configured. Please check your backend .env or SSM settings.');
  }

  const payload = {
    ClientId: clientId,
    Username: email,
    Password: password,
    UserAttributes: [
      {
        Name: 'email',
        Value: email,
      },
    ],
  };

  return await cognitoRequest('SignUp', payload, region);
};

/**
 * Confirm user email registration with 6-digit verification code
 */
export const cognitoConfirmSignUp = async ({ email, code, clientId, region }) => {
  if (!clientId) {
    throw new Error('Cognito Client ID is missing.');
  }

  const payload = {
    ClientId: clientId,
    Username: email,
    ConfirmationCode: code.trim(),
  };

  return await cognitoRequest('ConfirmSignUp', payload, region);
};

/**
 * Resend email confirmation code
 */
export const cognitoResendConfirmationCode = async ({ email, clientId, region }) => {
  if (!clientId) {
    throw new Error('Cognito Client ID is missing.');
  }

  const payload = {
    ClientId: clientId,
    Username: email,
  };

  return await cognitoRequest('ResendConfirmationCode', payload, region);
};

/**
 * Authenticate with Cognito using USER_PASSWORD_AUTH flow
 */
export const cognitoSignIn = async ({ email, password, clientId, region }) => {
  if (!clientId) {
    throw new Error('Cognito Client ID is not configured. Please check backend .env or SSM settings.');
  }

  const payload = {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  };

  const data = await cognitoRequest('InitiateAuth', payload, region);
  return data.AuthenticationResult;
};

/**
 * Parses JWT payload without verifying signature (used for client-side claims inspection)
 */
export const parseJwtPayload = (token) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to parse JWT payload', e);
    return null;
  }
};

