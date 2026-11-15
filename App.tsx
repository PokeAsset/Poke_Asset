import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme';
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
import { CardDatabase, Placeholder, Wishlist } from './src/screens/Misc';

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

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, border: colors.border },
};

const drawerNav = {
  navigate: (name: string, params?: object) => {
    if (rootRef.isReady()) rootRef.navigate(name, params);
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <NavigationContainer theme={theme} ref={rootRef}>
          <StatusBar style="light" />
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="CardDetail" component={CardDetail} />
            <Stack.Screen name="CardDatabase" component={CardDatabase} />
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
  );
}
