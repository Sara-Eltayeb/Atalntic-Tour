# Atlantic Coast Tours Concierge

A static React/Vite customer chatbot for Atlantic Coast Tours. It combines two live browser tools before asking Gemini to answer:

- Google Sheets CSV export for the tour catalogue, prices, locations, and availability.
- Open-Meteo forecast data for the destination referenced in the customer question.
- A server-side Gemini Worker proxy so the AI key is not exposed in the GitHub Pages frontend.

## Run locally

```bash
npm install
npm run dev
```

Paste a Google AI Studio API key into the key field in the page. It is stored only in that browser's local storage and is sent directly to Google's Gemini API. No key is bundled in the app or committed to the repository.

## Deploy to GitHub Pages

Push the repository to GitHub with the default branch named `main`, then enable **Settings → Pages → GitHub Actions** as the source. The workflow in `.github/workflows/deploy.yml` builds and publishes `dist` automatically on every push.

The spreadsheet must remain publicly readable for the CSV export to work. The sheet source is configured in `src/main.jsx` from the supplied document ID and tab GID.
