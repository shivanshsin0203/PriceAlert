import { Router } from "express";
import * as alerts from "../controllers/alerts.controller";

const router = Router();

router.get("/", alerts.list);
router.post("/", alerts.create);
router.delete("/:id", alerts.remove);
router.get("/:id/history", alerts.history);

export default router;
