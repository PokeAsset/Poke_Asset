import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DarkTheme, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { applyTheme, colors, Mode } from './src/theme';
import { ThemeModeCtx } from './src/themeMode';
import { StoreProvider } from './src/store';
import MenuDrawer from './src/MenuDrawer';
import Home from './src/screens/Home';
import Assistant from './src/screens/Assistant';
import Scan, { SealedScan } from './src/screens/Scan';
import Marketplace from './src/screens/Marketplace';
import MyCards from './src/screens/MyCards';
import Alerts from './src/screens/Alerts';
import Grade from './src/screens/Grade';
import Market from './src/screens/Market';
import Trade from './src/screens/Trade';
import CardDetail from './src/screens/CardDetail';
import { CardDatabase, Placeholder } from './src/screens/Misc';
import Wishlist from './src/screens/Wishlist';
import Sets, { SetDetail } from './src/screens/Sets';
import Sealed from './src/screens/Sealed';

export const rootRef = createNavigationContainerRef<any>();
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home: ['grid-outline', 'grid'],
  Assistant: ['sparkles-outline', 'sparkles'],
  Scan: ['scan-outline', 'scan'],
  Marketplace: ['people-outline', 'people'],
  Collection: ['library-outline', 'library'],
  Alerts: ['notifications-outline', 'notifications'],
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.amber,
        tabBarInactiveTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 12 },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons name={ICONS[route.name][focused ? 1 : 0]} size={size + 4} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Assistant" component={Assistant} />
      <Tab.Screen name="Scan" component={Scan} />
      <Tab.Screen name="Marketplace" component={Marketplace} />
      <Tab.Screen name="Collection" component={MyCards} />
      <Tab.Screen name="Alerts" component={Alerts} />
    </Tab.Navigator>
  );
}

const drawerNav = {
  navigate: (name: string, params?: object) => {
    if (rootRef.isReady()) rootRef.navigate(name, params);
  },
};

const MODE_KEY = 'pokeasset.theme';

export default function App() {
  const [mode, setMode] = useState<Mode | null>(null);
  const navState = useRef<any>(undefined);

  useEffect(() => {
    (async () => {
      let m: Mode = 'dark';
      try {
        const saved = await AsyncStorage.getItem(MODE_KEY);
        if (saved === 'light' || saved === 'dark') m = saved;
      } catch {
        // storage unavailable: default to dark
      }
      applyTheme(m);
      setMode(m);
    })();
  }, []);

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next: Mode = prev === 'light' ? 'dark' : 'light';
      if (rootRef.isReady()) navState.current = rootRef.getRootState();
      applyTheme(next);
      AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  if (mode === null) return null;

  const navTheme = {
    ...(mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.bg,
      border: colors.border,
      text: colors.text,
    },
  };

  return (
    <ThemeModeCtx.Provider value={{ mode, toggle }}>
      <SafeAreaProvider>
        <StoreProvider>
          {/* key remounts the screens so every style picks up the new colours; navigation state is restored */}
          <NavigationContainer key={mode} theme={navTheme} ref={rootRef} initialState={navState.current}>
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="Tabs" component={Tabs} />
              <Stack.Screen name="CardDetail" component={CardDetail} />
              <Stack.Screen name="CardDatabase" component={CardDatabase} />
              <Stack.Screen name="Sets" component={Sets} />
              <Stack.Screen name="SetDetail" component={SetDetail} />
              <Stack.Screen name="Sealed" component={Sealed} />
              <Stack.Screen name="Wishlist" component={Wishlist} />
              <Stack.Screen name="SealedScan" component={SealedScan} />
              <Stack.Screen name="Grade" component={Grade} />
              <Stack.Screen name="Market" component={Market} />
              <Stack.Screen name="Trade" component={Trade} />
              <Stack.Screen name="Placeholder" component={Placeholder} />
            </Stack.Navigator>
            <MenuDrawer navigation={drawerNav} />
          </NavigationContainer>
        </StoreProvider>
      </SafeAreaProvider>
    </ThemeModeCtx.Provider>
  );
}
