import { Router } from "express";
import * as notifications from "../controllers/notifications.controller";

const router = Router();

router.get("/", notifications.list);
router.get("/unread-count", notifications.count);
router.post("/read-all", notifications.readAll);
router.delete("/:id", notifications.dismiss);

export default router;
