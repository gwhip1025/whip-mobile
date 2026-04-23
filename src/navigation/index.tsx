import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { colors } from "../lib/theme";
import { ActivityIndicator, View } from "react-native";

import LoginScreen from "../screens/LoginScreen";
import SignupScreen from "../screens/SignupScreen";
import DashboardScreen from "../screens/DashboardScreen";
import QuoteDetailScreen from "../screens/QuoteDetailScreen";
import QuoteFormScreen from "../screens/QuoteFormScreen";
import SettingsScreen from "../screens/SettingsScreen";
import InvoicesScreen from "../screens/InvoicesScreen";
import InvoiceDetailScreen from "../screens/InvoiceDetailScreen";
import InvoiceFormScreen from "../screens/InvoiceFormScreen";
import TemplatesScreen from "../screens/TemplatesScreen";
import FeedbackScreen from "../screens/FeedbackScreen";

const AuthStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Each tab uses its own stack so all screens can be reached from anywhere.
const QuotesStackNav = createNativeStackNavigator();
const InvoicesStackNav = createNativeStackNavigator();
const SettingsStackNav = createNativeStackNavigator();

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.white },
  headerTintColor: colors.black,
  headerShadowVisible: false,
  headerBackTitle: "",
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function QuotesStack() {
  return (
    <QuotesStackNav.Navigator screenOptions={stackScreenOptions}>
      <QuotesStackNav.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Quotes" }} />
      <QuotesStackNav.Screen name="QuoteDetail" component={QuoteDetailScreen} options={{ title: "Quote" }} />
      <QuotesStackNav.Screen name="NewQuote" component={QuoteFormScreen} options={{ title: "New Quote" }} />
      <QuotesStackNav.Screen name="EditQuote" component={QuoteFormScreen} options={{ title: "Edit Quote" }} />
      {/* Reachable from a quote after converting to invoice */}
      <QuotesStackNav.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: "Invoice" }} />
    </QuotesStackNav.Navigator>
  );
}

function InvoicesStack() {
  return (
    <InvoicesStackNav.Navigator screenOptions={stackScreenOptions}>
      <InvoicesStackNav.Screen name="Invoices" component={InvoicesScreen} options={{ title: "Invoices" }} />
      <InvoicesStackNav.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: "Invoice" }} />
      <InvoicesStackNav.Screen name="NewInvoice" component={InvoiceFormScreen} options={{ title: "New Invoice" }} />
    </InvoicesStackNav.Navigator>
  );
}

function SettingsStack() {
  return (
    <SettingsStackNav.Navigator screenOptions={stackScreenOptions}>
      <SettingsStackNav.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <SettingsStackNav.Screen name="Templates" component={TemplatesScreen} options={{ title: "Templates" }} />
      <SettingsStackNav.Screen name="Feedback" component={FeedbackScreen} options={{ title: "Feedback" }} />
      {/* Creating a quote from a template switches tabs in code; see handler */}
      <SettingsStackNav.Screen name="NewQuote" component={QuoteFormScreen} options={{ title: "New Quote" }} />
    </SettingsStackNav.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray[400],
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.gray[200] },
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="QuotesTab"
        component={QuotesStack}
        options={{
          title: "Quotes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="InvoicesTab"
        component={InvoicesStack}
        options={{
          title: "Invoices",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cash-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStack}
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? <TabNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
