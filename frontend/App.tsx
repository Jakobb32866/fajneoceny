import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { Newsreader_500Medium, Newsreader_600SemiBold } from '@expo-google-fonts/newsreader';
import {
  NavigationContainer,
  useNavigationContainerRef,
  type NavigationContainerRefWithCurrent,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { AppHeader } from './src/components/AppHeader';
import { AppNav } from './src/components/AppNav';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LoginScreen } from './src/screens/LoginScreen';
import { theme } from './src/theme';
import type { RootStackParamList } from './src/navigation/types';

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface.app,
      }}
    >
      <ActivityIndicator size="large" color={theme.colors.brand.default} />
    </View>
  );
}

const WIDE_BREAKPOINT = 900;

/** Authenticated app shell: the stack plus the persistent AppNav (top on
 *  desktop/tablet, bottom on mobile). */
function AuthenticatedShell({
  navRef,
  routeName,
}: {
  navRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  routeName: string | undefined;
}) {
  const { user, signOut } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;

  return (
    <View style={{ flex: 1 }}>
      {/* Desktop/tablet: global header (logo + account) with the nav bar right
          below it. Mobile puts the nav in a bottom bar; its header is per-screen. */}
      {isWide ? (
        <>
          <AppHeader
            firstName={user?.firstName ?? ''}
            onSettings={() => navRef.navigate('Settings')}
            onSignOut={signOut}
          />
          <AppNav navRef={navRef} routeName={routeName} variant="top" />
        </>
      ) : null}
      <View style={{ flex: 1 }}>
        <RootNavigator />
      </View>
      {isWide ? null : <AppNav navRef={navRef} routeName={routeName} variant="bottom" />}
    </View>
  );
}

function Gate({
  navRef,
  routeName,
}: {
  navRef: NavigationContainerRefWithCurrent<RootStackParamList>;
  routeName: string | undefined;
}) {
  const { status } = useAuth();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'signedOut') {
    return <LoginScreen />;
  }

  return <AuthenticatedShell navRef={navRef} routeName={routeName} />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Newsreader_500Medium,
    Newsreader_600SemiBold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });

  const navRef = useNavigationContainerRef<RootStackParamList>();
  const [routeName, setRouteName] = useState<string | undefined>();
  const syncRoute = () => setRouteName(navRef.getCurrentRoute()?.name);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {fontsLoaded ? (
          <AuthProvider>
            <NavigationContainer ref={navRef} onReady={syncRoute} onStateChange={syncRoute}>
              <Gate navRef={navRef} routeName={routeName} />
            </NavigationContainer>
          </AuthProvider>
        ) : (
          <LoadingScreen />
        )}
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
