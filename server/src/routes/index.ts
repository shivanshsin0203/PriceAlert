import { Router } from "express";
import { COMMODITIES, CRYPTO, INDIA, INDICES, NAMES, STOCKS } from "../adapters/symbols";
import { updateCurrency } from "../controllers/me.controller";
import { dashboardUser } from "../middleware/dashboardUser.middleware";
import alertsRoute from "./alerts.route";
import notificationsRoute from "./notifications.route";

// Domain API router (mounted at /api). Every route runs as the dashboard user
// (pre-auth seam — see dashboardUser.middleware).
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

apiRouter.use(dashboardUser);
apiRouter.use("/alerts", alertsRoute);
apiRouter.use("/notifications", notificationsRoute);
apiRouter.post("/me/currency", updateCurrency);

export default apiRouter;
