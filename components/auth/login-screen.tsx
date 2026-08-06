"use client";

import { AlertCircle, Lock, LogIn, Mail, ShieldCheck, User, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { EmberCanvas } from "@/components/auth/ember-canvas";
import {
  MIN_USERNAME_LENGTH,
  isStrongPassword,
  isValidEmail,
  normalizeUsername,
} from "@/lib/auth/username";
import { getSupabaseClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup" | "forgot";

export function LoginScreen({
  onSignedIn,
}: {
  onSignedIn: (session: { userId: string; username: string }) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(false);

  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setIntroDone(true), reducedMotion ? 250 : 520);

    return () => window.clearTimeout(timer);
  }, []);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const cleanUsername = normalizeUsername(username);

    if (!cleanUsername || cleanUsername.length < MIN_USERNAME_LENGTH) {
      setError(`Användarnamnet behöver vara minst ${MIN_USERNAME_LENGTH} tecken.`);
      return;
    }

    if (isForgot) {
      setMessage(
        "Återställning är inte aktiverad ännu. Nästa steg blir att koppla detta till mailutskick.",
      );
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (isSignup && !isValidEmail(cleanEmail)) {
      setError("Skriv in en giltig emailadress.");
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
      let authEmail = cleanEmail;

      if (isSignup) {
        const { data: isAvailable, error: availabilityError } = await supabase.rpc(
          "is_username_available",
          { input_username: cleanUsername },
        );

        if (availabilityError) throw availabilityError;

        if (isAvailable !== true) {
          setError("Användarnamnet finns redan. Välj ett annat användarnamn.");
          return;
        }

        const { data, error: signupError } = await supabase.auth.signUp({
          email: authEmail,
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
            email: authEmail,
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
      } else {
        const { data: resolvedEmail, error: resolveError } = await supabase.rpc(
          "resolve_login_email",
          { input_username: cleanUsername },
        );

        if (resolveError) throw resolveError;

        if (typeof resolvedEmail !== "string" || !resolvedEmail) {
          setError("Hittar inget konto med det användarnamnet.");
          return;
        }

        authEmail = resolvedEmail;
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: authEmail,
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
      const authMessage =
        authError instanceof Error ? authError.message : "Kunde inte logga in just nu.";

      if (/USERNAME_TAKEN/i.test(authMessage)) {
        setError("Användarnamnet finns redan. Välj ett annat användarnamn.");
        return;
      }

      if (/already registered|User already registered/i.test(authMessage)) {
        setError("Emailadressen finns redan. Logga in eller använd en annan emailadress.");
        return;
      }

      if (/email rate limit exceeded|rate limit/i.test(authMessage)) {
        setError(
          "Supabase försöker skicka verifieringsmail och har nått sin emailgräns. Stäng av email confirmation i Supabase för testläget, eller vänta tills gränsen släpper.",
        );
        return;
      }

      setError(
        authMessage.includes("Invalid login credentials")
          ? "Fel användarnamn eller lösenord."
          : authMessage,
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

      <section
        className={`auth-card ${introDone ? "auth-card-ready" : ""}`}
        aria-label="Runhold inloggning"
      >
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
          {isSignup ? (
            <label>
              <span>Email</span>
              <div className="auth-input">
                <Mail aria-hidden="true" size={19} />
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="du@example.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </label>
          ) : null}

          <label>
            <span>Användarnamn</span>
            <div className="auth-input">
              <User aria-hidden="true" size={19} />
              <input
                autoCapitalize="none"
                autoComplete="username"
                inputMode="text"
                minLength={MIN_USERNAME_LENGTH}
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
              Användarnamn behöver minst {MIN_USERNAME_LENGTH} tecken. Lösenordet
              behöver minst 10 tecken och minst en siffra. Supabase lagrar
              lösenordet säkert, inte i appens egen kod.
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
            {isSignup ? (
              <UserPlus aria-hidden="true" size={20} />
            ) : (
              <LogIn aria-hidden="true" size={20} />
            )}
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
            <button type="button" onClick={() => changeMode("login")}>
              Jag har redan konto
            </button>
          ) : (
            <button type="button" onClick={() => changeMode("signup")}>
              Skapa nytt konto
            </button>
          )}
          <button type="button" onClick={() => changeMode("forgot")}>
            Glömt lösenord?
          </button>
        </div>
      </section>

      <p className="auth-footer">Bygg din bas. Samla resurser. Överlev hordarna.</p>
    </main>
  );
}
