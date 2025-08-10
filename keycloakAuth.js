const Keycloak = require('keycloak-backend').Keycloak
const dotenv = require('dotenv')
dotenv.config();

if (!process.env.KC_BASE_URL || !process.env.KC_REALM || !process.env.KC_CLIENT_ID) {
    console.error('❌ Missing Keycloak environment variables. Check your .env file.');
}

const keycloakAuth = new Keycloak({
    "realm": process.env.KC_REALM,
    "keycloak_base_url": process.env.KC_BASE_URL,
    "client_id": process.env.KC_CLIENT_ID,
    "username": process.env.KC_USERNAME,
    "password": process.env.KC_PASSWORD,        
    "is_legacy_endpoint": process.env.KC_IS_LEGACY_ENDPOINT
});


let cachedToken = null;
let tokenExpiry = null;

async function getCachedToken() {
    const now = Date.now();

    // If token exists and not expired, reuse it
    if (cachedToken && tokenExpiry && now < tokenExpiry) {
        return cachedToken;
    }

    let token;
    try {
        // Otherwise, fetch new token
        token = await keycloakAuth.accessToken.get();
    } catch (err) {
        console.error('❌ Failed to fetch Keycloak token:', err.message);
        throw err;
    }

    let decode;
    try {
        // Cache it and set expiry ~5 sec before actual expiry time
        decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    } catch (e) {
        console.error('❌ Failed to decode token payload:', e.message);
        throw e;
    }

    const expiresInMs = decoded.exp * 1000 - now - 5000;
    cachedToken = token;
    tokenExpiry = now + expiresInMs;

    return token;
}

module.exports = { getCachedToken };

if (process.env.NODE_ENV === 'test') {
  module.exports.__forceExpireToken = () => {
    cachedToken = null;
    tokenExpiry = null;
  };
  module.exports.__getCacheState = () => ({ cachedToken, tokenExpiry });
}