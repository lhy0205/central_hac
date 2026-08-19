import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import React, { createContext, useContext, useEffect, useState } from "react";
import { authApi, onUnauthorized } from "../api/client";
type Auth = {
  ready: boolean;
  token: string | null;
  login: (id: string, pw: string) => Promise<void>;
  enterDemo: () => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    SecureStore.getItemAsync("accessToken")
      .then(setToken)
      .finally(() => setReady(true));
    return onUnauthorized(() => {
      setToken(null);
      router.replace("/(auth)/login");
    });
  }, []);
  async function login(userId: string, password: string) {
    const accessToken = (await authApi.login({ email: userId, password })).accessToken;
    await SecureStore.setItemAsync("accessToken", accessToken);
    setToken(accessToken);
  }
  async function enterDemo() {
    const demoToken = "mcm-care-demo";
    await SecureStore.setItemAsync("accessToken", demoToken);
    setToken(demoToken);
  }
  async function logout() {
    await SecureStore.deleteItemAsync("accessToken");
    await SecureStore.deleteItemAsync("refreshToken");
    setToken(null);
  }
  return (
    <Context.Provider value={{ ready, token, login, enterDemo, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
