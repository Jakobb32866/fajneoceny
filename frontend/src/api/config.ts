import Constants from 'expo-constants';
import { Platform } from 'react-native';

const BACKEND_PORT = 8080;

/**
 * Derives the backend URL from the address Expo's own dev server is
 * reachable at (Constants.expoConfig.hostUri looks like "192.168.1.5:8081").
 * That LAN IP is already known-good for reaching this machine from a phone
 * on the same network, so we reuse it instead of asking the student to type
 * an IP address in by hand. Falls back to localhost for web/simulator.
 */
function resolveApiBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  const lanHost = hostUri?.split(':')[0];

  if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
    return `http://${lanHost}:${BACKEND_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${BACKEND_PORT}`; // Android emulator loopback to host
  }

  return `http://localhost:${BACKEND_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

// Google OAuth client ids for expo-auth-session. Leave placeholders here;
// real values are per-deployment (Google Cloud Console) and should be filled
// in before shipping. An empty string disables the Google sign-in button.
export const GOOGLE_OAUTH_CLIENT_IDS = {
  web: '495592595870-klmp9mk043di5tg9kmpbhpalcn4q6g35.apps.googleusercontent.com',
  ios: '',
  android: '',
};
