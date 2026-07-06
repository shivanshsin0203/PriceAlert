import { Router } from "express";
import { internalLogin } from "../controllers/auth.controller";
import { requireInternalSecret } from "../middleware/auth.middleware";

// /internal/* — server-to-server only (BFF → Express), guarded by the shared secret (§4.1).
const internalRouter = Router();

internalRouter.use(requireInternalSecret);
internalRouter.post("/auth/login", internalLogin);

export default internalRouter;
