"use client";

import { AlertCircle, Lock, LogIn, ShieldCheck, User, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { EmberCanvas } from "@/components/auth/ember-canvas";
import { isStrongPassword, normalizeUsername, usernameToAuthEmail } from "@/lib/auth/username";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup" | "forgot";

export function LoginScreen({
  onSignedIn,
}: {
  onSignedIn: (session: { userId: string; username: string }) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const cleanUsername = normalizeUsername(username);

    if (!cleanUsername || cleanUsername.length < 3) {
      setError("Användarnamnet behöver vara minst 3 tecken.");
      return;
    }

    if (isForgot) {
      setMessage(
        "Återställning är inte aktiverad ännu. Nästa steg blir att koppla detta till mailutskick.",
      );
      return;
    }

    if (!password) {
      setError("Skriv in ditt lösenord.");
      return;
    }

    if (isSignup && !isStrongPassword(password)) {
      setError("Välj ett säkrare lösenord: minst 10 tecken och minst en siffra.");
      return;
    }

    setBusy(true);

    try {
      const supabase = getSupabaseClient();
      const email = usernameToAuthEmail(cleanUsername);

      if (isSignup) {
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: cleanUsername,
            },
          },
        });

        if (signupError) throw signupError;

        if (data.session?.user) {
          onSignedIn({ userId: data.session.user.id, username: cleanUsername });
          return;
        }

        const { data: loginData, error: loginError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (loginError) {
          setMessage(
            "Kontot skapades, men Supabase kräver bekräftelse innan inloggning. För testläget: stäng av email confirmation i Supabase Auth.",
          );
          return;
        }

        if (loginData.user) {
          onSignedIn({ userId: loginData.user.id, username: cleanUsername });
          return;
        }
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) throw loginError;

      if (data.user) {
        onSignedIn({
          userId: data.user.id,
          username:
            typeof data.user.user_metadata.username === "string"
              ? data.user.user_metadata.username
              : cleanUsername,
        });
      }
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError.message
          : "Kunde inte logga in just nu.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <EmberCanvas />
      <div className="auth-sky" aria-hidden="true">
        <div className="auth-moon" />
        <div className="auth-tree auth-tree-left" />
        <div className="auth-tree auth-tree-right" />
        <div className="auth-watchtower">
          <span />
        </div>
        <div className="auth-campfire">
          <i />
          <b />
        </div>
      </div>

      <section className="auth-card" aria-label="Runhold inloggning">
        <div className="auth-logo" aria-hidden="true">
          <div className="auth-logo-moon">
            <span />
          </div>
          <h1>RUNHOLD</h1>
          <p>Run. Gather. Build. Survive.</p>
        </div>

        <div className="auth-heading">
          <h2>
            {isSignup
              ? "Skapa konto"
              : isForgot
                ? "Glömt lösenord"
                : "Välkommen tillbaka"}
          </h2>
          <p>
            {isSignup
              ? "Skapa din första säkra Runhold-inloggning."
              : isForgot
                ? "Funktionen kopplas till mail senare."
                : "Logga in för att fortsätta ditt äventyr."}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Användarnamn</span>
            <div className="auth-input">
              <User aria-hidden="true" size={19} />
              <input
                autoCapitalize="none"
                autoComplete="username"
                inputMode="text"
                minLength={3}
                placeholder="dittnamn"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </label>

          {!isForgot ? (
            <label>
              <span>Lösenord</span>
              <div className="auth-input">
                <Lock aria-hidden="true" size={19} />
                <input
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={isSignup ? 10 : 1}
                  placeholder={isSignup ? "Minst 10 tecken" : "Ditt lösenord"}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </label>
          ) : null}

          {isSignup ? (
            <p className="auth-note">
              Lösenordet behöver minst 10 tecken och minst en siffra. Supabase
              lagrar lösenordet säkert, inte i appens egen kod.
            </p>
          ) : null}

          {error ? (
            <div className="auth-alert auth-alert-error">
              <AlertCircle aria-hidden="true" size={18} />
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="auth-alert">
              <ShieldCheck aria-hidden="true" size={18} />
              {message}
            </div>
          ) : null}

          <button className="auth-primary" disabled={busy} type="submit">
            {isSignup ? <UserPlus aria-hidden="true" size={20} /> : <LogIn aria-hidden="true" size={20} />}
            {busy
              ? "Arbetar..."
              : isSignup
                ? "Skapa nytt konto"
                : isForgot
                  ? "Visa återställningsinfo"
                  : "Logga in"}
          </button>
        </form>

        <div className="auth-actions">
          {mode !== "login" ? (
            <button type="button" onClick={() => setMode("login")}>
              Jag har redan konto
            </button>
          ) : (
            <button type="button" onClick={() => setMode("signup")}>
              Skapa nytt konto
            </button>
          )}
          <button type="button" onClick={() => setMode("forgot")}>
            Glömt lösenord?
          </button>
        </div>
      </section>

      <p className="auth-footer">Bygg din bas. Samla resurser. Överlev hordarna.</p>
    </main>
  );
}
