// Biometric Authentication Hook using Web Authentication API
// Provides fingerprint/face recognition on supported devices

import { useState, useCallback } from 'react';

interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

interface UseBiometricAuthReturn {
  isSupported: boolean;
  isAuthenticating: boolean;
  authenticate: () => Promise<BiometricAuthResult>;
  register: (email: string) => Promise<BiometricAuthResult>;
}

// Generate a random challenge for authentication
function generateChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);
  return challenge;
}

// Convert string to ArrayBuffer
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

export function useBiometricAuth(): UseBiometricAuthReturn {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check if WebAuthn is supported
  const isSupported = typeof window !== 'undefined' &&
    !!window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

  // Register a new credential (for first-time setup)
  const register = useCallback(async (email: string): Promise<BiometricAuthResult> => {
    if (!isSupported) {
      return { success: false, error: 'Biometric authentication not supported on this device' };
    }

    setIsAuthenticating(true);

    try {
      const userId = stringToArrayBuffer(email);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: generateChallenge(),
        rp: {
          name: 'Building Hawk',
          id: window.location.hostname,
        },
        user: {
          id: new Uint8Array(userId),
          name: email,
          displayName: email.split('@')[0],
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Use built-in authenticator (fingerprint/face)
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions,
      });

      if (credential) {
        // Store credential ID in localStorage for later authentication
        const credentialId = btoa(String.fromCharCode(...new Uint8Array((credential as PublicKeyCredential).rawId)));
        localStorage.setItem('buildingHawkCredentialId', credentialId);
        localStorage.setItem('buildingHawkEmail', email);

        return { success: true };
      }

      return { success: false, error: 'Failed to create credential' };
    } catch (error) {
      console.error('Biometric registration error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    } finally {
      setIsAuthenticating(false);
    }
  }, [isSupported]);

  // Authenticate using existing credential
  const authenticate = useCallback(async (): Promise<BiometricAuthResult> => {
    if (!isSupported) {
      return { success: false, error: 'Biometric authentication not supported on this device' };
    }

    setIsAuthenticating(true);

    try {
      // Check for stored credential
      const storedCredentialId = localStorage.getItem('buildingHawkCredentialId');

      const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: generateChallenge(),
        timeout: 60000,
        rpId: window.location.hostname,
        userVerification: 'required',
        allowCredentials: storedCredentialId ? [{
          id: Uint8Array.from(atob(storedCredentialId), c => c.charCodeAt(0)),
          type: 'public-key',
          transports: ['internal'],
        }] : [],
      };

      const assertion = await navigator.credentials.get({
        publicKey: publicKeyCredentialRequestOptions,
      });

      if (assertion) {
        return { success: true };
      }

      return { success: false, error: 'Authentication failed' };
    } catch (error) {
      console.error('Biometric authentication error:', error);

      // Handle specific error cases
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          return { success: false, error: 'Authentication was cancelled or not allowed' };
        }
        if (error.name === 'SecurityError') {
          return { success: false, error: 'Security error - please use HTTPS' };
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      };
    } finally {
      setIsAuthenticating(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    isAuthenticating,
    authenticate,
    register,
  };
}

// Simpler fallback authentication for demo purposes
export function useSimpleBiometricAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const isSupported = typeof window !== 'undefined' &&
    !!window.PublicKeyCredential;

  const authenticate = useCallback(async (): Promise<BiometricAuthResult> => {
    setIsAuthenticating(true);

    // Simulate biometric prompt with a delay
    return new Promise((resolve) => {
      setTimeout(() => {
        setIsAuthenticating(false);
        // For demo: always succeed
        resolve({ success: true });
      }, 1500);
    });
  }, []);

  return {
    isSupported,
    isAuthenticating,
    authenticate,
  };
}
