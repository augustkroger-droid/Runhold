"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrainingLevelId } from "@/lib/game/definitions/training-levels";
import type { Language } from "@/lib/i18n";
import {
  type PlayerGameProfile,
  type PlayerGameProfileRow,
  mapPlayerGameProfileRow,
} from "@/lib/game/state/player-profile";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerProfileState = {
  loadedUserId: string | null;
  profile: PlayerGameProfile | null;
  loading: boolean;
  error: string | null;
};

export function usePlayerProfile(userId: string | null) {
  const [state, setState] = useState<PlayerProfileState>({
    loadedUserId: null,
    profile: null,
    loading: Boolean(userId),
    error: null,
  });

  const loadProfile = useCallback(async (options?: { quiet?: boolean }) => {
    await Promise.resolve();

    if (!userId) {
      setState({ loadedUserId: null, profile: null, loading: false, error: null });
      return;
    }

    if (!options?.quiet) {
      setState((current) => ({ ...current, loading: true, error: null }));
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("player_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      setState({
        loadedUserId: userId,
        profile: null,
        loading: false,
        error: error.message,
      });
      return;
    }

    setState({
      loadedUserId: userId,
      profile: data ? mapPlayerGameProfileRow(data as PlayerGameProfileRow) : null,
      loading: false,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadProfile({ quiet: true });
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadProfile]);

  const createProfile = useCallback(
    async (selectedTrainingLevel: TrainingLevelId) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad för att starta spelet.");
      }

      setState((current) => ({ ...current, loading: true, error: null }));

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("player_profiles")
        .insert({
          user_id: userId,
          selected_training_level: selectedTrainingLevel,
        })
        .select()
        .single();

      if (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message,
        }));
        throw error;
      }

      const profile = mapPlayerGameProfileRow(data as PlayerGameProfileRow);
      setState({ loadedUserId: userId, profile, loading: false, error: null });
      return profile;
    },
    [userId],
  );

  const updateLanguage = useCallback(
    async (language: Language) => {
      if (!userId || !state.profile) {
        throw new Error("Du behöver vara inloggad.");
      }

      const nextSettings = {
        ...state.profile.settings,
        language,
      };

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("player_profiles")
        .update({ settings: nextSettings })
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        setState((current) => ({ ...current, error: error.message }));
        throw error;
      }

      const profile = mapPlayerGameProfileRow(data as PlayerGameProfileRow);
      setState({ loadedUserId: userId, profile, loading: false, error: null });
      return profile;
    },
    [state.profile, userId],
  );

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    createProfile,
    updateLanguage,
    reloadProfile: loadProfile,
  };
}
