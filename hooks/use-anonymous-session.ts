"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

type AnonymousSessionState = {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
};

export function useAnonymousSession(): AnonymousSessionState {
  const [state, setState] = useState<AnonymousSessionState>({
    session: null,
    userId: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    async function ensureSession() {
      try {
        const supabase = getSupabaseClient();
        const { data: existingSession, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (existingSession.session) {
          if (!mounted) return;
          setState({
            session: existingSession.session,
            userId: existingSession.session.user.id,
            loading: false,
            error: null,
          });
          return;
        }

        const { data, error } = await supabase.auth.signInAnonymously();

        if (error) {
          throw error;
        }

        if (!mounted) return;
        setState({
          session: data.session,
          userId: data.user?.id ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (!mounted) return;
        const message =
          error instanceof Error
            ? error.message
            : "Kunde inte skapa anonym Supabase-session.";

        setState({
          session: null,
          userId: null,
          loading: false,
          error:
            message.includes("Anonymous")
              ? "Anonym inloggning verkar inte vara aktiverad i Supabase."
              : message,
        });
      }
    }

    ensureSession();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
