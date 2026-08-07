// src/services/FlutterwaveTokenManager.js

import axios from 'axios';
import {
  FLW_CLIENT_ID,
  FLW_CLIENT_SECRET,
  FLW_IDP_URL,
  FLW_TIMEOUT,
  FLW_BASE_URL,
  FLW_SECRET_KEY
} from '../../config/flutterwave.js';

import logger from '../utils/logger.js';

/**
 * Flutterwave Token Manager
 *
 * Supports BOTH:
 *
 * 1. Flutterwave V3 API
 *    - Uses Secret Key
 *    - No OAuth
 *
 * 2. Flutterwave Developer Sandbox API
 *    - Uses OAuth Client Credentials
 */
class FlutterwaveTokenManager {
  constructor() {
    this.token = null;
    this.expiresAt = null;
    this.isRefreshing = false;
    this.refreshPromise = null;

    // Refresh token 60 seconds before expiry
    this.tokenExpiryBuffer = 60 * 1000;
  }

  /**
   * Determine whether OAuth should be used.
   */
  shouldUseOAuth() {
    return (
      FLW_BASE_URL &&
      FLW_BASE_URL.includes('developersandbox-api')
    );
  }

  /**
   * Returns authentication credential.
   *
   * V3 API:
   *      Secret Key
   *
   * Developer Sandbox:
   *      OAuth Access Token
   */
  async getToken() {
    // -------------------------------
    // V3 API
    // -------------------------------
    if (!this.shouldUseOAuth()) {
      if (!FLW_SECRET_KEY) {
        throw new Error(
          'FLW_SECRET_KEY is not configured.'
        );
      }

      return FLW_SECRET_KEY;
    }

    // -------------------------------
    // OAuth
    // -------------------------------
    if (
      this.token &&
      this.expiresAt &&
      Date.now() < this.expiresAt - this.tokenExpiryBuffer
    ) {
      logger.debug('✅ Using cached Flutterwave OAuth token');
      return this.token;
    }

    return this.refreshToken();
  }

  /**
   * Refresh OAuth token
   */
  async refreshToken() {
    if (!this.shouldUseOAuth()) {
      return FLW_SECRET_KEY;
    }

    if (this.isRefreshing) {
      logger.debug('⏳ Waiting for existing token refresh...');
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = this._doRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Actually call Flutterwave OAuth endpoint.
   */
  async _doRefresh() {
    try {
      logger.info('🔄 Requesting Flutterwave OAuth token...');

      if (!FLW_CLIENT_ID || !FLW_CLIENT_SECRET) {
        throw new Error(
          'FLW_CLIENT_ID and FLW_CLIENT_SECRET are required.'
        );
      }

      if (!FLW_IDP_URL) {
        throw new Error(
          'FLW_IDP_URL is not configured.'
        );
      }

      const body = new URLSearchParams();

      body.append('client_id', FLW_CLIENT_ID);
      body.append('client_secret', FLW_CLIENT_SECRET);
      body.append('grant_type', 'client_credentials');

      const response = await axios.post(
        FLW_IDP_URL,
        body.toString(),
        {
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded'
          },
          timeout: FLW_TIMEOUT || 30000
        }
      );

      const data = response.data;

      if (!data.access_token) {
        throw new Error(
          'OAuth response did not contain access_token.'
        );
      }

      this.token = data.access_token;

      const expires =
        Number(data.expires_in) || 600;

      this.expiresAt =
        Date.now() + expires * 1000;

      logger.info('✅ Flutterwave OAuth token acquired');

      logger.debug({
        expiresIn: expires,
        expiresAt: new Date(
          this.expiresAt
        ).toISOString()
      });

      return this.token;
    } catch (error) {
      logger.error('❌ Flutterwave OAuth failed', {
        message: error.message,
        status: error.response?.status,
        response: error.response?.data
      });

      if (
        this.token &&
        this.expiresAt &&
        Date.now() < this.expiresAt
      ) {
        logger.warn(
          '⚠️ Using existing cached OAuth token.'
        );

        return this.token;
      }

      throw error;
    }
  }

  /**
   * Check token validity.
   */
  isValid() {
    if (!this.shouldUseOAuth()) {
      return !!FLW_SECRET_KEY;
    }

    return (
      !!this.token &&
      !!this.expiresAt &&
      Date.now() <
        this.expiresAt - this.tokenExpiryBuffer
    );
  }

  /**
   * Get expiry.
   */
  getExpiration() {
    if (!this.shouldUseOAuth()) {
      return null;
    }

    return this.expiresAt
      ? new Date(this.expiresAt)
      : null;
  }

  /**
   * Clear cached OAuth token.
   */
  clearToken() {
    this.token = null;
    this.expiresAt = null;

    logger.info('🗑️ Flutterwave OAuth token cleared');
  }

  /**
   * Status.
   */
  getStatus() {
    return {
      authentication:
        this.shouldUseOAuth()
          ? 'OAuth 2.0'
          : 'Secret Key',

      usingOAuth: this.shouldUseOAuth(),

      hasToken: this.shouldUseOAuth()
        ? !!this.token
        : !!FLW_SECRET_KEY,

      isValid: this.isValid(),

      expiresAt:
        this.shouldUseOAuth() && this.expiresAt
          ? new Date(this.expiresAt).toISOString()
          : null,

      timeToExpiry:
        this.shouldUseOAuth() && this.expiresAt
          ? Math.max(
              0,
              (this.expiresAt - Date.now()) / 1000
            )
          : null,

      isRefreshing: this.isRefreshing,

      clientIdConfigured: !!FLW_CLIENT_ID,

      clientSecretConfigured: !!FLW_CLIENT_SECRET,

      secretKeyConfigured: !!FLW_SECRET_KEY
    };
  }
}

const tokenManager = new FlutterwaveTokenManager();

export default tokenManager;

export { FlutterwaveTokenManager };