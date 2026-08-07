"use client";

import { useEffect, useState } from "react";
import { LoginScreen } from "@/components/auth/login-screen";
import { GameOnboarding } from "@/components/game-onboarding";
import { MissionApp } from "@/components/mission-app";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { usePlayerProfile } from "@/hooks/use-player-profile";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuthState = {
  userId: string | null;
  username: string | null;
  loading: boolean;
};

export function AppShell() {
  const [authState, setAuthState] = useState<AuthState>({
    userId: null,
    username: null,
    loading: true,
  });
  const {
    profile,
    loading: profileLoading,
    error: profileError,
    createProfile,
  } = usePlayerProfile(authState.userId);

  async function handleSignOut() {
    await getSupabaseClient().auth.signOut();
    setAuthState({ userId: null, username: null, loading: false });
  }

  useEffect(() => {
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setAuthState({
        userId: user?.id ?? null,
        username:
          typeof user?.user_metadata.username === "string"
            ? user.user_metadata.username
            : null,
        loading: false,
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      setAuthState({
        userId: user?.id ?? null,
        username:
          typeof user?.user_metadata.username === "string"
            ? user.user_metadata.username
            : null,
        loading: false,
      });
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  if (authState.loading) {
    return (
      <main className="auth-shell">
        <div className="auth-loading">Laddar Runhold...</div>
      </main>
    );
  }

  if (!authState.userId) {
    return (
      <>
        <LoginScreen
          onSignedIn={({ userId, username }) =>
            setAuthState({ userId, username, loading: false })
          }
        />
        <ServiceWorkerRegister />
      </>
    );
  }

  if (profileLoading) {
    return (
      <>
        <main className="auth-shell">
          <div className="auth-loading">Laddar spelprofil...</div>
        </main>
        <ServiceWorkerRegister />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <GameOnboarding
          username={authState.username ?? "spelare"}
          loading={profileLoading}
          error={profileError}
          onStart={async (trainingLevel) => {
            await createProfile(trainingLevel);
          }}
          onSignOut={handleSignOut}
        />
        <ServiceWorkerRegister />
      </>
    );
  }

  return (
    <>
      <MissionApp
        userId={authState.userId}
        username={authState.username ?? "spelare"}
        onSignOut={handleSignOut}
      />
      <ServiceWorkerRegister />
    </>
  );
}
