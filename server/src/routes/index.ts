import { Router } from "express";
// Domain API router (mounted at /api). Endpoints land here as features are built:
//   router.use("/alerts", alertsRoute); router.use("/auth", authRoute); ...
const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ message: "alert-engine API", version: "0.1.0" });
});

export default apiRouter;
