import "./styles/global.css";
import { initTheme } from "./lib/theme";
import { initRouter } from "./lib/router";

// The inline script in index.html already stamped data-theme before paint;
// this hooks up the OS listener and keeps the meta colour in step.
initTheme();

// Intercepts clicks on root-relative links so <a href="/login"> navigates
// client-side. Hash links keep their native in-page behaviour.
initRouter();

// cf-app is the route outlet and pulls in every page component it renders.
import "./components/cf-app";
