import { Router } from "express";
import { COMMODITIES, CRYPTO, INDIA, INDICES, NAMES, STOCKS } from "../adapters/symbols";
import { getMe, telegramLinkToken, updateCurrency } from "../controllers/me.controller";
import { requireUser } from "../middleware/auth.middleware";
import alertsRoute from "./alerts.route";
import notificationsRoute from "./notifications.route";

// Domain API router (mounted at /api). Every route requires the internal secret (caller
// is our BFF) + the user JWT — with a development-only fallback identity (§4.1, §6).
const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ message: "alert-engine API", version: "0.1.0" });
});

// Alertable symbols, grouped — drives the create-form dropdown (same registry the engine uses).
apiRouter.get("/symbols", (_req, res) => {
  const group = (syms: string[]) => syms.map((s) => ({ symbol: s, name: NAMES[s] ?? s }));
  res.json({
    groups: [
      { label: "Crypto", symbols: group(CRYPTO) },
      { label: "US Stocks", symbols: group(STOCKS) },
      { label: "Indian Stocks", symbols: group(INDIA) },
      { label: "Indices & Commodities", symbols: group([...INDICES, ...COMMODITIES]) },
    ],
  });
});

apiRouter.use(requireUser);
apiRouter.use("/alerts", alertsRoute);
apiRouter.use("/notifications", notificationsRoute);
apiRouter.get("/me", getMe);
apiRouter.post("/me/currency", updateCurrency);
apiRouter.post("/me/telegram/link-token", telegramLinkToken);

export default apiRouter;
