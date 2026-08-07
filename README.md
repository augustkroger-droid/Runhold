# Runhold

Runhold är en mobilanpassad PWA för ett GPS-drivet löparspel. Appen har inloggning, spelprofil, bas, förråd, lägereld, byggnation, reparationer, tech tree, språkval och en första expeditionsvy med GPS, scanner, kartobjekt, automatisk uppsamling och XP.

Expeditionen använder mobilens position lokalt under aktiv runda. När spelaren scannar genereras spelarspecifika kartsektorer nära aktuell position. Nya objekt placeras från gångvänliga OpenStreetMap-kandidater, så spawn undviker motorvägar, privata vägar och helt slumpade punkter. Objekten är olika per spelare, skapas bara nära där spelaren faktiskt spelar och försvinner för den spelaren när de samlas.

## Lokalt

1. Installera Node.js 22 eller senare. Projektet skapades och testades med Node 24.
2. Installera paket:

   ```bash
   npm install
   ```

3. Skapa `.env.local` från `.env.local.example`:

   ```bash
   cp .env.local.example .env.local
   ```

4. Fyll i:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

   Använd aldrig en service-role-nyckel i klienten.

5. Starta utvecklingsservern:

   ```bash
   npm run dev
   ```

6. Kör tester:

   ```bash
   npm test
   ```

7. Kontrollera TypeScript och lint:

   ```bash
   npm run typecheck
   npm run lint
   ```

8. Testa production-build:

   ```bash
   npm run build
   npm run start
   ```

GPS kräver normalt HTTPS på mobil. Lokal testning fungerar bäst med webbläsarens simulator eller genom en HTTPS-tunnel.

## Supabase

1. Skapa ett nytt Supabase-projekt.
2. Hämta Project URL och publishable/anon key under `Project Settings` -> `API`.
3. Aktivera email/password-inloggning under `Authentication` -> `Sign In / Providers` -> `Email`.
4. För nuvarande testläge: stäng av email confirmation så att nya konton kan logga in direkt. Vi kopplar riktig mailverifiering och lösenordsåterställning senare.
5. Signup använder riktig emailadress, användarnamn och lösenord. Login använder användarnamn och lösenord.
6. Kör SQL-migrationerna i `supabase/migrations/001_initial_schema.sql` till och med `supabase/migrations/018_map_object_lifecycle.sql` via Supabase SQL Editor, eller med Supabase CLI om du använder CLI lokalt. Migration 011 skapar reparationer, HP-skada och repair timers. Migration 012 skapar tech tree och låser muren bakom `basic_wall`. Migration 013 skapar expeditionssammanfattningar och XP-belöningar. Migration 014 skapar spelarspecifika kartsektorer, scanner-resultat och automatisk uppsamling. Migration 015 gör expeditionens haul serverstyrd och flyttar resurser till förrådet när expeditionen avslutas. Migration 016 lägger till chests, enklare item-loot och sparad expeditionstrail. Migration 017 gör ny spawn beroende av gångvänliga OSM-kandidater. Migration 018 rensar befintliga testobjekt och lägger till expiry, sektorkapacitet och långsam refill.
7. Om `DATABASE_URL`, Supabase CLI eller annan admin-anslutning finns i miljön kan migrationer köras direkt från terminalen. Med endast publishable/anon key måste SQL köras i Supabase SQL Editor.
8. Kontrollera att RLS är aktivt:

   ```sql
   select relrowsecurity
   from pg_class
   where relname = 'missions';
   ```

   Resultatet ska vara `true`.

8. Verifiera isolering genom att skapa två konton i två olika webbläsare/profiler. Varje konto ska bara kunna läsa sina egna rader eftersom policies använder `auth.uid() = user_id`.

Tabellen sparar startkoordinat, destinationskoordinat, planerad fågelvägsdistans, status och tidsstämplar. Den sparar inte löpande GPS-spår.

## Vercel

1. Pusha projektet till GitHub:

   ```bash
   git init
   git add .
   git commit -m "Build Runhold GPS MVP"
   git branch -M main
   git remote add origin <din-github-url>
   git push -u origin main
   ```

2. Importera GitHub-repot i Vercel som ett Next.js-projekt.
3. Lägg till miljövariabler i Vercel:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

4. Publicera appen med Vercels standardinställningar.
5. Öppna Vercel-adressen på mobilen via HTTPS.
6. Lägg till PWA:n på hemskärmen via webbläsarens meny när installation erbjuds.
7. Ge GPS-behörighet när du trycker på `Hämta min position`. Välj exakt plats där plattformen frågar.

## Fälttest

1. Gå utomhus.
2. Öppna appen via Vercels HTTPS-adress.
3. Tillåt exakt plats.
4. Vänta tills GPS-noggrannheten helst är bättre än 20 meter.
5. Placera ett mål ungefär 500 meter bort, eller använd `Skapa testmål 500 m bort`.
6. Starta hämta-och-vänd-uppdraget.
7. Håll appen öppen.
8. Gå till målet.
9. Kontrollera ljud, vibration, visuell ping och poäng vid målet.
10. Starta returfasen.
11. Gå tillbaka.
12. Kontrollera poängsammanfattningen och att uppdraget sparats i Supabase.

## Viktiga begränsningar

Appen behöver internet för OpenStreetMap, Overpass och Supabase. Service workern cachelagrar bara appens grundskal och en offline-sida, inte karttiles. En PWA kan inte garantera kontinuerlig bakgrundsspårning, så håll appen öppen och skärmen aktiv under testet.

Utvecklarläget visas bara i development och innehåller knappar för att simulera målträff och återkomst.

Poäng sparas lokalt i webbläsaren på enheten. Uppdragsraderna i Supabase sparar fortfarande bara start, destination, status, tider och GPS-noggrannhet.
